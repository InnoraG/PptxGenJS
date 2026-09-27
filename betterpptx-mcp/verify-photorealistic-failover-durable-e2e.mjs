// Cold-process durable lock/reuse proof using an actual live failover raster.
// No new GPU call is made here: the accepted fallback output is rehydrated from
// the tenant-scoped local asset store and committed through the normal spec path.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import JSZip from 'jszip'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..')
const sourceImage = path.join(here, 'outputs', 'photorealistic-failover-schnell.png')
// Keep the worker's audited landscape canvas (1280×768); the engine's
// structural landscape gate calibrates against this 5:3 canvas.
const sourceBytes = await sharp(fs.readFileSync(sourceImage)).resize(1280, 768, { fit: 'cover' }).png().toBuffer()
const sourceMeta = await sharp(sourceBytes).metadata()
const sharedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bpx-photorealistic-failover-e2e-'))
const outputRoot = path.join(sharedRoot, 'outputs')
const tenant = 'photorealistic-failover-tenant'
const accountId = 'photorealistic-failover-account'
const licenseId = 'photorealistic-failover-license'
const baseEnv = { ...process.env, BETTERPPTX_ASSETS_ROOT: repo, BETTERPPTX_FREE_PREVIEW_SLIDES: '99', BETTERPPTX_BILLING_ENFORCE: '0', BETTERPPTX_PUBLIC_BLACK_BOX: '0', BETTERPPTX_CREDENTIAL_STORE: path.join(sharedRoot, 'credentials.json'), BETTERPPTX_GEN_ASSET_STORE: 'local', BETTERPPTX_GEN_ASSET_DIR: sharedRoot, BETTERPPTX_GEN_ASSET_TENANT: tenant, BETTERPPTX_ACCOUNT_ID: accountId, BETTERPPTX_LICENSE_ID: licenseId }
const spec = () => ({ schemaVersion: 'betterpptx.deck-spec.v1', title: 'Photorealistic failover durable proof', audience: 'research maintainer', objective: 'prove a live fallback visual can be locked and reused in an editable PPTX', styleIntent: { artDirection: 'natural editorial photography', mode: 'light', density: 'low' }, theme: { name: 'Failover', palette: ['F5F8FA', '2B5C73', 'D9A441', '13202A'], fontFace: 'Aptos' }, sections: [{ id: 'main', title: 'Failover', slideIds: ['s1'] }], slides: [{ id: 's1', title: 'Live failover visual', role: 'evidence', message: 'A resilient visual authoring lane preserves quality when the first profile fails.', layoutIntent: 'copy-left-image-right', notes: 'Synthetic research artifact only', content: [{ kind: 'title', name: 'title', text: 'Resilient visual authoring' }, { kind: 'textBox', name: 'body', text: 'Failover → lock → reuse → PPTX', bbox: { x: 0.9, y: 5.55, w: 5.1, h: 0.55 } }, { kind: 'image', name: 'hero', bbox: { x: 6.8, y: 1.2, w: 5.8, h: 5.5 }, altText: 'Synthetic photorealistic failover visual with a right-side focal subject and left copy space', imageTreatment: 'world', visualIntent: { mode: 'auto', purpose: 'editorial hero', concept: 'resilient clean-energy field work', messageContribution: 'show resilient visual authoring', subjectPlacement: 'right', negativeSpace: 'left', consistencyGroup: 'failover-proof', noText: true, aspect: 'landscape' } }] }] })
function dataOf(value) { return value?.data || value || {} }
function digest(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex') }
function runChild(step, payload = {}) { const result = spawnSync(process.execPath, [fileURLToPath(import.meta.url), step, JSON.stringify(payload)], { encoding: 'utf8', timeout: 300000, env: baseEnv }); const line = String(result.stdout || '').split(/\r?\n/).find(value => value.startsWith('RESULT ')); if (!line) throw new Error(`child ${step} produced no RESULT: ${String(result.stderr || result.stdout).slice(-1200)}`); return JSON.parse(line.slice(7)) }

if (process.argv[2]) {
  const step = process.argv[2]
  const payload = JSON.parse(process.argv[3] || '{}')
  const provider = await import(`file://${path.join(here, 'assets', 'image-gen-providers.mjs').replace(/\\/g, '/')}`)
  const engine = await import(`file://${path.join(here, 'engine.mjs').replace(/\\/g, '/')}`)
  if (step === 'seed') {
    const context = { sessionId: 'photorealistic-failover-seed', accountId, licenseId }
    const deck = dataOf(await engine.callBetterPptxTool('betterpptx.deck.new', { title: 'Photorealistic failover durable proof', directorMode: 'director-guided' }, context))
    const deckId = deck.deckId
    await engine.callBetterPptxTool('betterpptx.deck.define_message_architecture', { deckId, audience: 'research maintainer', objective: 'prove a live fallback visual can be locked and reused', thesis: 'resilient visual authoring survives a profile failure', slides: [{ id: 's1', message: 'A resilient visual authoring lane preserves quality when the first profile fails.' }] }, context)
    await engine.callBetterPptxTool('betterpptx.deck.assign_slide_roles', { deckId, roles: [{ slideId: 's1', role: 'evidence' }] }, context)
    const dry = dataOf(await engine.callBetterPptxTool('betterpptx.deck.generate_from_spec', { deckId, spec: spec(), phase: 'dryRun', plan: 'standard', detail: 'full', includeCallPlan: true }, context))
    const visual = dry.visualDirection?.plans?.[0]
    if (!visual?.request) throw new Error('dry run did not produce a visual request')
    const hash = provider.promptHashFor(visual.request)
    provider.cacheGeneratedImage({ promptHash: hash, dataUri: `data:image/png;base64,${sourceBytes.toString('base64')}`, contentType: 'image/png', width: sourceMeta.width, height: sourceMeta.height, provider: 'private-failover-probe', model: 'audited-schnell', capability: 'create', gpuSeconds: 0, license: { license: 'Apache-2.0', attributionRequired: false, commercialUse: 'allowed' }, ocr: { status: 'complete', text: '' } })
    const persist = await provider.persistGeneratedImage(hash, tenant)
    console.log('RESULT ' + JSON.stringify({ hash, persist, dryMutationFree: dry.mutationFree === true, requestDigest: provider.promptHashFor(visual.request), sourceDigest: digest(sourceBytes) }))
    process.exit(0)
  }
  if (step === 'execute') {
    const hydrated = await provider.hydrateGeneratedImage(payload.hash, tenant)
    const context = { sessionId: 'photorealistic-failover-execute', accountId, licenseId }
    const deck = dataOf(await engine.callBetterPptxTool('betterpptx.deck.new', { title: 'Photorealistic failover durable proof', directorMode: 'director-guided' }, context))
    const deckId = deck.deckId
    await engine.callBetterPptxTool('betterpptx.deck.define_message_architecture', { deckId, audience: 'research maintainer', objective: 'prove a live fallback visual can be locked and reused', thesis: 'resilient visual authoring survives a profile failure', slides: [{ id: 's1', message: 'A resilient visual authoring lane preserves quality when the first profile fails.' }] }, context)
    await engine.callBetterPptxTool('betterpptx.deck.assign_slide_roles', { deckId, roles: [{ slideId: 's1', role: 'evidence' }] }, context)
    const resolved = await engine.callBetterPptxTool('betterpptx.deck.generate_from_spec', { deckId, spec: spec(), phase: 'resolve', plan: 'standard', detail: 'full', billingConfirmed: true }, context)
    const resolvedData = dataOf(resolved)
    const lockedSpec = resolvedData.lockedSpec
    const lockedImage = lockedSpec?.slides?.[0]?.content?.find(item => item.name === 'hero')?.image
    const lockedDry = await engine.callBetterPptxTool('betterpptx.deck.generate_from_spec', { deckId, spec: lockedSpec, phase: 'lockedDryRun', plan: 'standard', detail: 'summary' })
    const commit = await engine.callBetterPptxTool('betterpptx.deck.generate_from_spec', { deckId, spec: lockedSpec, phase: 'commit', commitMode: 'append', plan: 'standard', detail: 'summary' }, context)
    const validation = dataOf(await engine.callBetterPptxTool('betterpptx.deck.validate', { deckId }, context))
    const accessibility = dataOf(await engine.callBetterPptxTool('betterpptx.deck.validate_accessibility', { deckId }, context))
    const quality = dataOf(await engine.callBetterPptxTool('betterpptx.deck.validate_quality', { deckId }, context))
    fs.mkdirSync(outputRoot, { recursive: true })
    const saved = await engine.callBetterPptxTool('betterpptx.deck.save', { deckId, fileName: 'photorealistic-failover-durable-e2e.pptx', outputDir: outputRoot }, context)
    const pptxPath = path.join(outputRoot, 'photorealistic-failover-durable-e2e.pptx')
    const pptxBytes = fs.existsSync(pptxPath) ? fs.readFileSync(pptxPath) : Buffer.alloc(0)
    const zip = pptxBytes.length ? await JSZip.loadAsync(pptxBytes) : null
    const names = zip ? Object.keys(zip.files) : []
    const slideXml = zip?.file('ppt/slides/slide1.xml') ? await zip.file('ppt/slides/slide1.xml').async('string') : ''
    if (pptxBytes.length > 0) fs.writeFileSync(path.join(repo, 'betterpptx-mcp', 'outputs', 'photorealistic-failover-durable-e2e.pptx'), pptxBytes)
    try { await engine.callBetterPptxTool('betterpptx.deck.dispose', { deckId }, context) } catch {}
    console.log('RESULT ' + JSON.stringify({ hydrated: Boolean(hydrated), resolved: resolved?.ok === true, resolvedError: resolved?.error?.message || null, resolvedDetails: resolved?.error?.details || resolved?.data?.error?.details || null, resolvedKeys: Object.keys(resolved || {}), requestAspect: spec().slides[0].content.find(item => item.name === 'hero').visualIntent.aspect, sourceMeta, lockedImage, lockedDryRun: lockedDry?.ok === true && dataOf(lockedDry).resolution?.required === false, lockedDryError: lockedDry?.error?.message || null, committed: commit?.ok === true, commitError: commit?.error?.message || null, validationPass: validation.valid === true && validation.issueCount === 0, accessibilityPass: accessibility.passed === true && accessibility.score === 100, qualityPass: Array.isArray(quality.failed) && quality.failed.length === 0, saved: saved?.ok === true && pptxBytes.length > 0, pptxZip: names.includes('ppt/presentation.xml') && names.some(name => /^ppt\/media\/image(?:-\d+)+\.(png|jpg|jpeg|webp)$/i.test(name)), altText: /descr="[^"]*Synthetic photorealistic failover visual/i.test(slideXml), noRaw3d: !names.some(name => /\.(glb|fbx)$/i.test(name)), outputDigest: pptxBytes.length ? digest(pptxBytes) : null }))
    process.exit(0)
  }
  throw new Error(`unknown child step ${step}`)
}

