#!/usr/bin/env node
// Private maintainer verifier for public-safe gallery/release-candidate decks.
// Static package checks can run anywhere. Desktop PowerPoint repair checks are
// intentionally local-only and are never a Cloud Run runtime dependency.

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import JSZip from 'jszip'
import { DOMParser } from '@xmldom/xmldom'
import { validatePackageMetadataLeaksFromZip } from './quality/package-metadata.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')

function usage() {
	console.log('Usage: node betterpptx-mcp/verify-public-gallery-repair.mjs [--deck-dir <dir>] [--deck <pptx>]... [--decypher-index <path>] [--require-com]')
}

function parseArgs(argv) {
	const opts = { deckDirs: [], decks: [], requireCom: false, decypherIndex: process.env.BETTERPPTX_DECYPHER_INDEX || '' }
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i]
		if (arg === '--deck-dir') { opts.deckDirs.push(path.resolve(argv[++i] || '')); continue }
		if (arg === '--deck') { opts.decks.push(path.resolve(argv[++i] || '')); continue }
		if (arg === '--decypher-index') { opts.decypherIndex = path.resolve(argv[++i] || ''); continue }
		if (arg === '--require-com') { opts.requireCom = true; continue }
		if (arg === '--help' || arg === '-h') { usage(); process.exit(0) }
		throw new Error(`Unknown argument: ${arg}`)
	}
	if (!opts.deckDirs.length && !opts.decks.length) opts.deckDirs.push(path.resolve(process.cwd(), 'docs', 'examples', 'decks'))
	return opts
}

function listDecks(opts) {
	const decks = new Set(opts.decks)
	for (const dir of opts.deckDirs) {
		if (!fs.existsSync(dir)) throw new Error(`Deck directory does not exist: ${dir}`)
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			if (entry.isFile() && /\.pptx$/i.test(entry.name)) decks.add(path.join(dir, entry.name))
		}
	}
	const result = [...decks].sort()
	if (!result.length) throw new Error('No .pptx decks found to verify')
	return result
}

function makeParser(errors) {
	return new DOMParser({
		errorHandler: {
			warning: msg => errors.push(String(msg)),
			error: msg => errors.push(String(msg)),
			fatalError: msg => errors.push(String(msg)),
		},
	})
}

async function verifyStaticPackage(pptxPath) {
	const buf = fs.readFileSync(pptxPath)
	const zip = await JSZip.loadAsync(buf)
	const names = Object.keys(zip.files)
	const issues = []
	const errors = []
	const parser = makeParser(errors)
	let slideCount = 0
	let danglingRels = 0
	let duplicateContentTypeOverrides = 0
	let sharedChartRelationshipTargets = 0
	const chartTargetSlides = new Map()

	if (!zip.file('[Content_Types].xml')) issues.push('missing [Content_Types].xml')
	if (zip.file('[Content_Types].xml')) {
		const contentTypesXml = await zip.file('[Content_Types].xml').async('string')
		const seenOverrides = new Set()
		for (const match of contentTypesXml.matchAll(/<Override\b[^>]*\bPartName="([^"]+)"/g)) {
			const partName = match[1]
			if (seenOverrides.has(partName)) duplicateContentTypeOverrides += 1
			else seenOverrides.add(partName)
		}
	}
	if (!zip.file('ppt/presentation.xml')) issues.push('missing ppt/presentation.xml')

	for (const name of names) {
		const file = zip.file(name)
		if (!file || file.dir) continue
		if (/\.(xml|rels)$/i.test(name)) {
			const xml = await file.async('string')
			parser.parseFromString(xml, 'text/xml')
		}
		if (/ppt\/slides\/slide\d+\.xml$/i.test(name)) slideCount += 1
	}
	const metadataLeak = await validatePackageMetadataLeaksFromZip(zip)

	for (const name of names) {
		const match = name.match(/^ppt\/slides\/(slide\d+)\.xml$/i)
		if (!match) continue
		const xml = await zip.file(name).async('string')
		const relsName = `ppt/slides/_rels/${match[1]}.xml.rels`
		const relsXml = zip.file(relsName) ? await zip.file(relsName).async('string') : ''
		const declaredIds = new Set([...relsXml.matchAll(/Id="([^"]+)"/g)].map(x => x[1]))
		for (const relMatch of relsXml.matchAll(/<Relationship\b[^>]*>/g)) {
			const tag = relMatch[0]
			if (!/relationships\/chart(?:Ex)?"/i.test(tag)) continue
			const target = tag.match(/\bTarget="([^"]+)"/)?.[1]
			if (!target) continue
			const key = target.replace(/\\/g, '/')
			if (!chartTargetSlides.has(key)) chartTargetSlides.set(key, new Set())
			chartTargetSlides.get(key).add(name)
		}
		for (const ref of xml.matchAll(/r:(?:embed|id|link)="([^"]+)"/g)) {
			if (!declaredIds.has(ref[1])) danglingRels += 1
		}
	}
	sharedChartRelationshipTargets = [...chartTargetSlides.values()].filter(slides => slides.size > 1).length

	if (slideCount < 1) issues.push('no slides found')
	if (errors.length) issues.push(`xml parse issues: ${errors.length}`)
	if (danglingRels) issues.push(`dangling slide relationships: ${danglingRels}`)
	if (!metadataLeak.ok) issues.push(`metadata/relationship disclosure matches: ${metadataLeak.issueCount}`)
	if (duplicateContentTypeOverrides) issues.push(`duplicate content type overrides: ${duplicateContentTypeOverrides}`)
	if (sharedChartRelationshipTargets) issues.push(`shared chart relationship targets: ${sharedChartRelationshipTargets}`)

	return { ok: issues.length === 0, bytes: buf.length, slideCount, xmlIssues: errors.length, danglingRels, forbiddenMatches: metadataLeak.issueCount, metadataLeak, duplicateContentTypeOverrides, sharedChartRelationshipTargets, issues }
}

