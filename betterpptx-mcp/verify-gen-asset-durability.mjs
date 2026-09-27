// G3 GATE (durable, tenant-safe generated assets): with the store on the shared local backend,
// prove — in SEPARATE PROCESSES (== restart / cross-instance semantics for the disk backend) —
//   1. create on process A → persist                        (write-through)
//   2. read + FULL EMBED on cold process B                  (hydrate → spec compile → save)
//   3. another tenant is DENIED the same hash               (structural isolation)
//   4. idempotent re-persist                                (skipped:true, no double storage)
//   5. a corrupt/partial blob is a MISS, never a bad deck   (digest verification)
//   6. expiry sweep removes record + blobs                  (explicit retention)
// The GCS backend shares this exact code path (provider swap); its live probe belongs to the
// F1 canary. Uses only TRACKED bytes (assets/kinetic-clips.glb). Run:
//   node betterpptx-mcp/verify-gen-asset-durability.mjs
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import * as os from 'node:os'
import * as fs from 'node:fs'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(here, '..')
const SELF = fileURLToPath(import.meta.url)

if (process.argv[2]) { await child(process.argv[2]); process.exit(0) }

let pass = 0, fail = 0
const ok = (n, c, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}${c ? '' : ' ' + x}`) }
const sharedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bpx-g3-'))

function run(step, tenant) {
	const r = spawnSync(process.execPath, [SELF, step], {
		encoding: 'utf8', timeout: 300000,
		env: {
			...process.env,
			BETTERPPTX_GEN_ASSET_STORE: 'local',
			BETTERPPTX_GEN_ASSET_DIR: sharedDir,
			BETTERPPTX_GEN_ASSET_TENANT: tenant,
		},
	})
	const line = String(r.stdout || '').split(/\r?\n/).find(l => l.startsWith('RESULT '))
	if (!line) throw new Error(`child ${step} produced no RESULT (exit ${r.status}): ${String(r.stderr || r.stdout).slice(-400)}`)
	return JSON.parse(line.slice(7))
}

// 1. create + persist on process A (tenant t1)
const a = run('create', 't1')
ok('A: asset persisted to the durable store', a.persist?.ok === true && a.persist?.skipped === false, JSON.stringify(a))
ok('A: handle uses the generic scheme', /^gen:\/\/rigged3d\/[a-f0-9]{40}$/.test(a.handle))

// 2. COLD process B (same tenant): hydrate + FULL EMBED through the engine
const b = run(`embed:${a.hash}`, 't1')
ok('B (cold process, same tenant): hydrate returns the asset', b.hydrated === true)
ok('B: hydrated GLB bytes digest-match the original', b.glbSha === a.glbSha, `${b.glbSha} vs ${a.glbSha}`)
ok('B: FULL EMBED — cold generate_from_spec with the handle commits + saves', b.embed === true, JSON.stringify(b.embedErr || '').slice(0, 200))

// 3. cross-tenant denial
const c = run(`hydrate:${a.hash}`, 't2')
ok('C (other tenant): the same hash is a MISS — structurally denied', c.hydrated === false)

// 4. idempotent re-persist
const d = run(`repersist:${a.hash}`, 't1')
ok('D: re-persisting the identical asset is skipped (idempotent)', d.persist?.ok === true && d.persist?.skipped === true, JSON.stringify(d.persist))

// 5. corrupt blob → miss, never a corrupt read
const blobsDir = path.join(sharedDir, 'betterpptx-gen-assets', 'tenants', 't1', 'blobs')
const blobFiles = fs.readdirSync(blobsDir).filter(f => f.endsWith('.glb'))
ok('store layout: tenant-prefixed content-addressed blob exists', blobFiles.length >= 1)
const victim = path.join(blobsDir, blobFiles[0])
const original = fs.readFileSync(victim)
fs.writeFileSync(victim, original.subarray(0, Math.floor(original.length / 2))) // simulate a partial write
const e = run(`hydrate:${a.hash}`, 't1')
ok('E: corrupt/partial blob → asset is a MISS (digest verification), no crash', e.hydrated === false)
fs.writeFileSync(victim, original) // restore

// 6. expiry sweep
const f = run(`sweep:${a.hash}`, 't1')
ok('F: TTL sweep removes the asset', f.sweep?.removed >= 1 && f.hydratedAfter === false, JSON.stringify(f))

try { fs.rmSync(sharedDir, { recursive: true, force: true }) } catch {}
console.log(`\n${fail === 0 ? 'PASSED' : 'FAILED'}: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)

