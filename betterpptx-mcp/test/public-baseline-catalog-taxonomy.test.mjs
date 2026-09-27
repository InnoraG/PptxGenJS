import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import test from 'node:test'

import { buildCapabilityLedger } from '../../dist/node/pptx-mcp/capability-ledger.js'
import { publicBaselineCatalog } from '../public-baseline-catalog.mjs'

const EXPECTED_CATALOG_ROWS = 2258

const CATEGORY_EXPECTATIONS = [
	{ pattern: /^Charts(?:\s|$)/i, family: 'charts' },
	{ pattern: /^SmartArt(?:\s|$)/i, family: 'smartart' },
	{ pattern: /^Advanced Geometry$/i, family: 'structural' },
	{ pattern: /^Shapes$/i, family: 'shapes-gradients' },
	{ pattern: /^Legacy Shape Aliases$/i, family: 'shapes-gradients' },
	{ pattern: /^Shape Styling$/i, family: 'shapes-gradients' },
	{ pattern: /^Shape Based Icons$/i, family: 'shapes-gradients' },
	{ pattern: /^(?:Transitions|Morph Semantics|Motion Paths|Animation Semantics|Animations(?:\s|$))/i, family: 'motion-transitions-morph' },
	{ pattern: /\b(?:layout|master|theme)\b/i, family: 'layouts-themes-masters' },
]

const LABEL_EXCEPTIONS = [
	{ category: /^Shapes$/i, label: /^(?:custGeom|freeform)$/i, family: 'structural' },
	{ category: /^Legacy Shape Aliases$/i, label: /^CUSTOM_GEOMETRY\s*->\s*custGeom$/i, family: 'structural' },
	{ category: /^Shape Styling$/i, label: /custom geometry preservation/i, family: 'structural' },
	{ category: /^Slide Authoring$/i, label: /transition|animation|timing/i, family: 'motion-transitions-morph' },
]

const REPRESENTATIVE_CASES = [
	['Transitions', 'shape', 'motion-transitions-morph'],
	['Motion Paths', 'funnel', 'motion-transitions-morph'],
	['Animations media', 'mediaplay', 'motion-transitions-morph'],
	['Slide Authoring', 'add transition', 'motion-transitions-morph'],
	['Slide Master Deep Topology', 'showMasterShapes', 'layouts-themes-masters'],
	['Slide Master Deep Topology Placeholders', 'chart', 'layouts-themes-masters'],
	['Shapes', 'flowChartProcess', 'shapes-gradients'],
	['Shapes', 'chartPlus', 'shapes-gradients'],
	['Legacy Shape Aliases', 'FLOWCHART_PROCESS -> flowChartProcess', 'shapes-gradients'],
	['Shape Based Icons', 'shape-built chart icon', 'shapes-gradients'],
	['Charts Shape Built Analytics', 'funnel/trapezoid chart', 'charts'],
	['Shapes', 'custGeom', 'structural'],
	['Shapes', 'freeform', 'structural'],
	['Legacy Shape Aliases', 'CUSTOM_GEOMETRY -> custGeom', 'structural'],
	['Shape Styling', 'custom geometry preservation', 'structural'],
]

function opaqueLedgerId(featureId) {
	return `cap_${crypto.createHash('sha256').update(`ledger:${featureId}`).digest('hex').slice(0, 20)}`
}

function allCatalogRows() {
	const first = publicBaselineCatalog({ includePlanned: true, offset: 0, limit: 500 })
	const rows = []
	for (let offset = 0; offset < first.pagination.total; offset += 500) {
		rows.push(...publicBaselineCatalog({ includePlanned: true, offset, limit: 500 }).entries)
	}
	return rows
}

function expectedFamily(row) {
	const exception = LABEL_EXCEPTIONS.find(rule => rule.category.test(row.category) && rule.label.test(row.publicName))
	if (exception) return exception.family
	return CATEGORY_EXPECTATIONS.find(rule => rule.pattern.test(row.category))?.family
}

test('catalog taxonomy preserves ledger row IDs while allowing generated atomic controls', () => {
	const ledgerRows = buildCapabilityLedger(undefined, 'betterpptx-mcp').rows
		.filter(row => row.category !== 'MCP Internal Admin Surface')
	const catalogRows = allCatalogRows()
	const catalogById = new Map(catalogRows.map(row => [row.id, row]))

	assert.ok(catalogRows.length >= EXPECTED_CATALOG_ROWS)
	assert.equal(catalogById.size, catalogRows.length)
	assert.ok(catalogRows.some(row => row.sourceKind === 'atomic-option-control'))

	for (const ledgerRow of ledgerRows) {
		const stableId = opaqueLedgerId(ledgerRow.featureId)
		assert.ok(catalogById.has(stableId), `${ledgerRow.category} :: ${ledgerRow.publicName} changed or lost its stable catalog ID`)
		const family = expectedFamily(ledgerRow)
		if (family) assert.equal(catalogById.get(stableId).family, family, `${ledgerRow.category} :: ${ledgerRow.publicName}`)
	}
})

test('catalog taxonomy locks representative collision cases', () => {
	const ledgerRows = buildCapabilityLedger(undefined, 'betterpptx-mcp').rows
	const catalogById = new Map(allCatalogRows().map(row => [row.id, row]))

	for (const [category, label, family] of REPRESENTATIVE_CASES) {
		const ledgerRow = ledgerRows.find(row => row.category === category && row.publicName === label)
		assert.ok(ledgerRow, `${category} :: ${label}`)
		assert.equal(catalogById.get(opaqueLedgerId(ledgerRow.featureId))?.family, family, `${category} :: ${label}`)
	}
})
