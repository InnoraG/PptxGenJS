import assert from 'node:assert/strict'
import test from 'node:test'
import { publicToolList, PUBLIC_SPEC_FIRST_TOOLS } from '../blackbox.mjs'
import { TOOLS } from '../tools.mjs'
import { assertMediaAvatarPublicOutput, MEDIA_AVATAR_PUBLIC_OPERATION_SCHEMAS, validateMediaAvatarPublicOperationArgs } from '../media-avatar-public-operation-contract.mjs'

const name = 'betterpptx.narration.create_voice'
const valid = () => ({ name: 'My private voice', sample: `asset://locked/uploaded-audio/${'a'.repeat(64)}.wav`, language: 'en-US', consent: { speakerPermission: true, usageRights: true }, idempotencyKey: 'owned-voice-1' })
const contractOnly = value => Array.isArray(value) ? value.map(contractOnly) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'description').map(([key, child]) => [key, contractOnly(child)])) : value

test('private voice commands are discoverable with closed schemas and generic output facts', () => {
  const served = publicToolList(TOOLS)
  for (const operation of [name, 'betterpptx.narration.remove_voice']) {
    const tool = served.find(tool => tool.name === operation)
    assert.ok(tool, operation)
    assert.ok(PUBLIC_SPEC_FIRST_TOOLS.has(operation))
    assert.equal(tool.inputSchema.additionalProperties, false)
    assert.deepEqual(contractOnly(tool.inputSchema), contractOnly(MEDIA_AVATAR_PUBLIC_OPERATION_SCHEMAS[operation]))
    assert.doesNotMatch(JSON.stringify(tool), /chatterbox|piper|server.?path|sampleBuffer|modelPath|configPath/i)
  }
})

test('voice creation requires explicit recording permission and opaque uploaded audio only', () => {
  assert.doesNotThrow(() => validateMediaAvatarPublicOperationArgs(name, valid()))
  for (const sample of ['https://example.com/sample.wav', 'C:\\private\\voice.wav', '/tmp/voice.wav', `asset://locked/narration-audio/${'a'.repeat(64)}.wav`, `asset://locked/uploaded-audio/${'a'.repeat(64)}.mp3`]) {
    assert.throws(() => validateMediaAvatarPublicOperationArgs(name, { ...valid(), sample }), /opaque uploaded WAV/)
  }
  for (const consent of [undefined, {}, { speakerPermission: true }, { speakerPermission: true, usageRights: false }, { speakerPermission: true, usageRights: true, impersonation: true }]) {
    assert.throws(() => validateMediaAvatarPublicOperationArgs(name, { ...valid(), consent }), /consent/)
  }
  assert.throws(() => validateMediaAvatarPublicOperationArgs(name, { ...valid(), provider: 'anything' }), /not part of the public/)
  assert.throws(() => validateMediaAvatarPublicOperationArgs(name, { ...valid(), idempotencyKey: undefined }), /idempotencyKey/)
})

test('private voice public outputs reject recording locations and ownership internals', () => {
  assert.doesNotThrow(() => assertMediaAvatarPublicOutput(name, { voiceId: 'voice_private_example', name: 'My voice', language: 'en', durationMs: 5000, scope: 'private', consentBasis: 'user-attested' }))
  for (const key of ['owner', 'ownerHash', 'sampleBuffer', 'referenceAudio', 'path', 'filePath', 'provider', 'model']) {
    assert.throws(() => assertMediaAvatarPublicOutput(name, { voiceId: 'voice_private_example', [key]: 'private' }), /private/)
  }
  assert.throws(() => validateMediaAvatarPublicOperationArgs('betterpptx.narration.remove_voice', {}), /voiceId/)
})
