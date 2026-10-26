import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

function fixtureWav() {
  const rate = 8000, samples = rate * 3, bytes = Buffer.alloc(44 + samples * 2)
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8)
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22)
  bytes.writeUInt32LE(rate, 24); bytes.writeUInt32LE(rate * 2, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34)
  bytes.write('data', 36); bytes.writeUInt32LE(samples * 2, 40)
  for (let index = 0; index < samples; index++) bytes.writeInt16LE(Math.round(Math.sin(index / 4) * 2000), 44 + index * 2)
  return bytes
}

test('public private-voice creation authorizes the uploaded sample and rejects foreign owners and unsupported synthesis services', { timeout: 30000 }, async () => {
  const temporaryRoot = path.resolve(os.tmpdir())
  const root = await fs.mkdtemp(path.join(temporaryRoot, 'betterpptx-custom-api-'))
  const previous = { ...process.env }
  try {
    Object.assign(process.env, {
      NODE_ENV: 'test', BETTERPPTX_ENV: 'test', BETTERPPTX_DEPLOYMENT_STAGE: 'test',
      BETTERPPTX_PUBLIC_BLACK_BOX: '1', BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY: '1', BETTERPPTX_LOCAL_MAINTAINER: '1',
      BETTERPPTX_FORCE_PLAN: 'premium', BETTERPPTX_RELEASE_TEST_ENTITLEMENT: '1', BETTERPPTX_BILLING_ENFORCE: '0', BETTERPPTX_REQUIRE_FREE_VALUE_IDENTITY: '0',
      BETTERPPTX_TTS_PROVIDER: 'chatterbox-http', BETTERPPTX_CHATTERBOX_URL: 'http://127.0.0.1:1',
      BETTERPPTX_CUSTOM_VOICE_ROOT: path.join(root, 'private-voices'), BETTERPPTX_CHATTERBOX_VOICES_MANIFEST: path.join(root, 'manifest.json'),
      BETTERPPTX_LOCKED_ASSET_ROOT: path.join(root, 'assets'), BETTERPPTX_ASSET_GRANT_STORE: 'local', BETTERPPTX_ASSET_GRANT_DIR: path.join(root, 'grants'),
      BETTERPPTX_INSTALL_USAGE_STORE: 'local', BETTERPPTX_INSTALL_USAGE_FILE: path.join(root, 'usage.json'),
      BETTERPPTX_BILLING_LEDGER_STORE: 'local', BETTERPPTX_BILLING_LEDGER_FILE: path.join(root, 'ledger.json'),
      BETTERPPTX_INSTALL_HMAC_SECRET: 'custom-voice-public-dispatch-fixture-secret-at-least32',
    })
    await fs.writeFile(process.env.BETTERPPTX_CHATTERBOX_VOICES_MANIFEST, JSON.stringify({ provider: 'chatterbox-http', modelDigest: `sha256:${'a'.repeat(64)}`, voices: [] }))
    const { createMcpToolDispatcher } = await import('../engine.mjs')
    const client = letter => createMcpToolDispatcher({ installHash: `install_${letter.repeat(64)}`, authenticated: true, authenticationBasis: 'test-verified-account', sessionId: `private-voice-${letter}`, blackBox: true })
    const alice = client('a'), bob = client('b')
    const uploaded = await alice.call('betterpptx.assets.upload', { kind: 'audio', data: `data:audio/wav;base64,${fixtureWav().toString('base64')}`, fileName: 'speaker.wav', idempotencyKey: 'speaker-upload' })
    assert.equal(uploaded.ok, true, JSON.stringify(uploaded))
    const handle = uploaded.data.handle
    const args = { name: 'Private speaker', sample: handle, language: 'en', consent: { speakerPermission: true, usageRights: true }, idempotencyKey: 'private-speaker-create' }
    const foreignSample = await bob.call('betterpptx.narration.create_voice', args)
    assert.equal(foreignSample.ok, false)
    assert.equal(foreignSample.error.code, 'ASSET_NOT_FOUND', JSON.stringify(foreignSample))
    const created = await alice.call('betterpptx.narration.create_voice', args)
    assert.equal(created.ok, true, JSON.stringify(created))
    assert.equal(created.data.scope, 'private')
    assert.equal(created.data.durationMs, 3000)
    assert.equal(created.data.consentBasis, 'user-attested')
    const voiceId = created.data.voiceId
    assert.match(voiceId, /^voice_[a-f0-9]{64}$/)
    const replay = await alice.call('betterpptx.narration.create_voice', args)
    assert.equal(replay.ok, true, JSON.stringify(replay))
    assert.equal(replay.data.voiceId, voiceId)
    const ownCatalog = await alice.call('betterpptx.narration.voices', {})
    const foreignCatalog = await bob.call('betterpptx.narration.voices', {})
    assert.equal(ownCatalog.ok, true, JSON.stringify(ownCatalog))
    assert.equal(foreignCatalog.ok, true, JSON.stringify(foreignCatalog))
    assert.ok(ownCatalog.data.voices.some(voice => voice.id === voiceId), 'Owner catalog must include the private voice.')
    assert.ok(!foreignCatalog.data.voices.some(voice => voice.id === voiceId), 'Another account catalog must omit private voices.')
    const otherOwner = await bob.call('betterpptx.narration.remove_voice', { voiceId })
    assert.equal(otherOwner.ok, false)
    assert.equal(otherOwner.error.code, 'CUSTOM_VOICE_NOT_FOUND', JSON.stringify(otherOwner))
    process.env.BETTERPPTX_TTS_PROVIDER = 'piper-http'
    const unsupported = await alice.call('betterpptx.narration.create_voice', { ...args, idempotencyKey: 'unsupported-service' })
    assert.equal(unsupported.ok, false)
    assert.equal(unsupported.error.code, 'NARRATION_CUSTOM_VOICE_UNSUPPORTED', JSON.stringify(unsupported))
    const removed = await alice.call('betterpptx.narration.remove_voice', { voiceId })
    assert.equal(removed.ok, true, JSON.stringify(removed))
    assert.equal(removed.data.removed, true)
    for (const result of [created, replay, foreignSample, otherOwner, unsupported, removed]) assert.doesNotMatch(JSON.stringify(result), /sampleBuffer|referenceAudio|ownerHash|node_modules|chatterbox|piper|C:\\\\|D:\\\\/i)
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key]
    Object.assign(process.env, previous)
    assert.equal(path.dirname(root), temporaryRoot)
    assert.ok(path.basename(root).startsWith('betterpptx-custom-api-'))
    await fs.rm(root, { recursive: true, force: true })
  }
})
