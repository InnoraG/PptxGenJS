import assert from 'node:assert/strict'
import test from 'node:test'

import Ajv from 'ajv'

import { applyCatalogTruth } from '../capability-truth.mjs'
import {
	HYPERLINK_ENTRY_CONTRACT,
	HYPERLINK_ENTRY_ROW_ID,
	HYPERLINK_ENTRY_UNIT_ID,
	HYPERLINK_PUBLIC_SCHEMA,
	hyperlinkEntryCapabilityContractForEntry,
	normalizeHyperlink,
} from '../hyperlink-entry-contract.mjs'
import { publicBaselineCatalog } from '../public-baseline-catalog.mjs'

const validate = new Ajv({ allErrors: true, jsonPointers: true }).compile(structuredClone(HYPERLINK_PUBLIC_SCHEMA))

test('add-hyperlink row exposes one exact public semantic contract', () => {
	assert.equal(HYPERLINK_ENTRY_UNIT_ID, 'impl-b-dd9d9170d70c8ce8')
	assert.equal(HYPERLINK_ENTRY_ROW_ID, 'cap_ec04790e0410160fc4c3')
	assert.equal(HYPERLINK_ENTRY_CONTRACT.runtimeReady, true)
	assert.equal(HYPERLINK_ENTRY_CONTRACT.capabilityStatus, 'executable-exact-structured')
	assert.deepEqual(HYPERLINK_ENTRY_CONTRACT.componentOwnership, ['relationships', 'hyperlink'])
	assert.deepEqual(HYPERLINK_ENTRY_CONTRACT.overrideFields, ['hyperlink.url', 'hyperlink.slide', 'hyperlink.tooltip', 'hyperlink.target'])
	assert.equal(hyperlinkEntryCapabilityContractForEntry({ id: HYPERLINK_ENTRY_ROW_ID }), HYPERLINK_ENTRY_CONTRACT)
	assert.equal(hyperlinkEntryCapabilityContractForEntry({ id: 'other' }), null)

	const entry = publicBaselineCatalog({ family: 'layouts-themes-masters', includePlanned: true, limit: 500 }).entries.find(item => item.id === HYPERLINK_ENTRY_ROW_ID)
	assert.ok(entry)
	assert.equal(entry.selection.semanticKind, 'hyperlink')
	assert.equal(entry.selection.executableValue, 'hyperlink')
	assert.match(entry.selection.semanticPath, /content\[\].*hyperlink/)
	assert.equal(entry.route.semanticKind, 'hyperlink')
	assert.equal(entry.route.exactSelection, 'betterpptx.deck.generate_from_spec')
	assert.equal(applyCatalogTruth(entry).capabilityStatus, 'executable-exact-structured')
})

test('hyperlink schema accepts only safe external or one-based internal destinations', () => {
	for (const value of [
		null,
		{ url: 'https://example.com/path', tooltip: 'Open example', target: '_blank' },
		{ url: 'mailto:proof@example.com', target: '_self' },
		{ url: 'tel:+15550100', target: null },
		{ slide: 2, tooltip: 'Open slide two' },
	]) assert.equal(validate(value), true, JSON.stringify(validate.errors))

	for (const value of [
		{},
		{ url: 'http://example.com' },
		{ url: 'file:///C:/secret.txt' },
		{ url: 'https://example.com', slide: 2 },
		{ slide: 0 },
		{ slide: 2, target: '_blank' },
		{ url: 'https://example.com', target: 'named-frame' },
		{ url: 'https://example.com', _rId: 7 },
	]) assert.equal(validate(value), false, `unexpectedly accepted ${JSON.stringify(value)}`)
})

test('normalizer preserves semantic values, null reset, and rejects private or unsafe fields', () => {
	assert.equal(normalizeHyperlink(null), null)
	assert.equal(normalizeHyperlink(undefined), undefined)
	assert.deepEqual(normalizeHyperlink({ url: '  HTTPS://example.com/a  ', tooltip: '  Link  ', target: '_top' }), {
		url: 'HTTPS://example.com/a', tooltip: 'Link', target: '_top',
	})
	assert.deepEqual(normalizeHyperlink({ slide: 3, tooltip: null }), { slide: 3 })
	for (const value of [
		{ url: 'javascript:alert(1)' },
		{ url: 'https://example.com', target: '_new' },
		{ slide: 2, target: '_blank' },
		{ url: 'https://example.com', _rId: 4 },
		{ url: 'https://example.com', tooltip: 'x'.repeat(1025) },
	]) assert.throws(() => normalizeHyperlink(value), /hyperlink|https|target|tooltip|public/i)
})
