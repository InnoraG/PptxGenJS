import assert from 'node:assert/strict'
import test from 'node:test'

import { TOOLS } from '../tools.mjs'
import { applyCatalogTruth } from '../capability-truth.mjs'
import {
	MODEL3D_PUBLIC_OPERATION_CONTRACTS,
	MODEL3D_PUBLIC_OPERATION_NAMES,
	MODEL3D_PUBLIC_OPERATION_ROW_IDS,
	MODEL3D_PUBLIC_OPERATION_SCHEMAS,
	assertModel3dPublicOutput,
	model3dPublicOperationCapabilityContractForEntry,
	validateModel3dPublicOperationArgs,
} from '../model3d-public-operation-contract.mjs'

test('model3d generation rows close as exact public host commands', () => {
	assert.equal(MODEL3D_PUBLIC_OPERATION_NAMES.length, 2)
	for (const name of MODEL3D_PUBLIC_OPERATION_NAMES) {
		const entry = { id: MODEL3D_PUBLIC_OPERATION_ROW_IDS[name.endsWith('rigged3d') ? 'generateRigged3d' : 'generateModel3d'], sourceKind: 'public-tool', family: 'model3d', label: name, implemented: true }
		const contract = model3dPublicOperationCapabilityContractForEntry(entry)
		assert.ok(contract)
		assert.equal(contract.capabilityStatus, 'host-command-not-persistent-style')
		assert.equal(applyCatalogTruth(entry).capabilityStatus, 'host-command-not-persistent-style')
		assert.equal(contract.runtimeReady, true)
		assert.deepEqual(contract.overrideFields, [])
	}
})

test('public model3d operation schemas are closed and bounded', () => {
	const byName = new Map(TOOLS.map(tool => [tool.name, tool]))
	for (const name of MODEL3D_PUBLIC_OPERATION_NAMES) {
		const schema = MODEL3D_PUBLIC_OPERATION_SCHEMAS[name]
		assert.equal(schema.type, 'object')
		assert.equal(schema.additionalProperties, false)
		const published = byName.get(name)?.inputSchema
		assert.equal(published?.type, 'object')
		assert.equal(published?.additionalProperties, false)
		for (const key of Object.keys(schema.properties || {})) assert.ok(published?.properties?.[key], `${name}.${key}`)
	}
	assert.equal(MODEL3D_PUBLIC_OPERATION_SCHEMAS['betterpptx.assets.generate_model3d'].properties.searchLimit.maximum, 50)
	assert.equal(MODEL3D_PUBLIC_OPERATION_SCHEMAS['betterpptx.assets.generate_rigged3d'].properties.imageHandles.maxItems, 4)
})

test('model3d argument and output guards preserve opaque asset semantics', () => {
	assert.doesNotThrow(() => validateModel3dPublicOperationArgs('betterpptx.assets.generate_model3d', { query: 'easel', kind: 'device' }))
	assert.throws(() => validateModel3dPublicOperationArgs('betterpptx.assets.generate_model3d', { secret: true }), /not part of the public/)
	assert.throws(() => validateModel3dPublicOperationArgs('betterpptx.assets.generate_rigged3d', { prompt: 'a presenter' }), /experimentalConfirmed.*true/i)
	assert.doesNotThrow(() => validateModel3dPublicOperationArgs('betterpptx.assets.generate_rigged3d', { experimentalConfirmed: true, prompt: 'a presenter' }))
	assert.doesNotThrow(() => validateModel3dPublicOperationArgs('betterpptx.assets.generate_rigged3d', { experimentalConfirmed: true, imageHandles: ['gen://image/abcdef12'] }))
	assert.throws(() => validateModel3dPublicOperationArgs('betterpptx.assets.generate_rigged3d', { experimentalConfirmed: true, prompt: 'x', imageUrl: 'https://example.test/a.png', imageBase64: 'YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXo=' }), /exactly one image source lane/)
	assert.doesNotThrow(() => assertModel3dPublicOutput('betterpptx.assets.generate_model3d', { ok: true, handle: 'asset://catalog/model3d/example', selection: { selected: { handle: 'asset://catalog/model3d/example' } } }))
	assert.throws(() => assertModel3dPublicOutput('betterpptx.assets.generate_model3d', { ok: true, modelPath: 'C:\\private\\model.glb' }), /private/)
})
