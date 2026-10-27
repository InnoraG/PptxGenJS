import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'

function fixtureWav(milliseconds, frequency) {
	const rate = 24000, frames = rate * milliseconds / 1000, bytes = Buffer.alloc(44 + frames * 2)
	bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8)
	bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22)
	bytes.writeUInt32LE(rate, 24); bytes.writeUInt32LE(rate * 2, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34)
	bytes.write('data', 36); bytes.writeUInt32LE(frames * 2, 40)
	for (let index = 0; index < frames; index++) {
		const envelope = Math.min(1, index / 400, (frames - 1 - index) / 400)
		bytes.writeInt16LE(Math.round(Math.sin(index * Math.PI * 2 * frequency / rate) * 6000 * envelope), 44 + index * 2)
	}
	return bytes
}

function narratedSpec(prepared) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'Cross-instance prepared narration',
		authoringContract: { workflow: 'ai-sovereign-v1', creativeAuthority: 'ai', directorMode: 'off', verificationMode: 'complete', geometryAuthority: 'ai', placementPolicy: 'ai-authored-geometry-v1', level: 'deterministic', coordinateSystem: 'inches', layerModel: 'flat-object-array', objectIdentity: 'stable-names-required' },
		contentStory: { audience: 'Reviewers', outcome: 'Reuse the exact measured speech across instances.', remember: 'Immutable speech remains available after reconnect.' },
		visualDesign: { world: 'Editorial', framing: 'One controlled test slide.' }, styleIntent: { artDirection: 'editorial', mode: 'light' },
		motionTime: { masterClock: 'narration', timingSource: 'prepared measured audio', syncPolicy: 'one measured clock' },
		slides: [{ id: 'slide-1', title: 'Prepared', message: 'Reuse measured audio.', layoutIntent: 'title-only',
			narration: { script: 'First. Second.', voiceId: 'fixture-voice', preparedNarration: { preparationId: prepared.preparationId, manifestHandle: prepared.manifestHandle, manifestDigest: prepared.manifestDigest, segmentIds: ['first', 'second'], slideId: 'slide-1' } },
			content: [{ kind: 'textBox', name: 'headline', text: 'Reuse measured audio.', rect: { x: 0.8, y: 0.7, w: 6.8, h: 0.8 } }],
		}],
	}
}

function localAsset(root, handle) {
	const match = /^asset:\/\/locked\/([^/]+)\/([a-f0-9]{64})\.([a-z0-9]+)$/.exec(handle)
	assert.ok(match)
	return path.join(root, match[1], match[2].slice(0, 2), `${match[2]}.${match[3]}`)
}

