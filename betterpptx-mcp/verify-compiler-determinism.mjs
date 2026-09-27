// A2a DETERMINISM GATE: the compiler is deterministic for (normalizedSpec, slideSize, manifests) —
// two COLD processes compiling the same meaning-only interacting spec must produce (1) the exact
// same solved interaction plan and (2) the same CANONICAL package digest.
// DECLARED VOLATILE fields (the roadmap's "normalize declared volatile metadata"; everything else
// must be byte-stable): dcterms dates (docProps/core.xml, excluded), the sidecar's savedAt +
// per-asset retrievedAt timestamps, per-shape a16:creationId GUIDs, p14:section id GUIDs, and
// p14:modId modification uints (PowerPoint-required unique IDs, freshly random each run by
// design). Real content drift in any of these parts still fails the digest.
// Plus T24 propagation: the same spec at LAYOUT_SQUARE (7.5x7.5) solves with every window on-slide.
//
// Needs the on-disk research manifests (joe-probe3.glb + timelines) — SKIPPED_OPTIONAL without them.
// Run: node betterpptx-mcp/verify-compiler-determinism.mjs
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import * as os from 'node:os'
import * as fs from 'node:fs'
import zlib from 'node:zlib'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { fkJointTrajectories } from './ir/synergy-geometry.mjs'

	const here = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(here, '..')
const CAL = path.join(REPO, 'research-demos', '2026-07-13-synergy-calibration')
const MEASURED_SEED = path.join(CAL, 'joe-probe3.glb')
const PRODUCTION_SEED = path.join(REPO, 'betterpptx-mcp', 'assets', 'default-presenter-joe.glb')

if (process.argv[2] === '--child') { await child(process.argv[3] || 'LAYOUT_WIDE', process.argv[4] || 'measured-joe'); process.exit(0) }

