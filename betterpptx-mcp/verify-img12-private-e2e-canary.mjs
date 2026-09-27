// IMG12 — private cold-process end-to-end canary.
// Uses only the already-audited owned synthetic Modal output. This verifier does
// not invoke an external AI service and never reads the consented-human corpus.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import JSZip from 'jszip'
import sharp from 'sharp'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..')
const self = fileURLToPath(import.meta.url)
const evidencePath = path.join(here, 'deploy', 'image-edit-worker', 'canary-evidence-img11-20260717.json')
const imagePath = path.join(repo, 'betterpptx-mcp', 'outputs', 'img11-modal-canary-512-1707.png')

const sharedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bpx-img12-e2e-'))
const outputRoot = path.join(sharedRoot, 'outputs')
const tenant = 'img12-private-canary'
const accountId = 'img12-account'
const licenseId = 'img12-license'

const baseEnv = {
	...process.env,
	BETTERPPTX_ASSETS_ROOT: repo,
	BETTERPPTX_FREE_PREVIEW_SLIDES: '99',
	BETTERPPTX_BILLING_ENFORCE: '0',
	BETTERPPTX_PUBLIC_BLACK_BOX: '0',
	BETTERPPTX_CREDENTIAL_STORE: path.join(sharedRoot, 'credentials.json'),
	BETTERPPTX_GEN_ASSET_STORE: 'local',
	BETTERPPTX_GEN_ASSET_DIR: sharedRoot,
	BETTERPPTX_GEN_ASSET_TENANT: tenant,
	BETTERPPTX_ACCOUNT_ID: accountId,
	BETTERPPTX_LICENSE_ID: licenseId,
}

function spec() {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'IMG12 private end-to-end canary',
		audience: 'research maintainer',
		objective: 'show a controlled visual system without leaking provider internals',
		authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic', coordinateSystem: 'inches', layerModel: 'flat-object-array', objectIdentity: 'stable-names-required', textPolicy: 'Use shape only for geometry. Use textBox for standalone text and textShape for text inside a PowerPoint shape.', requires: ['slide.id', 'content[].name', 'slide.notes', 'altText for visual proof', 'validation before save'] },
		contentStory: { audience: 'research maintainer', outcome: 'show a controlled visual system without leaking provider internals', remember: 'Fragmented inputs converge into one controlled visual system.' },
		visualDesign: { world: 'luxe controlled system', framing: 'asymmetric editorial grid' },
		designSystem: { visualAssetEcosystem: { imageryDirection: 'tactile dark materials, quiet left copy space, precise gold focal accent' } },
		motionTime: { masterClock: 'authored slide timeline', timingSource: 'Authoring Excellence Motion/Time plan', syncPolicy: 'One governed clock coordinates builds and transitions.' },
		styleIntent: { artDirection: 'luxe', mode: 'dark', density: 'low' },
		theme: { name: 'IMG12', palette: ['17110D', 'C89A4B', '7D5E36', 'E8D9BD', 'F5EFE4'], fontFace: 'Aptos' },
		sections: [{ id: 'main', title: 'Canary', slideIds: ['s1'] }],
		slides: [{
			id: 's1', title: 'Controlled visual authoring', role: 'tension-to-resolution opener',
			message: 'Fragmented inputs converge into one controlled visual system',
			layoutIntent: 'copy-left-image-right', notes: 'IMG12 owned-synthetic private canary',
			content: [
				{ kind: 'title', name: 'title', text: 'One controlled visual system', altText: 'One controlled visual system' },
				{ kind: 'textBox', name: 'body', text: 'Brief → resolve → lock → validate → save', altText: 'The private canary lifecycle from brief through save' },
				{ kind: 'image', name: 'hero', altText: 'Owned synthetic controlled visual with a calm right-side focal subject and quiet copy space on the left', imageTreatment: 'world', visualIntent: {
					mode: 'auto', purpose: 'conceptual hero', concept: 'fragmented pathways converging into one calm controlled core',
					subjectPlacement: 'right', negativeSpace: 'left', consistencyGroup: 'controlled-system', noText: true,
				} },
			],
		}],
	}
}

