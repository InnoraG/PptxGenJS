import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeSmartArtOptions, SMARTART_CONTRACT, SMARTART_OPTIONS_PUBLIC_SCHEMA, validateSmartArtBlock } from '../smartart-authoring-family-contract.mjs'

test('SmartArt authoring contract is closed, recursive, and reset-aware', () => {
	assert.equal(SMARTART_CONTRACT.capabilityStatus, 'executable-exact-structured')
	assert.equal(SMARTART_OPTIONS_PUBLIC_SCHEMA.additionalProperties, false)
	const normalized = normalizeSmartArtOptions({
		mode: 'native', layout: 'hierarchy', rightToLeft: true, fontSize: 14, color: '#112233',
		nodes: [{ text: 'Root', role: 'root', children: [{ text: 'Assistant', role: 'assistant', color: '#AABBCC' }] }],
	})
	assert.equal(normalized.color, '112233')
	assert.equal(normalized.nodes[0].children[0].role, 'assistant')
	assert.throws(() => normalizeSmartArtOptions({ nodes: [{ text: 'x', _rawXml: '<x/>' }] }), /private/)
	assert.throws(() => normalizeSmartArtOptions({ mode: 'native', mystery: true }), /not part of the public SmartArt contract/)
	const block = { kind: 'smartart', nodes: ['One'], style: { fontFace: 'Aptos' } }
	validateSmartArtBlock(block)
	assert.equal(block.style.fontFace, 'Aptos')
})
