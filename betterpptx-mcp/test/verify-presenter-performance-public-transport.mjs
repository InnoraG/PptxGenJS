#!/usr/bin/env node
// Exercise a fresh stdio child or an existing HTTP MCP endpoint (--mcp-url).
// The client never imports the engine or restarts an existing connector. HTTP
// artifacts are downloaded through the public route, not read from server disk.
// The stdio authoritative-preview option invokes the session-safe renderer.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { auditPresenterPerformancePackage } from './presenter-performance-package-audit.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const value = flag => { const index = process.argv.indexOf(flag); return index < 0 ? undefined : process.argv[index + 1] }
const httpEndpoint = value('--mcp-url') ? new URL(value('--mcp-url')) : null
if (httpEndpoint) assert.ok(['http:', 'https:'].includes(httpEndpoint.protocol), 'MCP endpoint must use HTTP or HTTPS')
const outputDir = path.resolve(value('--outdir') || path.join(root, '../outputs/presenter-performance-public-transport', new Date().toISOString().replaceAll(':', '-')))
const releaseChecks = process.argv.includes('--release-checks')
const discoveryOnly = process.argv.includes('--discovery-only')
// This bounded API regression checks commit/export/replay without saving or
// claiming a package/renderer proof. Release validation uses the full mode.
const authoringOnly = process.argv.includes('--authoring-only')
assert.ok(!(authoringOnly && releaseChecks), 'Authoring-only checks do not run artifact release checks')
assert.ok(!(discoveryOnly && releaseChecks), 'Discovery-only checks do not run artifact release checks')
// The supported Windows deployment switch invokes the actual no-repair COM
// renderer. It never marks a preview complete without rendering the package.
const authoritativePreview = process.argv.includes('--authoritative-preview')
if (authoritativePreview) assert.equal(process.platform, 'win32', 'Authoritative local preview requires the approved Windows renderer')
const downloadRoot = path.join(outputDir, 'downloads')
await fs.mkdir(downloadRoot, { recursive: true })

function defaultFixture(identity = 'joe', actor = 'presenter') {
  return {
    schemaVersion: 'betterpptx.deck-spec.v1', title: `Continuous performance by ${identity}`,
    authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic', geometryAuthority: 'ai', placementPolicy: 'ai-authored-geometry-v1', coordinateSystem: 'inches', layerModel: 'flat-object-array', objectIdentity: 'stable-names-required' },
    contentStory: { audience: 'presentation authors', outcome: 'Show consecutive native presenter actions on one slide', remember: 'One performer has one continuous timeline' },
    visualDesign: { world: 'luxe', framing: 'One presenter and one clear result' },
    styleIntent: { artDirection: 'luxe', mode: 'dark' },
    presenter: { id: actor, identity },
    motionTime: { masterClock: 'authored slide timeline', timingSource: 'explicit performance actions', syncPolicy: 'one continuous clock' },
    slides: [{
      id: `performance-${identity}`, title: 'Continuous performance', layoutIntent: 'title-body',
      content: [{ kind: 'body', name: 'independent-result', text: 'A sequence with its own timing and motion.', rect: { x: 0.7, y: 0.8, w: 4, h: 1.2 } }],
      notes: 'A native 3D presenter performs consecutive actions automatically.',
      presenterPerformance: {
        actor, startMs: 725, blendMs: 200,
        frame: { x: 5, y: 2, w: 2.2, h: 4 },
        actions: [{ id: 'hello', motionId: 'motion.ordinary.greet', durationMs: 1700, sourceStartMs: 125, sourceEndMs: 400 }, { id: 'cross', motionId: 'motion.ordinary.walk', durationMs: 2250, cycles: 2 }, { id: 'farewell', motionId: 'motion.ordinary.bow', durationMs: 1650 }],
        transforms: [{ atMs: 0, yawDegrees: 25, scale: 1, easing: 'linear' }, { atMs: 1700, yawDegrees: -70, pitchDegrees: 4, rollDegrees: 3, depth: -0.2 }, { atMs: 3950, yawDegrees: 0, pitchDegrees: 0, rollDegrees: 0, scale: 0.9, height: 0.1, easing: 'easeOut' }],
        travel: [{ atMs: 0, stage: 'right', center: { x: 6.1, y: 4 } }, { atMs: 3950, stage: 'center', center: { x: 8.1, y: 4 } }],
        entry: { type: 'fade', durationMs: 450, fadeMs: 450 }, exit: { type: 'fade', durationMs: 500 },
      },
    }],
  }
}