function dataOf(value) { return value?.data || value || {} }
function digest(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex') }
function runChild(step, payload = {}) {
	const result = spawnSync(process.execPath, [self, step, JSON.stringify(payload)], { encoding: 'utf8', timeout: 300000, env: baseEnv })
	const line = String(result.stdout || '').split(/\r?\n/).find(value => value.startsWith('RESULT '))
	if (!line) throw new Error(`IMG12 child ${step} produced no RESULT (exit ${result.status}): ${String(result.stderr || result.stdout).slice(-1200)}`)
	return JSON.parse(line.slice(7))
}

if (process.argv[2]) {
	const step = process.argv[2]
	const payload = JSON.parse(process.argv[3] || '{}')
	const provider = await import(`file://${path.join(here, 'assets', 'image-gen-providers.mjs').replace(/\\/g, '/')}`)
	if (step === 'seed') {
		const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'))
		const bytes = fs.readFileSync(imagePath)
		const engine = await import(`file://${path.join(here, 'engine.mjs').replace(/\\/g, '/')}`)
		const dispatcher = engine.createMcpToolDispatcher({ sessionId: 'img12-seed', accountId, licenseId })
		const call = (name, args = {}) => dispatcher.call(name, args)
		const dry = dataOf(await call('betterpptx.deck.generate_from_spec', { spec: spec(), phase: 'dryRun', commitMode: 'createNew', plan: 'premium', detail: 'full', includeCallPlan: true }))
		const visual = dry.visualDirection?.plans?.[0]
		if (!visual?.request) throw new Error('IMG12 seed dry-run did not produce a visual request')
		const hash = provider.promptHashFor(visual.request)
		const base64 = bytes.toString('base64')
		provider.cacheGeneratedImage({ promptHash: hash, dataUri: `data:image/png;base64,${base64}`, contentType: 'image/png', width: 512, height: 512, provider: 'modal-private-canary', model: evidence.model?.revision || 'audited-private-revision', capability: 'reference', referenceDigests: [evidence.input?.sha256 || 'synthetic-reference'], gpuSeconds: Number(evidence.gpu?.gpuSeconds || evidence.gpuSeconds || 0), license: { license: 'Apache-2.0', attributionRequired: false, commercialUse: 'allowed' }, ocr: { status: 'complete', text: '' } })
		const persist = await provider.persistGeneratedImage(hash, tenant)
		console.log('RESULT ' + JSON.stringify({ hash, persist, imageDigest: digest(bytes), dryMutationFree: dry.mutationFree === true, requestDigest: provider.promptHashFor(visual.request) }))
		process.exit(0)
	}
	if (step === 'execute') {
		const engine = await import(`file://${path.join(here, 'engine.mjs').replace(/\\/g, '/')}`)
		const hydrated = await provider.hydrateGeneratedImage(payload.hash, tenant)
		const dispatcher = engine.createMcpToolDispatcher({ sessionId: 'img12-execute', accountId, licenseId })
		const call = (name, args = {}) => dispatcher.call(name, args)
		const dry = dataOf(await call('betterpptx.deck.generate_from_spec', { spec: spec(), phase: 'dryRun', commitMode: 'createNew', plan: 'premium', detail: 'full', includeCallPlan: true }))
		const visual = dry.visualDirection?.plans?.[0]
		const requestHash = provider.promptHashFor(visual?.request || {})
		const resolved = await call('betterpptx.deck.generate_from_spec', { spec: spec(), phase: 'resolve', commitMode: 'createNew', plan: 'premium', detail: 'full', billingConfirmed: true })
		const resolvedData = dataOf(resolved)
		const lockedSpec = resolvedData.lockedSpec
		const lockedImage = lockedSpec?.slides?.[0]?.content?.find(item => item.name === 'hero')?.image
		const lockedDeck = dataOf(await call('betterpptx.deck.generate_from_spec', { spec: lockedSpec, phase: 'commit', commitMode: 'createNew', plan: 'premium', detail: 'summary' }))
		const deckId = lockedDeck.deckId
		const validation = dataOf(await call('betterpptx.deck.validate', { deckId }))
		const accessibility = dataOf(await call('betterpptx.deck.validate_accessibility', { deckId }))
		const qualityCall = await call('betterpptx.deck.validate_quality', { deckId })
		const quality = dataOf(qualityCall)
		const lockedDry = await call('betterpptx.deck.generate_from_spec', { spec: lockedSpec, phase: 'lockedDryRun', commitMode: 'createNew', plan: 'premium', detail: 'summary' })
		const commit = lockedDeck
		fs.mkdirSync(outputRoot, { recursive: true })
		const saved = await call('betterpptx.deck.save', { deckId, fileName: 'img12-private-e2e-canary.pptx', outputDir: outputRoot })
		const pptxPath = path.join(outputRoot, 'img12-private-e2e-canary.pptx')
		const pptxBytes = fs.existsSync(pptxPath) ? fs.readFileSync(pptxPath) : Buffer.alloc(0)
		const durablePptxPath = path.join(repo, 'betterpptx-mcp', 'outputs', 'img12-private-e2e-canary.pptx')
		if (pptxBytes.length) fs.copyFileSync(pptxPath, durablePptxPath)
		const zip = pptxBytes.length ? await JSZip.loadAsync(pptxBytes) : null
		const names = zip ? Object.keys(zip.files) : []
		const slideXml = zip?.file('ppt/slides/slide1.xml') ? await zip.file('ppt/slides/slide1.xml').async('string') : ''
		const qualityPass = qualityCall?.ok === true && Array.isArray(quality.failed) && quality.failed.length === 0 && Array.isArray(quality.blockingIssues) && quality.blockingIssues.length === 0
		const result = { hydrated: Boolean(hydrated), requestHash, expectedHash: payload.hash, resolved: resolved?.ok === true, lockedImage, lockedDryRun: lockedDry?.ok === true && dataOf(lockedDry).resolution?.required === false, committed: commit?.ok === true, validationPass: validation.valid === true && validation.issueCount === 0, accessibilityPass: accessibility.passed === true && accessibility.score === 100, qualityPass, qualityState: { callOk: qualityCall?.ok, callError: qualityCall?.error?.message, failed: quality.failed, blockingIssues: quality.blockingIssues, keys: Object.keys(quality) }, saved: saved?.ok === true && pptxBytes.length > 0, artifactSaved: fs.existsSync(durablePptxPath), pptxZip: names.includes('ppt/presentation.xml') && names.some(name => /^ppt\/media\/image(?:-\d+)+\.(png|jpg|jpeg|webp)$/i.test(name)), altText: /descr="[^"]*controlled visual/i.test(slideXml), noRaw3d: !names.some(name => /\.(glb|fbx)$/i.test(name)), outputDigest: pptxBytes.length ? digest(pptxBytes) : null }
		try { await call('betterpptx.deck.dispose', { deckId }) } catch {}
		console.log('RESULT ' + JSON.stringify(result))
		process.exit(0)
	}
	throw new Error(`unknown IMG12 step ${step}`)
}

