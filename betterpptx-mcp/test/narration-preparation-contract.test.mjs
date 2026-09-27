import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { prepareNarrationAudio } from '../narration/preparation.mjs'
import { writeToneWav } from '../narration/audio.mjs'
import { TOOLS } from '../tools.mjs'
import { publicToolList } from '../blackbox.mjs'
import { estimateHeavyCost } from '../billing/estimator.mjs'

test('narration preparation measures each segment and assembles authored gaps', async () => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-narration-preparation-'))
	try {
		const prepared = await prepareNarrationAudio({
			voice: 'fixture-voice',
			segments: [
				{ id: 'intro', slideId: 'slide-1', text: 'First statement.', gapAfterMs: 120 },
				{ id: 'close', slideId: 'slide-1', text: 'Second statement.', gapBeforeMs: 80 },
			],
		}, {
			synthesize: async ({ text }) => {
				const durationMs = text.startsWith('First') ? 220 : 310
				const wavPath = path.join(root, `${text.startsWith('First') ? 'first' : 'second'}.wav`)
				writeToneWav(wavPath, durationMs / 1000)
				return { wavPath, durationMs, voice: { id: 'fixture-voice', language: 'en-US' }, provider: 'fixture', warnings: [] }
			},
		})
		assert.equal(prepared.schemaVersion, 'betterpptx.narration-preparation.v1')
		assert.deepEqual(prepared.segments.map(segment => ({ id: segment.id, durationMs: segment.durationMs, startMs: segment.startMs, endMs: segment.endMs })), [
			{ id: 'intro', durationMs: 220, startMs: 0, endMs: 220 },
			{ id: 'close', durationMs: 310, startMs: 420, endMs: 730 },
		])
		assert.equal(prepared.assembled.durationMs, 730)
		assert.equal(prepared.timingEvidence.kind, 'measured-audio')
		assert.equal(prepared.timingEvidence.wordAlignment, false)
	} finally {
		await fs.rm(root, { recursive: true, force: true })
	}
})

test('narration preparation keeps odd-millisecond gaps aligned to complete PCM frames', async () => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-narration-frame-alignment-'))
	try {
		const prepared = await prepareNarrationAudio({
			voice: 'fixture-voice',
			segmentGapMs: 350,
			segments: [
				{ id: 'first', text: 'First statement.' },
				{ id: 'second', text: 'Second statement.' },
			],
		}, {
			synthesize: async ({ text }) => {
				const name = text.startsWith('First') ? 'first' : 'second'
				const wavPath = path.join(root, `${name}.wav`)
				writeToneWav(wavPath, 0.1, name === 'first' ? 440 : 660)
				return { wavPath, durationMs: 100, voice: { id: 'fixture-voice', language: 'en-US' }, provider: 'fixture', warnings: [] }
			},
		})
		const first = await fs.readFile(path.join(root, 'first.wav'))
		const second = await fs.readFile(path.join(root, 'second.wav'))
		const assembled = await fs.readFile(prepared.assembled.filePath)
		const firstData = first.subarray(44)
		const secondData = second.subarray(44)
		const alignedGapBytes = Math.round(22050 * 350 / 1000) * 2
		const secondOffset = 44 + firstData.length + alignedGapBytes

		assert.equal((assembled.length - 44) % 2, 0)
		assert.ok(assembled.subarray(44, 44 + firstData.length).equals(firstData))
		assert.ok(assembled.subarray(secondOffset, secondOffset + secondData.length).equals(secondData))
		assert.equal(assembled[44 + firstData.length + alignedGapBytes - 1], 0)
	} finally {
		await fs.rm(root, { recursive: true, force: true })
	}
})

test('public synthesis schema exposes preparation fields and hides provider internals', () => {
	const tool = publicToolList(TOOLS).find(candidate => candidate.name === 'betterpptx.narration.synthesize')
	assert.ok(tool)
	const inputKeys = Object.keys(tool.inputSchema.properties || {})
	assert.ok(inputKeys.includes('text'))
	assert.ok(inputKeys.includes('segments'))
	assert.ok(inputKeys.includes('idempotencyKey'))
	assert.ok(!inputKeys.includes('provider'))
	assert.match(tool.description, /before quotation/i)
	assert.match(JSON.stringify(tool.outputSchema), /manifestHandle/)
	assert.match(JSON.stringify(tool.outputSchema), /timingEvidence/)
	assert.match(JSON.stringify(tool.outputSchema), /retention/)
	assert.match(JSON.stringify(tool.outputSchema), /reuse/)
})

test('prepared narration reuse does not incur a second synthesis estimate', () => {
	const rateCard = undefined
	const raw = estimateHeavyCost('betterpptx.slide.add_narration', { script: 'A measured script.' }, {}, rateCard)
	const reused = estimateHeavyCost('betterpptx.slide.add_narration', {
		preparedNarration: { preparationId: 'opaque', manifestHandle: 'opaque' },
		script: 'A measured script.',
	}, {}, rateCard)
	assert.ok(raw > 0)
	assert.equal(reused, 0)
})
