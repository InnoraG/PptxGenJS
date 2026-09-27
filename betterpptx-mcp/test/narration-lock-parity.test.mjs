import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { mkdtemp, rm } from 'node:fs/promises'

const wav500ms = () => {
	const dataBytes = 22050
	const bytes = Buffer.alloc(44 + dataBytes)
	bytes.write('RIFF', 0)
	bytes.writeUInt32LE(36 + dataBytes, 4)
	bytes.write('WAVE', 8)
	bytes.write('fmt ', 12)
	bytes.writeUInt32LE(16, 16)
	bytes.writeUInt16LE(1, 20)
	bytes.writeUInt16LE(1, 22)
	bytes.writeUInt32LE(22050, 24)
	bytes.writeUInt32LE(44100, 28)
	bytes.writeUInt16LE(2, 32)
	bytes.writeUInt16LE(16, 34)
	bytes.write('data', 36)
	bytes.writeUInt32LE(dataBytes, 40)
	for (let offset = 44, index = 0; offset + 1 < bytes.length; offset += 2, index++) {
		const envelope = Math.min(1, index / 400, (dataBytes / 2 - 1 - index) / 400)
		bytes.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 220 * index / 22050) * 9000 * Math.max(0, envelope)), offset)
	}
	return bytes
}

const baseSpec = () => ({
	schemaVersion: 'betterpptx.deck-spec.v1',
	title: 'Narration lock parity proof',
	authoringContract: {
		workflow: 'ai-sovereign-v1',
		creativeAuthority: 'ai',
		directorMode: 'off',
		verificationMode: 'complete',
		geometryAuthority: 'ai',
		placementPolicy: 'ai-authored-geometry-v1',
		coordinateSystem: 'inches',
		layerModel: 'flat-object-array',
		objectIdentity: 'stable-names-required',
	},
	contentStory: {
		audience: 'timing reviewers',
		outcome: 'Verify one narration clock across every mutation-free phase and commit.',
		remember: 'Locked audio, dwell, and cue targets remain identical.',
	},
	handshake: {
		audience: 'timing reviewers',
		promise: 'Prove locked narration timing parity.',
		proof: ['Measured local narration audio and deterministic readback.'],
		bar: 'Every phase reports the same clock.',
		commitments: ['timing-parity'],
	},
	visualDesign: { world: 'Editorial timing proof', framing: 'One named proof block.' },
	styleIntent: { artDirection: 'editorial', mode: 'light' },
	motionTime: {
		masterClock: 'narration-text',
		timingSource: 'measured narration audio',
		syncPolicy: 'one locked narration clock',
	},
	deliveryExperience: { mode: 'narrated-autoplay', requireMotion: true },
	autoplay: { enabled: true, loop: false, mode: 'present', secondsPerSlide: 6 },
	showSettings: { showMediaControls: false },
	layout: 'LAYOUT_WIDE',
	slides: [{
		id: 'timing-proof',
		title: 'One measured narration clock',
		role: 'proof',
		message: 'Resolve, locked dry-run, and commit agree.',
		layoutIntent: 'title-body',
		content: [
			{ kind: 'title', name: 'proof-title', text: 'One measured narration clock', rect: { x: 0.8, y: 0.7, w: 11.7, h: 0.8 } },
			{ kind: 'textBox', name: 'proof-body', text: 'The same cue targets and dwell survive every phase.', rect: { x: 0.8, y: 2.1, w: 11.7, h: 1.1 }, animation: { type: 'entrance', effect: 'fade', trigger: 'afterPrevious', duration: 500 } },
		],
		narration: {
			startDelayMs: 100,
			paddingMs: 400,
			segmentGapMs: 200,
			segments: [
				{ script: 'First measured statement.', gapAfterMs: 300, cues: [{ phrase: 'First', objectName: 'proof-body', type: 'emphasis', effect: 'pulse', duration: 100 }] },
				{ script: 'Second measured statement.', cues: [{ word: 'Second', objectName: 'proof-body', type: 'emphasis', effect: 'pulse', duration: 100 }] },
			],
			cues: [
				{ phrase: 'Second measured', objectName: 'proof-body', type: 'emphasis', effect: 'pulse', duration: 100 },
				{ atMs: 0, objectName: 'proof-body', type: 'emphasis', effect: 'pulse', duration: 100 },
			],
		},
	}],
})

