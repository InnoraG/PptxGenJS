// Verify the saved-package privacy contract (G1): a deck that embeds a GENERATED asset must save
// a package whose edition sidecar — INCLUDING the decoded dfl.b64 payload — carries only generic,
// user-facing license facts. Encoding is never a privacy boundary, so the tech-stack scanner must
// decode the sidecar blob, pass a clean package, and catch a dirty payload (negative control).
//
// Self-contained committed fixture: uses the tracked kinetic clip library as the model bytes, the
// local dev-harness env, and no network/creds. Run: node betterpptx-mcp/verify-sidecar-privacy.mjs
import path from 'node:path'
import * as os from 'node:os'
import fs from 'node:fs/promises'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')

Object.assign(process.env, {
	BETTERPPTX_ASSETS_ROOT: repoRoot,
	BETTERPPTX_ALLOW_PRIMITIVE_TOOLS: '1',
	BETTERPPTX_FREE_PREVIEW_SLIDES: '99',
	BETTERPPTX_DEV_ACCEPT_ANY_ACTIVATION_KEY: '1',
	BETTERPPTX_BILLING_ENFORCE: '0',
	BETTERPPTX_TOOL_TIMEOUT_MS: '600000',
	BETTERPPTX_CREDENTIAL_STORE: path.join(os.tmpdir(), `bpx-sidecar-verify-${process.pid}.json`),
})

const engine = await import(`file://${here.replace(/\\/g, '/')}/engine.mjs`)
const dispatcher = engine.createMcpToolDispatcher({ sessionId: `sidecar-privacy-${process.pid}` })
const prov = await import(`file://${here.replace(/\\/g, '/')}/assets/model3d-gen-providers.mjs`)
const vocab = await import(`file://${here.replace(/\\/g, '/')}/blackbox-vocabulary.mjs`)
const JSZip = (await import('jszip')).default

