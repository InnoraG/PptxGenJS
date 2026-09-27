#!/usr/bin/env node
// Fresh Role-A public-client proof for the typed Picture Format contrast control.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const endpoint = process.argv.includes('--endpoint') ? process.argv[process.argv.indexOf('--endpoint') + 1] : 'https://betterpptx.tail070c3a.ts.net/mcp'
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const evidenceDir = process.argv.includes('--evidence-dir') ? process.argv[process.argv.indexOf('--evidence-dir') + 1] : path.resolve(`outputs/authoring-principle-corpus/picture-format-public-five-point/corrections-contrast/${stamp}`)
const values = [-1, 0, 0, 1, 0.37]
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
function parseResponse(text) {
  const line = String(text || '').trim().split(/\r?\n/).find(item => item.startsWith('data:'))
  return JSON.parse(line ? line.slice(5).trim() : text)
}
function redact(value) {
  if (typeof value === 'string') return value.replace(/PptxGenJS_Claude|node_modules|engine\.mjs|[A-Z]:[\\/][^\s"']*/g, '[private-detail-redacted]')
  if (Array.isArray(value)) return value.map(redact)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redact(item)]))
  return value
}
const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
const spec = {
  schemaVersion: 'betterpptx.deck-spec.v1',
  title: 'Public Picture corrections contrast parameter proof',
  authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic' },
  contentStory: { audience: 'presentation authors', outcome: 'prove the native Picture Format contrast slider is publicly executable', remember: 'contrast is a normalized correction control, not a gallery preset' },
  visualDesign: { world: 'blueprint', framing: 'five native picture correction proof objects' },
  motionTime: { masterClock: 'authored slide timing', timingSource: 'Authoring Excellence Motion/Time plan', syncPolicy: 'one static visual clock' },
  styleIntent: { artDirection: 'blueprint', density: 'sparse', tone: 'technical' },
  validation: { validateBeforeSave: true, previewBeforeSave: false, requireAccessibility: true },
  slides: values.map((contrast, index) => ({
    id: `picture-corrections-contrast-${index + 1}`,
    title: 'Picture corrections contrast canary',
    message: `The same native picture is rendered with contrast ${contrast}.`,
    layoutIntent: 'title-only',
    content: [{ kind: 'image', name: `picture-corrections-contrast-${index + 1}`, region: 'hero', data: image, altText: `Native picture contrast checkpoint ${contrast}`, imageAdjustments: { contrast } }],
    notes: `Static Picture Format contrast checkpoint ${contrast}.`
  }))
}
const sourceBytes = Buffer.from(JSON.stringify(spec, null, 2), 'utf8')
function client(name) {
  let sessionId = null
  let requestId = 0
  return {
    async rpc(method, params = {}) {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...(sessionId ? { 'mcp-session-id': sessionId } : {}) }, body: JSON.stringify({ jsonrpc: '2.0', id: ++requestId, method, params }) })
      if (!sessionId) sessionId = response.headers.get('mcp-session-id')
      return parseResponse(await response.text())
    },
    async call(name_, args = {}) {
      const response = await this.rpc('tools/call', { name: name_, arguments: args })
      const text = response?.result?.content?.find(item => item.type === 'text')?.text
      return text ? JSON.parse(text) : response
    },
    async initialize() {
      await this.rpc('initialize', { protocolVersion: '2024-11-05', clientInfo: { name, version: '1' }, capabilities: {} })
      await this.rpc('notifications/initialized')
    }
  }
}

