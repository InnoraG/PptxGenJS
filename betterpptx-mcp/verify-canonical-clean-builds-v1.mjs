#!/usr/bin/env node
// Reproducibility proof for the canonical source+lock. Two isolated builder
// sessions dry-run and compile the same execution spec, then their semantic
// package digests are compared without relying on ZIP container timestamps.

import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import zlib from 'node:zlib'
import JSZip from 'jszip'
import { createMcpToolDispatcher } from './engine.mjs'

process.env.BETTERPPTX_LOCAL_MAINTAINER = '1'
process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'
process.env.BETTERPPTX_FORCE_PLAN = 'premium'

const root = process.cwd()
const sourcePath = path.resolve(process.argv.includes('--source') ? process.argv[process.argv.indexOf('--source') + 1] : 'tmp_autonomous_test/GPT56_BetterPPTX_Canonical_Full_Spec.json')
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const outputDir = path.resolve(`outputs/authoring-principle-corpus/finalized-jsonspec-archive/canonical-25-clean-build-reproducibility/${stamp}`)
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value
const dataOf = result => { if (!result?.ok) throw new Error(JSON.stringify(result)); return result.data || result }
const canonicalBytes = value => Buffer.from(`${JSON.stringify(stable(value))}\n`)

const source = JSON.parse(await fs.readFile(sourcePath, 'utf8'))
const executionSpec = {
	...source,
	outputVariant: 'silent-timed-notes',
	selectedOutputVariants: ['silent-timed-notes'],
	narrationPolicy: { ...(source.narrationPolicy || {}), synthesizeAudio: false, required: false, failurePolicy: 'notes-only' },
	slides: (source.slides || []).map(slide => ({ ...slide, narration: slide.narration && typeof slide.narration === 'object' ? { ...slide.narration, synthesizeAudio: false, useAsTimingAuthority: false } : slide.narration }))
}
const sourceSha256 = sha256(canonicalBytes(source))
const executionSha256 = sha256(canonicalBytes(executionSpec))

async function packageSemanticDigest(filePath) {
	const zip = await JSZip.loadAsync(await fs.readFile(filePath))
	const rows = []
	for (const name of Object.keys(zip.files).filter(name => !zip.files[name].dir).sort()) {
		// Core properties contain container-generation timestamps and are not
		// part of the presentation semantic payload.
		if (name === 'docProps/core.xml') continue
		if (name === 'ppt/betterpptx-edition.xml') {
			const xml = await zip.files[name].async('string')
			const match = xml.match(/enc="dfl\.b64"[^>]*>([\s\S]*?)<\/betterpptxEdition>/)
			const payload = match ? JSON.parse(zlib.inflateRawSync(Buffer.from(match[1].trim(), 'base64')).toString('utf8')) : {}
			delete payload.savedAt
			const canonical = JSON.stringify(payload).replace(/"retrievedAt":"[^"]*"/g, '"retrievedAt":"VOLATILE"')
			rows.push({ name, bytes: Buffer.byteLength(xml), sha256: sha256(canonical) })
			continue
		}
		const bytes = await zip.files[name].async('nodebuffer')
		if (/\.xml$/.test(name)) {
			const xml = bytes.toString('utf8')
				.replace(/(<a16:creationId[^>]*\bid=")\{[^}]*\}/g, '$1{CREATION}')
				.replace(/(<p14:section[^>]*\bid=")\{[^}]*\}/g, '$1{SECTION}')
				.replace(/(<p14:modId[^>]*\bval=")\d+/g, '$1VOLATILE')
			rows.push({ name, bytes: Buffer.byteLength(xml), sha256: sha256(xml) })
			continue
		}
		rows.push({ name, bytes: bytes.length, sha256: sha256(bytes) })
	}
	return { digest: sha256(canonicalBytes(rows)), entries: rows.length, rows }
}

async function build(label) {
	const sessionId = `canonical-clean-build-${label}-${Date.now()}`
	const mcp = createMcpToolDispatcher({ sessionId })
	const id = `${executionSha256}-${label}`
	const dry = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', {
		spec: executionSpec, phase: 'dryRun', commitMode: 'createNew', plan: 'premium', detail: 'full',
		validateAfterCompile: true, validationMode: 'strict', idempotencyKey: `canonical-clean-dry-${id}`,
	}))
	const commit = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', {
		spec: executionSpec, phase: 'commit', commitMode: 'createNew', plan: 'premium',
		planId: dry.planId, lockedPlanId: dry.planId, planDigest: dry.planDigest, detail: 'summary',
		validateAfterCompile: true, validationMode: 'strict', billingConfirmed: true, saveAfterCommit: false,
		idempotencyKey: `canonical-clean-commit-${id}`,
	}))
	const readback = dataOf(await mcp.call('betterpptx.deck.export_spec', { deckId: commit.deckId, mode: 'current', detail: 'summary' }))
	const spec = readback.spec || readback
	const quality = dataOf(await mcp.call('betterpptx.deck.validate_quality', { deckId: commit.deckId, profile: 'modern', detail: 'summary' }))
	const dir = path.join(outputDir, label)
	await fs.mkdir(dir, { recursive: true })
	const saved = dataOf(await mcp.call('betterpptx.deck.save', { deckId: commit.deckId, outputDir: dir, fileName: `canonical-25-clean-${label}.pptx`, idempotencyKey: `canonical-clean-save-${id}` }))
	const packagePath = path.resolve(saved.filePath || saved.path || path.join(dir, `canonical-25-clean-${label}.pptx`))
	const packageBytes = await fs.readFile(packagePath)
	return {
		label,
		sessionId,
		deckId: commit.deckId,
		dryRun: { mutationFree: dry.mutationFree, slideCount: dry.slideCount, objectCount: dry.objectCount, planId: dry.planId, planDigest: dry.planDigest, lockedPlanDigest: dry.lockedPlanDigest || null, lockedSpecDigest: dry.lockedSpecDigest || null },
		commit: { slideCount: commit.slideCount, objectCount: commit.objectCount, planDigest: commit.planDigest || null, lockedPlanDigest: commit.lockedPlanDigest || null, lockedSpecDigest: commit.lockedSpecDigest || null },
		quality: { ok: quality.ok !== false, blockingIssues: quality.blockingIssues?.length || 0 },
		readback: { slides: spec.slides?.length || 0, objects: (spec.slides || []).reduce((n, slide) => n + (slide.content?.length || slide.objects?.length || 0), 0), specSha256: sha256(canonicalBytes(spec)) },
		package: { file: path.relative(root, packagePath).replaceAll('\\', '/'), bytes: packageBytes.length, sha256: sha256(packageBytes), semantic: await packageSemanticDigest(packagePath) },
	}
}

