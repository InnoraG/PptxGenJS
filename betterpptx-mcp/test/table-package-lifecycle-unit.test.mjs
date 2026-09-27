import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { runTablePackageLifecycleProof } from '../verify-table-package-lifecycle-unit-v1.mjs'

function paginationSpec() {
	const rows = [['Header', 'Value']]
	for (let index = 1; index <= 10; index += 1) rows.push([`Metric ${index}`, `Value ${index}`])
	return {
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'Native table auto-pagination', layout: 'LAYOUT_WIDE',
		authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic', coordinateSystem: 'inches', objectIdentity: 'stable-names-required' },
		contentStory: { audience: 'presentation authors', outcome: 'prove table-to-slides behavior', remember: 'continuation pages retain the authored header' },
		visualDesign: { world: 'table pagination proof', framing: 'one auto-paged native table', tone: 'technical' },
		motionTime: { masterClock: 'static', timingSource: 'authored slide', syncPolicy: 'single clock' },
		slides: [{
			id: 'pagination', title: 'Auto-pagination', message: 'Every continuation remains non-empty and repeats the header.', layoutIntent: 'title-only',
			content: [{
				kind: 'table-panel', name: 'auto-page-table', objectName: 'auto-page-table', rows,
				tableOptions: { autoPage: true, autoPageRepeatHeader: true, autoPageHeaderRows: 1, fontSize: 18, margin: 0.08, colW: [3.4, 3.4] },
			}],
		}],
	}
}

function plainCellText(cell) {
	return Array.isArray(cell?.text) ? cell.text.map(run => run.text || '').join('') : String(cell?.text || '')
}

test('table unit has exact inventory and repair-safe create/re-edit/export/recompile/delete package closure', { timeout: 120000 }, async () => {
	const outputDir = path.join(os.tmpdir(), `betterpptx-table-package-test-${Date.now()}-${process.pid}`)
	try {
		const report = await runTablePackageLifecycleProof({ outputDir, office: false })
		assert.equal(report.unitId, 'impl-c-4e199c49def769be')
		assert.equal(report.status, 'TABLE_PACKAGE_LIFECYCLE_VERIFIED_OFFICE_GATED')
		assert.equal(report.inventory.unit.fanOutRows, 36)
		assert.equal(report.inventory.rows.length, 36)
		assert.equal(new Set(report.inventory.rows.map(row => row.id)).size, 36)
		assert.equal(report.lifecycle.length, 4)
		assert.deepEqual(report.lifecycle.map(item => item.label), ['initial', 're-edited', 'recompiled', 'deleted'])
		assert.equal(report.lifecycle.slice(0, 3).every(item => item.tables.length === 2), true)
		assert.equal(report.lifecycle.slice(0, 3).every(item => item.repeatedWrite.stateStable && item.repeatedWrite.bytesStable), true)
		assert.equal(report.lifecycle[3].tableCount, 0)
		assert.equal(report.checks.mixedMergeGridClosure, true)
		assert.equal(report.checks.selectorReplacementAndComponentReset, true)
		assert.equal(report.checks.exportAndPortableRecompile, true)
		assert.equal(report.checks.deleteAndRelationshipCleanup, true)
		assert.equal(report.blockers.length, 0)
	} finally {
		await fs.rm(outputDir, { recursive: true, force: true })
	}
})

test('public JSON-spec auto-pagination never emits an empty table and repeats the authored header', { timeout: 60000 }, async () => {
	const { createMcpToolDispatcher, getDeck } = await import('../engine.mjs')
	const mcp = createMcpToolDispatcher({ sessionId: `table-pagination-${Date.now()}`, clientInfo: { name: 'table-pagination-verifier', version: '1' }, blackBox: false, __skipDurableOperationLedger: true, __skipDurableDeckPersistence: true })
	const deckIds = []
	try {
		const result = await mcp.call('betterpptx.deck.generate_from_spec', { spec: paginationSpec(), phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'full' })
		assert.equal(result?.ok, true, JSON.stringify(result))
		const deckId = (result.data || result).deckId
		deckIds.push(deckId)
		const entry = getDeck(deckId)
		assert.ok(entry.pptx.slides.length > 1, 'fixture must exercise at least one continuation slide')
		const tables = entry.pptx.slides.flatMap(slide => slide._slideObjects.filter(object => object?._type === 'table'))
		assert.ok(tables.length > 1, 'fixture must exercise at least one continuation slide')
		assert.equal(new Set(tables.map(table => table.options.objectName)).size, tables.length, 'every continuation table must retain a unique stable object name')
		for (const table of tables) {
			assert.ok(table.arrTabRows.length > 0, 'auto-pagination must not append an empty table fragment')
			assert.deepEqual(table.arrTabRows[0].map(plainCellText), ['Header', 'Value'], 'every table fragment must repeat the authored header')
		}

		const exportedResult = await mcp.call('betterpptx.deck.export_spec', { deckId, mode: 'current', download: false, detail: 'full' })
		assert.equal(exportedResult?.ok, true, JSON.stringify(exportedResult))
		const exported = (exportedResult.data || exportedResult).spec
		const exportedTables = exported.slides.flatMap(slide => (slide.content || []).filter(block => block.kind === 'table-panel'))
		assert.equal(exportedTables.length, tables.length)
		assert.equal(exportedTables.every(block => block.rows.length > 0 && block.tableOptions?.autoPage === false && block.tableOptions?.autoPageRepeatHeader === undefined), true)
		assert.equal(new Set(exportedTables.map(block => block.objectName)).size, exportedTables.length)

		const replayResult = await mcp.call('betterpptx.deck.generate_from_spec', { spec: exported, phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'full' })
		assert.equal(replayResult?.ok, true, JSON.stringify(replayResult))
		const replayDeckId = (replayResult.data || replayResult).deckId
		deckIds.push(replayDeckId)
		const replayTables = getDeck(replayDeckId).pptx.slides.flatMap(slide => slide._slideObjects.filter(object => object?._type === 'table'))
		assert.equal(replayTables.length, tables.length, 'portable replay must not expand auto-page fragments a second time')
		assert.equal(replayTables.every(table => table.arrTabRows.length > 0 && table.arrTabRows[0].map(plainCellText).join('|') === 'Header|Value'), true)
	} finally {
		for (const deckId of deckIds) await mcp.call('betterpptx.deck.dispose', { deckId }).catch(() => {})
	}
})
