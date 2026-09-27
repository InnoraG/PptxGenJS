import assert from 'node:assert/strict'
import test from 'node:test'

import { applyCatalogTruth } from '../capability-truth.mjs'
import { publicBaselineCatalog } from '../public-baseline-catalog.mjs'
import { listArtDirections } from '../ir/layout-engine.mjs'
import {
	ART_DIRECTION_WORLD_CONTRACT,
	ART_DIRECTION_WORLD_KEYS,
	artDirectionWorldCapabilityContractForEntry,
	validateArtDirectionWorldSelection,
} from '../art-direction-world-contract.mjs'

test('all named Worlds are exact parameterized art-direction selectors', () => {
	const worlds = listArtDirections()
	assert.equal(worlds.length, 18)
	assert.deepEqual(ART_DIRECTION_WORLD_KEYS, worlds.map(world => world.key))
	const catalog = publicBaselineCatalog({ family: 'art-direction', limit: 50 })
	assert.equal(catalog.entries.length, 18)
	for (const entry of catalog.entries) {
		assert.equal(entry.capabilityMode, 'parameterized')
		assert.equal(entry.capabilityStatus, 'executable-exact-structured')
		assert.equal(artDirectionWorldCapabilityContractForEntry(entry), ART_DIRECTION_WORLD_CONTRACT)
		assert.equal(applyCatalogTruth(entry).capabilityStatus, 'executable-exact-structured')
	}
})

test('World selection exposes axis reset, precedence, and bespoke-safe combinations', () => {
	const selection = validateArtDirectionWorldSelection({ artDirection: 'observatory', mode: 'dark', palette: ['0D1321', '7DD3FC', 'A3E635'], card: 'plot', depth: null })
	assert.equal(selection.artDirection, 'observatory')
	assert.equal(selection.mode, 'dark')
	assert.ok(ART_DIRECTION_WORLD_CONTRACT.overrideFields.includes('styleIntent.artDirection.palette'))
	assert.ok(ART_DIRECTION_WORLD_CONTRACT.resetBehavior.component.includes('null'))
	assert.ok(ART_DIRECTION_WORLD_CONTRACT.precedence.length >= 3)
	assert.ok(ART_DIRECTION_WORLD_CONTRACT.legalCombinations.length >= 3)
	assert.throws(() => validateArtDirectionWorldSelection({ artDirection: 'not-a-world' }), /18 named World keys/)
	assert.throws(() => validateArtDirectionWorldSelection({ artDirection: 'observatory', privatePath: 'C:\\secret' }), /not part of the public art-direction World contract/)
})