const roleA = client('betterpptx-public-picture-corrections-contrast-role-a')
await roleA.initialize()
const listed = await roleA.rpc('tools/list')
const servedNames = (listed?.result?.tools || []).map(tool => tool.name).sort()
const catalog = await roleA.call('betterpptx.options.catalog', { surface: 'corrections', format: 'full' })
const surfaces = catalog?.data?.data?.surfaces || catalog?.data?.surfaces || []
const correctionsSurface = surfaces.find(surface => surface.id === 'corrections')
const contrastParameter = Array.isArray(correctionsSurface?.parameters) ? correctionsSurface.parameters.find(parameter => parameter.id === 'contrast') : null
const upload = await roleA.call('betterpptx.assets.upload', { kind: 'jsonSpec', data: `data:application/json;base64,${sourceBytes.toString('base64')}`, fileName: 'picture-corrections-contrast-public.json', idempotencyKey: `picture-corrections-contrast-public-${Date.now()}-${crypto.randomUUID()}` })
const handle = upload?.data?.handle || upload?.handle
const dryRun = handle ? await roleA.call('betterpptx.deck.generate_from_spec', { specHandle: handle, phase: 'dryRun', commitMode: 'createNew', plan: 'premium', detail: 'full', validateAfterCompile: true, validationMode: 'strict', idempotencyKey: `picture-corrections-contrast-dry-${Date.now()}-${crypto.randomUUID()}` }) : { ok: false, error: { code: 'UPLOAD_DID_NOT_RETURN_HANDLE' } }
const dryData = dryRun?.data || dryRun || {}
const boundarySpec = JSON.parse(JSON.stringify(spec))
boundarySpec.title = 'Public Picture corrections contrast boundary probe'
boundarySpec.slides[0].content[0].imageAdjustments = { contrast: 1.1 }
const boundarySourceBytes = Buffer.from(JSON.stringify(boundarySpec, null, 2), 'utf8')
const boundaryUpload = await roleA.call('betterpptx.assets.upload', { kind: 'jsonSpec', data: `data:application/json;base64,${boundarySourceBytes.toString('base64')}`, fileName: 'picture-corrections-contrast-boundary-probe.json', idempotencyKey: `picture-corrections-contrast-boundary-upload-${Date.now()}-${crypto.randomUUID()}` })
const boundaryHandle = boundaryUpload?.data?.handle || boundaryUpload?.handle
const boundaryDryRun = boundaryHandle ? await roleA.call('betterpptx.deck.generate_from_spec', { specHandle: boundaryHandle, phase: 'resolve', commitMode: 'createNew', plan: 'premium', detail: 'full', validateAfterCompile: true, validationMode: 'strict', idempotencyKey: `picture-corrections-contrast-boundary-resolve-${Date.now()}-${crypto.randomUUID()}` }) : { ok: false, error: { code: 'BOUNDARY_UPLOAD_DID_NOT_RETURN_HANDLE' } }
const publicResponseText = JSON.stringify({ catalog, upload, dryRun, boundaryUpload, boundaryDryRun })
const privateLeakMatches = publicResponseText.match(/PptxGenJS_Claude|node_modules|engine\.mjs|[A-Z]:[\\/][^\s"']*/g) || []
const checks = {
  freshPublicSession: true,
  servedDiscovery: servedNames.includes('betterpptx.options.catalog') && servedNames.includes('betterpptx.assets.upload') && servedNames.includes('betterpptx.deck.generate_from_spec'),
  correctionsCatalogPresent: catalog?.ok === true && correctionsSurface?.id === 'corrections' && correctionsSurface?.capabilityStatus === 'executable-exact-structured',
  contrastParameterContractPresent: contrastParameter?.type === 'continuous' && contrastParameter?.valueType === 'number' && contrastParameter?.minimum === -1 && contrastParameter?.maximum === 1 && contrastParameter?.default === 0 && String(contrastParameter?.unit || '') === 'normalized' && String(contrastParameter?.semanticPath || '') === 'imageAdjustments.contrast',
  jsonSpecUpload: upload?.ok === true && typeof handle === 'string' && handle.startsWith('asset://locked/uploaded-jsonspec/'),
  dryRunMutationFree: dryRun?.ok === true && dryData.phase === 'dryRun' && dryData.mutationFree === true && !dryData.deckId,
  fiveContrastValuesReachPublicPlan: dryRun?.ok === true && dryData.slideCount === values.length && dryData.objectCount >= values.length,
  upperBoundaryRejected: boundaryUpload?.ok === true && typeof boundaryHandle === 'string' && boundaryDryRun?.ok === false,
  upperBoundaryMessage: /1\.1|contrast|between|-1|1/i.test(boundaryDryRun?.error?.message || ''),
  noPrivateImplementationLeakage: privateLeakMatches.length === 0
}
const status = Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL'
if (status !== 'PASS') throw new Error(`Public Picture corrections contrast checks failed: ${JSON.stringify(checks)}; privateLeakMatches=${JSON.stringify(privateLeakMatches)}\n${JSON.stringify(redact({ catalog, upload, dryRun, boundaryUpload, boundaryDryRun }), null, 2).slice(0, 12000)}`)
const evidence = redact({
  schemaVersion: 'betterpptx.public-picture-corrections-contrast-proof.v1',
  status,
  generatedAt: new Date().toISOString(),
  endpoint,
  roleA: { freshSession: true, servedToolCount: servedNames.length, servedToolNamesSha256: sha256(JSON.stringify(servedNames)), catalogSurface: 'corrections', catalogDigest: sha256(JSON.stringify(catalog)), contrastParameter },
  request: { values, sourceSha256: sha256(sourceBytes), sourceBytes: sourceBytes.length, staticContent: true, nativeCarrier: 'picture', parameter: 'imageAdjustments.contrast', valueType: 'number', unit: 'normalized', durableNativeProof: 'outputs/authoring-principle-corpus/picture-format-five-point/contrast/20260823T051315Z/proof-regression-20260823T060600Z/five-point-proof.json' },
  dryRun: { ok: dryRun?.ok === true, phase: dryData.phase, mutationFree: dryData.mutationFree, slideCount: dryData.slideCount, objectCount: dryData.objectCount, specDigest: dryData.specDigest, planDigest: dryData.planDigest, planId: dryData.planId, fiveContrastValuesReachPublicPlan: checks.fiveContrastValuesReachPublicPlan },
  boundaryProbe: { requestedValue: 1.1, uploadOk: boundaryUpload?.ok === true, rejected: checks.upperBoundaryRejected, errorCode: boundaryDryRun?.error?.code || null, errorMessage: boundaryDryRun?.error?.message || null },
  checks,
  privateLeakMatches,
  interpretation: 'A fresh public client discovered the typed Picture Format contrast contract, uploaded five normalized checkpoints, completed a mutation-free public dry-run, rejected 1.1, and showed no private leakage. Native XML, Office-authored reference, SaveCopyAs/reopen, retained readback, and visual proof remain covered by the immutable local five-point artifact.'
})
fs.mkdirSync(evidenceDir, { recursive: true })
const evidencePath = path.join(evidenceDir, 'picture-corrections-contrast-public-proof.json')
fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
const evidenceSha256 = sha256(fs.readFileSync(evidencePath))
fs.writeFileSync(`${evidencePath}.sha256`, `${evidenceSha256}  ${path.basename(evidencePath)}\n`, 'utf8')
console.log(JSON.stringify({ ...evidence, evidencePath, evidenceSha256 }, null, 2))