const meta = await sharp(sourceBytes).metadata()
let pass = 0
let fail = 0
const checks = []
const ok = (name, condition, detail = '') => { checks.push({ name, status: condition ? 'PASS' : 'FAIL', detail }); if (condition) pass += 1; else fail += 1; console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`) }
console.log('PHOTOREALISTIC FAILOVER DURABLE E2E:')
ok('normalized live failover source raster is present', meta.width === 1280 && meta.height === 768 && sourceBytes.length > 1000)
const seeded = runChild('seed')
ok('seed dry-run is mutation-free and deterministic', seeded.dryMutationFree === true && seeded.hash === seeded.requestDigest)
ok('failover raster persists under tenant boundary', seeded.persist?.ok === true && seeded.persist?.skipped === false)
const executed = runChild('execute', { hash: seeded.hash })
ok('cold process rehydrates the accepted failover raster', executed.hydrated === true)
ok('resolve returns a provider-neutral locked handle', executed.resolved === true && /^gen:\/\/image\/[a-f0-9]{40}$/i.test(executed.lockedImage || ''), JSON.stringify({ resolved: executed.resolved, lockedImage: executed.lockedImage, error: executed.resolvedError, details: executed.resolvedDetails, requestAspect: executed.requestAspect, sourceMeta: executed.sourceMeta }))
ok('lockedDryRun requires no further resolution', executed.lockedDryRun === true, JSON.stringify({ lockedDryRun: executed.lockedDryRun, error: executed.lockedDryError }))
ok('commit validates and accessibility remains green', executed.committed === true && executed.validationPass === true && executed.accessibilityPass === true && executed.qualityPass === true, JSON.stringify({ committed: executed.committed, error: executed.commitError, validationPass: executed.validationPass, accessibilityPass: executed.accessibilityPass, qualityPass: executed.qualityPass }))
ok('saved PPTX embeds the raster with alt text and no raw 3D', executed.saved === true && executed.pptxZip === true && executed.altText === true && executed.noRaw3d === true, JSON.stringify({ saved: executed.saved, pptxZip: executed.pptxZip, altText: executed.altText, noRaw3d: executed.noRaw3d }))
ok('public result remains provider/path neutral', !/private-failover-probe|audited-schnell|BETTERPPTX_MODAL|photorealistic-failover-tenant/i.test(JSON.stringify(executed)))
const report = { schemaVersion: 'betterpptx.photorealistic-failover-durable-e2e.v1', status: fail === 0 ? 'research-live-pass' : 'research-live-fail', source: 'betterpptx-mcp/outputs/photorealistic-failover-schnell.png', sourceDigest: digest(sourceBytes), seeded, executed, pptx: 'betterpptx-mcp/outputs/photorealistic-failover-durable-e2e.pptx', customerImages: false, consentedHumanImages: false, training: false, externalAi: false, checks: pass, failures: fail, checksDetail: checks }
fs.writeFileSync(path.join(repo, 'betterpptx-mcp', 'outputs', 'photorealistic-failover-durable-e2e-report.json'), JSON.stringify(report, null, 2) + '\n')
try { fs.rmSync(sharedRoot, { recursive: true, force: true }) } catch {}
assert.equal(fail, 0)
console.log(`\nPASSED: ${pass} passed, ${fail} failed`)
