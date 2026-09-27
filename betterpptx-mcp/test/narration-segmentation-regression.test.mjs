import assert from 'node:assert/strict'
import test from 'node:test'
import { cuesToSynthesisSegments } from '../narration/tts-text.mjs'
import { buildSpecOperationPlan, NARRATION_CUE_ANCHOR_METHOD, operationResolutionRequirement } from '../ir/spec-compiler.mjs'
import { mergeNarrationSegmentsLockIntoSpec } from '../engine.mjs'

const fullScript = 'One delay. Four commitments. An eighteen-day exposure does not stay in one workstream. It travels from permit release, through civil works and energization, to commissioning. The recovery plan starts by making that dependency visible.'

function specFor(narration, objectCount = 36) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Narration segmentation regression',
		layout: 'LAYOUT_WIDE',
		styleIntent: { artDirection: 'editorial', mode: 'light' },
		presenter: { enabled: false },
		slides: [{
			id: 'narration-proof',
			layoutIntent: 'title-body',
			content: Array.from({ length: objectCount }, (_, index) => ({
				kind: 'textBox', name: `proof-${index}`, text: `Evidence ${index + 1}`,
			})),
			narration,
		}],
	}
}

function narrationOperation(spec) {
	const operations = buildSpecOperationPlan(spec).operations.filter(operation => operation.tool === 'betterpptx.slide.add_narration')
	assert.equal(operations.length, 1)
	return operations[0]
}

function locksFor(segments) {
	return segments.map((segment, index) => ({
		segment,
		lockedAudio: {
			handle: `asset://locked/audio/${String(index + 1).repeat(64)}.wav`,
			durationMs: 1200 + index * 100,
			extn: 'wav',
		},
		resolved: { audio: { source: 'tts' }, textHash: `spoken-text-${index + 1}`, provider: 'test-only' },
	}))
}

test('spec compiler preserves explicit clip-local WebVTT through the narration operation', () => {
	const first = 'WEBVTT\n\n00:00:00.000 --> 00:00:00.700\nFirst\n'
	const second = 'WEBVTT\n\n00:00:00.000 --> 00:00:00.700\nSecond\n'
	const operation = narrationOperation(specFor({ segments: [
		{ script: 'First.', closedCaptionTracks: [{ language: 'en-US', vtt: first }] },
		{ script: 'Second.', audio: { closedCaptionTracks: [{ language: 'en-US', vtt: second }] } },
	] }, 2))
	assert.equal(operation.args.segments[0].closedCaptionTracks[0].vtt, first)
	assert.equal(operation.args.segments[1].audio.closedCaptionTracks[0].vtt, second)
})

test('visual cue anchors never become spoken synthesis segments', () => {
	assert.equal(cuesToSynthesisSegments([
		{ atPhrase: 'One delay', target: 'a' },
		{ phrase: 'One delay', target: 'b' },
		{ atMs: 600, target: 'c' },
	]), null)
	assert.equal(cuesToSynthesisSegments([
		{ atPhrase: 'One delay', text: 'One delay', autoSyncedBuild: true },
		{ atPhrase: 'One delay', text: 'One delay', autoSyncedBuild: true },
	]), null, 'even a normalized auto-cue text copy is a visual anchor, not speech')
})

test('partial, repeated, reordered, or unrelated cue text cannot replace a full narration script', () => {
	for (const texts of [
		['One delay.', 'Four commitments.'],
		['One delay.', 'One delay.'],
		['Four commitments.', 'One delay.'],
		['A different sentence.', 'Another sentence.'],
	]) {
		assert.equal(cuesToSynthesisSegments(texts.map(text => ({ text })), { script: fullScript }), null)
	}
})

test('complete authored granular speech preserves words, order, pauses, and rate', () => {
	const cues = [
		{ text: 'First complete sentence.', pauseAfterMs: 180, target: 'a' },
		{ script: 'Second complete sentence.', rate: 0.92, target: 'b' },
	]
	const segments = cuesToSynthesisSegments(cues, { script: 'First complete sentence.\nSecond complete sentence.' })
	assert.deepEqual(segments.map(segment => segment.script), ['First complete sentence.', 'Second complete sentence.'])
	assert.equal(segments[0].gapAfterMs, 180)
	assert.ok(segments[1].lengthScale > 1)
	assert.deepEqual(segments.map(segment => segment.cues[0].target), ['a', 'b'])
	assert.equal(cuesToSynthesisSegments(cues).length, 2, 'existing cue-only speech authoring remains supported')
})

test('many auto-build objects keep one complete media-timed script and all visual cues', () => {
	const spec = specFor({ script: fullScript, timingAuthority: 'media', startDelayMs: 450, paddingMs: 900 })
	const untouched = structuredClone(spec)
	const operation = narrationOperation(spec)
	assert.equal(operation.args.script, fullScript)
	assert.equal(operation.args.synthesisText, fullScript)
	assert.equal(operation.args.segments, undefined, '36 object cues must not produce 36 audio clips')
	assert.equal(operation.args.cues.length, 36)
	assert.equal(new Set(operation.args.cues.map(cue => cue.atPhrase)).size, 5)
	assert.ok(operation.args.cues.every(cue => cue.autoSyncedBuild && cue.anchorMethod === NARRATION_CUE_ANCHOR_METHOD))
	assert.equal(operation.args.timingAuthority, 'media')
	assert.equal(operation.args.expectedDurationMs, undefined, 'no segment duration-fitting target is invented')
	assert.equal(operation.args.startDelayMs, 450)
	assert.equal(operation.args.paddingMs, 900)
	assert.equal(operationResolutionRequirement(operation)?.kind, 'ttsAudio')
	assert.deepEqual(spec, untouched, 'compilation must not change the authored narration')
})

