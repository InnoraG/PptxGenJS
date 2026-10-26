#!/usr/bin/env node
// Deliver already completed, verified V3 media through native PowerPoint.
// No speech/model execution is allowed here, including during a deck rebuild.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import JSZip from 'jszip'
import { DOMParser } from '@xmldom/xmldom'
import { parseWavDuration } from './narration/wavDuration.mjs'
import { inspectNativeCaptionTracks } from './narration/native-caption-package-evidence.mjs'

const arg = (key, fallback) => process.argv.includes(key) ? process.argv[process.argv.indexOf(key) + 1] : fallback
const root = path.resolve('outputs/chatterbox-v3-current/pptx')
const sourcePath = path.resolve(arg('--manifest', 'outputs/chatterbox-v3-current/modal/l4/smoke-manifest.json'))
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const stamp = milliseconds => {
  const ms = Math.round(milliseconds)
  return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`
}
const identities = {
  checkpointSha256: '5abca8321ede76f8e61f1cc0d19aea6c946b28871017ce8726f8a69203f05953',
  modelDigest: 'sha256:4afe36eeb538555c62c8b768f312a89580a1ef8f764dc7ef87487f8289e25875',
  sourceCommit: '5de7a54aa4e5e2baadb0182dde554908b48b85c2',
  sourceArchiveSha256: 'bb7363a76c0c0432a0305681fe2e533bbfb0f10fcf7b98d75a439d9a909f1576',
}
const languages = [
  { id: 'en', label: 'English', accent: '2364CE', ink: '172434', background: 'F6F4EE', secondary: '536170' },
  { id: 'fr', label: 'Français', accent: 'F0A6C1', ink: 'F3F4F5', background: '14202D', secondary: 'BAC5D1', stacked: true },
  { id: 'ar', label: 'العربية', accent: '007A72', ink: '172434', background: 'F6F4EE', secondary: '536170', rtl: true },
  { id: 'sw', label: 'Kiswahili', accent: 'EDBE78', ink: 'F3F4F5', background: '14202D', secondary: 'BAC5D1', stacked: true },
]
const report = {
  schemaVersion: 'betterpptx.v3-native-media-delivery.v1', generatedAt: new Date().toISOString(), status: 'INCOMPLETE',
  scope: 'Verified Modal V3 SpeechWorker inference followed by local MCP native-media delivery acceptance.',
  synthesisCallsDuringDeckBuild: 0, checks: {},
  limitations: ['This deck reuses real V3 media from the Modal worker. It does not certify that the deployed public MCP speech provider invoked Modal.', 'These licensed reference voices are fixtures, not a personal recording supplied by the user.', 'Native Arabic and Swahili fluency, perceived similarity, and naturalness require listening review.', 'Native caption package presence does not establish caption glyph display with PowerPoint CC enabled.'],
}
let dispatcher, deckId, reopenedId
const originalFetch = globalThis.fetch
async function call(name, args = {}) {
  assert.ok(!['betterpptx.narration.get_voice_timing', 'betterpptx.narration.synthesize', 'betterpptx.narration.create_voice'].includes(name), 'This media-delivery harness cannot generate or clone speech.')
  const response = await dispatcher.call(name, args)
  assert.equal(response.ok, true, `${name}: ${JSON.stringify(response.error || response).slice(0, 2200)}`)
  return response.data || response
}
function xml(text) {
  const errors = []
  const parsed = new DOMParser({ errorHandler: { warning() {}, error: message => errors.push(message), fatalError: message => errors.push(message) } }).parseFromString(text, 'application/xml')
  assert.equal(errors.length, 0, errors.join('; '))
  return parsed
}
function text(name, value, rect, style) {
  return { kind: 'textBox', name, text: value, rect, style: { fontFace: 'Segoe UI', ...style } }
}
try {
  const sourceBytes = await fs.readFile(sourcePath)
  const source = JSON.parse(sourceBytes)
  assert.equal(source.multilingualVersion, 'v3', 'Only an explicit V3 source manifest is accepted.')
  assert.equal(source.checkpointVerified, true, 'Actual checkpoint bytes must be verified by the inference producer.')
  for (const [key, value] of Object.entries(identities)) assert.equal(source[key], value, `Source identity mismatch: ${key}`)
  assert.equal(source.clips?.length, 8, 'Eight completed V3 clips are required.')
  const clipRows = []
  for (const language of languages) for (const gender of ['female', 'male']) {
    const matching = source.clips.filter(clip => clip.language === language.id && clip.gender === gender)
    assert.equal(matching.length, 1, `Exactly one ${language.id}/${gender} clip is required.`)
    const clip = matching[0]
    assert.ok(clip.text?.trim() && clip.voiceId && clip.file && /^[a-f0-9]{64}$/.test(clip.sha256))
    const file = path.resolve(path.dirname(sourcePath), clip.file)
    assert.ok(file.startsWith(path.dirname(sourcePath) + path.sep), 'Clip paths must remain inside the current inference output.')
    const bytes = await fs.readFile(file)
    assert.equal(sha(bytes), clip.sha256, 'Completed clip content changed.')
    const measured = parseWavDuration(bytes)
    assert.ok(measured?.durationMs > 0 && measured.bitsPerSample === 16)
    assert.equal(measured.durationMs, clip.durationMs)
    assert.equal(measured.sampleRate, clip.sampleRate)
    assert.equal(measured.channels, clip.channels)
    assert.equal(measured.bitsPerSample, clip.bitsPerSample)
    clipRows.push({ ...clip, measured, bytes })
  }
  report.source = { manifestSha256: sha(sourceBytes), multilingualVersion: 'v3', ...identities, clipCount: clipRows.length }
  if (process.argv.includes('--check-inputs')) {
    console.log(JSON.stringify({ status: 'INPUTS_VERIFIED', clips: clipRows.length, synthesisCalls: 0, modelDigest: identities.modelDigest }))
    process.exit(0)
  }
  await fs.mkdir(root, { recursive: true })
  Object.assign(process.env, {
    NODE_ENV: 'test', BETTERPPTX_ENV: 'test', BETTERPPTX_DEPLOYMENT_STAGE: 'test', BETTERPPTX_LOCAL_MAINTAINER: '1',
    BETTERPPTX_PUBLIC_BLACK_BOX: '0', BETTERPPTX_BLACK_BOX: '0', BETTERPPTX_FORCE_PLAN: 'premium', BETTERPPTX_RELEASE_TEST_ENTITLEMENT: '1',
    BETTERPPTX_REQUIRE_FREE_VALUE_IDENTITY: '0', BETTERPPTX_BILLING_ENFORCE: '0', BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY: '1',
    BETTERPPTX_LOCKED_ASSET_ROOT: path.join(root, 'assets'), BETTERPPTX_OUT_DIR: path.join(root, 'runtime'),
    BETTERPPTX_ASSET_GRANT_STORE: 'local', BETTERPPTX_ASSET_GRANT_DIR: path.join(root, 'grants'),
    BETTERPPTX_INSTALL_USAGE_STORE: 'local', BETTERPPTX_INSTALL_USAGE_FILE: path.join(root, 'usage.json'),
    BETTERPPTX_BILLING_LEDGER_STORE: 'local', BETTERPPTX_BILLING_LEDGER_FILE: path.join(root, 'ledger.json'),
    BETTERPPTX_DURABLE_OPERATION_STORE: 'local', BETTERPPTX_OPERATION_STORE_FILE: path.join(root, 'operations.json'),
    BETTERPPTX_ALLOWED_AUDIO_DIRS: [path.join(root, 'assets'), path.join(root, 'runtime')].join(path.delimiter),
  })
  process.env.BETTERPPTX_INSTALL_HMAC_SECRET ||= crypto.randomBytes(32).toString('hex')
  globalThis.fetch = async (url, options) => {
    const endpoint = new URL(typeof url === 'string' ? url : url.url || String(url))
    assert.ok(!(options?.method === 'POST' && ['/synthesize', '/voices/register'].includes(endpoint.pathname)), 'Unexpected inference attempt during media-only rebuild.')
    return originalFetch(url, options)
  }
  const { createMcpToolDispatcher } = await import('./engine.mjs')
  const identity = `install_${sha('v3-media-delivery-current')}`
  dispatcher = createMcpToolDispatcher({ installHash: identity, authenticated: true, authenticationBasis: 'local-maintainer', sessionId: crypto.randomUUID(), blackBox: false })
  await call('betterpptx.auth.status')
  const help = await call('betterpptx.help.capabilities', { intent: 'Deliver existing verified speech clips as a multilingual native narrated PowerPoint with two voices on every language slide.', detail: 'summary' })
  await call('betterpptx.help.workflow', { intent: 'Native speech media reuse with exact author geometry, clip captions, measured autoplay and V3 provenance.', detail: 'summary' })
  await call('betterpptx.options.catalog', { surface: 'background', format: 'full' })
  await call('betterpptx.authoring.catalog', { family: 'layout-intents', query: 'comparison', limit: 10 })
  report.verificationPolicy = help.releaseInfrastructure?.verificationPolicy || 'local-maintainer qualification'
  for (const clip of clipRows) {
    const asset = await call('betterpptx.assets.upload', { kind: 'audio', data: `data:audio/wav;base64,${clip.bytes.toString('base64')}`, fileName: `${clip.language}-${clip.gender}.wav`, idempotencyKey: `v3-media-${clip.sha256}` })
    clip.handle = asset.handle
    assert.match(clip.handle, /^asset:\/\/locked\//)
  }
  report.clips = clipRows.map(({ language, gender, voiceId, text, sha256, durationMs, handle }) => ({ language, gender, voiceId, text, sha256, durationMs, handle }))
  const spec = {
    schemaVersion: 'betterpptx.deck-spec.v1', title: 'A World of Voices — V3', layout: 'LAYOUT_WIDE',
    authoringContract: { workflow: 'ai-sovereign-v1', creativeAuthority: 'ai', directorMode: 'off', verificationMode: 'complete', geometryAuthority: 'ai', placementPolicy: 'ai-authored-geometry-v1', coordinateSystem: 'inches', layerModel: 'flat-object-array', objectIdentity: 'stable-names-required' },
    handshake: { audience: 'Speech product reviewers', promise: 'Hear verified V3 speech in four languages with two voices per slide.', proof: ['Eight immutable real speech clips', 'Native clip-local captions', 'Measured sequential playback'], bar: 'Exact audio identities, readable native scripts, and correct timing.' },
    contentStory: { audience: 'Speech product reviewers', outcome: 'Compare female and male speech across four languages.', remember: 'The same presentation can change language and voice without changing the slide.' },
    visualDesign: { world: 'Editorial speech specimens', framing: 'Alternating parallel and stacked language comparisons; native script and measured time are the proof.' },
    styleIntent: { artDirection: 'editorial', mode: 'light' }, motionPolicy: 'reduced',
    motionTime: { masterClock: 'narration', timingSource: 'supplied measured WAV media', syncPolicy: 'one exact sequential clip clock per language' },
    autoplay: { enabled: true, preserveTimedSlides: true, secondsPerSlide: 6 }, showSettings: { useTimings: true },
    slides: languages.map((language, index) => {
      const pair = clipRows.filter(clip => clip.language === language.id)
      const content = [
        text(`edition-${index}`, 'A WORLD OF VOICES  /  V3', { x: 0.8, y: 0.42, w: 11.7, h: 0.35 }, { fontSize: 12, bold: true, color: language.secondary }),
        text(`heading-${index}`, language.label, { x: 0.8, y: 1.0, w: 11.7, h: 0.8 }, { fontSize: 34, bold: true, color: language.accent, ...(language.rtl ? { fontFace: 'Arial', fontFaceComplexScript: 'Arial' } : {}) }),
      ]
      pair.forEach((clip, voiceIndex) => {
        const x = language.stacked ? 0.85 : 0.85 + voiceIndex * 6.1
        const y = language.stacked ? 2.18 + voiceIndex * 1.55 : 2.25
        content.push(text(`speaker-${index}-${voiceIndex}`, voiceIndex === 0 ? '01  /  FEMALE VOICE' : '02  /  MALE VOICE', { x, y, w: language.stacked ? 2.55 : 5.45, h: 0.4 }, { fontSize: 16, bold: true, color: language.accent }))
        content.push(text(`specimen-${index}-${voiceIndex}`, clip.text, { x: language.stacked ? 3.5 : x, y: language.stacked ? y - 0.08 : y + 0.75, w: language.stacked ? 8.8 : 5.45, h: language.stacked ? 1.18 : 2.1 }, { fontSize: language.stacked ? 26 : 28, color: language.ink, ...(language.rtl ? { fontFace: 'Arial', fontFaceComplexScript: 'Arial', rtlMode: true, align: 'right', lang: 'ar' } : {}) }))
      })
      content.push(text(`timeline-${index}`, `${(pair[0].durationMs / 1000).toFixed(2)}s female  →  0.20s pause  →  ${(pair[1].durationMs / 1000).toFixed(2)}s male`, { x: 0.85, y: 5.75, w: 11.65, h: 0.45 }, { fontSize: 18, color: language.secondary }))
      content.push(text(`footer-${index}`, 'V3 checkpoint verified · model 4afe36eeb538… · native captions · automatic advance', { x: 0.85, y: 6.6, w: 11.65, h: 0.35 }, { fontSize: 12, color: language.secondary }))
      return {
        id: `v3-${language.id}`, title: `${language.label}: two voices`, message: 'Two real V3 voices play sequentially on one native slide.', layoutIntent: 'comparison', syncBuild: false, background: { color: language.background }, content,
        notes: `V3 checkpoint SHA256 ${identities.checkpointSha256}. Model aggregate ${identities.modelDigest}. Upstream source commit ${identities.sourceCommit}. Real inference: Modal SpeechWorker; this file tests native media delivery, not deployed MCP synthesis. Reference fixtures: Linda Johnson/LJSpeech public domain https://keithito.com/LJ-Speech-Dataset/ and Thorsten Müller CC0 https://thorsten-voice.de/en/about/recordings/.`,
        narration: { preserveInNotes: true, paddingMs: 700, segments: pair.map((clip, voiceIndex) => ({
          id: `${language.id}-${clip.gender}`, script: clip.text, voice: clip.voiceId,
          audio: { path: clip.handle, durationMs: clip.durationMs, extn: 'wav' }, gapAfterMs: voiceIndex === 0 ? 200 : 0,
          closedCaptionTracks: [{ language: language.id, label: `${language.label} · ${clip.gender}`, vtt: `WEBVTT\n\n1\n00:00:00.000 --> ${stamp(clip.durationMs)}\n${clip.text}\n` }],
        })) },
      }
    }),
  }
  const run = crypto.randomUUID()
  const phase = (phase, input, extra = {}) => call('betterpptx.deck.generate_from_spec', { spec: input, phase, commitMode: 'createNew', plan: 'premium', detail: 'full', billingConfirmed: true, validationMode: 'strict', validateAfterCompile: true, saveAfterCommit: false, idempotencyKey: `v3-delivery-${phase}-${run}`, ...extra })
  const dry = await phase('dryRun', spec)
  const resolved = await phase('resolve', spec)
  report.resolution = resolved.resolution
  assert.equal(resolved.resolution.locked, true)
  const lockedSpec = resolved.lockedSpec || (resolved.resolution.status === 'already_locked' ? spec : null)
  assert.ok(lockedSpec, 'Resolve must return a locked spec or affirm that the supplied handles are already locked.')
  const locked = await phase('lockedDryRun', lockedSpec)
  assert.equal(locked.lockedPlanDigest, resolved.lockedPlanDigest)
  const committed = await phase('commit', lockedSpec, { planId: locked.planId, lockedPlanId: locked.planId, planDigest: locked.planDigest })
  deckId = committed.deckId
  report.operations = { deckId, planId: locked.planId, lockedPlanDigest: locked.lockedPlanDigest }
  report.validation = {}
  for (const validator of ['validate', 'validate_design', 'validate_accessibility', 'validate_narration', 'validate_quality']) {
    const args = ['validate_design', 'validate_quality'].includes(validator) ? { profile: 'static', requireNarration: true, requireMotion: false, requireVisualProof: false } : {}
    const result = await call(`betterpptx.deck.${validator}`, { deckId, ...args })
    report.validation[validator] = { ok: result.ok, score: result.score, issues: result.issues || result.errors || [], blockingIssues: result.blockingIssues || [] }
    if (validator === 'validate_narration') report.timeline = result.perSlide.map(slide => ({ slideIndex: slide.slideIndex, audioEndMs: slide.audioEndMs, captionTimelineEndMs: slide.captionTimelineEndMs, requiredAdvanceMs: slide.requiredAdvanceMs, clips: (slide.captionTracks || []).map(track => ({ clipStartMs: track.clipStartMs, clipLocalCueEndMs: track.clipLocalCueEndMs })) }))
  }
  assert.equal(report.validation.validate_quality.ok, true, JSON.stringify(report.validation.validate_quality))
  const saved = await call('betterpptx.deck.save', { deckId, outputDir: root, fileName: 'a-world-of-voices-v3.pptx', idempotencyKey: `v3-delivery-save-${run}` })
  const bytes = await fs.readFile(saved.filePath || path.join(root, 'a-world-of-voices-v3.pptx'))
  report.output = { file: 'a-world-of-voices-v3.pptx', bytes: bytes.length, sha256: sha(bytes) }
  const zip = await JSZip.loadAsync(bytes)
  for (const part of Object.values(zip.files).filter(part => !part.dir && /\.(xml|rels)$/.test(part.name))) xml(await part.async('string'))
  for (const part of Object.values(zip.files).filter(part => !part.dir && part.name.endsWith('.rels'))) {
    const ownerDirectory = part.name === '_rels/.rels' ? '' : path.posix.dirname(path.posix.dirname(part.name))
    const relationships = xml(await part.async('string')).getElementsByTagName('Relationship')
    for (const relationship of Array.from(relationships)) {
      if (relationship.getAttribute('TargetMode') === 'External') continue
      const target = decodeURI(relationship.getAttribute('Target').split('#')[0])
      const member = path.posix.normalize(target.startsWith('/') ? target.slice(1) : path.posix.join(ownerDirectory, target))
      assert.ok(zip.file(member), `Unresolved package relationship: ${member}`)
    }
  }
  const types = xml(await zip.file('[Content_Types].xml').async('string'))
  const defaults = new Set(Array.from(types.getElementsByTagName('Default')).map(node => node.getAttribute('Extension')))
  const overrides = new Set(Array.from(types.getElementsByTagName('Override')).map(node => node.getAttribute('PartName').replace(/^\//, '')))
  assert.ok(Object.values(zip.files).filter(part => !part.dir && part.name !== '[Content_Types].xml').every(part => overrides.has(part.name) || defaults.has(part.name.split('.').pop())))
  const media = await Promise.all(Object.values(zip.files).filter(part => /^ppt\/media\/.*\.wav$/.test(part.name)).map(async part => ({ part: part.name, sha256: sha(await part.async('nodebuffer')) })))
  report.slides = []
  for (const [index, language] of languages.entries()) {
    const document = xml(await zip.file(`ppt/slides/slide${index + 1}.xml`).async('string'))
    const pair = clipRows.filter(clip => clip.language === language.id)
    const audio = Array.from(document.getElementsByTagNameNS('http://schemas.openxmlformats.org/presentationml/2006/main', 'audio'))
    const captions = await inspectNativeCaptionTracks(zip, index)
    const transition = document.getElementsByTagNameNS('http://schemas.openxmlformats.org/presentationml/2006/main', 'transition')[0]
    const advanceMs = Number(transition?.getAttribute('advTm'))
    const notes = xml(await zip.file(`ppt/notesSlides/notesSlide${index + 1}.xml`).async('string')).documentElement.textContent
    report.slides.push({ language: language.id, audioCount: audio.length, narrationMarkers: audio.filter(node => node.getAttribute('isNarration') === '1').length, nativeCaptionTracks: captions.verifiedTrackCount, captionIssues: captions.issues, advanceMs, requiredAdvanceMs: pair[0].durationMs + 200 + pair[1].durationMs + 700, scriptsInNotes: pair.every(clip => notes.includes(clip.text)), sourceIdentityInNotes: notes.includes(identities.modelDigest) && notes.includes(identities.checkpointSha256) })
  }
  const reopened = await call('betterpptx.deck.open_uploaded', { data: bytes.toString('base64'), fileName: report.output.file, preserveTiming: true })
  reopenedId = reopened.deckId
  report.checks = {
    sourceV3IdentityVerified: true, mutationFreePlanning: dry.mutationFree === true && locked.mutationFree === true,
    fullQualityValidation: report.validation.validate_quality.ok === true,
    exactOriginalEightAudioParts: media.length === 8 && clipRows.every(clip => media.some(part => part.sha256 === clip.sha256)),
    twoNativeNarrationVoicesPerSlide: report.slides.every(slide => slide.audioCount === 2 && slide.narrationMarkers === 2),
    eightNativeCaptionTracks: report.slides.every(slide => slide.nativeCaptionTracks === 2 && slide.captionIssues.length === 0),
    measuredAutomaticAdvance: report.slides.every(slide => slide.advanceMs >= slide.requiredAdvanceMs),
    scriptsAndV3IdentityRetained: report.slides.every(slide => slide.scriptsInNotes && slide.sourceIdentityInNotes),
    exactSequentialClipTimeline: report.timeline.every((slide, index) => {
      const pair = clipRows.filter(clip => clip.language === languages[index].id)
      return slide.clips.length === 2 && slide.clips[0].clipStartMs === 0 && slide.clips[1].clipStartMs === pair[0].durationMs + 200 && slide.audioEndMs === pair[0].durationMs + 200 + pair[1].durationMs
    }),
    internalRelationshipsAndContentTypesComplete: true,
    reopenedFourLanguageSlides: reopened.slideCount === 4,
    noAdditionalInference: report.synthesisCallsDuringDeckBuild === 0,
  }
  report.status = Object.values(report.checks).every(Boolean) ? 'V3_MEDIA_DELIVERY_PASS_DESKTOP_PENDING' : 'FAIL'
} catch (error) {
  report.status = 'FAIL'; report.error = { code: error.code || 'V3_DELIVERY_FAILED', message: error.message }
} finally {
  globalThis.fetch = originalFetch
  if (dispatcher) for (const id of [reopenedId, deckId].filter(Boolean)) await dispatcher.call('betterpptx.deck.dispose', { deckId: id }).catch(() => {})
  if (!process.argv.includes('--check-inputs')) {
    await fs.mkdir(root, { recursive: true })
    await fs.writeFile(path.join(root, 'summary.json'), JSON.stringify(report, null, 2) + '\n')
  }
  console.log(JSON.stringify({ status: report.status, output: report.output, checks: report.checks, error: report.error }))
  if (report.status === 'FAIL') process.exitCode = 1
}