const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'))
const canaryBytes = fs.readFileSync(imagePath)
const canaryMeta = await sharp(canaryBytes).metadata()
let pass = 0
let fail = 0
const ok = (name, condition, detail = '') => { if (condition) { pass++; console.log(`  ok   ${name}`) } else { fail++; console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) } }
console.log('IMG12 PRIVATE END-TO-END CANARY (cold client, owned synthetic only):')
ok('frozen audited Modal evidence exists', evidence.status === 'private-research-canary-pass; production-gate-pending' && evidence.referencePolicy?.customerImages === false && evidence.referencePolicy?.consentedHumanAssetSentToCloud === false && evidence.referencePolicy?.trainingEnabled === false)
ok('canary raster is real and expected size', canaryMeta.width === 512 && canaryMeta.height === 512 && digest(canaryBytes) === evidence.output?.sha256)
const seeded = runChild('seed')
ok('brief/dry-run is mutation-free and resolves one deterministic request', seeded.dryMutationFree === true && seeded.hash === seeded.requestDigest)
ok('accepted image is durably persisted under the private tenant boundary', seeded.persist?.ok === true && seeded.persist?.skipped === false)
const executed = runChild('execute', { hash: seeded.hash })
ok('cold process rehydrates the accepted image', executed.hydrated === true)
ok('cold process rebuilds the same request hash', executed.requestHash === executed.expectedHash)
ok('resolve produces a locked generic image handle', executed.resolved === true && /^gen:\/\/image\/[a-f0-9]{40}$/i.test(executed.lockedImage || ''))
ok('locked dry-run has no remaining resolution', executed.lockedDryRun === true)
ok('locked spec commits and all deterministic validators pass', executed.committed === true && executed.validationPass === true && executed.accessibilityPass === true && executed.qualityPass === true, JSON.stringify({ committed: executed.committed, validationPass: executed.validationPass, accessibilityPass: executed.accessibilityPass, qualityPass: executed.qualityPass, qualityState: executed.qualityState }))
ok('PPTX is saved, embeds the raster, preserves alt text, and has no raw 3D export', executed.saved === true && executed.pptxZip === true && executed.altText === true && executed.noRaw3d === true)
ok('public result remains provider/model/path neutral', !/modal-private-canary|audited-private-revision|betterpptx-mcp|IMG12_ACCOUNT_SECRET/i.test(JSON.stringify(executed)))
try { fs.rmSync(sharedRoot, { recursive: true, force: true }) } catch {}
assert.equal(fail, 0)
console.log(`\n${fail ? 'FAILED' : 'PASSED'}: ${pass} passed, ${fail} failed`)