test('explicit phrase, word, and time anchors survive without synthesizing their labels', () => {
	const operation = narrationOperation(specFor({
		script: fullScript,
		cues: [
			{ atPhrase: 'One delay', target: 'proof-0', type: 'entrance', effect: 'fade' },
			{ phrase: 'Four commitments', objectName: 'proof-1', type: 'emphasis', effect: 'pulse' },
			{ word: 'commissioning', objectName: 'proof-2' },
			{ atMs: 1250, target: 'proof-3' },
		],
	}))
	assert.equal(operation.args.script, fullScript)
	assert.equal(operation.args.segments, undefined)
	assert.equal(operation.args.cues.length, 4)
	assert.deepEqual(operation.args.cues.map(cue => cue.target), ['proof-0', 'proof-1', 'proof-2', 'proof-3'])
	assert.equal(operation.args.cues[1].atPhrase, 'Four commitments')
	assert.equal(operation.args.cues[2].atWord, 'commissioning')
	assert.equal(operation.args.cues[3].atMs, 1250)
})

test('authored cue text snippets do not truncate the full script at compilation', () => {
	const operation = narrationOperation(specFor({
		script: fullScript,
		cues: [{ text: 'One delay.', target: 'proof-0' }, { text: 'Four commitments.', target: 'proof-1' }],
	}))
	assert.equal(operation.args.script, fullScript)
	assert.equal(operation.args.segments, undefined)
	assert.deepEqual(operation.args.cues.map(cue => cue.text), ['One delay.', 'Four commitments.'])
})

test('cue-derived audio locks retain the complete segment scripts and timing on recompilation', () => {
	const spec = specFor({
		script: 'First complete sentence. Second complete sentence.',
		cues: [
			{ text: 'First complete sentence.', target: 'proof-0', pauseAfterMs: 180 },
			{ text: 'Second complete sentence.', target: 'proof-1', rate: 0.92 },
		],
	}, 2)
	const operation = narrationOperation(spec)
	assert.equal(operation.args.segments.length, 2)
	const lockedSpec = structuredClone(spec)
	const locks = locksFor(operation.args.segments)
	const patch = mergeNarrationSegmentsLockIntoSpec(lockedSpec, operation, locks)
	assert.equal(patch.path, '/slides/0/narration')
	assert.equal(lockedSpec.slides[0].narration.script, spec.slides[0].narration.script)
	assert.deepEqual(patch.value.segments.map(segment => segment.script), operation.args.segments.map(segment => segment.script))
	assert.equal(patch.value.segments[0].gapAfterMs, 180)
	assert.ok(patch.value.segments[1].lengthScale > 1)
	assert.equal(patch.value.segments[1].cues[0].target, 'proof-1')
	const lockedOperation = narrationOperation(lockedSpec)
	assert.deepEqual(lockedOperation.args.segments.map(segment => segment.script), operation.args.segments.map(segment => segment.script))
	assert.equal(operationResolutionRequirement(lockedOperation), null, 'locked recompilation reuses audio and needs no synthesis')
})

test('script-array and string-segment aliases retain their words and order when locked', () => {
	for (const narration of [
		{ script: ['Repeat this deliberately.', 'Repeat this deliberately.'] },
		{ segments: ['Repeat this deliberately.', 'Repeat this deliberately.'] },
	]) {
		const spec = specFor(narration, 1)
		const operation = narrationOperation(spec)
		assert.equal(operation.args.segments.length, 2, 'explicit repetitions must not be deduplicated')
		mergeNarrationSegmentsLockIntoSpec(spec, operation, locksFor(operation.args.segments))
		assert.deepEqual(spec.slides[0].narration.segments.map(segment => segment.script), ['Repeat this deliberately.', 'Repeat this deliberately.'])
		assert.equal(operationResolutionRequirement(narrationOperation(spec)), null)
	}
})

test('authored segment text and metadata win over compiled aliases during locking', () => {
	const spec = specFor({ segments: [
		{ text: 'First authored sentence.', pauseAfterMs: 220, voice: 'authored-voice', cues: [{ phrase: 'First', target: 'proof-0' }] },
		{ script: 'Second authored sentence.', gapBeforeMs: 140 },
	] }, 1)
	const original = structuredClone(spec.slides[0].narration.segments)
	const operation = narrationOperation(spec)
	const locks = locksFor(operation.args.segments)
	mergeNarrationSegmentsLockIntoSpec(spec, operation, locks)
	for (let index = 0; index < original.length; index++) {
		const locked = spec.slides[0].narration.segments[index]
		for (const [key, value] of Object.entries(original[index])) assert.deepEqual(locked[key], value)
		assert.equal(locked.audio.path, locks[index].lockedAudio.handle)
		assert.equal(locked.expectedDurationMs, locks[index].lockedAudio.durationMs)
	}
})

test('silent notes remain silent despite multiple visual cues', () => {
	const operation = narrationOperation(specFor({
		script: fullScript,
		synthesizeAudio: false,
		cues: [{ text: 'One delay.', target: 'proof-0' }, { text: 'Four commitments.', target: 'proof-1' }],
	}))
	assert.equal(operation.args.script, fullScript)
	assert.equal(operation.args.segments, undefined)
	assert.equal(operationResolutionRequirement(operation), null)
})
