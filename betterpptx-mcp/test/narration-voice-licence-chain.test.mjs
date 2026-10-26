import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdtemp, rm } from 'node:fs/promises'
import { genderCoverage, enrichVoiceWithProfile, loadVoiceProfiles } from '../narration/voiceProfiles.mjs'
import { prepareNarrationAudio } from '../narration/preparation.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const voicesDir = path.resolve(here, '..', 'narration', 'voices')
const production = JSON.parse(fs.readFileSync(path.join(voicesDir, 'runtime-manifest.production.json'), 'utf8'))
const candidates = JSON.parse(fs.readFileSync(path.join(voicesDir, 'manifest.json'), 'utf8'))
const profiles = loadVoiceProfiles()
const NON_COMMERCIAL_BASE = /lessac|blizzard|ryan/i

test('launch locales have a female and male voice whose whole licence chain is resale-safe', () => {
	const clean = production.voices.filter(voice => /^resale-safe/.test(voice.licenseChain?.verdict || ''))
	const coverage = genderCoverage(clean.map(voice => enrichVoiceWithProfile(voice, profiles)), ['female', 'male'], profiles)
	for (const locale of ['en_US', 'fr_FR', 'de_DE']) assert.ok(coverage.localesWithPair.includes(locale), `${locale} lacks a clean pair`)
	for (const voice of clean) {
		assert.equal(voice.reviewStatus, 'approved')
		assert.equal(voice.lineageReview, false, voice.id)
		assert.equal(voice.licenseChain.training.base, null, voice.id)
		assert.ok(voice.licenseChain.modelCard.url && voice.licenseChain.dataset.url && voice.licenseChain.dataset.license, voice.id)
		assert.ok(voice.modelSha256 && voice.configSha256, voice.id)
	}
})

test('no production voice is non-commercial or unknown, and attribution voices carry their credit', () => {
	for (const voice of production.voices) {
		assert.ok(['allowed', 'attribution'].includes(voice.commercialUse), `${voice.id} is ${voice.commercialUse}`)
		if (voice.commercialUse === 'attribution') assert.match(voice.attributionText || '', /CC BY 4\.0/, voice.id)
	}
})

test('weights fine-tuned from a non-commercial base are flagged and never counted as resale-safe', () => {
	for (const voice of candidates.voices.filter(voice => NON_COMMERCIAL_BASE.test(voice.finetunedFrom || ''))) {
		assert.equal(voice.lineageReview, true, voice.id)
		assert.doesNotMatch(voice.licenseChain?.verdict || '', /^resale-safe/, voice.id)
	}
})

test('preparation records each distinct voice licence across segments', async () => {
	const dir = await mkdtemp(path.join(os.tmpdir(), 'bpx-voice-licence-'))
	const wav = path.join(dir, 'a.wav')
	fs.writeFileSync(wav, wav500ms())
	const ccBy = { spdx: 'CC-BY-4.0', commercialUse: 'attribution', attributionRequired: true, attribution: 'credit', datasetUrl: 'https://www.openslr.org/94/' }
	const cc0 = { spdx: 'CC0-1.0', commercialUse: 'allowed', attributionRequired: false }
	const licenses = [ccBy, ccBy, cc0]
	let call = 0
	const prepared = await prepareNarrationAudio({ segments: [{ id: 'a', text: 'One.' }, { id: 'b', text: 'Two.' }, { id: 'c', text: 'Three.' }] }, {
		synthesize: async () => ({ wavPath: wav, voice: { id: 'v' }, license: licenses[call++], provider: 'test' }),
	})
	assert.deepEqual(prepared.licenses, [ccBy, cc0])
	await rm(dir, { recursive: true, force: true })
})

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

