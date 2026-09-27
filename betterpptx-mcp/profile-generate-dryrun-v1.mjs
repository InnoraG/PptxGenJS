#!/usr/bin/env node
// Maintainer-only perf harness: replays the spec-edit roundtrip dry-run pipeline
// fully in-process (no MCP transport) so the server-side cost of
// betterpptx.deck.generate_from_spec phase:dryRun can be timed and CPU-profiled.
//
// Usage:
//   node profile-generate-dryrun-v1.mjs [reference.pptx] [--repeat N] [--stop-after open|export|dryrun]
//   node --cpu-prof --cpu-prof-dir=../outputs/dryrun-profile profile-generate-dryrun-v1.mjs ref.pptx

process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'

import fs from 'node:fs/promises'
import path from 'node:path'
import { performance } from 'node:perf_hooks'

const argv = process.argv.slice(2)
let referencePath = 'D:/PptxGenJS_Claude/tmp_autonomous_test/3DanimationFrozenReference.pptx'
let repeat = 1
let dryRunRepeat = 1
let stopAfter = 'dryrun'
for (let i = 0; i < argv.length; i += 1) {
	if (argv[i] === '--repeat') repeat = Number(argv[++i] || 1)
	else if (argv[i] === '--dryrun-repeat') dryRunRepeat = Number(argv[++i] || 1)
	else if (argv[i] === '--stop-after') stopAfter = String(argv[++i] || 'dryrun')
	else referencePath = argv[i]
}

const { callBetterPptxTool } = await import('./engine.mjs')
const context = { sessionId: `profile-dryrun-${Date.now()}` }

function ok(label, result) {
	if (!result?.ok) {
		console.error(`${label} failed:`, JSON.stringify(result?.error || result, null, 2).slice(0, 4000))
		process.exit(1)
	}
	return result.data
}

async function timed(label, fn) {
	const t0 = performance.now()
	const value = await fn()
	const ms = Math.round(performance.now() - t0)
	console.log(`${label}: ${ms} ms`)
	return { value, ms }
}

const referenceBytes = await fs.readFile(referencePath)
console.log(`reference: ${referencePath} (${referenceBytes.length} bytes)`)

for (let run = 1; run <= repeat; run += 1) {
	console.log(`--- run ${run}/${repeat} ---`)
	const opened = await timed('open_uploaded', () => callBetterPptxTool('betterpptx.deck.open_uploaded', {
		data: `data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,${referenceBytes.toString('base64')}`,
		fileName: path.basename(referencePath),
		preserveTiming: true,
	}, context))
	const openedData = ok('open_uploaded', opened.value)
	if (stopAfter === 'open') continue

	const exported = await timed('export_spec', () => callBetterPptxTool('betterpptx.deck.export_spec', {
		deckId: openedData.deckId,
		detail: 'full',
	}, context))
	const exportedData = ok('export_spec', exported.value)
	const spec = exportedData.spec
	console.log(`spec bytes: ${Buffer.byteLength(JSON.stringify(spec))}, slides: ${spec.slides?.length}`)
	if (stopAfter === 'export') continue

	const summary = await callBetterPptxTool('betterpptx.deck.summary', { deckId: openedData.deckId }, context)
	const deckVersion = summary?.data?.deckVersion ?? summary?.data?.version

	let dryRun
	for (let pass = 1; pass <= dryRunRepeat; pass += 1) {
		dryRun = await timed(`generate_from_spec dryRun #${pass}`, () => callBetterPptxTool('betterpptx.deck.generate_from_spec', {
			deckId: openedData.deckId,
			deckVersion,
			commitMode: 'replaceDeck',
			spec,
			phase: 'dryRun',
			detail: 'summary',
			includePlan: false,
			includePatchPlan: false,
			billingConfirmed: false,
		}, context))
	}
	const dryRunPayload = dryRun.value
	if (dryRunPayload?.ok) {
		console.log(`dryRun ok: operationCount=${dryRunPayload.data?.operationCount}, warnings=${dryRunPayload.warnings?.length ?? dryRunPayload.data?.warnings?.length ?? 'n/a'}`)
	} else {
		console.log(`dryRun not ok: code=${dryRunPayload?.error?.code} message=${String(dryRunPayload?.error?.message || '').slice(0, 200)}`)
	}
}
console.log('PROFILE DONE')
