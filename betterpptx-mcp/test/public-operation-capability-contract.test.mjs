import assert from 'node:assert/strict'
import test from 'node:test'

import { PUBLIC_SPEC_FIRST_TOOLS, publicToolList } from '../blackbox.mjs'
import { listBetterPptxToolNames } from '../engine.mjs'
import {
	CANONICAL_FOUNDATION_OPERATION_NAMES,
	CONDITIONAL_COMMERCE_OPERATION_NAMES,
	CONDITIONAL_JOB_OPERATION_NAMES,
	FOUNDATION_PUBLIC_OPERATION_NAMES,
	FOUNDATION_PUBLIC_OPERATION_ROW_IDS,
} from '../public-operation-capability-contract.mjs'
import { publicBaselineCatalog } from '../public-baseline-catalog.mjs'
import { TOOLS } from '../tools.mjs'

const operationRows = () => publicBaselineCatalog({
	family: 'foundation',
	includePlanned: true,
	offset: 0,
	limit: 500,
}).entries.filter(entry => entry.sourceKind === 'public-tool')

test('the foundation collision is exactly the public operation surface', () => {
	const rows = operationRows()
	assert.equal(rows.length, FOUNDATION_PUBLIC_OPERATION_NAMES.length)
	assert.deepEqual(rows.map(row => row.id).sort(), FOUNDATION_PUBLIC_OPERATION_ROW_IDS)
	assert.deepEqual(rows.map(row => row.label).sort(), [...FOUNDATION_PUBLIC_OPERATION_NAMES].sort())

	for (const row of rows) {
		assert.equal(row.capabilityMode, 'discrete', row.label)
		assert.equal(row.capabilityStatus, 'host-command-not-persistent-style', row.label)
		assert.deepEqual(row.componentOwnership, ['publicOperation'], row.label)
		assert.deepEqual(row.overrideFields, [], row.label)
		assert.deepEqual(row.resetBehavior, {
			component: 'not-applicable',
			full: 'not-applicable',
			nullBehavior: 'not-applicable',
		}, row.label)
		assert.equal(row.selection.semanticKind, 'productOperation', row.label)
		assert.equal(row.route.status, 'public-tool', row.label)
		assert.deepEqual(row.route.composition, [row.label], row.label)
		assert.equal(row.route.exactSelection, row.label, row.label)
		assert.ok(row.applicability?.length, row.label)
		assert.match(row.limitation, /not itself serialized as a PowerPoint style or authoring field/, row.label)
	}
})

test('every classified row has a public schema and a dispatcher handler', () => {
	const toolByName = new Map(TOOLS.map(tool => [tool.name, tool]))
	const handlerNames = new Set(listBetterPptxToolNames())
	const rawProtocolNames = new Set(CONDITIONAL_COMMERCE_OPERATION_NAMES)

	for (const name of FOUNDATION_PUBLIC_OPERATION_NAMES) {
		const tool = toolByName.get(name)
		assert.ok(tool, name)
		assert.ok(tool.inputSchema && typeof tool.inputSchema === 'object', name)
		assert.ok(PUBLIC_SPEC_FIRST_TOOLS.has(name), name)
		assert.ok(handlerNames.has(name), name)
		if (rawProtocolNames.has(name)) {
			assert.equal(tool.protocolRawOutput, true, name)
			assert.equal(tool.outputSchema, undefined, name)
		} else {
			assert.ok(tool.outputSchema && typeof tool.outputSchema === 'object', name)
		}
	}
})

test('commerce compatibility operations are conditionally discoverable without changing catalog truth', () => {
	const previous = process.env.BETTERPPTX_MONETIZED_MCP_ENABLED
	try {
		delete process.env.BETTERPPTX_MONETIZED_MCP_ENABLED
		const disabled = new Set(publicToolList(TOOLS).map(tool => tool.name))
		for (const name of CANONICAL_FOUNDATION_OPERATION_NAMES) assert.ok(disabled.has(name), name)
		for (const name of CONDITIONAL_COMMERCE_OPERATION_NAMES) assert.ok(!disabled.has(name), name)
		for (const name of CONDITIONAL_JOB_OPERATION_NAMES) assert.ok(!disabled.has(name), name)

		process.env.BETTERPPTX_MONETIZED_MCP_ENABLED = '1'
		const enabled = new Set(publicToolList(TOOLS).map(tool => tool.name))
		for (const name of FOUNDATION_PUBLIC_OPERATION_NAMES) assert.ok(enabled.has(name), name)
	} finally {
		if (previous === undefined) delete process.env.BETTERPPTX_MONETIZED_MCP_ENABLED
		else process.env.BETTERPPTX_MONETIZED_MCP_ENABLED = previous
	}
})
