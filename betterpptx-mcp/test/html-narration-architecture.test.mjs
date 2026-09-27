import assert from 'node:assert/strict'
import test from 'node:test'
import { wrapPcmWav, joinWavBuffers, silencePcm } from '../narration/wav-join.mjs'
import { cuesToSynthesisSegments, mapCueProsody, narratedProfileRequested, normalizeNarrationForTts } from '../narration/tts-text.mjs'
import { applyLockedCompilePlan, rememberLockedCompilePlan, resetLockedCompilePlansForTests } from '../ir/compile-plan-store.mjs'
import { operationResolutionRequirement } from '../ir/spec-compiler.mjs'

test('notes stay author-readable while TTS gets a pronunciation copy', () => {
	assert.equal(normalizeNarrationForTts('GPT-5.6 Pro uses the API'), 'G P T 5 point 6 Pro uses the A P I')
})

test('granular cues become synthesis segments with measured pauses', () => {
	const segments = cuesToSynthesisSegments([
		{ cueId: 'c1', text: 'First beat', pauseAfterMs: 180 },
		{ cueId: 'c2', text: 'Second beat', rate: 0.92, pitch: '+2st' },
	])
	assert.equal(segments.length, 2)
	assert.equal(segments[0].gapAfterMs, 180)
	assert.ok(segments[1].lengthScale > 1)
	assert.equal(segments[1].prosody.partial, true)
	assert.ok(segments[1].prosody.unsupported.includes('independent pitch control'))
})

test('narrated profile is not silent-timed-notes', () => {
	assert.equal(narratedProfileRequested({ outputVariant: 'silent-timed-notes', narration: { text: 'Hello', synthesizeAudio: false } }), false)
	assert.equal(narratedProfileRequested({ narration: { text: 'Hello', synthesizeAudio: true } }), true)
})

test('cue-segment wav join concatenates PCM and authored silence', () => {
	const a = wrapPcmWav({ pcm: Buffer.alloc(22050 * 2), sampleRate: 22050, channels: 1, bitsPerSample: 16 })
	const b = wrapPcmWav({ pcm: Buffer.alloc(11025 * 2), sampleRate: 22050, channels: 1, bitsPerSample: 16 })
	const joined = joinWavBuffers([a, b], { pauseMs: [0, 200] })
	assert.ok(joined.durationMs >= 1200)
	assert.equal(joined.timeline.length, 2)
	assert.ok(silencePcm({ durationMs: 200 }).length > 0)
})

test('compile-once commit consumes the locked planId', () => {
	resetLockedCompilePlansForTests()
	const compiled = { specDigest: 'aaa', planDigest: 'plan-1', lockedPlanDigest: 'plan-1', operations: [{ tool: 'keep' }] }
	rememberLockedCompilePlan(compiled)
	const reused = applyLockedCompilePlan({ planId: 'plan-1' }, { specDigest: 'aaa', planDigest: 'plan-1', operations: [{ tool: 'fresh' }] }, 'commit')
	assert.equal(reused.operations[0].tool, 'keep')
	assert.throws(() => applyLockedCompilePlan({ planId: 'plan-1' }, { specDigest: 'bbb', planDigest: 'plan-1' }, 'commit'), { code: 'PLAN_ID_MISMATCH' })
	assert.throws(() => applyLockedCompilePlan({ planId: 'missing' }, compiled, 'commit'), { code: 'PLAN_ID_UNKNOWN' })
})

test('notes-only narration does not require TTS audio resolution', () => {
	assert.equal(operationResolutionRequirement({
		tool: 'betterpptx.slide.add_narration',
		args: { script: 'Keep this in notes', synthesizeAudio: false },
	}), null)
	assert.equal(operationResolutionRequirement({
		tool: 'betterpptx.slide.add_narration',
		args: { script: 'Speak this' },
	})?.kind, 'ttsAudio')
})

test('unsupported pitch is reported rather than dropped', () => {
	const mapped = mapCueProsody({ pitch: 4, rate: 1 })
	assert.equal(mapped.partial, true)
	assert.ok(mapped.applied.lengthScale)
})
