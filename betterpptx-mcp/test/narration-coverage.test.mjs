import test from 'node:test'
import assert from 'node:assert/strict'
import { narrationCoverageForManifests } from '../narration/coverage.mjs'

test('avatar-native Record Studio slides count as narration coverage', () => {
	const coverage = narrationCoverageForManifests(null, {
		slides: [
			{ slideIndex: 0, durationMs: 9000, advanceAfterTime: 9650, mode: 'videoWithAudio' },
			{ slideIndex: 1, durationMs: 10000, advanceAfterTime: 10650, mode: 'videoWithAudio' },
		],
	})
	assert.equal(coverage.coveredSlideCount, 2)
	assert.equal(coverage.timedSlideCount, 2)
})

test('native audio plus presenter replacement is deduplicated per slide', () => {
	const narration = { slides: [{ slideIndex: 0, durationMs: 9000, advanceAfterTime: 9650 }] }
	const avatar = { slides: [{ slideIndex: 0, durationMs: 9000, advanceAfterTime: 9650, mode: 'videoWithAudio' }] }
	const coverage = narrationCoverageForManifests(narration, avatar)
	assert.equal(coverage.coveredSlideCount, 1)
	assert.equal(coverage.timedSlideCount, 1)
})

test('untimed manifest entries count as authored coverage but not measured timing', () => {
	const coverage = narrationCoverageForManifests({ slides: [{ slideIndex: 0 }] }, null)
	assert.equal(coverage.coveredSlideCount, 1)
	assert.equal(coverage.timedSlideCount, 0)
})
