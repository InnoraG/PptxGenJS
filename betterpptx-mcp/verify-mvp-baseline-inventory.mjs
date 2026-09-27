// Verify that the latest catalog-closure inventory still represents every
// currently assembled capability source.  The inventory is private release
// evidence; this verifier does not expose source paths through product tools.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildMvpBaselineInventory } from './generate-mvp-baseline-inventory.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const INVENTORY_ROOT = path.resolve(ROOT, 'outputs/authoring-principle-corpus/mvp-baseline-inventory')

function latestInventoryPath() {
	const candidates = fs.existsSync(INVENTORY_ROOT)
		? fs.readdirSync(INVENTORY_ROOT, { withFileTypes: true })
			.filter(item => item.isDirectory())
			.map(item => path.join(INVENTORY_ROOT, item.name, 'mvp-baseline-inventory.json'))
			.filter(file => fs.existsSync(file))
		: []
	if (!candidates.length) return null
	return candidates.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0]
}

function result(status, checks, inventoryPath = null) {
	return {
		schemaVersion: 'betterpptx.authoring.mvp-baseline-inventory-verification.v1',
		status,
		inventoryPath: inventoryPath ? path.relative(ROOT, inventoryPath).replaceAll('\\', '/') : null,
		checks,
	}
}

export function verifyMvpBaselineInventory(options = {}) {
	const inventoryPath = options.path
		? path.resolve(ROOT, options.path)
		: latestInventoryPath()
	if (!inventoryPath || !fs.existsSync(inventoryPath)) {
		return result('FAIL', [{ id: 'inventory-present', status: 'FAIL', detail: 'No generated MVP baseline inventory was found.' }], inventoryPath)
	}
	let inventory
	try {
		inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'))
	} catch (error) {
		return result('FAIL', [{ id: 'inventory-json', status: 'FAIL', detail: String(error?.message || error) }], inventoryPath)
	}
	const current = buildMvpBaselineInventory({ generatedAt: inventory.generatedAt })
	const checks = []
	const add = (id, ok, detail) => checks.push({ id, status: ok ? 'PASS' : 'FAIL', detail })
	add('schema', inventory.schemaVersion === 'betterpptx.authoring.mvp-baseline-inventory.v1', `schema=${inventory.schemaVersion || 'missing'}`)
	add('source-files', inventory.verification?.allSourcesPresent === true && current.verification.allSourcesPresent === true, 'all declared inventory sources exist')
	add('catalog-fingerprint', inventory.baseline?.catalogFingerprint === current.baseline.catalogFingerprint, `stored=${inventory.baseline?.catalogFingerprint || 'missing'} current=${current.baseline.catalogFingerprint}`)
	add('source-fingerprint', inventory.sources?.fingerprint === current.sources.fingerprint, 'source hashes match the current assembled catalog sources')
	add('ledger-semantic-hash', inventory.sources?.ledgerSemanticHash === current.sources.ledgerSemanticHash, 'capability-ledger semantic hash matches')
	add('public-tool-definitions', inventory.coverage?.publicToolDefinitions?.missingDefinitions?.length === 0 && current.coverage.publicToolDefinitions.missingDefinitions.length === 0, 'every public JSON-spec-first tool is declared')
	add('declared-handler-parity', inventory.verification?.allDeclaredToolsHaveHandlers === true && current.verification.allDeclaredToolsHaveHandlers === true, 'every declared tool has an engine handler; engine-only handlers are recorded separately')
	add('family-composition-routes', inventory.coverage?.publicToolDefinitions?.familyRouteGaps?.length === 0 && current.coverage.publicToolDefinitions.familyRouteGaps.length === 0, 'every semantic family has a composition route')
	add('baseline-public-route-contract', inventory.verification?.allBaselineRowsHavePublicRouteContract === true && current.verification.allBaselineRowsHavePublicRouteContract === true, 'every baseline row has a public discovery/composition/validation route contract')
	const storedIds = new Set((inventory.rows || []).map(row => row.id))
	const currentIds = new Set(current.rows.map(row => row.id))
	const missing = [...currentIds].filter(id => !storedIds.has(id))
	const extra = [...storedIds].filter(id => !currentIds.has(id))
	add('row-set-complete', missing.length === 0 && extra.length === 0, `missing=${missing.length} extra=${extra.length}`)
	add('no-duplicate-ids', storedIds.size === (inventory.rows || []).length, `rows=${(inventory.rows || []).length} unique=${storedIds.size}`)
	add('no-silent-drop', inventory.verification?.noProductRowsSilentlyDropped === true, 'inventory explicitly records all assembled source rows')
	const status = checks.every(check => check.status === 'PASS') ? 'PASS' : 'FAIL'
	return result(status, checks, inventoryPath)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const report = verifyMvpBaselineInventory({ path: process.argv[2] })
	console.log(JSON.stringify(report, null, 2))
	if (report.status !== 'PASS') process.exitCode = 1
}