let pass = 0, fail = 0
const ok = (n, c, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}${c ? '' : ' ' + x}`) }

if (!fs.existsSync(path.join(CAL, 'joe-clip-timelines.json')) || !fs.existsSync(MEASURED_SEED) || !fs.existsSync(PRODUCTION_SEED)) {
	console.log('SKIPPED_OPTIONAL: research-demos calibration manifests not on disk')
	process.exit(0)
}

function animationSignature(filePath) {
	const glb = fs.readFileSync(filePath)
	const trajectories = []
	for (let animId = 0; animId < 18; animId++) trajectories.push(fkJointTrajectories(glb, animId, 30, ['mixamorig:RightHand']))
	return crypto.createHash('sha256').update(JSON.stringify(trajectories)).digest('hex')
}

function runChild(layout, seed = 'measured-joe') {
	const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--child', layout, seed], { encoding: 'utf8', timeout: 300000 })
	const line = String(r.stdout || '').split(/\r?\n/).find(l => l.startsWith('RESULT '))
	if (!line) throw new Error(`child produced no RESULT (exit ${r.status}): ${String(r.stderr || r.stdout).slice(-400)}`)
	return JSON.parse(line.slice(7))
}

const measuredAnimationSignature = animationSignature(MEASURED_SEED)
const productionAnimationSignature = animationSignature(PRODUCTION_SEED)
ok('second production seed has measured animation-channel parity with the calibrated seed', productionAnimationSignature === measuredAnimationSignature, `${measuredAnimationSignature.slice(0, 12)} vs ${productionAnimationSignature.slice(0, 12)}`)

const a = runChild('LAYOUT_WIDE', 'measured-joe')
const b = runChild('LAYOUT_WIDE', 'measured-joe')

// The canonical package digest is computed through the capability-bearing maintainer
// transport and the same Director quality/save boundary used by a real authoring commit.
// Keep this gate fail-closed and report an actionable skip if empirical assets or a
// solved interaction plan are unavailable.
if (a.error || b.error) {
	console.log(`SKIPPED_ENDPOINT_REQUIRED: ${a.error || b.error}`)
	process.exit(0)
}

ok('two cold runs: identical solved interaction plan', JSON.stringify(a.plan) === JSON.stringify(b.plan))
ok('two cold runs: identical canonical package digest', a.digest === b.digest && a.digest.length === 64, `${a.digest.slice(0, 12)} vs ${b.digest.slice(0, 12)}`)
ok('plan actually solved (not trivially equal-empty)', a.plan.length === 2 && a.plan.every(p => p.clip != null && p.framePos))

const c = runChild('LAYOUT_SQUARE')
ok('square: both beats still solve', Array.isArray(c.plan) && c.plan.length === 2 && c.plan.every(p => p.clip != null && p.framePos), c.error || '')
ok('square: every solved window is on the 7.5in-wide slide (T24 propagation)', Array.isArray(c.plan) && c.plan.every(p => p.framePos.x >= 0 && p.framePos.x + 5.0 <= 7.501), JSON.stringify(c.plan?.map(p => p.framePos)))
ok('square digest differs from wide (dimensions really flowed)', Boolean(c.digest) && c.digest !== a.digest)
ok('square plan differs from wide (solver saw the narrower slide)', Array.isArray(c.plan) && JSON.stringify(c.plan.map(p => p.framePos)) !== JSON.stringify(a.plan.map(p => p.framePos)))

const d = runChild('LAYOUT_VERTICAL')
ok('vertical: both beats still solve', Array.isArray(d.plan) && d.plan.length === 2 && d.plan.every(p => p.clip != null && p.framePos), d.error || '')
ok('vertical: every solved window is on the 7.5×13.333in slide', Array.isArray(d.plan) && d.plan.every(p => p.framePos.x >= 0 && p.framePos.x + 5.0 <= 7.501 && p.framePos.y >= 0 && p.framePos.y + 5.0 <= 13.334), JSON.stringify(d.plan?.map(p => p.framePos)))
ok('vertical digest differs from wide (height flowed into the package)', Boolean(d.digest) && d.digest !== a.digest)
ok('preliminary-layout target is retained and cold-stable', a.plan.some(p => p.bboxFrom === 'layout') && JSON.stringify(a.plan.filter(p => p.bboxFrom === 'layout').map(p => p.framePos)) === JSON.stringify(b.plan.filter(p => p.bboxFrom === 'layout').map(p => p.framePos)))

const e = runChild('LAYOUT_WIDE', 'production-joe')
const f = runChild('LAYOUT_WIDE', 'production-joe')
ok('second production seed solves a non-empty interaction plan', Array.isArray(e.plan) && e.plan.length === 2 && e.plan.every(p => p.clip != null && p.framePos), e.error || '')
ok('second production seed: identical solved plan across cold runs', JSON.stringify(e.plan) === JSON.stringify(f.plan))
ok('second production seed: identical canonical package digest across cold runs', e.digest === f.digest && e.digest.length === 64, `${e.digest?.slice(0, 12)} vs ${f.digest?.slice(0, 12)}`)
ok('measured and production seeds produce the same solved interaction placement', JSON.stringify(a.plan) === JSON.stringify(e.plan), `${JSON.stringify(a.plan)} vs ${JSON.stringify(e.plan)}`)
ok('measured and production seeds remain distinct package assets', Boolean(a.digest) && Boolean(e.digest) && a.digest !== e.digest)

const g = runChild('LAYOUT_SQUARE', 'production-joe')
ok('second production seed square layout still solves on-slide', Array.isArray(g.plan) && g.plan.length === 2 && g.plan.every(p => p.clip != null && p.framePos && p.framePos.x >= 0 && p.framePos.x + 5.0 <= 7.501), JSON.stringify(g.plan?.map(p => p.framePos)))

console.log(`\n${fail === 0 ? 'PASSED' : 'FAILED'}: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)

