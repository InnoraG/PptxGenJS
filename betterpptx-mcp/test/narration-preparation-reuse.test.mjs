import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { mkdtemp, rm } from 'node:fs/promises'

function wav500ms() {
	const dataBytes = 22050
	const data = Buffer.alloc(44 + dataBytes)
	data.write('RIFF', 0)
	data.writeUInt32LE(36 + dataBytes, 4)
	data.write('WAVE', 8)
	data.write('fmt ', 12)
	data.writeUInt32LE(16, 16)
	data.writeUInt16LE(1, 20)
	data.writeUInt16LE(1, 22)
	data.writeUInt32LE(22050, 24)
	data.writeUInt32LE(44100, 28)
	data.writeUInt16LE(2, 32)
	data.writeUInt16LE(16, 34)
	data.write('data', 36)
	data.writeUInt32LE(dataBytes, 40)
	for (let offset = 44, index = 0; offset + 1 < data.length; offset += 2, index++) {
		const envelope = Math.min(1, index / 400, (dataBytes / 2 - 1 - index) / 400)
		data.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 220 * index / 22050) * 9000 * Math.max(0, envelope)), offset)
	}
	return data
}

function specFor(prepared) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Prepared narration reuse',
		authoringContract: { workflow: 'ai-sovereign-v1', creativeAuthority: 'ai', directorMode: 'off', verificationMode: 'complete', geometryAuthority: 'ai', placementPolicy: 'ai-authored-geometry-v1', level: 'deterministic', coordinateSystem: 'inches', layerModel: 'flat-object-array', objectIdentity: 'stable-names-required' },
		contentStory: { audience: 'Reviewers', outcome: 'Verify measured narration reuse.', remember: 'The final generation reuses the prepared audio.' },
		visualDesign: { world: 'Editorial', framing: 'One proof slide.' },
		styleIntent: { artDirection: 'editorial', mode: 'light' },
		motionTime: { masterClock: 'narration', timingSource: 'prepared measured audio', syncPolicy: 'one clock' },
		autoplay: { enabled: false, advanceOnClick: true },
		showSettings: { useTimings: false },
		slides: [{
			id: 'slide-2', title: 'Prepared', message: 'Reuse measured audio.', layoutIntent: 'title-only',
			narration: {
				script: 'Third sentence. Fourth sentence.',
				voiceId: 'en_US-ljspeech-high',
			preparedNarration: {
					preparationId: prepared.preparationId,
					manifestHandle: prepared.manifestHandle,
					manifestDigest: prepared.manifestDigest,
					slideId: 'slide-2',
					segmentIds: ['third', 'fourth'],
				},
			},
			content: [{ kind: 'textBox', name: 'headline', text: 'Reuse measured audio.', rect: { x: 0.8, y: 0.7, w: 6.8, h: 0.8 } }],
		}],
	}
}

