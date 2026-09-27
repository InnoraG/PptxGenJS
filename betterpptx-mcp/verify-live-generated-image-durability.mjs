// Live generated-image durability proof.
// One bounded, owned-synthetic live creation is resolved into a generic handle,
// then a fresh process hydrates that handle under the same account-scoped store,
// embeds it into an editable PPTX, and proves cross-account isolation.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import JSZip from 'jszip'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..')
const self = fileURLToPath(import.meta.url)
const outputRoot = path.join(here, 'outputs')
const outputDir = path.join(outputRoot, 'live-generated-image-durability')
const pptxPath = path.join(outputDir, 'live-generated-image-durability.pptx')
const renderPath = path.join(outputDir, 'com-render', 'slide-1.png')
fs.mkdirSync(path.dirname(renderPath), { recursive: true })

const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const dataOf = value => value?.data || value || {}
const checks = []
const ok = (name, condition, detail = '') => {
	checks.push({ name, status: condition ? 'PASS' : 'FAIL', detail })
	console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const sharedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bpx-live-image-durable-'))
const accountId = 'live-image-durability-account-a'
const licenseId = 'live-image-durability-license-a'
const baseEnv = {
	...process.env,
	BETTERPPTX_ASSETS_ROOT: repo,
	BETTERPPTX_LOCAL_MAINTAINER: '1',
	BETTERPPTX_IMAGE_AUTHORING_RESEARCH_OVERRIDE: '1',
	BETTERPPTX_FREE_PREVIEW_SLIDES: '99',
	BETTERPPTX_BILLING_ENFORCE: '0',
	BETTERPPTX_PUBLIC_BLACK_BOX: '0',
	BETTERPPTX_GEN_ASSET_STORE: 'local',
	BETTERPPTX_GEN_ASSET_DIR: sharedRoot,
}

const labels = [
	{ text: 'ATMOSPHERE', x: 0.36, y: 0.03, w: 0.24, h: 0.09 },
	{ text: 'PLANTS', x: 0.05, y: 0.36, w: 0.18, h: 0.09 },
	{ text: 'SOIL', x: 0.10, y: 0.78, w: 0.16, h: 0.09 },
	{ text: 'OCEAN', x: 0.78, y: 0.38, w: 0.17, h: 0.09 },
]
const arrows = [
	{ x: 0.30, y: 0.15, w: 0.20, h: 0.15 }, { x: 0.13, y: 0.46, w: 0.06, h: 0.25 },
	{ x: 0.24, y: 0.82, w: 0.34, h: 0.04 }, { x: 0.55, y: 0.20, w: 0.17, h: 0.12 },
]
const visualIntent = {
	mode: 'generate', purpose: 'scientific teaching illustration', style: 'illustration', steps: 2,
	concept: 'high-end carbon cycle cutaway landscape with lush forest, exposed roots and layered soil, blue ocean and atmospheric clouds',
	noText: true, nativeAnnotations: { labels, arrows },
}
const spec = {
	schemaVersion: 'betterpptx.deck-spec.v1', title: 'Live durable carbon-cycle illustration', audience: 'science lesson', objective: 'Explain carbon movement across reservoirs.',
	styleIntent: { artDirection: 'chalkline', mode: 'light' }, theme: { palette: ['102A43', '2D6A4F', 'F4F1DE', 'FFFFFF'], fontFace: 'Aptos' },
	slides: [{ id: 'carbon-durable', title: 'The carbon cycle', role: 'teaching', message: 'Carbon moves among atmosphere, plants, soil and ocean.', layoutIntent: 'title-only', content: [{ kind: 'image', name: 'carbon-durable-illustration', bbox: { x: 0.8, y: 1.1, w: 11.7, h: 5.6 }, altText: 'Carbon cycle illustration showing atmosphere, plants, soil and ocean', visualIntent }] }],
}

function child(step, payload = {}) {
	const result = spawnSync(process.execPath, [self, step, JSON.stringify(payload)], { encoding: 'utf8', timeout: 300000, env: baseEnv, windowsHide: true })
	const line = String(result.stdout || '').split(/\r?\n/).find(value => value.startsWith('RESULT '))
	if (!line) throw new Error(`child ${step} produced no RESULT (exit ${result.status}): ${String(result.stderr || result.stdout).slice(-1200)}`)
	return JSON.parse(line.slice(7))
}

if (process.argv[2]) {
	const step = process.argv[2]
	const payload = JSON.parse(process.argv[3] || '{}')
	if (step === 'hydrate-embed') {
		const provider = await import(`file://${path.join(here, 'assets', 'image-gen-providers.mjs').replace(/\\/g, '/')}`)
		const assetStore = await import(`file://${path.join(here, 'storage', 'gen-asset-store.mjs').replace(/\\/g, '/')}`)
		const engine = await import(`file://${path.join(here, 'engine.mjs').replace(/\\/g, '/')}`)
		const context = { sessionId: 'live-image-durable-child', accountId, licenseId }
		const tenantA = assetStore.resolveGenAssetTenantIdentity({ accountId, licenseId }).tenantId
		const entry = await provider.hydrateGeneratedImage(payload.hash, tenantA)
		const bytes = entry?.dataUri ? Buffer.from(String(entry.dataUri).split(',')[1] || '', 'base64') : Buffer.alloc(0)
		const lockedSpec = JSON.parse(fs.readFileSync(payload.lockedSpecPath, 'utf8'))
		const lockedDry = await engine.callBetterPptxTool('betterpptx.deck.generate_from_spec', { spec: lockedSpec, phase: 'lockedDryRun', plan: 'premium', detail: 'summary' }, context)
		const committed = await engine.callBetterPptxTool('betterpptx.deck.generate_from_spec', { spec: lockedSpec, phase: 'commit', plan: 'premium', detail: 'summary' }, context)
		const deckId = dataOf(committed).deckId
		const saved = deckId ? await engine.callBetterPptxTool('betterpptx.deck.save', { deckId, fileName: path.basename(pptxPath), outputDir }, context) : null
		let names = [], slideXml = ''
		if (fs.existsSync(pptxPath)) {
			const zip = await JSZip.loadAsync(fs.readFileSync(pptxPath))
			names = Object.keys(zip.files)
			slideXml = await zip.file('ppt/slides/slide1.xml')?.async('string') || ''
		}
		let comText = ''
		if (fs.existsSync(pptxPath)) {
			const ps = `$ErrorActionPreference='Stop'; $pp=New-Object -ComObject PowerPoint.Application; $p=$pp.Presentations.Open('${pptxPath.replace(/'/g, "''")}', $false, $false, $false); $count=$p.Slides.Count; $p.Slides.Item(1).Export('${renderPath.replace(/'/g, "''")}', 'PNG', 1600, 900); $p.Close(); $pp.Quit(); Write-Output ('SLIDES=' + $count)`
			const com = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { encoding: 'utf8', timeout: 180000, windowsHide: true })
			comText = `${com.stdout || ''}\n${com.stderr || ''}`
		}
		try { if (deckId) await engine.callBetterPptxTool('betterpptx.deck.dispose', { deckId }, context) } catch {}
		console.log('RESULT ' + JSON.stringify({
			hydrated: Boolean(entry), imageDigest: bytes.length ? digest(bytes) : null, width: entry?.width, height: entry?.height,
			lockedDryRun: lockedDry?.ok === true && dataOf(lockedDry).resolution?.required === false,
			committed: committed?.ok === true, saved: saved?.ok === true && fs.existsSync(pptxPath),
			pptxZip: names.includes('ppt/presentation.xml') && names.some(name => /^ppt\/media\/image/i.test(name)),
			labels: labels.every(label => slideXml.includes(`>${label.text}<`)), arrows: (slideXml.match(/native-annotation-arrow/g) || []).length >= 4,
			noRaw3d: !names.some(name => /\.(glb|fbx)$/i.test(name)), com: /SLIDES=1/.test(comText) && fs.existsSync(renderPath), comText: comText.trim().slice(-240),
			pptxDigest: fs.existsSync(pptxPath) ? digest(fs.readFileSync(pptxPath)) : null,
		}))
		process.exit(0)
	}
	if (step === 'cross-tenant') {
		const provider = await import(`file://${path.join(here, 'assets', 'image-gen-providers.mjs').replace(/\\/g, '/')}`)
		const assetStore = await import(`file://${path.join(here, 'storage', 'gen-asset-store.mjs').replace(/\\/g, '/')}`)
		const tenantB = assetStore.resolveGenAssetTenantIdentity({ accountId: 'live-image-durability-account-b', licenseId: 'live-image-durability-license-b' }).tenantId
		const entry = await provider.hydrateGeneratedImage(payload.hash, tenantB)
		console.log('RESULT ' + JSON.stringify({ hydrated: Boolean(entry) }))
		process.exit(0)
	}
	throw new Error(`unknown step ${step}`)
}