const resultData = (label, result) => {
	assert.equal(result?.ok, true, `${label}: ${JSON.stringify(result)}`)
	return result.data || result
}

const timingShape = timeline => (timeline?.slides || []).map(slide => ({
	slideIndex: slide.slideIndex,
	slideId: slide.slideId,
	realDurationMs: slide.realDurationMs,
	dwellMs: slide.dwellMs,
	startDelayMs: slide.startDelayMs,
	paddingMs: slide.paddingMs,
	segmented: slide.segmented,
	segments: slide.segments,
	beats: (slide.beats || []).map(beat => ({
		target: beat.target,
		atMs: beat.atMs,
		endMs: beat.endMs,
		anchorMethod: beat.anchorMethod,
	})),
}))

test('public narration cues fail closed and locked timing stays identical through commit without save', async () => {
	const previous = new Map()
	const setEnv = (key, value) => {
		previous.set(key, process.env[key])
		process.env[key] = value
	}
	const lockedRoot = await mkdtemp(path.join(os.tmpdir(), 'betterpptx-narration-lock-'))
	setEnv('BETTERPPTX_PUBLIC_BLACK_BOX', '1')
	setEnv('BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY', '1')
	setEnv('BETTERPPTX_BILLING_ENFORCE', '0')
	setEnv('BETTERPPTX_LOCAL_MAINTAINER', '1')
	setEnv('BETTERPPTX_LOCKED_ASSET_ROOT', lockedRoot)
	setEnv('BETTERPPTX_ALLOWED_AUDIO_DIRS', lockedRoot)
	setEnv('BETTERPPTX_ASSET_GRANT_STORE', 'local')
	setEnv('BETTERPPTX_ASSET_GRANT_DIR', path.join(lockedRoot, 'asset-grants'))

	const server = http.createServer((request, response) => {
		if (request.method === 'POST') {
			response.writeHead(200, { 'content-type': 'audio/wav' })
			response.end(wav500ms())
			return
		}
		response.writeHead(200, { 'content-type': 'application/json' })
		response.end('[]')
	})
	await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
	setEnv('BETTERPPTX_TTS_PROVIDER', 'piper-http')
	setEnv('BETTERPPTX_TTS_URL', `http://127.0.0.1:${server.address().port}`)

	let committedDeckId = null
	try {
		const { createMcpToolDispatcher, getDeck } = await import('../engine.mjs')
		const mcp = createMcpToolDispatcher({
			sessionId: `narration-lock-parity-${Date.now()}`,
			clientInfo: { name: 'narration-lock-parity-test', version: '1' },
			blackBox: true,
		})

		const unresolvedSpec = baseSpec()
		unresolvedSpec.slides[0].narration = { script: 'Only this phrase is authored.', cues: [{ phrase: 'absent phrase', objectName: 'proof-body' }] }
		const unresolved = await mcp.call('betterpptx.deck.generate_from_spec', { spec: unresolvedSpec, phase: 'dryRun', commitMode: 'createNew', detail: 'full' })
		const unresolvedFinding = unresolved?.error?.details?.errors?.[0]
		assert.equal(unresolved?.ok, false)
		assert.equal(unresolvedFinding?.code, 'NARRATION_CUE_ANCHOR_UNRESOLVED', JSON.stringify(unresolved))
		assert.equal(unresolvedFinding?.severity, 'error')
		assert.equal(typeof unresolvedFinding?.reason, 'string')
		assert.equal(typeof unresolvedFinding?.fix, 'string')

		const missingAnchorSpec = baseSpec()
		missingAnchorSpec.slides[0].narration = { script: 'An anchor is required.', cues: [{ objectName: 'proof-body' }] }
		const missingAnchor = await mcp.call('betterpptx.deck.generate_from_spec', { spec: missingAnchorSpec, phase: 'dryRun', commitMode: 'createNew', detail: 'full' })
		assert.equal(missingAnchor?.ok, false)
		assert.equal(missingAnchor?.error?.details?.errors?.[0]?.code, 'NARRATION_CUE_ANCHOR_UNRESOLVED')

		const spec = baseSpec()
		const resolved = resultData('resolve', await mcp.call('betterpptx.deck.generate_from_spec', {
			spec,
			phase: 'resolve',
			commitMode: 'createNew',
			plan: 'premium',
			billingConfirmed: true,
			detail: 'full',
		}))
		const resolvedSpine = resolved.timingSpine?.slides?.[0]
		assert.equal(resolved.mutationFree, true)
		assert.equal(resolvedSpine?.timingSource, 'locked-audio')
		assert.equal(resolvedSpine?.narrationMs, 1500)
		assert.equal(resolvedSpine?.dwellMs, 2000)
		assert.equal(resolved.narrationTimeline?.phase, 'resolve')
		assert.equal(resolved.narrationTimeline?.source, 'resolved-audio')

		const lockedDryRun = resultData('lockedDryRun', await mcp.call('betterpptx.deck.generate_from_spec', {
			spec: resolved.lockedSpec,
			phase: 'lockedDryRun',
			commitMode: 'createNew',
			plan: 'premium',
			detail: 'full',
		}))
		assert.equal(lockedDryRun.mutationFree, true)
		assert.equal(lockedDryRun.narrationTimeline?.phase, 'lockedDryRun')
		assert.equal(lockedDryRun.narrationTimeline?.source, 'locked-audio')
		assert.equal(lockedDryRun.timingSpine?.slides?.[0]?.timingSource, 'locked-audio')

		const committed = resultData('commit', await mcp.call('betterpptx.deck.generate_from_spec', {
			spec: resolved.lockedSpec,
			phase: 'commit',
			commitMode: 'createNew',
			plan: 'premium',
			billingConfirmed: true,
			detail: 'full',
		}))
		committedDeckId = committed.deckId
		assert.equal(committed.narrationTimeline?.phase, 'commit')
		assert.deepEqual(timingShape(lockedDryRun.narrationTimeline), timingShape(resolved.narrationTimeline))
		assert.deepEqual(timingShape(committed.narrationTimeline), timingShape(resolved.narrationTimeline))
		const beats = resolved.narrationTimeline.slides[0].beats
		assert.equal(beats.length, 4)
		assert.ok(beats.every(beat => beat.target === 'proof-body'))
		assert.equal(beats.filter(beat => beat.anchorMethod === 'duration-proportional-script-position').length, 3)
		assert.ok(beats.some(beat => beat.atMs === 0 && beat.anchorMethod === undefined))
		const narrationCheck = resultData('narrationValidation', await mcp.call('betterpptx.deck.validate_narration', { deckId: committedDeckId }))
		assert.equal(narrationCheck.ok, true, JSON.stringify({ issues: narrationCheck.issues, transition: getDeck(committedDeckId).pptx.slides[0].transition }))
		assert.equal(narrationCheck.perSlide[0].hasNativeNarration, true)
		assert.equal(narrationCheck.perSlide[0].hasMediaCall, true)
		assert.equal(narrationCheck.perSlide[0].advanceAfterTime, 2000)
		const exported = resultData('currentSource', await mcp.call('betterpptx.deck.export_spec', { deckId: committedDeckId, mode: 'current' }))
		assert.equal(exported.spec?.deliveryExperience?.mode, 'narrated-autoplay')
		assert.equal(exported.spec?.autoplay?.enabled, true)
		assert.equal(exported.spec?.autoplay?.preserveTimedSlides, true)
		assert.equal(exported.spec?.showSettings?.showNarration, true)

		if (committedDeckId) {
			await mcp.call('betterpptx.deck.dispose', { deckId: committedDeckId })
			committedDeckId = null
		}
	} finally {
		await new Promise(resolve => server.close(resolve))
		await rm(lockedRoot, { recursive: true, force: true })
		for (const [key, value] of previous.entries()) {
			if (value === undefined) delete process.env[key]
			else process.env[key] = value
		}
	}
})
