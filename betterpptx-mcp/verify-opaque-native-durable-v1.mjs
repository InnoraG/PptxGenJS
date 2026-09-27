#!/usr/bin/env node
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { callBetterPptxTool } from './engine.mjs'

function fail(message, detail = {}) {
	console.error('OPAQUE NATIVE DURABLE VERIFY: FAIL')
	console.error(message)
	if (Object.keys(detail).length) console.error(JSON.stringify(detail, null, 2))
	process.exit(1)
}

function okResult(label, result) {
	if (!result?.ok) fail(`${label} failed.`, result)
	return result.data
}

function assertPublicSafeExport(value) {
	const text = JSON.stringify(value)
	const leaks = [
		/<(?:p|a|r|pkg):/i,
		/[A-Za-z]:[\\/][A-Za-z0-9_. -]/,
		/\/Users\//,
		/\/tmp\//,
		/\bnode_modules\b/i,
		/\bengine\.mjs\b/i,
	].filter(rx => rx.test(text)).map(String)
	if (leaks.length) fail('exported spec leaked private/raw details.', { leaks })
}

const PASSTHROUGH_XML = '<p:sp xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:nvSpPr><p:cNvPr id="991" name="Durable Raw Shape"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="914400" y="914400"/><a:ext cx="1828800" cy="914400"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Opaque</a:t></a:r></a:p></p:txBody></p:sp>'

async function main() {
	const context = { sessionId: `verify-opaque-native-${Date.now()}` }
	const deck = okResult('deck.new', await callBetterPptxTool('betterpptx.deck.new', {
		title: 'Opaque Native Durable Source',
		directorMode: 'primitive-direct',
	}, context))
	okResult('slide.add', await callBetterPptxTool('betterpptx.slide.add', {
		deckId: deck.deckId,
		background: { color: 'FFFFFF' },
	}, context))
	okResult('passthrough_xml', await callBetterPptxTool('betterpptx.slide.passthrough_xml', {
		deckId: deck.deckId,
		slideIndex: 0,
		xml: PASSTHROUGH_XML,
	}, context))
	const exported = okResult('deck.export_spec', await callBetterPptxTool('betterpptx.deck.export_spec', {
		deckId: deck.deckId,
		detail: 'full',
	}, context))
	assertPublicSafeExport(exported.spec)
	const block = exported.spec?.slides?.[0]?.content?.find(item => item.kind === 'opaqueNative')
	if (!block?.preservationHandle || !/^asset:\/\/locked\/opaque-native\/[a-f0-9]{64}\.json$/i.test(block.preservationHandle)) {
		fail('export_spec did not return a durable locked opaque-native handle.', block || {})
	}

	const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-opaque-'))
	const specPath = path.join(tempDir, 'spec.json')
	const replayScriptPath = path.join(tempDir, 'replay.mjs')
	await fs.writeFile(specPath, JSON.stringify({ ...exported.spec, title: 'Opaque Native Durable Replay' }, null, 2))
	await fs.writeFile(replayScriptPath, `
		process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
		process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'
		const fs = await import('node:fs/promises')
		const { callBetterPptxTool } = await import(${JSON.stringify(pathToFileURL(path.resolve('betterpptx-mcp/engine.mjs')).href)})
		const spec = JSON.parse(await fs.readFile(${JSON.stringify(specPath)}, 'utf8'))
		const context = { sessionId: 'opaque-native-replay-child-' + Date.now() }
		const commit = await callBetterPptxTool('betterpptx.deck.generate_from_spec', { spec, phase: 'commit' }, context)
		if (!commit.ok) throw new Error('commit failed: ' + JSON.stringify(commit))
		const exported = await callBetterPptxTool('betterpptx.deck.export_spec', { deckId: commit.data.deckId, detail: 'full' }, context)
		if (!exported.ok) throw new Error('re-export failed: ' + JSON.stringify(exported))
		const opaqueBlocks = (exported.data.spec.slides || []).flatMap(slide => slide.content || []).filter(block => block.kind === 'opaqueNative')
		if (!opaqueBlocks.length) throw new Error('durable replay did not restore an opaqueNative object: ' + JSON.stringify(exported.data.spec))
		const validate = await callBetterPptxTool('betterpptx.deck.validate', { deckId: commit.data.deckId }, context)
		if (!validate.ok) throw new Error('validate failed: ' + JSON.stringify(validate))
		console.log(JSON.stringify({
			deckId: commit.data.deckId,
			opaqueNativeCount: opaqueBlocks.length,
			exportedBlockCount: (exported.data.spec.slides || []).reduce((sum, slide) => sum + (slide.content || []).length, 0),
			validateOk: validate.ok
		}))
	`)
	const child = spawnSync(process.execPath, [replayScriptPath], {
		cwd: process.cwd(),
		encoding: 'utf8',
		env: {
			...process.env,
			BETTERPPTX_PUBLIC_BLACK_BOX: '1',
			BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY: '1',
		},
	})
	if (child.status !== 0) {
		fail('fresh-process replay failed.', {
			status: child.status,
			stdout: child.stdout,
			stderr: child.stderr,
		})
	}
	let replay
	try {
		replay = JSON.parse(child.stdout.trim().split(/\r?\n/).pop())
	} catch (err) {
		fail('fresh-process replay did not return JSON.', { stdout: child.stdout, stderr: child.stderr, error: err.message })
	}
	console.log('OPAQUE NATIVE DURABLE VERIFY: PASS')
	console.log(JSON.stringify({
		handle: block.preservationHandle,
		replay,
	}, null, 2))
}

main().catch(error => fail(error?.message || String(error), { stack: error?.stack }))