// ── child steps (each a FRESH process; the Map cache starts empty) ──────────
async function child(step) {
	Object.assign(process.env, {
		BETTERPPTX_ASSETS_ROOT: REPO, BETTERPPTX_ALLOW_PRIMITIVE_TOOLS: '1', BETTERPPTX_FREE_PREVIEW_SLIDES: '99',
		BETTERPPTX_DEV_ACCEPT_ANY_ACTIVATION_KEY: '1', BETTERPPTX_BILLING_ENFORCE: '0', BETTERPPTX_TOOL_TIMEOUT_MS: '600000',
		BETTERPPTX_CREDENTIAL_STORE: path.join(os.tmpdir(), `bpx-g3-${process.pid}.json`),
	})
	const prov = await import(`file://${here.replace(/\\/g, '/')}/assets/model3d-gen-providers.mjs`)
	const store = await import(`file://${here.replace(/\\/g, '/')}/storage/gen-asset-store.mjs`)
	const tenant = process.env.BETTERPPTX_GEN_ASSET_TENANT
	const sha = b => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16)

	if (step === 'create') {
		const glb = fs.readFileSync(path.join(here, 'assets', 'kinetic-clips.glb'))
		const { handle, hash } = prov.registerLocalRigged3d({ glbBase64: glb.toString('base64'), glbBytes: glb.length, clipMap: { idle: 0, greet: 2 }, basisKey: 'g3-gate-asset' })
		const persist = await prov.persistGeneratedRigged3d(hash, tenant)
		console.log('RESULT ' + JSON.stringify({ handle, hash, persist, glbSha: sha(glb) }))
		return
	}
	const [op, hash] = step.split(':')
	if (op === 'hydrate') {
		const entry = await prov.hydrateGeneratedRigged3d(hash, tenant)
		console.log('RESULT ' + JSON.stringify({ hydrated: !!entry }))
		return
	}
	if (op === 'repersist') {
		await prov.hydrateGeneratedRigged3d(hash, tenant)
		const persist = await prov.persistGeneratedRigged3d(hash, tenant)
		console.log('RESULT ' + JSON.stringify({ persist }))
		return
	}
	if (op === 'sweep') {
		const sweep = await store.sweepExpiredGenAssets({ tenantId: tenant, ttlMs: 0 })
		const entryAfter = await store.loadGeneratedAsset({ tenantId: tenant, hash })
		console.log('RESULT ' + JSON.stringify({ sweep, hydratedAfter: !!entryAfter }))
		return
	}
	if (op === 'embed') {
		const entry = await prov.hydrateGeneratedRigged3d(hash, tenant)
		const glbSha = entry?.glbBase64 ? sha(Buffer.from(entry.glbBase64, 'base64')) : null
		// FULL EMBED through the engine in this COLD process: the spec references the handle; the
		// generate handler's spec pre-hydration + the compile path must resolve it end-to-end.
		const engine = await import(`file://${here.replace(/\\/g, '/')}/engine.mjs`)
		const dispatcher = engine.createMcpToolDispatcher({ sessionId: `gen-asset-durability-${process.pid}` })
		const spec = {
			schemaVersion: 'betterpptx.deck-spec.v1', title: 'g3 gate', audience: 'gate', objective: 'durability',
			authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic', coordinateSystem: 'inches', layerModel: 'flat-object-array', objectIdentity: 'stable-names-required', textPolicy: 'Use textBox for standalone text and textShape for text inside a PowerPoint shape.', requires: ['slide.id', 'content[].name', 'slide.notes', 'validation before save'] },
			contentStory: { audience: 'gate', outcome: 'prove durable rigged asset hydration', remember: 'the same opaque handle rehydrates across a cold process' },
			visualDesign: { world: 'Quiet verification canvas', framing: 'clear title and native 3D model surface' },
			motionTime: { masterClock: 'authored slide timeline', timingSource: 'Authoring Excellence Motion/Time plan', syncPolicy: 'One governed clock coordinates builds and transitions.' },
			styleIntent: { density: 'medium' }, theme: { name: 'G', palette: ['0B1220', '2563EB', '14B8A6', 'F59E0B', 'F8FAFC'], fontFace: 'Aptos' },
			sections: [{ id: 'm', title: 'M', slideIds: ['s1'] }],
			slides: [{
				id: 's1', title: '3D', role: 'opener', message: '3D', layoutIntent: 'title-body', notes: 'g',
				content: [{ kind: 'title', name: 't', text: 'durable asset' }, { kind: 'model3d', name: 'host', model: `gen://rigged3d/${hash}` }],
			}],
		}
		const gen = await dispatcher.call('betterpptx.deck.generate_from_spec', { spec, phase: 'commit', plan: 'free', detail: 'summary' })
		const deckId = (gen?.data || gen)?.deckId
		let saved = false
		if (deckId) {
			const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bpx-g3-embed-'))
			const quality = await dispatcher.call('betterpptx.deck.validate_quality', { deckId })
			const save = await dispatcher.call('betterpptx.deck.save', { deckId, fileName: 'g3.pptx', outputDir: dir })
			saved = quality?.ok === true && save?.ok === true
			try { await dispatcher.call('betterpptx.deck.dispose', { deckId }) } catch {}
			try { fs.rmSync(dir, { recursive: true, force: true }) } catch {}
		}
		console.log('RESULT ' + JSON.stringify({ hydrated: !!entry, glbSha, embed: gen?.ok === true && saved, embedErr: gen?.error?.message }))
		return
	}
	throw new Error(`unknown step ${step}`)
}