console.log('LIVE GENERATED IMAGE DURABILITY (one bounded live creation, cold-process hydration):')
Object.assign(process.env, baseEnv)
const engine = await import('./engine.mjs')
const context = { sessionId: `live-image-durable-parent-${Date.now().toString(36)}`, accountId, licenseId }
const resolved = await engine.callBetterPptxTool('betterpptx.deck.generate_from_spec', { spec, phase: 'resolve', plan: 'premium', detail: 'full', billingConfirmed: true }, context)
const resolvedData = dataOf(resolved)
const lockedSpec = resolvedData.lockedSpec
const lockedImage = lockedSpec?.slides?.[0]?.content?.find(item => item.name === 'carbon-durable-illustration')?.image
const hashMatch = String(lockedImage || '').match(/^gen:\/\/image\/([a-f0-9]{40})$/i)
const lockedHash = hashMatch?.[1] || null
const lockedSpecPath = path.join(sharedRoot, 'locked-spec.json')
if (lockedSpec) fs.writeFileSync(lockedSpecPath, JSON.stringify(lockedSpec, null, 2))
ok('live source-less resolve returns a generic locked image handle', resolved?.ok === true && Boolean(lockedHash), String(resolved?.error?.message || ''))
ok('live resolved spec is written for a cold process', Boolean(lockedSpec) && fs.existsSync(lockedSpecPath))