let pass = 0, fail = 0
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : ' ' + extra}`) }

// Seed a "generated" avatar from the TRACKED kinetic library bytes (any valid animated GLB works —
// this fixture proves the LICENSE-MANIFEST path, not model quality).
const glbB64 = (await fs.readFile(path.join(here, 'assets', 'kinetic-clips.glb'))).toString('base64')
const reg = prov.registerLocalRigged3d({ glbBase64: glbB64, clipMap: { idle: 0 }, basisKey: 'sidecar-privacy-fixture' })
ok('registered handle uses the generic scheme (no provider segment)', /^gen:\/\/rigged3d\/[a-f0-9]{40}$/.test(reg.handle), reg.handle)

const spec = {
	schemaVersion: 'betterpptx.deck-spec.v1', title: 'Sidecar privacy fixture', audience: 'internal', objective: 'verify saved-package privacy',
	authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic', coordinateSystem: 'inches', layerModel: 'flat-object-array', objectIdentity: 'stable-names-required', textPolicy: 'Use textBox for standalone text and textShape for text inside a PowerPoint shape.', requires: ['slide.id', 'content[].name', 'slide.notes', 'validation before save'] },
	contentStory: { audience: 'internal', outcome: 'verify saved-package privacy', remember: 'private asset provenance is not exposed in the package' },
	visualDesign: { world: 'Quiet verification canvas', framing: 'clear title and native model surface' },
	motionTime: { masterClock: 'authored slide timeline', timingSource: 'Authoring Excellence Motion/Time plan', syncPolicy: 'One governed clock coordinates builds and transitions.' },
	styleIntent: { density: 'medium', tone: 'direct', visualSystem: 'native editable PowerPoint' },
	theme: { name: 'V', palette: ['0B1220', '2563EB', '14B8A6', 'F59E0B', 'F8FAFC'], fontFace: 'Aptos' },
	sections: [{ id: 'main', title: 'Main', slideIds: ['s1'] }],
	slides: [{
		id: 's1', title: 'Host', role: 'opener', message: 'Host slide', layoutIntent: 'title-body', notes: 'n',
		content: [
			{ kind: 'title', name: 't', text: 'Generated asset fixture' },
			{ kind: 'model3d', name: 'host', model: reg.handle },
		],
	}],
}
const gen = await dispatcher.call('betterpptx.deck.generate_from_spec', { spec, phase: 'commit', plan: 'free', detail: 'summary' })
ok('deck committed', gen?.ok === true, JSON.stringify(gen?.error || '').slice(0, 200))
const deckId = (gen?.data ?? gen)?.deckId
const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bpx-sidecar-verify-'))
const quality = await dispatcher.call('betterpptx.deck.validate_quality', { deckId })
ok('quality gate passes before save', quality?.ok === true && (quality?.data?.blockingIssues || quality?.blockingIssues || []).length === 0, JSON.stringify(quality?.error || '').slice(0, 200))
const save = await dispatcher.call('betterpptx.deck.save', { deckId, fileName: 'sidecar-privacy.pptx', outputDir: outDir })
ok('deck saved', save?.ok === true, JSON.stringify(save?.error || '').slice(0, 200))

const zip = await JSZip.loadAsync(await fs.readFile(path.join(outDir, 'sidecar-privacy.pptx')))

// (1) Decode the sidecar directly — the license manifest must be provenance-free.
const sidecarXml = await zip.files['ppt/betterpptx-edition.xml'].async('string')
const m = sidecarXml.match(/<betterpptxEdition[^>]*enc="dfl\.b64"[^>]*>([\s\S]*?)<\/betterpptxEdition>/)
ok('sidecar present + encoded', Boolean(m))
const payload = JSON.parse(zlib.inflateRawSync(Buffer.from(m[1].trim(), 'base64')).toString('utf8'))
const assets = payload?.embeddedAssetLicenses?.assets || []
ok('license manifest carries the generated asset', assets.length >= 1, JSON.stringify(assets).slice(0, 200))
const rec = assets[0] || {}
ok('record is generic (type:generated; no provider/host/generator/rigger/model/licenseUrl keys)',
	rec.type === 'generated' && rec.provider === undefined && rec.host === undefined && rec.generator === undefined && rec.rigger === undefined && rec.model === undefined && rec.licenseUrl === undefined,
	JSON.stringify(rec).slice(0, 300))
const wholePayload = JSON.stringify(payload)
ok('decoded payload has no generation-stack names', !/trellis|unirig|flux|huggingface|black-forest|l40s|liveportrait|musetalk/i.test(wholePayload))
ok('decoded payload has no legacy provider-bearing handles', !/gen:\/\/(?:trellis|flux)\//.test(wholePayload))

// (2) The upgraded scanner must decode the blob itself and report the package clean.
const scan = await vocab.validateTechStackVocabularyFromZip(zip)
ok('tech-stack scan (incl. decoded sidecar) is clean', scan.ok === true, JSON.stringify(scan.issues || []).slice(0, 400))
ok('scanner inspected the sidecar part', scan.inspectedParts.some(p => /betterpptx-edition\.xml$/.test(p)))

// (3) NEGATIVE CONTROL — a dirty encoded payload must be caught via the decode path. Guards
// against the scanner silently regressing to raw-text-only scanning (the pre-2026-07-14 gap).
const dirty = zlib.deflateRawSync(Buffer.from(JSON.stringify({ assets: [{ provider: 'trellis', host: 'modal', generator: 'trellis-2' }] }))).toString('base64')
const dirtyZip = new JSZip()
dirtyZip.file('ppt/betterpptx-edition.xml', `<?xml version="1.0"?>\n<betterpptxEdition xmlns="x" enc="dfl.b64">${dirty}</betterpptxEdition>`)
const dirtyScan = await vocab.validateTechStackVocabularyFromZip(dirtyZip)
ok('negative control: dirty encoded sidecar IS caught in the decoded payload', dirtyScan.ok === false && dirtyScan.issues.some(i => i.scope === 'decoded sidecar payload'), JSON.stringify(dirtyScan.issues).slice(0, 300))

// (4) UNDECODABLE control — a corrupt blob must be flagged, never silently passed.
const brokenZip = new JSZip()
brokenZip.file('ppt/betterpptx-edition.xml', '<?xml version="1.0"?>\n<betterpptxEdition xmlns="x" enc="dfl.b64">!!!not-base64-deflate!!!</betterpptxEdition>')
const brokenScan = await vocab.validateTechStackVocabularyFromZip(brokenZip)
ok('undecodable control: corrupt sidecar payload is flagged (cannot be certified clean)', brokenScan.ok === false && brokenScan.issues.some(i => i.code === 'PUBLIC_PACKAGE_SIDECAR_UNDECODABLE'), JSON.stringify(brokenScan.issues).slice(0, 300))

try { await dispatcher.call('betterpptx.deck.dispose', { deckId }) } catch {}
try { await fs.rm(outDir, { recursive: true, force: true }) } catch {}
console.log(`\n${fail === 0 ? 'PASSED' : 'FAILED'}: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
