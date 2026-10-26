#!/usr/bin/env node
// Real fixture-sample upload, private voice creation, synthesis, and same-slide delivery.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import JSZip from 'jszip'
import { DOMParser } from '@xmldom/xmldom'
import { inspectNativeCaptionTracks } from './narration/native-caption-package-evidence.mjs'
import { parseWavDuration } from './narration/wavDuration.mjs'

const current = path.resolve('outputs/custom-voice-current')
const output = current
const reportPath = path.join(output, 'summary.json')
const reusePrepared = process.argv.includes('--reuse-prepared')
const previousReport = reusePrepared ? JSON.parse(await fs.readFile(reportPath, 'utf8')) : null
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const report = { schemaVersion: 'betterpptx.private-voice-real-acceptance.v1', generatedAt: new Date().toISOString(), status: 'INCOMPLETE', scope: 'local-maintainer-real-custom-voice-inference', synthesisCalls: 0, checks: {}, limitations: ['This is a local integration test of two short real clips, not public endpoint certification or a perceptual voice-identity assessment.'] }
const timestamp = milliseconds => `00:00:${String(Math.floor(milliseconds / 1000)).padStart(2, '0')}.${String(milliseconds % 1000).padStart(3, '0')}`
function pcmData(bytes) {
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF')
  assert.equal(bytes.toString('ascii', 8, 12), 'WAVE')
  for (let position = 12; position + 8 <= bytes.length;) {
    const name = bytes.toString('ascii', position, position + 4)
    const size = bytes.readUInt32LE(position + 4)
    if (name === 'data') return bytes.subarray(position + 8, position + 8 + size)
    position += 8 + size + (size % 2)
  }
  throw new Error('PCM payload missing.')
}
async function readExistingAsset(handle) {
  const match = /^asset:\/\/locked\/([a-z-]+)\/([a-f0-9]{64})\.(json|wav)$/.exec(handle)
  assert.ok(match, 'Unexpected locked asset binding.')
  return fs.readFile(path.join(current, 'assets', match[1], match[2].slice(0, 2), `${match[2]}.${match[3]}`))
}
const parser = text => {
  const errors = []
  const document = new DOMParser({ errorHandler: { warning() {}, error: value => errors.push(value), fatalError: value => errors.push(value) } }).parseFromString(text, 'application/xml')
  assert.equal(errors.length, 0, errors.join('; '))
  return document
}
let mcp, deckId, reopenedId
async function call(name, args = {}) {
  assert.notEqual(name, 'betterpptx.narration.synthesize', 'This verifier must never synthesize.')
  const response = await mcp.call(name, args)
  assert.equal(response.ok, true, `${name}: ${JSON.stringify(response.error || response).slice(0, 3000)}`)
  return response.data || response
}
try {
  await fs.mkdir(output, { recursive: true })
  Object.assign(process.env, {
    NODE_ENV: 'test', BETTERPPTX_ENV: 'test', BETTERPPTX_DEPLOYMENT_STAGE: 'test',
    BETTERPPTX_LOCAL_MAINTAINER: '1', BETTERPPTX_PUBLIC_BLACK_BOX: '1', BETTERPPTX_BLACK_BOX: '1', BETTERPPTX_FORCE_PLAN: 'premium',
    BETTERPPTX_REQUIRE_FREE_VALUE_IDENTITY: '0', BETTERPPTX_RELEASE_TEST_ENTITLEMENT: '1', BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY: '1', BETTERPPTX_BILLING_ENFORCE: '0',
    BETTERPPTX_LOCKED_ASSET_ROOT: path.join(current, 'assets'), BETTERPPTX_OUT_DIR: path.join(output, 'runtime'),
    BETTERPPTX_INSTALL_USAGE_STORE: 'local', BETTERPPTX_INSTALL_USAGE_FILE: path.join(output, 'usage.json'),
    BETTERPPTX_BILLING_LEDGER_STORE: 'local', BETTERPPTX_BILLING_LEDGER_FILE: path.join(output, 'ledger.json'),
    BETTERPPTX_DURABLE_OPERATION_STORE: 'local', BETTERPPTX_OPERATION_STORE_FILE: path.join(output, 'operations.json'),
    BETTERPPTX_ASSET_GRANT_STORE: 'local', BETTERPPTX_ASSET_GRANT_DIR: path.join(current, 'grants'),
    BETTERPPTX_ALLOWED_AUDIO_DIRS: [path.join(current, 'assets'), path.join(current, 'runtime-audio'), path.join(output, 'runtime')].join(path.delimiter),
  })
  process.env.BETTERPPTX_INSTALL_HMAC_SECRET ||= crypto.randomBytes(32).toString('hex')
  const { createMcpToolDispatcher } = await import('./engine.mjs')
  const identity = `install_${hash('custom-voice-real-current-local-maintainer')}`
  mcp = createMcpToolDispatcher({ installHash: identity, resourceIdentityHash: identity, authenticated: true, authenticationBasis: 'local-maintainer', sessionId: crypto.randomUUID(), blackBox: true })
  const referencesRoot = process.env.CHATTERBOX_REFERENCE_ROOT
  const references = JSON.parse(await fs.readFile(path.join(referencesRoot, 'references.json'))).references
  const phrases = ['Hello. Welcome.', 'Bonjour. Bienvenue.']
  const languages = ['en-US', 'fr-FR']
  const voices = []
  const outsider = createMcpToolDispatcher({ installHash: `install_${hash('foreign-custom-voice-fixture')}`, authenticated: true, authenticationBasis: 'local-maintainer', sessionId: crypto.randomUUID(), blackBox: true })
  report.fixture = { personalUserSampleProvided: false, attestation: 'Explicitly authorized local public-domain/CC0 reference fixtures; no claim of a personal user voice.', sources: references.map(reference => ({ name: reference.name, license: reference.license, source: reference.source, licenseUrl: reference.licenseUrl, sha256: reference.sha256 })) }
  let runtimeCalls = 0, referenceRegistrations = 0
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url, options) => {
    const pathname = new URL(typeof url === 'string' ? url : url.url || String(url)).pathname
    const response = await originalFetch(url, options)
    if (options?.method === 'POST' && response.ok && pathname === '/synthesize') runtimeCalls++
    if (options?.method === 'POST' && response.ok && pathname === '/voices/register') referenceRegistrations++
    return response
  }
  try {
    let batch
    if (reusePrepared) {
      batch = JSON.parse(await fs.readFile(path.join(output, 'prepared-current.json'), 'utf8'))
      assert.equal(batch.status, 'PASS')
      for (const field of ['fixture', 'privateVoices', 'source', 'segments', 'inference']) report[field] = previousReport[field]
      report.checks = previousReport.checks
      report.synthesisCalls = 0
      report.reusedRealInference = true
      report.inference = { ...previousReport.inference, classification: 'previous real inference retained; this PPTX rebuild makes zero synthesis requests' }
    } else {
    for (const [index, gender] of ['female', 'male'].entries()) {
      const reference = references.find(reference => reference.gender === gender)
      const sampleBytes = await fs.readFile(path.join(referencesRoot, reference.file))
      assert.equal(hash(sampleBytes), reference.sha256)
      const uploaded = await call('betterpptx.assets.upload', { kind: 'audio', data: `data:audio/wav;base64,${sampleBytes.toString('base64')}`, fileName: reference.file, idempotencyKey: `custom-upload-${reference.sha256}` })
      const args = { name: `${reference.name} reference fixture`, sample: uploaded.handle, language: languages[index], gender, consent: { speakerPermission: true, usageRights: true }, idempotencyKey: `custom-create-${reference.sha256}` }
      const denied = await outsider.call('betterpptx.narration.create_voice', args)
      assert.equal(denied.ok, false)
      assert.equal(denied.error.code, 'ASSET_NOT_FOUND')
      const created = await call('betterpptx.narration.create_voice', args)
      assert.equal(created.scope, 'private')
      voices.push(created)
      const foreignRemove = await outsider.call('betterpptx.narration.remove_voice', { voiceId: created.voiceId })
      assert.equal(foreignRemove.ok, false)
      assert.equal(foreignRemove.error.code, 'CUSTOM_VOICE_NOT_FOUND')
    }
    report.checks.crossOwnerDeniedBeforeInference = runtimeCalls === 0
    const own = await call('betterpptx.narration.voices', {})
    assert.ok(voices.every(voice => own.voices.some(item => item.id === voice.voiceId)))
    const prepared = await call('betterpptx.narration.get_voice_timing', {
      segments: voices.map((voice, index) => ({ id: `private-segment-${index + 1}`, text: phrases[index], voice: voice.voiceId, lang: languages[index], gapAfterMs: index === 0 ? 100 : 0 })),
      idempotencyKey: `private-voice-real-${hash(JSON.stringify(voices))}`,
    })
    report.inference = { newSynthesisHttpCalls: runtimeCalls, customReferenceRegistrations: referenceRegistrations, idempotentReplay: prepared.idempotentReplay === true }
    report.synthesisCalls = runtimeCalls
    assert.equal(runtimeCalls, prepared.idempotentReplay ? 0 : 2)
    if (!prepared.idempotentReplay) assert.equal(referenceRegistrations, 2)
    const workerVoices = await originalFetch(`${process.env.BETTERPPTX_CHATTERBOX_URL}/voices`).then(response => response.json())
    assert.ok(voices.every(voice => !workerVoices.voices.some(item => item.id === voice.voiceId)), 'Custom worker profiles must stay outside the global catalog.')
    report.checks.privateWorkerProfilesExcludedFromGlobalCatalog = true
    batch = { status: 'PASS', firstCall: { preparationId: prepared.preparationId, manifestHandle: prepared.manifestHandle, manifestDigest: prepared.manifestDigest, durationMs: prepared.durationMs }, segments: prepared.segments.map((segment, index) => ({ ...segment, voice: voices[index].voiceId, lang: languages[index] })) }
    report.source = { preparationId: prepared.preparationId, manifestDigest: prepared.manifestDigest }
    report.privateVoices = voices
    report.segments = batch.segments.map((segment, index) => ({ id: segment.id, voice: segment.voice, language: segment.lang, text: phrases[index], durationMs: segment.durationMs, startMs: segment.startMs, endMs: segment.endMs, gapAfterMs: segment.gapAfterMs, audioSha256: segment.audio.digest }))
    await fs.writeFile(path.join(output, 'prepared-current.json'), JSON.stringify(batch, null, 2)+'\n')
    }
    // Creation and measured preparation above exercise the public API. Publish
    // the acceptance artifact via the explicit local maintainer serialization
    // route; a public client can never choose a server output directory.
    process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'
    process.env.BETTERPPTX_BLACK_BOX = '0'
    mcp = createMcpToolDispatcher({ installHash: identity, authenticated: true, authenticationBasis: 'local-maintainer', sessionId: crypto.randomUUID(), blackBox: false })
    report.artifactSerialization = 'local maintainer route after public API creation and preparation; not deployed endpoint certification'
  const spec = {
    schemaVersion: 'betterpptx.deck-spec.v1', title: 'Two Private Voices. One Slide.', layout: 'LAYOUT_WIDE',
    authoringContract: { workflow: 'ai-sovereign-v1', creativeAuthority: 'ai', directorMode: 'off', verificationMode: 'complete', geometryAuthority: 'ai', placementPolicy: 'ai-authored-geometry-v1', coordinateSystem: 'inches', layerModel: 'flat-object-array', objectIdentity: 'stable-names-required' },
    contentStory: { audience: 'Narration reviewers', outcome: 'Hear two distinct voices in sequence on one slide.', remember: 'A single slide can contain a conversation.' },
    visualDesign: { world: 'Editorial voice dialogue', framing: 'Two parallel voice specimens connected by time.' },
    styleIntent: { artDirection: 'editorial', mode: 'dark' }, motionTime: { masterClock: 'narration', timingSource: 'prepared measured audio', syncPolicy: 'one measured clock' },
    autoplay: { enabled: true, secondsPerSlide: 3, preserveTimedSlides: true }, showSettings: { useTimings: true },
    slides: [{
      id: 'two-voices', title: 'Two voices. One slide.', message: 'English female, then French male, in one continuous slide.', syncBuild: false, background: { color: '14202D' },
      content: [
        { kind: 'textBox', name: 'title', text: 'Two private voices. One slide.', rect: { x: 0.8, y: 0.7, w: 11.7, h: 0.9 }, style: { fontFace: 'Segoe UI', fontSize: 38, bold: true, color: 'F3F4F5' } },
        { kind: 'textBox', name: 'first-label', text: '01  /  ENGLISH · FEMALE', rect: { x: 0.85, y: 2.1, w: 5.5, h: 0.5 }, style: { fontSize: 16, bold: true, color: '8EBBFF' } },
        { kind: 'textBox', name: 'first-phrase', text: phrases[0], rect: { x: 0.85, y: 2.9, w: 5.5, h: 1.4 }, style: { fontSize: 40, bold: true, color: 'F3F4F5' } },
        { kind: 'textBox', name: 'second-label', text: '02  /  FRANÇAIS · MALE', rect: { x: 7, y: 2.1, w: 5.5, h: 0.5 }, style: { fontSize: 16, bold: true, color: 'F0A6C1' } },
        { kind: 'textBox', name: 'second-phrase', text: phrases[1], rect: { x: 7, y: 2.9, w: 5.5, h: 1.4 }, style: { fontSize: 40, bold: true, color: 'F3F4F5' } },
        { kind: 'textBox', name: 'timing', text: `0.00–${(batch.segments[0].endMs/1000).toFixed(2)}s  →  0.10s pause  →  ${(batch.segments[1].startMs/1000).toFixed(2)}–${(batch.segments[1].endMs/1000).toFixed(2)}s`, rect: { x: 0.85, y: 5.1, w: 11.6, h: 0.7 }, style: { fontSize: 22, color: 'BAC5D1' } },
        { kind: 'textBox', name: 'footer', text: 'Two private synthesized voices · native captions · one measured slide clock', rect: { x: 0.85, y: 6.4, w: 11.6, h: 0.4 }, style: { fontSize: 16, color: 'BAC5D1' } },
      ],
      notes: 'Real prepared synthetic speech: Linda Johnson reference (LJSpeech public domain; https://keithito.com/LJ-Speech-Dataset/) and Thorsten Müller reference (CC0; https://thorsten-voice.de/en/about/recordings/).',
      narration: {
        preparedNarration: { preparationId: batch.firstCall.preparationId, manifestHandle: batch.firstCall.manifestHandle, manifestDigest: batch.firstCall.manifestDigest, segmentIds: batch.segments.map(segment => segment.id) },
        preserveInNotes: true, paddingMs: 700,
        segments: batch.segments.map((segment, index) => ({ id: segment.id, script: phrases[index], voice: segment.voice, lang: segment.lang, gapAfterMs: segment.gapAfterMs,
          closedCaptionTracks: [{ language: segment.lang, label: index === 0 ? 'English · Female' : 'Français · Male', vtt: `WEBVTT\n\n1\n00:00:00.000 --> ${timestamp(segment.durationMs)}\n${index === 0 ? 'Female / English' : 'Male / Français'}: ${phrases[index]}\n` }],
        })),
      },
    }],
  }
  const run = crypto.randomUUID()
  const phase = (phase, source, extra = {}) => call('betterpptx.deck.generate_from_spec', { spec: source, phase, commitMode: 'createNew', plan: 'premium', detail: 'full', billingConfirmed: true, validateAfterCompile: true, validationMode: 'strict', saveAfterCommit: false, idempotencyKey: `two-voices-${phase}-${run}`, ...extra })
  const dry = await phase('dryRun', spec)
  const resolved = await phase('resolve', spec)
  assert.equal(resolved.resolution.locked, true)
  const locked = await phase('lockedDryRun', resolved.lockedSpec)
  assert.equal(locked.lockedPlanDigest, resolved.lockedPlanDigest)
  const commit = await phase('commit', resolved.lockedSpec, { planId: locked.planId, lockedPlanId: locked.planId, planDigest: locked.planDigest })
  deckId = commit.deckId
  report.operations = { deckId, planId: locked.planId, lockedPlanDigest: locked.lockedPlanDigest }
  const validations = {}
  for (const name of ['validate', 'validate_narration', 'validate_design', 'validate_accessibility', 'validate_quality']) {
    const args = name === 'validate_design' || name === 'validate_quality' ? { profile: 'static', requireNarration: true, requireMotion: false, requireVisualProof: false } : {}
    const result = await call(`betterpptx.deck.${name}`, { deckId, ...args })
    validations[name] = { ok: result.ok, score: result.score, issues: result.issues || result.errors || [], blockingIssues: result.blockingIssues || [] }
  }
  report.validation = validations
  assert.equal(validations.validate_quality.ok, true, JSON.stringify(validations.validate_quality))
  const saved = await call('betterpptx.deck.save', { deckId, outputDir: current, fileName: 'custom-voice-demo.pptx', idempotencyKey: `two-voices-save-${run}` })
  const file = saved.filePath || path.join(current, 'custom-voice-demo.pptx')
  const bytes = await fs.readFile(file)
  report.output = { file: path.basename(file), bytes: bytes.length, sha256: hash(bytes) }
  const zip = await JSZip.loadAsync(bytes)
  for (const file of Object.values(zip.files).filter(file => !file.dir && /\.(xml|rels)$/.test(file.name))) parser(await file.async('string'))
  const slide = parser(await zip.file('ppt/slides/slide1.xml').async('string'))
  const pns = 'http://schemas.openxmlformats.org/presentationml/2006/main'
  const nodes = Array.from(slide.getElementsByTagNameNS(pns, 'audio'))
  const caption = await inspectNativeCaptionTracks(zip, 0)
  const audioFiles = Object.values(zip.files).filter(file => /^ppt\/media\/.*\.wav$/.test(file.name))
  report.embeddedAudio = await Promise.all(audioFiles.map(async file => { const bytes = await file.async('nodebuffer'); return { part: file.name, sha256: hash(bytes), durationMs: parseWavDuration(bytes)?.durationMs } }))
  const preparedManifest = JSON.parse(await readExistingAsset(batch.firstCall.manifestHandle))
  const preparedAssembled = await readExistingAsset(preparedManifest.audio.ref)
  const exactClips = await Promise.all(batch.segments.map(segment => readExistingAsset(segment.audio.ref)))
  const audioFormat = parseWavDuration(exactClips[0])
  const silenceBytes = Math.round(100 / 1000 * audioFormat.sampleRate * audioFormat.channels * audioFormat.bitsPerSample / 8)
  const expectedPcm = Buffer.concat([pcmData(exactClips[0]), Buffer.alloc(silenceBytes), pcmData(exactClips[1])])
  report.preparedPcm = { originalSegmentSha256: exactClips.map(hash), assembledWavSha256: hash(preparedAssembled), assembledPcmSha256: hash(pcmData(preparedAssembled)), expectedPcmSha256: hash(expectedPcm), gapMs: 100, zeroSilenceBytes: silenceBytes }
  const notes = parser(await zip.file('ppt/notesSlides/notesSlide1.xml').async('string')).documentElement.textContent
  const advanceMs = Number(slide.getElementsByTagNameNS(pns, 'transition')[0].getAttribute('advTm'))
  report.package = { nativeAudioCount: nodes.length, captionTracks: caption.verifiedTrackCount, advanceMs }
  const narrationAudit = await call('betterpptx.deck.validate_narration', { deckId, filePath: file })
  report.timing = narrationAudit.perSlide?.[0]
  const reopened = await call('betterpptx.deck.open_uploaded', { data: bytes.toString('base64'), fileName: path.basename(file), preserveTiming: true })
  reopenedId = reopened.deckId
  report.checks = { ...report.checks,
    mutationFreePlanning: dry.mutationFree === true && locked.mutationFree === true,
    aggregateQualityPass: validations.validate_quality.ok === true,
    exactTwoRealClips: report.embeddedAudio.length === 2 && batch.segments.every(segment => report.embeddedAudio.some(audio => audio.sha256 === segment.audio.digest && audio.durationMs === segment.durationMs)),
    distinctAudioIdentities: new Set(report.embeddedAudio.map(audio => audio.sha256)).size === 2,
    originalPcmOrderedWithExactSilence: expectedPcm.equals(pcmData(preparedAssembled)),
    twoNativeNarrationCarriers: nodes.length === 2 && nodes.every(node => node.getAttribute('isNarration') === '1'),
    twoNativeCaptionTracks: caption.verifiedTrackCount === 2 && caption.issues.length === 0,
    completeMeasuredTimeline: advanceMs >= batch.firstCall.durationMs + 700 && narrationAudit.ok === true,
    exactSequentialCaptionTiming: narrationAudit.perSlide[0].captionTracks[0].clipStartMs === 0 && narrationAudit.perSlide[0].captionTracks[1].clipStartMs === batch.segments[1].startMs && narrationAudit.perSlide[0].captionTracks[0].clipLocalCueEndMs === batch.segments[0].durationMs && narrationAudit.perSlide[0].captionTracks[1].clipLocalCueEndMs === batch.segments[1].durationMs,
    bothScriptsInNotes: phrases.every(phrase => notes.includes(phrase)),
    reopenedOneSlide: reopened.slideCount === 1,
  }
  report.status = Object.values(report.checks).every(Boolean) ? 'PACKAGE_PASS_DESKTOP_PENDING' : 'FAIL'
  } finally { globalThis.fetch = originalFetch }
} catch (error) {
  report.status = 'FAIL'; report.error = { code: error.code, message: error.message }
} finally {
  if (mcp) for (const deck of [reopenedId, deckId].filter(Boolean)) await mcp.call('betterpptx.deck.dispose', { deckId: deck }).catch(() => {})
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify({ status: report.status, output: report.output, checks: report.checks, error: report.error }))
  if (report.status === 'FAIL') process.exitCode = 1
}