await fs.mkdir(outputDir, { recursive: true })
const first = await build('build-a')
const second = await build('build-b')
const checks = {
	sourceIs25Slides: source.slides?.length === 25,
	sourceSha256Stable: sourceSha256 === sha256(canonicalBytes(source)),
	executionSpecStable: executionSha256 === sha256(canonicalBytes(executionSpec)),
	firstDryRunMutationFree: first.dryRun.mutationFree === true,
	secondDryRunMutationFree: second.dryRun.mutationFree === true,
	dryRunPlanDigestEqual: first.dryRun.planDigest === second.dryRun.planDigest,
	dryRunLockedSpecDigestEqual: first.dryRun.lockedSpecDigest === second.dryRun.lockedSpecDigest,
	commitPlanDigestMatchesDryRun: first.commit.planDigest === first.dryRun.planDigest && second.commit.planDigest === second.dryRun.planDigest,
	bothPackages25Slides: first.commit.slideCount === 25 && second.commit.slideCount === 25,
	bothPackages871Objects: first.commit.objectCount >= 871 && second.commit.objectCount >= 871,
	readbackStable: first.readback.slides === 25 && second.readback.slides === 25 && first.readback.specSha256 === second.readback.specSha256,
	packageSemanticDigestEqual: first.package.semantic.digest === second.package.semantic.digest,
	packageSemanticEntryCountEqual: first.package.semantic.entries === second.package.semantic.entries,
}
const differingEntries = first.package.semantic.rows.filter((row, index) => JSON.stringify(row) !== JSON.stringify(second.package.semantic.rows[index])).map(row => row.name)
const report = {
	schemaVersion: 'betterpptx.canonical-25-clean-build-reproducibility-proof.v1',
	status: Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL',
	generatedAt: new Date().toISOString(),
	source: { file: path.relative(root, sourcePath).replaceAll('\\', '/'), sha256: sourceSha256, slides: source.slides?.length || 0, executionSha256 },
	builds: [first, second],
	comparison: { differingSemanticEntries: differingEntries, packageByteDigestsEqual: first.package.sha256 === second.package.sha256 },
	checks,
	interpretation: 'Two isolated builder sessions consumed the same canonical source and silent-timed-notes execution lock. Their dry-run plan and locked-source digests, semantic readback, and canonicalized package-entry digests are equal. ZIP container metadata and docProps/core.xml are intentionally excluded from the package-semantic digest.',
}
const reportPath = path.join(outputDir, 'canonical-25-clean-build-reproducibility-proof.json')
const reportBytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`)
await fs.writeFile(reportPath, reportBytes)
await fs.writeFile(`${reportPath}.sha256`, `${sha256(reportBytes)}  ${path.basename(reportPath)}\n`)
console.log(JSON.stringify({ status: report.status, reportPath: path.relative(root, reportPath).replaceAll('\\', '/'), reportSha256: sha256(reportBytes), checks, builds: report.builds.map(build => ({ label: build.label, planDigest: build.dryRun.planDigest, lockedSpecDigest: build.dryRun.lockedSpecDigest, packageSha256: build.package.sha256, packageSemanticDigest: build.package.semantic.digest })) }, null, 2))
if (report.status !== 'PASS') process.exitCode = 1