const primary = value('--spec') ? JSON.parse(await fs.readFile(path.resolve(value('--spec')), 'utf8')) : defaultFixture()
const alternate = value('--alternate-spec') ? JSON.parse(await fs.readFile(path.resolve(value('--alternate-spec')), 'utf8')) : defaultFixture('louise', 'alternate-guide')
// This second fixture intentionally uses different action IDs, ordering,
// durations, entry type, orientation and stage direction from the primary.
if (!value('--alternate-spec')) {
  const p = alternate.slides[0].presenterPerformance
  p.startMs = 1150; p.blendMs = 120
  p.actions = [{ id: 'travel-first', motionId: 'motion.ordinary.walk', durationMs: 2100, cycles: 3, sourceStartMs: 100 }, { id: 'salute-second', motionId: 'motion.ordinary.greet', durationMs: 1250, sourceEndMs: 400 }, { id: 'close-third', motionId: 'motion.ordinary.bow', durationMs: 1900, sourceStartMs: 150, sourceEndMs: 900 }]
  p.entry = { type: 'appear' }
  p.exit = { type: 'disappear', atMs: 5250 }
  p.frame = { x: 7.5, y: 1.9, w: 2, h: 4.2 }
  p.travel = [{ atMs: 0, stage: 'left', center: { x: 8.5, y: 4 } }, { atMs: 2100, stage: 'right', center: { x: 5.7, y: 4 } }]
  p.transforms = [{ atMs: 0, yawDegrees: 80, scale: 0.8 }, { atMs: 2100, yawDegrees: -20, pitchDegrees: -5, rollDegrees: -4, depth: 0.1, easing: 'easeIn' }, { atMs: 5250, yawDegrees: 0, scale: 1.1, height: 0, easing: 'linear' }]
}