test('prepared narration publishes shared bytes before success and hydrates them in a different process without synthesis', { timeout: 90000 }, async () => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'narration-cross-instance-'))
	const shared = path.join(root, 'shared')
	const manifest = path.join(root, 'voices.json')
	await fs.writeFile(manifest, JSON.stringify({ voices: [{ id: 'fixture-voice', language: 'en', locale: 'en_US', reviewStatus: 'approved', commercialUse: 'allowed', license: 'MIT', isDefaultForLocale: true }] }))
	const source = `
		let raw = ''; for await (const chunk of process.stdin) raw += chunk;
		const input = JSON.parse(raw); let providerCalls = 0;
		globalThis.fetch = async (url, options) => {
			if (input.mode !== 'prepare' || options?.method !== 'POST') throw new Error('Unexpected synthesis or external network request.');
			providerCalls++; const body = JSON.parse(options.body);
			return new Response(Buffer.from(body.text.startsWith('First') ? input.firstWav : input.secondWav, 'base64'));
		};
		const { createMcpToolDispatcher } = await import(${JSON.stringify(new URL('../engine.mjs', import.meta.url).href)});
		const mcp = createMcpToolDispatcher({ installHash: 'install_' + input.owner.repeat(64), authenticated: true, authenticationBasis: 'test-verified-account', sessionId: 'cross-instance-' + input.mode, blackBox: true });
		const result = input.mode === 'prepare'
			? await mcp.call('betterpptx.narration.get_voice_timing', { voice: 'fixture-voice', segments: [{ id: 'first', slideId: 'slide-1', text: 'First.', gapAfterMs: 100 }, { id: 'second', slideId: 'slide-1', text: 'Second.' }], idempotencyKey: input.key || 'cross-instance-preparation' })
			: await mcp.call('betterpptx.billing.estimate', { toolName: 'betterpptx.deck.generate_from_spec', toolArgs: { spec: input.spec, plan: 'premium' } });
		process.stdout.write('NARRATION_CROSS_RESULT ' + JSON.stringify({ result, providerCalls }));
	`
	const fresh = (input, cacheName, extra = {}) => new Promise((resolve, reject) => {
		const child = spawn(process.execPath, ['--input-type=module', '-e', source], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: {
			...process.env,
			NODE_ENV: 'test', BETTERPPTX_ENV: 'test', BETTERPPTX_DEPLOYMENT_STAGE: 'test', K_SERVICE: '',
			BETTERPPTX_PUBLIC_BLACK_BOX: '1', BETTERPPTX_LOCAL_MAINTAINER: '0', BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY: '1',
			BETTERPPTX_FORCE_PLAN: 'premium', BETTERPPTX_BILLING_ENFORCE: '0', BETTERPPTX_BILLING_PROVIDER: '',
			BETTERPPTX_LOCKED_ASSET_ROOT: path.join(root, cacheName), BETTERPPTX_LOCKED_ASSET_STORE: 'local', BETTERPPTX_LOCKED_ASSET_SHARED_DIR: shared,
			BETTERPPTX_ASSET_GRANT_STORE: 'local', BETTERPPTX_ASSET_GRANT_DIR: path.join(root, 'grants'),
			BETTERPPTX_DURABLE_OPERATION_STORE: 'disabled', BETTERPPTX_DURABLE_DECK_STATE_STORE: 'disabled', BETTERPPTX_DECK_SNAPSHOT_STORE: 'disabled',
			BETTERPPTX_REQUIRE_SHARED_STORES: '0', BETTERPPTX_REQUIRE_DURABLE_DECK_STATE: '0', BETTERPPTX_REQUIRE_DURABLE_OPERATIONS: '0',
			BETTERPPTX_INSTALL_USAGE_STORE: 'local', BETTERPPTX_INSTALL_USAGE_FILE: path.join(root, 'usage.json'),
			BETTERPPTX_BILLING_LEDGER_STORE: 'local', BETTERPPTX_BILLING_LEDGER_FILE: path.join(root, 'ledger.json'),
			BETTERPPTX_OUT_DIR: path.join(root, cacheName, 'generated'), BETTERPPTX_DOWNLOAD_ROOT: path.join(root, cacheName, 'downloads'),
			BETTERPPTX_TTS_PROVIDER: 'piper-http', BETTERPPTX_TTS_AUTH: '', BETTERPPTX_TTS_URL: 'http://fixture.invalid',
			BETTERPPTX_RUNTIME_VOICES_MANIFEST: manifest, BETTERPPTX_VOICES_MANIFEST: manifest,
			BETTERPPTX_NARRATION_MODE: 'production', BETTERPPTX_NARRATION_DISABLED: '0', BETTERPPTX_LOG: '',
			BETTERPPTX_INSTALL_HMAC_SECRET: 'cross-instance-test-fixture-secret-at-least-32-characters', ...extra,
		} })
		let stdout = '', stderr = ''
		child.stdout.on('data', value => { stdout += value })
		child.stderr.on('data', value => { stderr += value })
		child.on('error', reject)
		child.on('close', code => {
			if (code !== 0) return reject(new Error(`Fixture process failed (${code}): ${stderr.slice(-2000)}`))
			try { resolve(JSON.parse(stdout.slice(stdout.indexOf('NARRATION_CROSS_RESULT ') + 23))) } catch (error) { reject(new Error(`${error.message}: ${stdout.slice(-2000)}`)) }
		})
		child.stdin.end(JSON.stringify({ owner: 'a', firstWav: fixtureWav(500, 220).toString('base64'), secondWav: fixtureWav(300, 330).toString('base64'), ...input }))
	})
	try {
		const preparedCall = await fresh({ mode: 'prepare' }, 'producer')
		assert.equal(preparedCall.result.ok, true, JSON.stringify(preparedCall.result))
		assert.equal(preparedCall.providerCalls, 2)
		const prepared = preparedCall.result.data
		const handles = [prepared.manifestHandle, prepared.audio.ref, ...prepared.segments.map(segment => segment.audio.ref)]
		assert.equal(new Set(handles).size, 4)
		for (const handle of handles) await fs.access(localAsset(shared, handle))
		const spec = narratedSpec(prepared)
		const quoted = await fresh({ mode: 'quote', spec }, 'consumer')
		assert.equal(quoted.result.ok, true, JSON.stringify(quoted.result))
		assert.equal(quoted.providerCalls, 0)
		assert.equal(quoted.result.data.narrationPreparation.validatedPreparationCount, 1)
		assert.equal(quoted.result.data.narrationPreparation.measuredSegmentCount, 2)
		assert.equal(quoted.result.data.narrationPreparation.measuredDurationMs, 900)
		for (const handle of handles) assert.deepEqual(await fs.readFile(localAsset(path.join(root, 'consumer'), handle)), await fs.readFile(localAsset(shared, handle)))
		assert.doesNotMatch(JSON.stringify(quoted.result), /narration-cross-instance-|fixture\.invalid|resourceOwner/)
		const foreign = await fresh({ mode: 'quote', spec, owner: 'b' }, 'foreign')
		assert.equal(foreign.result.ok, false)
		assert.equal(foreign.result.error.code, 'ASSET_NOT_FOUND')
		await assert.rejects(fs.access(localAsset(path.join(root, 'foreign'), prepared.manifestHandle)))
		const segmentFile = localAsset(shared, prepared.segments[0].audio.ref)
		const original = await fs.readFile(segmentFile)
		await fs.writeFile(segmentFile, fixtureWav(500, 440))
		const corrupt = await fresh({ mode: 'quote', spec }, 'corrupt-consumer')
		assert.equal(corrupt.result.ok, false)
		assert.equal(corrupt.result.error.code, 'NARRATION_PREPARATION_INVALID')
		await fs.writeFile(segmentFile, original)
		await fs.unlink(segmentFile)
		const missing = await fresh({ mode: 'quote', spec }, 'missing-consumer')
		assert.equal(missing.result.ok, false)
		assert.equal(missing.result.error.code, 'NARRATION_PREPARATION_EXPIRED')
		const blocked = path.join(root, 'unavailable-shared-store')
		await fs.writeFile(blocked, 'fixture blocks directory creation')
		const failedPublish = await fresh({ mode: 'prepare', key: 'failed-shared-preparation' }, 'failed-producer', { BETTERPPTX_LOCKED_ASSET_SHARED_DIR: blocked })
		assert.equal(failedPublish.result.ok, false)
		assert.equal(failedPublish.result.error.code, 'NARRATION_PREPARATION_STORAGE_UNAVAILABLE')
		assert.doesNotMatch(JSON.stringify(failedPublish.result), /unavailable-shared-store|narration-cross-instance-/)
	} finally {
		assert.ok(root.startsWith(path.resolve(os.tmpdir()) + path.sep))
		await fs.rm(root, { recursive: true, force: true })
	}
})
