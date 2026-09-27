#!/usr/bin/env node
// Maintainer-only: in-process dry-run timing sweep over the frozen-reference corpus.
// Usage: node profile-generate-dryrun-corpus-v1.mjs [manifest.json]

process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'

import fs from 'node:fs/promises'
import path from 'node:path'
import { performance } from 'node:perf_hooks'

const manifestPath = process.argv[2] || 'D:/PptxGenJS_Claude/outputs/frozen-reference-corpus-final-20260611-1320/manifest.json'
const manifest = JSON.parse((await fs.readFile(manifestPath, 'utf8')).replace(/^﻿/, ''))
const { callBetterPptxTool } = await import('./engine.mjs')
const context = { sessionId: `profile-dryrun-corpus-${Date.now()}` }

const rows = []
for (let i = 0; i < manifest.length; i += 1) {
	const referencePath = manifest[i].path
	const name = path.basename(referencePath)
	const row = { index: i + 1, name }
	try {
		const referenceBytes = await fs.readFile(referencePath)
		row.referenceKB = Math.round(referenceBytes.length / 1024)
		let t = performance.now()
		const opened = await callBetterPptxTool('betterpptx.deck.open_uploaded', {
			data: `data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,${referenceBytes.toString('base64')}`,
			fileName: name,
			preserveTiming: true,
		}, context)
		row.openMs = Math.round(performance.now() - t)
		if (!opened?.ok) throw new Error(`open failed: ${opened?.error?.code}`)
		t = performance.now()
		const exported = await callBetterPptxTool('betterpptx.deck.export_spec', {
			deckId: opened.data.deckId,
			detail: 'full',
		}, context)
		row.exportMs = Math.round(performance.now() - t)
		if (!exported?.ok) throw new Error(`export failed: ${exported?.error?.code}`)
		const spec = exported.data.spec
		row.specKB = Math.round(Buffer.byteLength(JSON.stringify(spec)) / 1024)
		row.slides = spec.slides?.length
		t = performance.now()
		const dryRun = await callBetterPptxTool('betterpptx.deck.generate_from_spec', {
			deckId: opened.data.deckId,
			commitMode: 'replaceDeck',
			spec,
			phase: 'dryRun',
			detail: 'summary',
			includePlan: false,
			includePatchPlan: false,
			billingConfirmed: false,
		}, context)
		row.dryRunMs = Math.round(performance.now() - t)
		row.ops = dryRun?.data?.operationCount ?? null
		row.dryRunOk = dryRun?.ok === true
		row.dryRunResponseKB = Math.round(Buffer.byteLength(JSON.stringify(dryRun)) / 1024)
		if (!dryRun?.ok) row.error = `${dryRun?.error?.code}: ${String(dryRun?.error?.message || '').slice(0, 120)}`
	} catch (err) {
		row.error = String(err?.message || err).slice(0, 160)
	}
	rows.push(row)
	console.log(JSON.stringify(row))
}
console.log('\nindex\tname\topenMs\texportMs\tdryRunMs\tops\tspecKB\trespKB\terror')
for (const row of rows) {
	console.log(`${row.index}\t${row.name}\t${row.openMs ?? ''}\t${row.exportMs ?? ''}\t${row.dryRunMs ?? ''}\t${row.ops ?? ''}\t${row.specKB ?? ''}\t${row.dryRunResponseKB ?? ''}\t${row.error ?? ''}`)
}