function resolveDecypherIndex(explicitPath) {
	const candidates = [
		explicitPath,
		path.join(repoRoot, 'dist', 'node', 'pptx-decypher', 'index.js'),
		path.join(repoRoot, 'out', 'pptx-decypher', 'index.js'),
	].filter(Boolean)
	for (const candidate of candidates) {
		if (fs.existsSync(candidate)) return path.resolve(candidate)
	}
	return ''
}

function powerpointOpenIsolated({ pptxPath, decypherIndex, timeoutMs = 175000 }) {
	return new Promise(resolve => {
		if (!decypherIndex) {
			resolve({ available: false, ok: false, error: 'decypher repairCheck module not found' })
			return
		}
		const decypherUrl = pathToFileURL(decypherIndex).href
		const code = `
			(async () => {
				try {
					const d = await import(process.argv[1])
					if (typeof d.repairCheck !== 'function') {
						process.stdout.write(JSON.stringify({ available: false, ok: false, error: 'repairCheck export missing' }))
						return
					}
					const r = await d.repairCheck(process.argv[2], ${timeoutMs - 15000})
					let slides = null
					try { slides = JSON.parse((r.stdout || '').trim().split('\\n').pop()).slideCount } catch {}
					process.stdout.write(JSON.stringify({ available: true, ok: r.success === true, slides, runtimeAvailable: r.runtimeAvailable, error: r.error || '' }))
				} catch (e) {
					process.stdout.write(JSON.stringify({ available: true, ok: false, error: String(e && e.message || e) }))
				}
			})()
		`
		const child = spawn(process.execPath, ['-e', code, decypherUrl, pptxPath], { stdio: ['ignore', 'pipe', 'pipe'] })
		let out = ''
		let done = false
		const finish = value => {
			if (done) return
			done = true
			clearTimeout(timer)
			try { child.kill('SIGKILL') } catch {}
			resolve(value)
		}
		const timer = setTimeout(() => finish({ available: true, ok: false, error: 'PowerPoint COM repair check timeout' }), timeoutMs)
		child.stdout.on('data', data => { out += data })
		child.on('exit', codeValue => {
			let parsed = null
			try { parsed = JSON.parse(out.trim()) } catch {}
			finish(parsed || { available: true, ok: false, error: `PowerPoint COM repair child exited ${codeValue}` })
		})
		child.on('error', err => finish({ available: true, ok: false, error: `PowerPoint COM repair child spawn failed: ${err.message}` }))
	})
}

async function powerpointOpenWithRetry(args) {
	let result = await powerpointOpenIsolated(args)
	if (result.available && !result.ok) {
		await new Promise(resolve => setTimeout(resolve, 4000))
		result = await powerpointOpenIsolated(args)
	}
	return result
}

async function main() {
	const opts = parseArgs(process.argv.slice(2))
	const decks = listDecks(opts)
	const decypherIndex = resolveDecypherIndex(opts.decypherIndex)
	const rows = []
	let failed = false

	for (const deck of decks) {
		const stat = await verifyStaticPackage(deck)
		const repair = await powerpointOpenWithRetry({ pptxPath: deck, decypherIndex })
		const repairRequiredFailed = opts.requireCom && (!repair.available || !repair.ok)
		const ok = stat.ok && !repairRequiredFailed
		if (!ok) failed = true
		rows.push({ deck, stat, repair, ok })
	}

	for (const row of rows) {
		const repairText = row.repair.available
			? `${row.repair.ok ? 'PASS' : 'FAIL'} slides=${row.repair.slides ?? 'unknown'}`
			: `SKIP ${row.repair.error || 'unavailable'}`
		console.log(`${row.ok ? 'PASS' : 'FAIL'} ${path.basename(row.deck)} static=${row.stat.ok ? 'PASS' : 'FAIL'} slides=${row.stat.slideCount} bytes=${row.stat.bytes} repair=${repairText}`)
		if (row.stat.issues.length) console.log(`  static issues: ${row.stat.issues.join('; ')}`)
		if (row.repair.available && !row.repair.ok) console.log(`  repair issue: ${row.repair.error || 'PowerPoint repair/open failed'}`)
	}

	if (failed) {
		console.error('PUBLIC GALLERY REPAIR VERIFY: FAIL')
		process.exit(1)
	}
	console.log(`PUBLIC GALLERY REPAIR VERIFY: PASS decks=${rows.length} com=${opts.requireCom ? 'required' : 'optional'}`)
}

main().catch(err => {
	console.error(`PUBLIC GALLERY REPAIR VERIFY: FAIL ${err.message}`)
	process.exit(1)
})
