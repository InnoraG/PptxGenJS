import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { prepareNarrationAudio } from '../narration/preparation.mjs';
import { buildSpecOperationPlan, operationResolutionRequirement } from '../ir/spec-compiler.mjs';
import { validateNarrationProvider } from '../media-image-formatting-contract.mjs';
import { estimateHeavyCost } from '../billing/estimator.mjs';
import { TOOLS } from '../tools.mjs';
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
function wav(ms, rate = 24000, frequency = 440) { const n = rate * ms / 1000, b = Buffer.alloc(44 + n * 2); b.write('RIFF'); b.writeUInt32LE(b.length - 8, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40); for (let i = 0; i < n; i++)
    b.writeInt16LE(Math.round(Math.sin(i * 2 * Math.PI * frequency / rate) * 3000), 44 + i * 2); return b; }
const ref = b => `asset://locked/uploaded-audio/${sha(b)}.wav`;
function spec(narration) { return { schemaVersion: 'betterpptx.deck-spec.v1', title: 'Owned audio', authoringContract: { workflow: 'ai-sovereign-v1', creativeAuthority: 'ai', directorMode: 'off', verificationMode: 'complete', geometryAuthority: 'ai', placementPolicy: 'ai-authored-geometry-v1', coordinateSystem: 'inches', layerModel: 'flat-object-array', objectIdentity: 'stable-names-required' }, motionTime: { masterClock: 'narration' }, slides: [{ id: 'slide-a', title: 'Owned', message: 'One exact clip.', layoutIntent: 'comparison', syncBuild: false, narration, content: [{ kind: 'textBox', name: 'proof', text: 'One exact clip.', rect: { x: 1, y: 1, w: 8, h: 1 } }] }] }; }
const track = (text, ms) => ({ language: 'en', label: 'English', vtt: `WEBVTT\n\n1\n00:00:00.000 --> 00:00:00.${String(ms).padStart(3, '0')}\n${text}\n` });
test('owned-only preparation bypasses catalog/synthesis and preserves PCM plus exact authored gaps', async () => { const root = await fs.mkdtemp(path.join(os.tmpdir(), 'owned-prepare-')); const before = process.env.BETTERPPTX_TTS_PROVIDER; try {
    process.env.BETTERPPTX_TTS_PROVIDER = 'unavailable-owned-only-fixture';
    const a = wav(220), b = wav(310, 24000, 660), files = new Map();
    for (const [name, bytes] of [['a', a], ['b', b]]) {
        const filePath = path.join(root, name + '.wav');
        await fs.writeFile(filePath, bytes);
        files.set(ref(bytes), { filePath, buffer: bytes });
    }
    let calls = 0;
    const prepared = await prepareNarrationAudio({ segments: [{ id: 'a', text: 'First.', audioRef: ref(a), gapAfterMs: 120 }, { id: 'b', text: 'Second.', audioRef: ref(b), gapBeforeMs: 80 }] }, { loadAudio: async (handle) => files.get(handle), synthesize: async () => { calls++; throw Error('No synthesis'); } });
    assert.equal(calls, 0);
    assert.equal(prepared.voice, null);
    assert.equal(prepared.assembled.durationMs, 730);
    assert.deepEqual(prepared.segments.map(s => [s.sourceType, s.sourceAudioSha256, s.startMs, s.endMs]), [['caller-audio', sha(a), 0, 220], ['caller-audio', sha(b), 420, 730]]);
    const merged = await fs.readFile(prepared.assembled.filePath);
    assert.ok(merged.subarray(44, 44 + a.length - 44).equals(a.subarray(44)));
    assert.ok(merged.subarray(44 + (24000 * 420 / 1000) * 2).equals(b.subarray(44)));
    assert.equal(estimateHeavyCost('betterpptx.narration.get_voice_timing', { segments: [{ text: 'First.', audioRef: ref(a) }] }), 0);
}
finally {
    if (before === undefined)
        delete process.env.BETTERPPTX_TTS_PROVIDER;
    else
        process.env.BETTERPPTX_TTS_PROVIDER = before;
    await fs.rm(root, { recursive: true, force: true });
} });
test('all owned PCM formats are checked before any mixed-request speech compute', async () => { const root = await fs.mkdtemp(path.join(os.tmpdir(), 'owned-format-')); try {
    const clips = [wav(100), wav(100, 48000)];
    const files = new Map();
    for (const [i, b] of clips.entries()) {
        const filePath = path.join(root, i + '.wav');
        await fs.writeFile(filePath, b);
        files.set(ref(b), { filePath, buffer: b });
    }
    let calls = 0;
    await assert.rejects(prepareNarrationAudio({ segments: [{ id: 'synthesis', text: 'Do not compute.' }, ...clips.map((b, i) => ({ id: 'owned-' + i, text: 'Owned.', audioRef: ref(b) }))] }, { loadAudio: async (handle) => files.get(handle), synthesize: async () => { calls++; throw Error('Unexpected'); } }), e => e.code === 'NARRATION_PREPARATION_FORMAT_MISMATCH');
    assert.equal(calls, 0);
}
finally {
    await fs.rm(root, { recursive: true, force: true });
} });
test('mixed preparation synthesizes only missing clips and preserves authored order', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'owned-mixed-'));
    try {
        const owned = wav(220), generated = wav(310, 24000, 660);
        const ownedPath = path.join(root, 'owned.wav'), generatedPath = path.join(root, 'generated.wav');
        await fs.writeFile(ownedPath, owned);
        await fs.writeFile(generatedPath, generated);
        let calls = 0;
        const prepared = await prepareNarrationAudio({ segments: [
            { id: 'owned-first', text: 'First.', audioRef: ref(owned), gapAfterMs: 100 },
            { id: 'generated', text: 'Second.', gapAfterMs: 50 },
            { id: 'owned-last', text: 'First again.', audioRef: ref(owned) },
        ] }, {
            loadAudio: async () => ({ filePath: ownedPath, buffer: owned }),
            synthesize: async ({ text }) => {
                calls++;
                assert.equal(text, 'Second.');
                return { wavPath: generatedPath, voice: { id: 'fixture' }, warnings: [] };
            },
        });
        assert.equal(calls, 1);
        assert.deepEqual(prepared.segments.map(s => [s.id, s.sourceType, s.startMs, s.endMs]), [
            ['owned-first', 'caller-audio', 0, 220], ['generated', 'synthesized', 320, 630], ['owned-last', 'caller-audio', 680, 900],
        ]);
        const merged = await fs.readFile(prepared.assembled.filePath);
        assert.ok(merged.subarray(44 + 320 * 48, 44 + 630 * 48).equals(generated.subarray(44)));
        const mixedCost = estimateHeavyCost('betterpptx.narration.get_voice_timing', { segments: [
            { text: 'Owned transcript does not consume speech compute.', audioRef: ref(owned) }, { text: 'Second.' },
        ] });
        assert.equal(mixedCost, estimateHeavyCost('betterpptx.narration.get_voice_timing', { segments: [{ text: 'Second.' }] }));
    } finally {
        await fs.rm(root, { recursive: true, force: true });
    }
});
test('compiler recognizes audioRef and audio.ref; typed attach carries native captions and multiclip order', () => { const a = ref(wav(220)), b = ref(wav(310)); for (const narration of [{ text: 'First.', audioRef: a }, { text: 'First.', audio: { ref: a } }, { text: 'First.', audioRef: a, audio: { closedCaptionTracks: [track('First.', 220)] } }, { mode: 'attach', audioRef: a, text: 'First.', timing: { paddingMs: 500 }, closedCaptionTracks: [track('First.', 220)] }]) {
    const result = buildSpecOperationPlan(spec(narration));
    const op = result.operations.find(x => x.tool === 'betterpptx.slide.add_narration');
    assert.ok(op);
    assert.equal(operationResolutionRequirement(op), null);
    assert.equal(op.args.audio.ref, a);
    if (narration.mode) {
        validateNarrationProvider(narration);
        assert.equal(op.args.closedCaptionTracks.length, 1);
    }
} const result = buildSpecOperationPlan(spec({ segments: [{ id: 'a', script: 'First.', audioRef: a, gapAfterMs: 100, closedCaptionTracks: [track('First.', 220)] }, { id: 'b', script: 'Second.', audio: { ref: b }, closedCaptionTracks: [track('Second.', 310)] }] })); const op = result.operations.find(x => x.tool === 'betterpptx.slide.add_narration'); assert.equal(operationResolutionRequirement(op), null); assert.deepEqual(op.args.segments.map(s => s.id), ['a', 'b']); assert.deepEqual(op.args.segments.map(s => s.audio.ref), [a, b]); assert.ok(op.args.segments.every(s => s.closedCaptionTracks.length === 1)); const tool = TOOLS.find(t => t.name === 'betterpptx.narration.get_voice_timing'); assert.ok(tool.inputSchema.properties.segments.items.properties.audioRef); const front = TOOLS.find(t => t.name === 'betterpptx.deck.generate_from_spec'); assert.ok(front.inputSchema.properties.spec.properties.slides.items.properties.narration.properties.closedCaptionTracks); });
test('conflicting caller audio handles are rejected rather than silently substituted', () => {
    const a = ref(wav(220)), b = ref(wav(310));
    assert.throws(() => buildSpecOperationPlan(spec({ text: 'First.', audioRef: a, audio: { ref: b } })), e => e.code === 'NARRATION_AUDIO_SOURCE_AMBIGUOUS');
});
test('public owner-bound batch authorizes all clips before compute, reports measured provenance, and replays immutable preparation', { timeout: 60000 }, async () => { const root = await fs.mkdtemp(path.join(os.tmpdir(), 'owned-dispatch-')), before = { ...process.env }, fetchBefore = globalThis.fetch; let synthesisCalls = 0; try {
    Object.assign(process.env, { NODE_ENV: 'test', BETTERPPTX_ENV: 'test', BETTERPPTX_DEPLOYMENT_STAGE: 'test', BETTERPPTX_PUBLIC_BLACK_BOX: '1', BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY: '1', BETTERPPTX_LOCAL_MAINTAINER: '1', BETTERPPTX_FORCE_PLAN: 'premium', BETTERPPTX_RELEASE_TEST_ENTITLEMENT: '1', BETTERPPTX_BILLING_ENFORCE: '0', BETTERPPTX_REQUIRE_FREE_VALUE_IDENTITY: '0', BETTERPPTX_TTS_PROVIDER: 'unavailable-owned-only-fixture', BETTERPPTX_LOCKED_ASSET_ROOT: path.join(root, 'assets'), BETTERPPTX_ASSET_GRANT_STORE: 'local', BETTERPPTX_ASSET_GRANT_DIR: path.join(root, 'grants'), BETTERPPTX_INSTALL_USAGE_STORE: 'local', BETTERPPTX_INSTALL_USAGE_FILE: path.join(root, 'usage.json'), BETTERPPTX_BILLING_LEDGER_STORE: 'local', BETTERPPTX_BILLING_LEDGER_FILE: path.join(root, 'ledger.json'), BETTERPPTX_INSTALL_HMAC_SECRET: 'owned-audio-dispatch-fixture-secret-at-least32', BETTERPPTX_OUT_DIR: path.join(root, 'generated'), BETTERPPTX_DURABLE_OPERATION_STORE: 'disabled', BETTERPPTX_REQUIRE_SHARED_STORES: '0' });
    globalThis.fetch = async () => { synthesisCalls++; throw Error('No external speech request permitted'); };
    const { createMcpToolDispatcher } = await import('../engine.mjs');
    const client = letter => createMcpToolDispatcher({ installHash: 'install_' + letter.repeat(64), authenticated: true, authenticationBasis: 'test-verified-account', sessionId: 'owned-' + letter, blackBox: true });
    const alice = client('a'), bob = client('b');
    const a = wav(220), b = wav(310, 24000, 660);
    const upload = async (bytes) => { const x = await alice.call('betterpptx.assets.upload', { kind: 'audio', data: 'data:audio/wav;base64,' + bytes.toString('base64'), fileName: 'owned.wav' }); assert.equal(x.ok, true, JSON.stringify(x)); return x.data.handle; };
    const ah = await upload(a), bh = await upload(b);
    const denied = await bob.call('betterpptx.narration.get_voice_timing', { segments: [{ id: 'synth', text: 'Must not synthesize.' }, { id: 'foreign', text: 'Private.', audioRef: ah }], idempotencyKey: 'foreign-before-compute' });
    assert.equal(denied.ok, false);
    assert.equal(denied.error.code, 'ASSET_NOT_FOUND', JSON.stringify(denied));
    assert.equal(synthesisCalls, 0);
    const args = { segments: [{ id: 'a', slideId: 'slide-a', text: 'First.', audioRef: ah, gapAfterMs: 100 }, { id: 'b', slideId: 'slide-a', text: 'Second.', audioRef: bh }], idempotencyKey: 'owned-exact-batch' };
    const x = await alice.call('betterpptx.narration.get_voice_timing', args);
    assert.equal(x.ok, true, JSON.stringify(x));
    assert.equal(x.data.durationMs, 630);
    assert.equal(x.data.billing.synthesizedSegmentCount, 0);
    assert.equal(x.data.billing.callerAudioSegmentCount, 2);
    assert.deepEqual(x.data.segments.map(s => [s.id, s.sourceType, s.sourceAudioSha256, s.startMs, s.endMs]), [['a', 'caller-audio', sha(a), 0, 220], ['b', 'caller-audio', sha(b), 320, 630]]);
    const replay = await alice.call('betterpptx.narration.get_voice_timing', args);
    assert.equal(replay.ok, true, JSON.stringify(replay));
    assert.equal(replay.data.manifestHandle, x.data.manifestHandle);
    assert.equal(replay.data.manifestDigest, x.data.manifestDigest);
    assert.equal(synthesisCalls, 0);
    assert.doesNotMatch(JSON.stringify(x), /unavailable-owned-only-fixture|filePath|node_modules|[CD]:\\/);
}
finally {
    globalThis.fetch = fetchBefore;
    for (const key of Object.keys(process.env))
        if (!(key in before))
            delete process.env[key];
    Object.assign(process.env, before);
    await fs.rm(root, { recursive: true, force: true });
} });
