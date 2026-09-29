import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
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

const artDirectionGuide = readFileSync(new URL('../skills/betterpptx/references/art-direction-and-typography.md', import.meta.url), 'utf8')

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

test('omission and null are documented as neutral without adding World or mode defaults', () => {
	assert.deepEqual(validateArtDirectionWorldSelection({}), {})
	const reset = { artDirection: null, mode: null, palette: ['172033', '127C70'] }
	assert.deepEqual(validateArtDirectionWorldSelection(reset), reset)
	assert.ok(!ART_DIRECTION_WORLD_KEYS.includes('neutral'))
	assert.equal(ART_DIRECTION_WORLD_CONTRACT.publicSchema.required, undefined)
	assert.match(ART_DIRECTION_WORLD_CONTRACT.publicSchema.properties.artDirection.description, /Optional.*neutral\/no named World/i)
	assert.match(ART_DIRECTION_WORLD_CONTRACT.publicSchema.properties.mode.description, /Optional.*no authored mode/i)
	assert.deepEqual(ART_DIRECTION_WORLD_CONTRACT.publicSchema.properties.artDirection.oneOf.map(option => option.type), ['string', 'null'])
	assert.match(ART_DIRECTION_WORLD_CONTRACT.limitation, /only the 18 optional named-World selectors/i)
	assert.ok(ART_DIRECTION_WORLD_CONTRACT.overrideFields.includes('styleIntent.mode'))
	assert.ok(ART_DIRECTION_WORLD_CONTRACT.legalCombinations.some(rule => /premium, complete, business-appropriate.*not a World.*effects quota/i.test(rule)))
	assert.ok(ART_DIRECTION_WORLD_CONTRACT.legalCombinations.some(rule => /exact slide geometry.*AI and Director/i.test(rule)))
	assert.ok(ART_DIRECTION_WORLD_CONTRACT.legalCombinations.some(rule => /styling remains authoritative.*without selecting a World/i.test(rule)))
})

test('public art-direction guidance teaches optional Worlds and AI-owned geometry', () => {
	assert.match(artDirectionGuide, /premium, complete, business-appropriate/i)
	assert.match(artDirectionGuide, /`styleIntent\.artDirection` and `styleIntent\.mode` are optional/i)
	assert.match(artDirectionGuide, /Exact slide geometry remains AI-authored, including in Director-assisted workflows/i)
	assert.doesNotMatch(artDirectionGuide, /Choose an explicit art-direction World|Do not accept an omitted-World fallback/i)
})
