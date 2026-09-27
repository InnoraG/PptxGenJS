import assert from 'node:assert/strict'
import test from 'node:test'
import {
	buildNarrationCueLedger,
	cueBelongsToSlide,
	findNonNativeCaptionOverlayField,
	flattenHtmlCueManifest,
	isNonNativeCaptionOverlayValue,
	materializeClosedCaptionTracks,
	webvttFromCues,
} from '../ir/narration-contract.mjs'
import { applyLockedCompilePlan, rememberLockedCompilePlan, resetLockedCompilePlansForTests } from '../ir/compile-plan-store.mjs'
import { publicToolList } from '../blackbox.mjs'
import { TOOLS } from '../tools.mjs'
import { applyHtmlCueManifest } from '../ir/html-slide-compiler.mjs'

test('ordinary narration fields are not overlay captions', () => {
	assert.equal(isNonNativeCaptionOverlayValue(false), false)
	assert.equal(isNonNativeCaptionOverlayValue('forbidden'), false)
	assert.equal(findNonNativeCaptionOverlayField({
		narration: { text: 'Hello', voiceId: 'en_US-ljspeech-high', synthesizeAudio: true, timing: { cues: [{ atMs: 0, text: 'Hello' }] } },
	}), null)
})

test('explicit overlay caption fields are removed at schema level', () => {
	assert.equal(findNonNativeCaptionOverlayField({
		slides: [{ narration: { captions: [{ atMs: 0, text: 'Nope' }] } }],
	}), 'spec.slides[0].narration.captions')
})

test('sidecar cue manifests bind by slide number and title', () => {
	const cues = flattenHtmlCueManifest({
		slides: [{ slide: 1, title: 'REASONING', cues: [{ at: 0.75, duration: 1.2, text: 'I map the system', focus: ['SYSTEMS THINKING'] }] }],
	})
	assert.equal(cues.length, 1)
	assert.equal(cues[0].atMs, 750)
	assert.equal(cues[0].target, 'SYSTEMS THINKING')
	assert.equal(cueBelongsToSlide(cues[0], { id: 'slide-1', title: 'REASONING' }, 0), true)
})

test('HTML cue sidecar attaches 156-style cues onto matching slides', () => {
	const spec = applyHtmlCueManifest({
		outputVariant: 'voice-only',
		htmlCueManifest: {
			slides: [
				{ slide: 1, title: 'A', cues: [{ at: 0.2, text: 'One' }, { at: 1.1, text: 'Two' }] },
				{ slide: 2, title: 'B', cues: [{ at: 0.4, text: 'Three' }] },
			],
		},
		slides: [
			{ id: 'slide-1', title: 'A', content: [{ kind: 'title', name: 'A', text: 'A' }] },
			{ id: 'slide-2', title: 'B', content: [{ kind: 'title', name: 'B', text: 'B' }] },
		],
	})
	assert.equal(spec.slides[0].narration.cues.length, 2)
	assert.equal(spec.slides[1].narration.cues.length, 1)
	const ledger = buildNarrationCueLedger(spec)
	assert.equal(ledger.authoredCueCount, 3)
	assert.equal(ledger.acceptedCueCount, 3)
	assert.equal(ledger.cueSegmentSynthesis, true)
})

test('commit consumes planId, lockedPlanId, or planDigest', () => {
	resetLockedCompilePlansForTests()
	const compiled = { specDigest: 'aaa', planDigest: 'plan-1', lockedPlanDigest: 'plan-1', operations: [{ tool: 'keep' }] }
	rememberLockedCompilePlan(compiled)
	assert.equal(applyLockedCompilePlan({ lockedPlanId: 'plan-1' }, { specDigest: 'aaa', operations: [{ tool: 'fresh' }] }, 'commit').operations[0].tool, 'keep')
	rememberLockedCompilePlan(compiled)
	assert.equal(applyLockedCompilePlan({ planDigest: 'plan-1' }, { specDigest: 'aaa', operations: [{ tool: 'fresh' }] }, 'commit').operations[0].tool, 'keep')
})

test('generate_from_spec advertises compile-once plan aliases', () => {
	const generate = publicToolList(TOOLS).find(tool => tool.name === 'betterpptx.deck.generate_from_spec')
	assert.ok(generate.inputSchema.properties.planId)
	assert.ok(generate.inputSchema.properties.lockedPlanId)
	assert.ok(generate.inputSchema.properties.planDigest)
})

test('native caption tracks materialize WebVTT and never invent overlay text', () => {
	const tracks = materializeClosedCaptionTracks([{ format: 'webvtt', language: 'en-US', label: 'English', source: 'narration-cues', embed: true }], {
		cues: [{ atMs: 0, durationMs: 1000, text: 'I map the system.' }],
	})
	assert.equal(tracks.length, 1)
	assert.match(tracks[0].vtt, /^WEBVTT/m)
	assert.match(tracks[0].vtt, /I map the system/)
	assert.ok(webvttFromCues([{ atMs: 250, text: 'Hello' }]).text.includes('00:00:00.250'))
})

test('narration mediaOptions caption alias is retained and duplicate sources are rejected', async () => {
	const { closedCaptionTracksForArgsForTest } = await import('../engine.mjs')
	const track = { format: 'webvtt', language: 'en-US', label: 'English', vtt: 'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHello\n' }
	const result = closedCaptionTracksForArgsForTest({ mediaOptions: { closedCaptionTracks: [track] } })
	assert.equal(result.length, 1)
	assert.match(result[0].vtt, /^WEBVTT/)
	assert.throws(
		() => closedCaptionTracksForArgsForTest({ closedCaptionTracks: [track], mediaOptions: { closedCaptionTracks: [track] } }),
		{ code: 'CAPTION_TRACKS_AMBIGUOUS_SOURCE' },
	)
})

test('segmented narration binds one WebVTT track to every clip and refuses slide-level scope', async () => {
	const { segmentCaptionTracksForArgsForTest } = await import('../engine.mjs')
	const vtt = text => `WEBVTT\n\n00:00:00.000 --> 00:00:00.800\n${text}\n`
	const segments = [
		{ script: 'First spoken beat.', closedCaptionTracks: [{ language: 'en-US', vtt: vtt('First spoken beat.') }] },
		{ script: 'Second spoken beat.', audio: { closedCaptionTracks: [{ language: 'en-US', vtt: vtt('Second spoken beat.') }] } },
		{ script: 'Third spoken beat.', mediaOptions: { closedCaptionTracks: [{ language: 'en-US', vtt: vtt('Third spoken beat.') }] } },
	]
	const tracks = segmentCaptionTracksForArgsForTest({}, segments)
	assert.deepEqual(tracks.map(item => item.length), [1, 1, 1])
	assert.deepEqual(tracks.map(item => item[0].vtt.includes('spoken beat.')), [true, true, true])
	assert.match(tracks[2][0].vtt, /Third spoken beat/)
	assert.throws(() => segmentCaptionTracksForArgsForTest({ closedCaptionTracks: [{ language: 'en-US', vtt: vtt('Whole slide') }] }, segments), { code: 'NARRATION_SEGMENT_CAPTION_SCOPE_REQUIRED' })
	assert.throws(() => segmentCaptionTracksForArgsForTest({}, [{ ...segments[0], audio: { closedCaptionTracks: segments[0].closedCaptionTracks } }]), { code: 'CAPTION_TRACKS_AMBIGUOUS_SOURCE' })
})