test('final generation reuses prepared audio without a second provider call', async () => {
	const previous = new Map()
	const setEnv = (key, value) => { previous.set(key, process.env[key]); process.env[key] = value }
	const lockedRoot = await mkdtemp(path.join(os.tmpdir(), 'betterpptx-narration-reuse-'))
	let providerCalls = 0
	const server = http.createServer((request, response) => {
		if (request.method === 'POST') {
			providerCalls += 1
			response.writeHead(200, { 'content-type': 'audio/wav' })
			response.end(wav500ms())
			return
		}
		response.writeHead(200, { 'content-type': 'application/json' })
		response.end('[]')
	})
	await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
	setEnv('BETTERPPTX_PUBLIC_BLACK_BOX', '1')
	setEnv('BETTERPPTX_ENV', 'test')
	setEnv('BETTERPPTX_DEPLOYMENT_STAGE', 'test')
	setEnv('NODE_ENV', 'test')
	setEnv('BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY', '1')
	setEnv('BETTERPPTX_BILLING_ENFORCE', '0')
	setEnv('BETTERPPTX_LOCAL_MAINTAINER', '1')
	setEnv('BETTERPPTX_FORCE_PLAN', 'premium')
	setEnv('BETTERPPTX_LOCKED_ASSET_ROOT', lockedRoot)
	setEnv('BETTERPPTX_INSTALL_USAGE_STORE', 'local')
	setEnv('BETTERPPTX_INSTALL_USAGE_FILE', path.join(lockedRoot, 'install-usage.json'))
	setEnv('BETTERPPTX_BILLING_LEDGER_STORE', 'local')
	setEnv('BETTERPPTX_BILLING_LEDGER_FILE', path.join(lockedRoot, 'billing-ledger.json'))
	setEnv('BETTERPPTX_INSTALL_HMAC_SECRET', 'narration-reuse-test-secret-at-least-thirty-two-characters')
	setEnv('BETTERPPTX_ASSET_GRANT_STORE', 'local')
	setEnv('BETTERPPTX_ASSET_GRANT_DIR', path.join(lockedRoot, 'asset-grants'))
	setEnv('BETTERPPTX_ALLOWED_AUDIO_DIRS', lockedRoot)
	setEnv('BETTERPPTX_TTS_PROVIDER', 'piper-http')
	setEnv('BETTERPPTX_TTS_URL', `http://127.0.0.1:${server.address().port}`)
	let deckId = null
	try {
		const { createMcpToolDispatcher } = await import('../engine.mjs')
		const testIdentity = `install_${'c'.repeat(64)}`
		const mcp = createMcpToolDispatcher({ installHash: testIdentity, resourceIdentityHash: testIdentity, authenticated: true, authenticationBasis: 'test-verified-account', sessionId: `narration-prep-reuse-${Date.now()}`, clientInfo: { name: 'narration-prep-reuse', version: '1' }, blackBox: true })
		const preparedSegments = [
			{ id: 'first', slideId: 'slide-1', text: 'First sentence.', gapAfterMs: 100 },
			{ id: 'second', slideId: 'slide-1', text: 'Second sentence.', gapBeforeMs: 100 },
			{ id: 'third', slideId: 'slide-2', text: 'Third sentence.', gapAfterMs: 50 },
			{ id: 'fourth', slideId: 'slide-2', text: 'Fourth sentence.', gapBeforeMs: 50 },
		]
		const preparedResult = await mcp.call('betterpptx.narration.get_voice_timing', {
			segments: preparedSegments,
			voice: 'en_US-ljspeech-high',
			idempotencyKey: 'prep-reuse-test',
		})
		assert.equal(preparedResult.ok, true, JSON.stringify(preparedResult))
		const prepared = preparedResult.data
		assert.equal(providerCalls, 4)
		const replayResult = await mcp.call('betterpptx.narration.get_voice_timing', {
			segments: preparedSegments,
			voice: 'en_US-ljspeech-high',
			idempotencyKey: 'prep-reuse-test',
		})
		assert.equal(replayResult.ok, true, JSON.stringify(replayResult))
		assert.equal(replayResult.data.idempotentReplay, true)
		assert.equal(providerCalls, 4, 'same preparation idempotency key must not synthesize again')
		assert.match(prepared.manifestHandle, /^asset:\/\/locked\/narration-preparation\//)
		assert.equal(prepared.segments[0].durationMs, 500)
		assert.equal(prepared.segments[1].startMs, 700)
		const { publicBillingEstimate } = await import('../billing/checkout.mjs')
		const quote = publicBillingEstimate({ toolName: 'betterpptx.deck.generate_from_spec', args: { spec: specFor(prepared), idempotencyKey: 'quote-reuse-test' } })
		assert.equal(quote.quoteReadiness, 'ready-for-authorization')
		assert.equal(quote.readyForExecution, true)
		assert.equal(quote.narrationPreparation.preparedOperationCount, 1)
		assert.equal(quote.narrationPreparation.missingPreparationCount, 0)
		assert.equal(quote.narrationPreparation.finalGenerationReusesPreparedAudio, true)
		const publicQuote = await mcp.call('betterpptx.billing.estimate', {
			toolName: 'betterpptx.deck.generate_from_spec',
			toolArgs: { spec: specFor(prepared), plan: 'premium' },
		})
		assert.equal(publicQuote.ok, true, JSON.stringify(publicQuote))
		assert.equal(publicQuote.data.quoteReadiness, 'ready-for-authorization')
		assert.equal(publicQuote.data.narrationPreparation.validatedPreparationCount, 1)
		assert.equal(publicQuote.data.narrationPreparation.measuredSegmentCount, 2)
		assert.equal(publicQuote.data.narrationPreparation.measuredDurationMs, 1100)
		assert.equal(publicQuote.data.narrationPreparation.timelineBoundToMeasuredAudio, true)
		assert.equal(publicQuote.data.narrationPreparation.timingEvidence[0], 'measured-audio')
		assert.match(publicQuote.data.preparedTimelineDigest, /^[a-f0-9]{64}$/)
		assert.match(publicQuote.data.quoteId, /^bpptx_quote_[a-f0-9]{32}$/)
		assert.equal(publicQuote.data.quoteBinding.specDigest, publicQuote.data.specDigest)
		assert.equal(publicQuote.data.quoteBinding.preparedTimelineDigest, publicQuote.data.preparedTimelineDigest)

		const preliminary = publicBillingEstimate({
			toolName: 'betterpptx.deck.generate_from_spec',
			args: { spec: { ...specFor(prepared), slides: [{ ...specFor(prepared).slides[0], narration: { script: 'Unprepared.' } }] } },
		})
		assert.equal(preliminary.quoteReadiness, 'preparation-required')
		assert.equal(preliminary.readyForExecution, false)
		assert.equal(preliminary.narrationPreparation.missingPreparationCount, 1)

		// A production-style public commit must consume the exact quote binding;
		// changing the authored spec after quotation is rejected before mutation.
		setEnv('BETTERPPTX_LOCAL_MAINTAINER', '0')
		setEnv('BETTERPPTX_REQUIRE_QUOTE_BINDING', '1')
		const staleCommit = await mcp.call('betterpptx.deck.generate_from_spec', {
			spec: { ...specFor(prepared), title: 'Changed after quote' },
			phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true,
			quoteBinding: publicQuote.data.quoteBinding,
		})
		assert.equal(staleCommit.ok, false, JSON.stringify(staleCommit))
		assert.equal(staleCommit.error.code, 'QUOTE_BINDING_MISMATCH', JSON.stringify(staleCommit))

		const resolvedResult = await mcp.call('betterpptx.deck.generate_from_spec', { spec: specFor(prepared), phase: 'resolve', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'full' })
		assert.equal(resolvedResult.ok, true, JSON.stringify(resolvedResult))
		assert.equal(providerCalls, 4, 'resolve must not synthesize a second time')
		assert.equal(resolvedResult.data.resolution.locked, true)
		assert.equal(resolvedResult.data.resolvedAssets[0].prepared, true)
		assert.deepEqual(resolvedResult.data.resolvedAssets[0].selection.segmentIds, ['third', 'fourth'])
		assert.equal(resolvedResult.data.resolvedAssets[0].segments.length, 2)
		assert.doesNotMatch(JSON.stringify(resolvedResult.data), /betterpptx\.deck\.apply_auto_timings/)

		const commitResult = await mcp.call('betterpptx.deck.generate_from_spec', {
			spec: specFor(prepared), phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true,
			quoteBinding: publicQuote.data.quoteBinding, detail: 'full',
		})
		assert.equal(commitResult.ok, true, JSON.stringify(commitResult))
		assert.equal(providerCalls, 4, 'commit must reuse the exact locked preparation')
		assert.equal(commitResult.data.billing.quoteId, publicQuote.data.quoteId)
		deckId = commitResult.data.deckId
		const { getDeck } = await import('../engine.mjs')
		const committed = getDeck(deckId)
		assert.equal(committed.pptx.showSettings.useTimings, false)
		assert.equal(committed.pptx.slides[0].transition.advanceOnClick, true)
		assert.equal(committed.pptx.slides[0].transition.advanceAfterTime, undefined)
		assert.equal(committed.narrationManifest.slides[0].autoplayEnabled, false)
		assert.equal(committed.narrationManifest.slides[0].segmented, true)
		assert.equal(committed.narrationManifest.slides[0].segmentCount, 2)
		assert.equal(committed.narrationManifest.slides[0].durationMs, 1100)
		const narrationValidation = await mcp.call('betterpptx.deck.validate_narration', { deckId, compression: true })
		assert.equal(narrationValidation.ok, true, JSON.stringify(narrationValidation))
		assert.equal(narrationValidation.data.ok, true, JSON.stringify(narrationValidation.data))
		assert.equal(narrationValidation.data.perSlide[0].audioNodeCount, 2)
		assert.equal(narrationValidation.data.perSlide[0].advanceAfterTime, null)
	} finally {
		if (deckId) {
			try {
				const { createMcpToolDispatcher } = await import('../engine.mjs')
				await createMcpToolDispatcher({ sessionId: `narration-prep-reuse-cleanup-${Date.now()}`, clientInfo: { name: 'cleanup', version: '1' }, blackBox: true }).call('betterpptx.deck.dispose', { deckId })
			} catch {}
		}
		await new Promise(resolve => server.close(resolve))
		await rm(lockedRoot, { recursive: true, force: true })
		for (const [key, value] of previous.entries()) { if (value === undefined) delete process.env[key]; else process.env[key] = value }
	}
})