const embedded = lockedHash ? child('hydrate-embed', { hash: lockedHash, lockedSpecPath }) : {}
ok('fresh process hydrates the live image under the same account', embedded.hydrated === true)
ok('hydrated image bytes retain a digest', /^[a-f0-9]{64}$/i.test(embedded.imageDigest || ''))
ok('fresh process locked dry-run has no remaining resolution', embedded.lockedDryRun === true)
ok('fresh process commits and saves editable PPTX', embedded.committed === true && embedded.saved === true)
ok('PPTX embeds the live raster and keeps native annotations', embedded.pptxZip === true && embedded.labels === true && embedded.arrows === true)
ok('PPTX remains PPTX-only', embedded.noRaw3d === true)
ok('PowerPoint COM reopens and exports the live deck', embedded.com === true, embedded.comText || '')
const cross = lockedHash ? child('cross-tenant', { hash: lockedHash }) : {}
ok('different account cannot hydrate the live image', cross.hydrated === false)

const passed = checks.filter(item => item.status === 'PASS').length
const report = {
	schemaVersion: 'betterpptx.live-generated-image-durability.v1', status: passed === checks.length ? 'research-live-generated-durability-pass' : 'research-live-generated-durability-fail',
	checks: checks.length, failures: checks.length - passed, passed, liveCreation: true, sourceLess: true, requestedLane: 'create',
	lockedImageHandle: lockedImage || null, imageHash: lockedHash, sameAccountHydrated: embedded.hydrated === true, crossAccountHydrated: cross.hydrated === true,
	outputPptx: 'betterpptx-mcp/outputs/live-generated-image-durability/live-generated-image-durability.pptx', render: 'betterpptx-mcp/outputs/live-generated-image-durability/com-render/slide-1.png',
	nativeLabels: labels, nativeArrows: arrows.length, customerImages: false, consentedHumanImages: false, externalAi: false, training: false, noRaw3d: embedded.noRaw3d === true,
	pptxDigest: embedded.pptxDigest || null, checksDetail: checks,
}
fs.writeFileSync(path.join(outputRoot, 'live-generated-image-durability-report.json'), JSON.stringify(report, null, 2) + '\n')
try { fs.rmSync(sharedRoot, { recursive: true, force: true }) } catch {}
console.log(`\nLIVE GENERATED IMAGE DURABILITY: ${passed}/${checks.length} checks passed`)
process.exit(passed === checks.length ? 0 : 1)