test('a CC-BY narration voice is credited in the saved deck licence manifest, not on a slide', async () => {
	const previous = new Map()
	const setEnv = (key, value) => { previous.set(key, process.env[key]); process.env[key] = value }
	const lockedRoot = await mkdtemp(path.join(os.tmpdir(), 'betterpptx-voice-attribution-'))
	const requests = []
	const server = http.createServer((request, response) => {
		if (request.method === 'POST') {
			let body = ''
			request.on('data', chunk => { body += chunk })
			request.on('end', () => {
				requests.push(JSON.parse(body || '{}'))
				response.writeHead(200, { 'content-type': 'audio/wav' })
				response.end(wav500ms())
			})
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
	setEnv('BETTERPPTX_INSTALL_HMAC_SECRET', 'voice-attribution-test-secret-at-least-thirty-two-characters')
	setEnv('BETTERPPTX_ASSET_GRANT_STORE', 'local')
	setEnv('BETTERPPTX_ASSET_GRANT_DIR', path.join(lockedRoot, 'asset-grants'))
	setEnv('BETTERPPTX_ALLOWED_AUDIO_DIRS', lockedRoot)
	setEnv('BETTERPPTX_TTS_PROVIDER', 'piper-http')
	setEnv('BETTERPPTX_TTS_URL', `http://127.0.0.1:${server.address().port}`)
	setEnv('BETTERPPTX_RUNTIME_VOICES_MANIFEST', path.join(voicesDir, 'runtime-manifest.production.json'))
	let deckId = null
	const dispatcherOptions = (sessionId) => ({ installHash: `install_${'d'.repeat(64)}`, resourceIdentityHash: `install_${'d'.repeat(64)}`, authenticated: true, authenticationBasis: 'test-verified-account', sessionId, clientInfo: { name: 'voice-attribution', version: '1' }, blackBox: true })
	try {
		const { createMcpToolDispatcher, getDeck } = await import('../engine.mjs')
		const mcp = createMcpToolDispatcher(dispatcherOptions(`voice-attribution-${Date.now()}`))
		const preparedResult = await mcp.call('betterpptx.narration.get_voice_timing', {
			segments: [{ id: 'one', slideId: 'slide-1', text: 'Bonjour à toutes et à tous.' }],
			lang: 'fr_FR',
			gender: 'female',
			idempotencyKey: 'voice-attribution-test',
		})
		assert.equal(preparedResult.ok, true, JSON.stringify(preparedResult))
		assert.equal(requests.length, 1)
		assert.equal(requests[0].voice, 'fr_FR-mls-medium')
		assert.equal(requests[0].speaker, 1, 'gender:female selects the dataset-verified female MLS speaker')
		const prepared = preparedResult.data
		const spec = {
			schemaVersion: 'betterpptx.deck-spec.v1',
			title: 'Voice attribution',
			authoringContract: { workflow: 'ai-sovereign-v1', creativeAuthority: 'ai', directorMode: 'off', verificationMode: 'complete', geometryAuthority: 'ai', placementPolicy: 'ai-authored-geometry-v1', level: 'deterministic', coordinateSystem: 'inches', layerModel: 'flat-object-array', objectIdentity: 'stable-names-required' },
			contentStory: { audience: 'Reviewers', outcome: 'Verify narration voice attribution.', remember: 'Credits live in the licence manifest.' },
			visualDesign: { world: 'Editorial', framing: 'One proof slide.' },
			styleIntent: { artDirection: 'editorial', mode: 'light' },
			motionTime: { masterClock: 'narration', timingSource: 'prepared measured audio', syncPolicy: 'one clock' },
			autoplay: { enabled: false, advanceOnClick: true },
			showSettings: { useTimings: false },
			slides: [{
				id: 'slide-1', title: 'Bonjour', message: 'Bonjour.', layoutIntent: 'title-only',
				narration: {
					script: 'Bonjour à toutes et à tous.',
					preparedNarration: { preparationId: prepared.preparationId, manifestHandle: prepared.manifestHandle, manifestDigest: prepared.manifestDigest, slideId: 'slide-1' },
				},
				content: [{ kind: 'textBox', name: 'headline', text: 'Bonjour.', rect: { x: 0.8, y: 0.7, w: 6.8, h: 0.8 } }],
			}],
		}
		const commit = await mcp.call('betterpptx.deck.generate_from_spec', { spec, phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'full' })
		assert.equal(commit.ok, true, JSON.stringify(commit))
		deckId = commit.data.deckId
		const voiceLicenses = getDeck(deckId).narrationManifest.slides[0].voiceLicenses
		assert.equal(voiceLicenses.length, 1)
		const { buildEditionSidecarForTest } = await import('../engine.mjs')
		const payload = JSON.parse(JSON.stringify(buildEditionSidecarForTest(getDeck(deckId))))
		const records = (payload.embeddedAssetLicenses?.assets || []).filter(asset => asset.kind === 'narration-voice')
		assert.equal(records.length, 1, JSON.stringify(payload.embeddedAssetLicenses))
		assert.equal(records[0].license, 'CC-BY-4.0')
		assert.equal(records[0].attributionRequired, true)
		assert.match(records[0].attribution, /Multilingual LibriSpeech/)
		assert.match(payload.embeddedAssetLicenses.notice, /Attribution required by a narration voice licence/)
		assert.doesNotMatch(JSON.stringify(records[0]), /piper|fr_FR-mls|onnx|huggingface/i)
		assert.doesNotMatch(JSON.stringify(getDeck(deckId).pptx.slides[0]._slideObjects || []), /LibriSpeech/, 'no on-slide credit')
	} finally {
		if (deckId) {
			try {
				const { createMcpToolDispatcher } = await import('../engine.mjs')
				await createMcpToolDispatcher({ sessionId: `voice-attribution-cleanup-${Date.now()}`, clientInfo: { name: 'cleanup', version: '1' }, blackBox: true }).call('betterpptx.deck.dispose', { deckId })
			} catch {}
		}
		await new Promise(resolve => server.close(resolve))
		await rm(lockedRoot, { recursive: true, force: true })
		for (const [key, value] of previous.entries()) { if (value === undefined) delete process.env[key]; else process.env[key] = value }
	}
})