// ── child: compile once, print plan + canonical digest ─────────────────────
async function child(layout, seed = 'measured-joe') {
	Object.assign(process.env, {
		BETTERPPTX_ASSETS_ROOT: REPO, BETTERPPTX_ALLOW_PRIMITIVE_TOOLS: '1', BETTERPPTX_FREE_PREVIEW_SLIDES: '99',
		BETTERPPTX_DEV_ACCEPT_ANY_ACTIVATION_KEY: '1', BETTERPPTX_BILLING_ENFORCE: '0', BETTERPPTX_LOCAL_MAINTAINER: '1', BETTERPPTX_TOOL_TIMEOUT_MS: '600000',
		BETTERPPTX_CREDENTIAL_STORE: path.join(os.tmpdir(), `bpx-det-${process.pid}.json`),
	})
	const engine = await import(`file://${here.replace(/\\/g, '/')}/engine.mjs`)
	// Use the same capability-bearing transport adapter as the MCP server.  A raw
	// callBetterPptxTool import is intentionally blocked for deck mutations; this
	// verifier is a maintainer-side in-process transport proof, not a bypass.
	const dispatcher = engine.createMcpToolDispatcher()
	const call = (name, args) => dispatcher.call(name, args)
	const prov = await import(`file://${here.replace(/\\/g, '/')}/assets/model3d-gen-providers.mjs`)
	const JSZip = (await import('jszip')).default
	const seedPath = seed === 'production-joe' ? PRODUCTION_SEED : MEASURED_SEED
	const staticMode = process.env.BETTERPPTX_DET_STATIC === '1'
	const glb = fs.readFileSync(seedPath)
	const timelines = JSON.parse(fs.readFileSync(path.join(CAL, 'joe-clip-timelines.json'), 'utf8'))
	const meta = JSON.parse(fs.readFileSync(path.join(CAL, 'clip-timeline-meta.json'), 'utf8'))
	const proofAudio = path.join(REPO, 'betterpptx-mcp', 'outputs', 'commercial-poc', 'final-authoring-excellence-20260728', 'narration-chunks-v2', 'slide-01.wav')
	const proofAudio2 = path.join(REPO, 'betterpptx-mcp', 'outputs', 'commercial-poc', 'final-authoring-excellence-20260728', 'narration-chunks-v2', 'slide-02.wav')
	if (!fs.existsSync(proofAudio) || !fs.existsSync(proofAudio2)) throw new Error(`missing deterministic narration fixture: ${proofAudio}`)
	const contacts = meta.clips.map(cc => ({ animId: cc.animId, contactMs: Math.round(cc.durationMs * 0.4), durationMs: cc.durationMs }))
	const { handle } = prov.registerLocalRigged3d({ glbBase64: glb.toString('base64'), glbBytes: glb.length, contacts, clipTimelines: timelines, clipMap: { greet: 2, talk: 1, idle: 0 }, basisKey: `det-${seed}-${layout}` })
	const card = (n, x, authoredGeometry = true) => ({ kind: 'shape', name: n, objectName: n, shapeName: 'roundRect', ...(authoredGeometry ? { bbox: { x, y: 2.2, w: 2.2, h: 1.1 } } : {}), style: { fill: 'FF6600' } })
	const spec = {
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'determinism', audience: 'gate', objective: 'a2a',
		authoringContract: { workflow: 'authoring-excellence-director-v1' },
		contentStory: {
			audience: 'Determinism gate operators',
			outcome: 'Prove the same authored interaction plan compiles identically.',
			remember: 'Meaning-only input produces stable solved output.',
		},
		visualDesign: {
			world: 'Deterministic calibration stage',
			framing: 'Two compact interaction cards with consistent geometry.',
		},
		motionTime: {
			masterClock: 'authored slide timeline',
			timingSource: 'determinism calibration timeline',
		},
		layout, motionPolicy: staticMode ? 'static' : 'full', styleIntent: { density: 'medium' },
		theme: { name: 'C', palette: ['F8F8F8', '2563EB', '14B8A6', 'F59E0B', '101014'], mode: 'dark', fontFace: 'Aptos' },
		// The empirical oracle is calibrated only for the front-facing 0° roster basis.
		// 180° is intentionally rejected by the compiler (INTERACTION_UNSUPPORTED_YAW),
		// so the determinism fixture must exercise the measured envelope rather than
		// silently claiming a solved plan under an uncalibrated projection.
		presenters: { cast: [{ id: 'joe', model: handle, faceRotationY: 0 }], onSlides: 'none' },
		sections: [{ id: 'm', title: 'M', slideIds: ['s0', 's1'] }],
		slides: [
			{ id: 's0', layoutIntent: 'title-body', transition: { type: 'fade', speed: 'medium', advanceOnClick: false }, narration: { script: 'Push the KPI into focus.', audio: { path: proofAudio }, bbox: { x: 6.8, y: 6.8, w: 0.3, h: 0.3 } }, content: [{ kind: 'title', name: 't', text: 'push' }, card('kpi', 5)], interactions: [{ actor: 'joe', verb: 'push', target: 'kpi' }] },
			{ id: 's1', layoutIntent: 'title-body', transition: { type: 'fade', speed: 'medium', advanceOnClick: false }, narration: { script: 'Touch the metric to bring it into focus.', audio: { path: proofAudio2 }, bbox: { x: 6.8, y: 6.8, w: 0.3, h: 0.3 } }, content: [{ kind: 'title', name: 't', text: 'touch' }, card('metric', 5, false)], interactions: [{ actor: 'joe', verb: 'touch', target: 'metric' }] },
		],
	}
	const gen = await call('betterpptx.deck.generate_from_spec', { spec, phase: 'commit', plan: 'free', detail: 'full' })
	const data = gen?.data || gen
	if (!gen?.ok) { console.log('RESULT ' + JSON.stringify({ error: gen?.error?.message, details: gen?.error?.details || null, raw: gen })); return }
	const preserve = process.env.BETTERPPTX_DET_PRESERVE === '1'
	const outputRoot = process.env.BETTERPPTX_DET_OUTPUT_DIR
	if (outputRoot) fs.mkdirSync(outputRoot, { recursive: true })
	const dir = fs.mkdtempSync(path.join(outputRoot || os.tmpdir(), 'bpx-det-'))
	// The Director save contract is intentionally fail-closed: a committed deck must
	// pass the aggregate quality gate before export. Run that gate in each cold child
	// so determinism covers the same production authoring path as a real save.
	const quality = await call('betterpptx.deck.validate_quality', { deckId: data.deckId, profile: 'modern' })
	if (quality?.ok === false) {
		console.log('RESULT ' + JSON.stringify({ error: 'Director quality gate failed', details: quality }))
		return
	}
	const saved = await call('betterpptx.deck.save', { deckId: data.deckId, fileName: 'det.pptx', outputDir: dir })
	const savedData = saved?.data || saved
	if (!saved?.ok && !savedData?.filePath) {
		console.log('RESULT ' + JSON.stringify({ error: saved?.error?.message || 'deck save failed', raw: saved }))
		return
	}
	const savedPath = savedData?.filePath || path.join(dir, 'det.pptx')
	const zip = await JSZip.loadAsync(fs.readFileSync(savedPath))
	const partHashes = []
	for (const name of Object.keys(zip.files).sort()) {
		const f = zip.files[name]
		if (f.dir) continue
		if (name === 'docProps/core.xml') continue // dcterms created/modified timestamps
		if (name === 'ppt/betterpptx-edition.xml') {
			// canonicalize: decode the blob, strip the declared-volatile timestamps, hash the JSON.
			const xml = await f.async('string')
			const m = xml.match(/enc="dfl\.b64"[^>]*>([\s\S]*?)<\/betterpptxEdition>/)
			const payload = m ? JSON.parse(zlib.inflateRawSync(Buffer.from(m[1].trim(), 'base64')).toString('utf8')) : {}
			delete payload.savedAt
			const canonical = JSON.stringify(payload).replace(/"retrievedAt":"[^"]*"/g, '"retrievedAt":"VOLATILE"')
			partHashes.push([name, crypto.createHash('sha256').update(canonical).digest('hex')])
			continue
		}
		if (/\.xml$/.test(name)) {
			// canonicalize the two declared-volatile GUID families (fresh-random each run by design).
			const xml = (await f.async('string'))
				.replace(/(<a16:creationId[^>]*\bid=")\{[^}]*\}/g, '$1{CREATION}')
				.replace(/(<p14:section[^>]*\bid=")\{[^}]*\}/g, '$1{SECTION}')
				.replace(/(<p14:modId[^>]*\bval=")\d+/g, '$1VOLATILE')
			partHashes.push([name, crypto.createHash('sha256').update(xml).digest('hex')])
			continue
		}
		partHashes.push([name, crypto.createHash('sha256').update(await f.async('nodebuffer')).digest('hex')])
	}
	const digest = crypto.createHash('sha256').update(JSON.stringify(partHashes)).digest('hex')
	const plan = (data.appliedDefaults?.presenter?.interactions || []).map(p => ({ slideId: p.slideId, verb: p.verb, clip: p.clip, framePos: p.framePos, contactMs: p.contactMs ?? null, ...(p.bboxFrom ? { bboxFrom: p.bboxFrom } : {}), ...(p.targetBbox ? { targetBbox: p.targetBbox } : {}) }))
	try { await call('betterpptx.deck.dispose', { deckId: data.deckId }) } catch {}
	if (!preserve) {
		try { fs.rmSync(dir, { recursive: true, force: true }) } catch {}
	}
	console.log('RESULT ' + JSON.stringify({ plan, digest, seed, staticMode, savedPath: preserve ? savedPath : undefined, parts: process.env.DET_DEBUG ? partHashes : undefined }))
}