const report = { schemaVersion: 'betterpptx.presenter-performance.public-transport.v1', status: 'RUNNING', startedAt: new Date().toISOString(), actualMcpTransport: httpEndpoint ? 'streamable-http' : 'stdio', ...(httpEndpoint ? { endpointOrigin: httpEndpoint.origin } : {}), engineImportsUsed: false, existingServerRestarted: false, discoveryOnly, authoringOnly, packageProofRequested: !authoringOnly && !discoveryOnly, previewRequested: releaseChecks, releaseChecks: [], invalidCases: [], fixtures: [], publicLeakChecks: 0, toolTimings: [] }
let currentActivity = 'discovery', currentFixture
// Credentials are deliberately accepted only through the environment and are
// never included in the report, command-line arguments, or logged headers.
const httpHeaders = {
  ...(process.env.BETTERPPTX_TEST_HTTP_TOKEN ? { Authorization: `Bearer ${process.env.BETTERPPTX_TEST_HTTP_TOKEN}` } : {}),
  ...(process.env.BETTERPPTX_TEST_HTTP_DEVICE ? { 'x-betterpptx-device': process.env.BETTERPPTX_TEST_HTTP_DEVICE } : {}),
}
const transport = httpEndpoint ? new StreamableHTTPClientTransport(httpEndpoint, { requestInit: { headers: httpHeaders } }) : new StdioClientTransport({
  command: process.execPath, args: ['server.mjs'], cwd: root, stderr: 'pipe',
  env: { ...process.env, BETTERPPTX_PUBLIC_BLACK_BOX: '1', BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY: '1', BETTERPPTX_LOCAL_MAINTAINER: '0', BETTERPPTX_PUBLIC_BASE: 'http://local.invalid', BETTERPPTX_DOWNLOAD_ROOT: downloadRoot, BETTERPPTX_LOCKED_ASSET_ROOT: path.join(outputDir, 'locked-assets'), BETTERPPTX_ASSET_GRANT_STORE: 'local', BETTERPPTX_ASSET_GRANT_DIR: path.join(outputDir, 'asset-grants'), ...(authoritativePreview ? { BETTERPPTX_AUTHORITATIVE_POWERPOINT_PREVIEW: '1' } : {}), ...(process.argv.includes('--keep-preview-debug') ? { BETTERPPTX_KEEP_POWERPOINT_PREVIEW_TMP: '1', BETTERPPTX_PREVIEW_TMP_DIR: path.join(outputDir, 'preview-debug') } : {}) },
})
let stderr = ''
transport.stderr?.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-20000) })
const client = new Client({ name: 'presenter-performance-public-transport-verifier', version: '1' }, { capabilities: {} })
const parseEnvelope = result => result?.structuredContent || (() => { try { return JSON.parse(result?.content?.find(item => item.type === 'text')?.text || '{}') } catch { return null } })()
const compactError = error => {
  if (!error) return undefined
  const trim = value => String(value).replace(/data:[^;\s]+;base64,[A-Za-z0-9+/=]+/g, '[inline media omitted]').slice(0, 4000)
  return typeof error === 'object' ? { code: error.code, message: trim(error.message || error), recoverable: error.recoverable } : trim(error)
}
function noLeaks(envelope, label) {
  const forbidden = new Set(['animId', 'clipMap', 'sourceSlug', 'sourcePath', 'privateEvidence', 'motionIdToAnimId', 'bundleHandle', 'glbFile', 'framePos', 'bboxFrom', 'presenterPerformanceValidation', '_presenterPerformanceEntry', '_presenterPerformanceVisibleBounds', 'resolvedSource', 'sourceResolutionFingerprint', 'resolvedSourceRange', 'libraryKey'])
  const walk = (item, location = '$') => {
    if (Array.isArray(item)) return item.forEach((child, i) => walk(child, `${location}[${i}]`))
    if (!item || typeof item !== 'object') return
    for (const [key, child] of Object.entries(item)) { assert.ok(!forbidden.has(key), `${label} exposes ${location}.${key}`); walk(child, `${location}.${key}`) }
  }
  walk(envelope)
  assert.doesNotMatch(JSON.stringify(envelope), /node_modules|[A-Z]:\\\\|file:\/\/|\.glb\b/i, `${label} exposes local implementation details`)
  report.publicLeakChecks++
}
async function rawCall(name, args) {
  const started = performance.now()
  const phase = name.endsWith('.generate_from_spec') ? args.phase : /\.(auth\.|help\.|authoring\.catalog)/.test(name) ? 'discovery' : name.split('.').at(-1)
  let status = 'transport_or_schema_error'
  try {
    const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 300000 })
    const envelope = parseEnvelope(result)
    assert.ok(envelope && typeof envelope.ok === 'boolean', `${name} did not return its public envelope`)
    status = envelope.ok ? 'ok' : 'rejected'
    noLeaks(envelope, name)
    return envelope
  } finally {
    report.toolTimings.push({ tool: name, phase, activity: currentActivity, ...(currentFixture ? { fixture: currentFixture } : {}), elapsedMs: Math.round(performance.now() - started), status })
  }
}
async function call(name, args) {
  const envelope = await rawCall(name, args)
  assert.equal(envelope.ok, true, `${name}: ${JSON.stringify(compactError(envelope.error))}`)
  return envelope.data || envelope
}
async function recordReleaseCheck(label, name, args) {
  try {
    if (name === 'betterpptx.deck.preview' && value('--preview-permit-file')) {
      const permit = path.resolve(value('--preview-permit-file')), waitStarted = performance.now()
      console.log(`${label}: authoring checks complete; waiting for the shared native renderer.`)
      while (true) {
        try { await fs.access(permit); break } catch {}
        if (performance.now() - waitStarted > 12 * 60 * 1000) throw new Error('Native renderer coordination timed out')
        await new Promise(resolve => setTimeout(resolve, 500))
      }
      report.rendererCoordinationWaitMs = Math.round(performance.now() - waitStarted)
    }
    const result = await rawCall(name, args), data = result.data || {}
    await fs.writeFile(path.join(outputDir, `${label}-${name.split('.').at(-1)}.json`), JSON.stringify(result, null, 2))
    report.releaseChecks.push({ label, tool: name, ok: result.ok, resultOk: data.ok, score: data.score ?? data.design?.score, issueCount: data.issues?.length, error: compactError(result.error) })
    return result
  } catch (error) {
    report.releaseChecks.push({ label, tool: name, ok: false, transportOrSchemaError: error.message })
    return null
  }
}
const generationArgs = (spec, phase) => ({ spec, phase, commitMode: 'createNew', plan: 'premium', detail: 'full' })
function fixturePerformance(spec) {
  const slide = spec.slides.find(item => item.presenterPerformance)
  assert.ok(slide, 'Fixture has no presenterPerformance')
  return { slide, p: slide.presenterPerformance }
}
function performanceReadback(result, slideId) {
  const entries = result.authoringContracts?.presenterPerformance?.performances
  assert.ok(Array.isArray(entries), 'Public semantic performance readback is absent')
  const selected = entries.find(item => item.slideId === slideId)
  assert.ok(selected, `Public performance readback missing slide ${slideId}`)
  return selected
}
function actionAuthoring(actions) {
  return actions.map(action => ({
    id: action.id, motionId: action.motionId, durationMs: action.durationMs, cycles: action.cycles ?? 1,
    ...(Object.hasOwn(action, 'sourceStartMs') ? { sourceStartMs: action.sourceStartMs } : {}),
    ...(Object.hasOwn(action, 'sourceEndMs') ? { sourceEndMs: action.sourceEndMs } : {}),
  }))
}
function localDownload(downloadUrl) {
  const url = new URL(downloadUrl), match = url.pathname.match(/^\/files\/([^/]+)\/(.+)$/)
  assert.ok(match, `Unexpected download route ${url.pathname}`)
  const filename = path.resolve(downloadRoot, decodeURIComponent(match[1]), decodeURIComponent(match[2]))
  assert.ok(filename.startsWith(`${path.resolve(downloadRoot)}${path.sep}`), 'Download route escapes the isolated artifact directory')
  return filename
}
async function downloadArtifact(downloadUrl, destination) {
  if (!httpEndpoint) return fs.copyFile(localDownload(downloadUrl), destination)
  const url = new URL(downloadUrl, httpEndpoint)
  assert.ok(['http:', 'https:'].includes(url.protocol), 'Published artifacts must use HTTP or HTTPS')
  const response = await fetch(url, {
    headers: url.origin === httpEndpoint.origin ? httpHeaders : {},
    redirect: 'error',
    signal: AbortSignal.timeout(120000),
  })
  assert.equal(response.ok, true, `Public artifact download failed with HTTP ${response.status}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  assert.ok(bytes.length > 4 && bytes.subarray(0, 2).toString() === 'PK', 'Public download did not return a presentation package')
  await fs.writeFile(destination, bytes)
  report.publicArtifactDownloads = (report.publicArtifactDownloads || 0) + 1
}

try {
  const connectStarted = performance.now()
  await client.connect(transport)
  report.toolTimings.push({ tool: 'mcp.connect', phase: 'discovery', activity: 'discovery', elapsedMs: Math.round(performance.now() - connectStarted), status: 'ok' })
  const listStarted = performance.now()
  const listed = await client.listTools()
  report.toolTimings.push({ tool: 'mcp.listTools', phase: 'discovery', activity: 'discovery', elapsedMs: Math.round(performance.now() - listStarted), status: 'ok' })
  assert.ok(listed.tools.some(tool => tool.name === 'betterpptx.deck.generate_from_spec'))
  noLeaks(listed, 'mcp.listTools')
  if (releaseChecks) {
    await recordReleaseCheck('discovery', 'betterpptx.auth.status', {})
    await recordReleaseCheck('discovery', 'betterpptx.help.capabilities', { intent: 'One-slide continuous 3D presenter performance with multiple actions and interactions', deckType: 'new', detail: 'full' })
  }
  const motionCatalog = await call('betterpptx.authoring.catalog', { family: 'presenter-motion', limit: 200 })
  await fs.writeFile(path.join(outputDir, 'discovery-motions.json'), JSON.stringify(motionCatalog, null, 2))
  const motionIds = (motionCatalog.entries || []).map(entry => entry.id).filter(id => id.startsWith('motion.'))
  report.motionCatalog = { total: motionCatalog.pagination?.total, returned: motionIds.length, ids: motionIds }
  assert.equal(motionCatalog.pagination?.total, 56, 'Endpoint does not expose the 56 currently executable presenter motions')
  assert.equal(motionIds.length, 56)
  const trackedMotionCatalog = await call('betterpptx.authoring.catalog', { family: 'presenter-motion', includePlanned: true, limit: 200 })
  const trackedMotionIds = (trackedMotionCatalog.entries || []).map(entry => entry.id).filter(id => id.startsWith('motion.'))
  const heldMotionCount = (trackedMotionCatalog.entries || []).filter(entry => entry.selectable === false).length
  report.trackedMotionCatalog = { total: trackedMotionCatalog.pagination?.total, returned: trackedMotionIds.length, held: heldMotionCount }
  assert.equal(trackedMotionCatalog.pagination?.total, 96, 'Endpoint does not expose all tracked motion rows when includePlanned is explicit')
  assert.equal(trackedMotionIds.length, 96)
  assert.equal(heldMotionCount, 40, 'Tracked presenter-motion catalog must keep all 40 unqualified rows non-selectable')
  console.log('Fresh public MCP transport connected; motion catalog discovered.')

  const invalidCases = [
    ['unknown semantic motion', spec => { fixturePerformance(spec).p.actions[0].motionId = 'motion.unknown.unavailable' }],
    ['private motion path', spec => { fixturePerformance(spec).p.actions[0].motionId = 'C:/private/performer.glb' }],
    ['duplicate action ID', spec => { const p = fixturePerformance(spec).p; p.actions[1].id = p.actions[0].id }],
    ['duplicate transform time', spec => { fixturePerformance(spec).p.transforms = [{ atMs: 0, yawDegrees: 0 }, { atMs: 0, yawDegrees: 30 }] }],
    ['stage-only travel', spec => { fixturePerformance(spec).p.travel.forEach(anchor => { delete anchor.center }) }],
    ['travel outside slide', spec => { fixturePerformance(spec).p.travel[1].center.x = 20 }],
    ['transform beyond the performance', spec => { const p = fixturePerformance(spec).p; p.transforms = [{ atMs: p.actions.reduce((sum, action) => sum + action.durationMs, 0) + 1, scale: 1 }] }],
    ['invalid transform magnitude', spec => { fixturePerformance(spec).p.transforms = [{ atMs: 0, scale: 0 }] }],
    ['motion missing from explicit bundle', spec => { const p = fixturePerformance(spec).p; spec.motionTime ||= {}; spec.motionTime.kineticSelection = { presenters: [{ presenterId: p.actor || 'presenter', selectedMotionIds: [p.actions.at(-1).motionId] }] } }],
    ['unresolved interaction target', spec => { const p = fixturePerformance(spec).p; p.interactions = [{ actionId: p.actions[0].id, verb: 'point-at', target: 'intentionally-missing-target' }] }],
    ['competing slide motion owner', spec => { const { slide, p } = fixturePerformance(spec); slide.presenterMotion = { presenterId: p.actor || 'presenter', motionId: p.actions[0].motionId } }],
    ['negative source start', spec => { fixturePerformance(spec).p.actions[0].sourceStartMs = -1 }],
    ['fractional source start', spec => { fixturePerformance(spec).p.actions[0].sourceStartMs = 1.5 }],
    ['fractional source end', spec => { fixturePerformance(spec).p.actions[0].sourceEndMs = 300.5 }],
    ['empty source segment', spec => { Object.assign(fixturePerformance(spec).p.actions[0], { sourceStartMs: 500, sourceEndMs: 500 }) }],
    ['reversed source segment', spec => { Object.assign(fixturePerformance(spec).p.actions[0], { sourceStartMs: 501, sourceEndMs: 500 }) }],
    ['source end beyond selected motion', spec => { Object.assign(fixturePerformance(spec).p.actions[0], { sourceStartMs: 0, sourceEndMs: 120000 }) }],
    ['source start beyond selected motion', spec => { const action = fixturePerformance(spec).p.actions[0]; action.sourceStartMs = 119999; delete action.sourceEndMs }],
  ]
  currentActivity = 'negative_validation'
  for (const [label, mutate] of discoveryOnly ? [] : invalidCases) {
    const invalid = structuredClone(primary); mutate(invalid)
    const result = await rawCall('betterpptx.deck.generate_from_spec', generationArgs(invalid, 'dryRun'))
    assert.equal(result.ok, false, `${label} was silently accepted`)
    assert.ok(result.error?.code, `${label} lacks an explicit error code`)
    assert.ok(!result.data?.deckId, `${label} mutated a deck`)
    const codes = []
    const findCodes = item => { if (!item || typeof item !== 'object') return; for (const [key, child] of Object.entries(item)) { if (key === 'code' && typeof child === 'string') codes.push(child); else findCodes(child) } }
    findCodes(result.error)
    const targeted = { 'unknown semantic motion': 'MOTION_ID_UNKNOWN', 'stage-only travel': 'PERFORMANCE_TRAVEL_GEOMETRY_REQUIRED', 'travel outside slide': 'PERFORMANCE_TRAVEL_OFF_STAGE', 'motion missing from explicit bundle': 'PERFORMANCE_MOTION_NOT_SELECTED', 'unresolved interaction target': 'PERFORMANCE_TARGET_NOT_FOUND', 'competing slide motion owner': 'PERFORMANCE_OWNERSHIP_CONFLICT' }[label]
    const publicReason = { 'motion missing from explicit bundle': /not included in the explicit motion selection/i, 'unresolved interaction target': /intentionally-missing-target/i, 'competing slide motion owner': /presenterMotion|another action owner|ownership|competing|conflict/i }[label]
    if (targeted) assert.ok(codes.includes(targeted) || (result.error.code === 'SPEC_COMPILE_FAILED' && publicReason?.test(result.error.message)), `${label} failed for the wrong reason: ${JSON.stringify(result.error)}`)
    if (/source (?:start|end)|source segment/.test(label)) assert.match(JSON.stringify(result.error), /sourceStartMs|sourceEndMs|source range/i, `${label} must reject the authored source range specifically`)
    report.invalidCases.push({ label, status: 'PASS', code: result.error.code, detailCodes: codes, error: result.error })
  }
  console.log(`Public validation rejected ${report.invalidCases.length} invalid requests before mutation.`)

  assert.ok(!(process.argv.includes('--primary-only') && process.argv.includes('--alternate-only')), 'Choose only one fixture filter')
  const fixtures = discoveryOnly ? [] : process.argv.includes('--primary-only') ? [['primary', primary]] : process.argv.includes('--alternate-only') ? [['alternate', alternate]] : [['primary', primary], ['alternate', alternate]]
  for (const [label, spec] of fixtures) {
    currentActivity = 'authoring'; currentFixture = label
    const { slide, p } = fixturePerformance(spec)
    await fs.writeFile(path.join(outputDir, `${label}-spec.json`), JSON.stringify(spec, null, 2))
    const dry = await call('betterpptx.deck.generate_from_spec', generationArgs(spec, 'dryRun'))
    await fs.writeFile(path.join(outputDir, `${label}-dry-run.json`), JSON.stringify(dry, null, 2))
    assert.equal(dry.mutationFree, true)
    assert.ok(!dry.deckId)
    const readback = performanceReadback(dry, slide.id), startMs = p.startMs ?? 0
    const durationMs = p.actions.reduce((sum, action) => sum + action.durationMs, 0)
    assert.equal(readback.actor, p.actor || 'presenter')
    assert.equal(readback.startMs, startMs)
    assert.equal(readback.durationMs, durationMs)
    assert.equal(readback.endMs, startMs + durationMs)
    assert.equal(readback.sceneCount, 1)
    assert.deepEqual(readback.frame, p.frame, 'Public readback must preserve the exact authored presenter frame')
    assert.equal(readback.travelCoordinateUnit, 'slide-inches')
    assert.deepEqual(readback.travel, p.travel, 'Public readback must preserve exact authored travel anchors')
    assert.deepEqual(actionAuthoring(readback.actions), actionAuthoring(p.actions), 'Readback must preserve exact authored motion segments, omitted endpoints and cycles')
    let boundary = 0
    for (const action of readback.actions) {
      assert.equal(action.startMs, startMs + boundary, 'Action start must use absolute authored slide timing')
      boundary += action.durationMs
      assert.equal(action.endMs, startMs + boundary, 'Action endpoint must use absolute authored slide timing')
    }
    assert.deepEqual((readback.interactions || []).map(item => [item.actionId, item.verb, item.target]), (p.interactions || []).map(item => [item.actionId, item.verb, item.target]))
    for (const interaction of readback.interactions || []) {
      const action = readback.actions.find(item => item.id === interaction.actionId)
      assert.ok(action && Number.isInteger(interaction.atMs) && interaction.atMs >= action.startMs && interaction.atMs <= action.endMs, 'Interaction must use an exact cue inside its action')
      assert.equal(interaction.atMs, action.contactMs, 'Interaction must follow measured action contact timing')
      assert.equal(interaction.contactSource, 'measured-performer-motion')
      assert.equal(interaction.alignment, 'aligned', 'Authored target must resolve to a supported aligned contact')
    }
    const stagingEdit = structuredClone(spec)
    stagingEdit.slides.find(item => item.id === slide.id).presenterPerformance.startMs = startMs + 100
    currentActivity = 'staging_edit'
    const shifted = await call('betterpptx.deck.generate_from_spec', generationArgs(stagingEdit, 'dryRun'))
    await fs.writeFile(path.join(outputDir, `${label}-staging-edit-dry-run.json`), JSON.stringify(shifted, null, 2))
    const shiftedReadback = performanceReadback(shifted, slide.id)
    assert.equal(shifted.mutationFree, true)
    assert.equal(shiftedReadback.startMs, startMs + 100)
    assert.equal(shiftedReadback.durationMs, durationMs)
    assert.deepEqual(actionAuthoring(shiftedReadback.actions), actionAuthoring(p.actions), 'A staging edit must preserve source-segment selection')
    assert.deepEqual(shiftedReadback.actions.map(item => [item.id, item.startMs, item.endMs]), readback.actions.map(item => [item.id, item.startMs + 100, item.endMs + 100]))
    currentActivity = 'authoring'
    const commit = await call('betterpptx.deck.generate_from_spec', generationArgs(spec, 'commit'))
    await fs.writeFile(path.join(outputDir, `${label}-commit.json`), JSON.stringify(commit, null, 2))
    assert.ok(commit.deckId)
    console.log(`${label}: public dryRun and commit passed; checking release evidence.`)
    let saved, output, packageAudit
    try {
      if (releaseChecks) {
        for (const [name, options] of [
          ['betterpptx.deck.validate', { mode: 'normal', autoFix: false }],
          ['betterpptx.deck.validate_design', { profile: 'modern' }],
          ['betterpptx.deck.validate_accessibility', { mode: 'basic' }],
          ['betterpptx.deck.validate_quality', { profile: 'modern' }],
          ['betterpptx.deck.preview', { slides: [0], width: 1600 }],
        ]) await recordReleaseCheck(label, name, { deckId: commit.deckId, ...options })
      }
      if (!authoringOnly) {
        if (!releaseChecks) {
          const quality = await call('betterpptx.deck.validate_quality', { deckId: commit.deckId, profile: 'modern' })
          assert.equal(quality.ok, true, `Current-version quality validation has blocking issues: ${JSON.stringify(quality.blockingIssues || quality.issues || [])}`)
        }
        saved = await call('betterpptx.deck.save', { deckId: commit.deckId, fileName: `${label}-presenter-performance.pptx`, idempotencyKey: `performance-${label}-${crypto.randomUUID()}` })
        assert.ok(saved.downloadUrl)
        output = path.join(outputDir, `${label}-presenter-performance.pptx`)
        await downloadArtifact(saved.downloadUrl, output)
        let cursor = 0
        const actionBoundariesMs = [0, ...p.actions.map(action => (cursor += action.durationMs))]
        const expected = { startMs, durationMs, minimumDwellMs: startMs + durationMs, actionBoundariesMs, entryRequired: !!p.entry, ...(Number.isFinite(readback.dwellMs) ? { dwellMs: readback.dwellMs } : {}) }
        if (p.exit) expected.exitStartMs = startMs + (p.exit.atMs ?? durationMs - (p.exit.durationMs ?? (p.exit.type === 'disappear' ? 0 : Math.min(1200, durationMs))))
        packageAudit = await auditPresenterPerformancePackage(output, expected)
        await fs.writeFile(path.join(outputDir, `${label}-package-audit.json`), JSON.stringify(packageAudit, null, 2))
      }
      const currentExport = await call('betterpptx.deck.export_spec', { deckId: commit.deckId, mode: 'current', detail: 'full' })
      await fs.writeFile(path.join(outputDir, `${label}-current-exported-spec.json`), JSON.stringify(currentExport, null, 2))
      const currentPerformance = currentExport.spec?.semanticRoundtrip?.slides?.performances?.find(item => item.slideId === slide.id)?.performance
      assert.deepEqual(currentPerformance, p, 'Current native-object export must preserve raw performance authoring in semantic metadata')
      // The current mode reconstructs editable native objects. The supported
      // source export is the replayable authoring plan, before compilation.
      const exported = await call('betterpptx.deck.export_spec', { deckId: commit.deckId, mode: 'effectivePrecompile', detail: 'full' })
      await fs.writeFile(path.join(outputDir, `${label}-exported-spec.json`), JSON.stringify(exported, null, 2))
      const exportedPerformance = exported.spec?.slides?.find(item => item.id === slide.id)?.presenterPerformance
      assert.ok(exportedPerformance, 'Saved deck lost semantic performance authoring')
      assert.ok(!Object.hasOwn(exportedPerformance, 'durationMs'), 'Derived total duration leaked into replayable public input')
      assert.deepEqual(actionAuthoring(exportedPerformance.actions), actionAuthoring(p.actions), 'Source export must retain authored ranges, omitted bounds and cycles')
      currentActivity = 'source_replay'
      const replay = await call('betterpptx.deck.generate_from_spec', { spec: exported.spec, phase: 'dryRun', deckId: commit.deckId, commitMode: 'replaceDeck', plan: 'premium', detail: 'full' })
      assert.equal(replay.mutationFree, true, 'Export replay must remain mutation free during dryRun')
      const replayPerformance = performanceReadback(replay, slide.id)
      assert.equal(replayPerformance.durationMs, durationMs)
      assert.deepEqual(actionAuthoring(replayPerformance.actions), actionAuthoring(p.actions), 'Source replay must preserve exact authored source ranges')
      assert.deepEqual(replayPerformance.actions.map(action => [action.id, action.motionId, action.startMs, action.endMs]), readback.actions.map(action => [action.id, action.motionId, action.startMs, action.endMs]))
      report.fixtures.push({ label, status: 'PASS', output, identity: spec.presenter?.identity, actor: p.actor || 'presenter', dryRun: readback, packageAuditPerformed: !authoringOnly, packageAudit, sourceRangeActionCount: p.actions.filter(action => Object.hasOwn(action, 'sourceStartMs') || Object.hasOwn(action, 'sourceEndMs')).length, currentExportPreservesPerformanceMetadata: true, effectivePrecompileAcceptedForReplaceDryRun: true })
      console.log(authoringOnly ? `${label}: public source-range authoring, commit and export replay passed; no package/render proof requested.` : `${label}: one native model/scene, timing, entry/exit, package and semantic export passed.`)
    } finally {
      try { await call('betterpptx.deck.dispose', { deckId: commit.deckId }) } catch {}
    }
  }
  report.releaseBlockers = report.releaseChecks.filter(item => item.ok === false || item.resultOk === false)
  report.status = report.releaseBlockers.length ? 'PASS_WITH_RELEASE_BLOCKERS' : 'PASS'
  if (report.releaseBlockers.length) process.exitCode = 1
} catch (error) {
  report.status = 'FAIL'; report.error = error.stack || String(error)
  process.exitCode = 1
} finally {
  try { await client.close() } catch {}
  report.completedAt = new Date().toISOString()
  if (!httpEndpoint) report.serverReadyObserved = /MCP server ready/.test(stderr)
  await fs.writeFile(path.join(outputDir, 'public-transport-report.json'), JSON.stringify(report, null, 2))
  await fs.writeFile(path.join(outputDir, 'server-stderr.txt'), stderr)
  console.log(JSON.stringify({ status: report.status, report: path.join(outputDir, 'public-transport-report.json'), invalidCases: report.invalidCases.length, fixtures: report.fixtures.length, error: report.error }, null, 2))
}
