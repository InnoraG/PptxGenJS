// Durable generated-image gate. Separate child processes prove restart/cross-instance hydration,
// tenant isolation, full PPTX embedding, idempotent persistence, corruption rejection, and TTL.
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
const ok = (name, condition, detail = '') => {
	if (condition) { pass++; console.log(`  ok   ${name}`) }
	else { fail++; console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}
const sharedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bpx-image-durable-'))

function run(step, tenant) {
	const result = spawnSync(process.execPath, [SELF, step], {
		encoding: 'utf8', timeout: 300000,
		env: {
			...process.env,
			BETTERPPTX_GEN_ASSET_STORE: 'local',
			BETTERPPTX_GEN_ASSET_DIR: sharedDir,
			BETTERPPTX_GEN_ASSET_TENANT: tenant,
		},
	})
	const line = String(result.stdout || '').split(/\r?\n/).find(value => value.startsWith('RESULT '))
	if (!line) throw new Error(`child ${step} produced no RESULT (exit ${result.status}): ${String(result.stderr || result.stdout).slice(-500)}`)
	return JSON.parse(line.slice(7))
}

console.log('GENERATED IMAGE DURABILITY (separate processes):')
const a = run('create', 'tenant-a')
ok('process A persists image bytes and private metadata', a.persist?.ok === true && a.persist?.skipped === false, JSON.stringify(a.persist))
ok('handle uses the generic provider-free scheme', /^gen:\/\/image\/[a-f0-9]{40}$/.test(a.handle))

const b = run(`embed:${a.hash}`, 'tenant-a')
ok('cold process B hydrates the same tenant asset', b.hydrated === true)
ok('hydrated bytes digest-match the original', b.imageSha === a.imageSha, `${b.imageSha} vs ${a.imageSha}`)
ok('cold process B fully commits and saves a PPTX using the handle', b.embed === true, b.embedErr || '')

const c = run(`hydrate:${a.hash}`, 'tenant-b')
ok('another tenant cannot hydrate the same hash', c.hydrated === false)

const d = run(`repersist:${a.hash}`, 'tenant-a')
ok('re-persist is idempotent and skips duplicate storage', d.persist?.ok === true && d.persist?.skipped === true, JSON.stringify(d.persist))

const blobsDir = path.join(sharedDir, 'betterpptx-gen-assets', 'tenants', 'tenant-a', 'blobs')
const blobs = fs.readdirSync(blobsDir).filter(file => /\.(png|jpg|jpeg|webp)$/i.test(file))
ok('tenant-prefixed content-addressed image blob exists', blobs.length >= 1)
const victim = path.join(blobsDir, blobs[0])
const original = fs.readFileSync(victim)
fs.writeFileSync(victim, original.subarray(0, Math.max(1, Math.floor(original.length / 2))))
const e = run(`hydrate:${a.hash}`, 'tenant-a')
ok('corrupt/partial blob becomes a safe miss', e.hydrated === false)
fs.writeFileSync(victim, original)

const f = run(`sweep:${a.hash}`, 'tenant-a')
ok('retention sweep removes record and blob access', f.sweep?.removed >= 1 && f.hydratedAfter === false, JSON.stringify(f))

try { fs.rmSync(sharedDir, { recursive: true, force: true }) } catch {}
console.log(`\n${fail ? 'FAILED' : 'PASSED'}: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)

async function child(step) {
	Object.assign(process.env, {
		BETTERPPTX_ASSETS_ROOT: REPO,
		BETTERPPTX_FREE_PREVIEW_SLIDES: '99',
		BETTERPPTX_BILLING_ENFORCE: '0',
		BETTERPPTX_CREDENTIAL_STORE: path.join(os.tmpdir(), `bpx-image-durable-creds-${process.pid}.json`),
	})
	const provider = await import(`file://${here.replace(/\\/g, '/')}/assets/image-gen-providers.mjs`)
	const store = await import(`file://${here.replace(/\\/g, '/')}/storage/gen-asset-store.mjs`)
	const tenant = process.env.BETTERPPTX_GEN_ASSET_TENANT
	const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 16)

	if (step === 'create') {
		const prompt = 'durable contextual image fixture'
		const hash = provider.promptHashFor({ prompt, aspect: 'landscape', style: 'illustration', steps: 4 })
		const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8Dwn4GBgYGJAQgAJw4DA1U01/kAAAAASUVORK5CYII='
		provider.cacheGeneratedImage({
			promptHash: hash, dataUri: `data:image/png;base64,${base64}`, contentType: 'image/png',
			width: 1280, height: 768, provider: 'private-fixture', model: 'private-fixture',
			license: { license: 'Apache-2.0', attributionRequired: false, commercialUse: 'allowed' },
		})
		const persist = await provider.persistGeneratedImage(hash, tenant)
		console.log('RESULT ' + JSON.stringify({ handle: `gen://image/${hash}`, hash, persist, imageSha: digest(Buffer.from(base64, 'base64')) }))
		return
	}
	const [operation, hash] = step.split(':')
	if (operation === 'hydrate') {
		const entry = await provider.hydrateGeneratedImage(hash, tenant)
		console.log('RESULT ' + JSON.stringify({ hydrated: Boolean(entry) }))
		return
	}
	if (operation === 'repersist') {
		await provider.hydrateGeneratedImage(hash, tenant)
		const persist = await provider.persistGeneratedImage(hash, tenant)
		console.log('RESULT ' + JSON.stringify({ persist }))
		return
	}
	if (operation === 'sweep') {
		const sweep = await store.sweepExpiredGenAssets({ tenantId: tenant, ttlMs: 0 })
		const after = await store.loadGeneratedAsset({ tenantId: tenant, hash })
		console.log('RESULT ' + JSON.stringify({ sweep, hydratedAfter: Boolean(after) }))
		return
	}
	if (operation === 'embed') {
		const entry = await provider.hydrateGeneratedImage(hash, tenant)
		const raw = String(entry?.dataUri || '').split(',')[1] || ''
		const imageSha = raw ? digest(Buffer.from(raw, 'base64')) : null
		const engine = await import(`file://${here.replace(/\\/g, '/')}/engine.mjs`)
		const dispatcher = engine.createMcpToolDispatcher({ sessionId: `generated-image-durability-${process.pid}` })
		const spec = {
			schemaVersion: 'betterpptx.deck-spec.v1', title: 'durable image gate', audience: 'gate', objective: 'durability',
			authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic', coordinateSystem: 'inches', layerModel: 'flat-object-array', objectIdentity: 'stable-names-required', textPolicy: 'Use textBox for standalone text and textShape for text inside a PowerPoint shape.', requires: ['slide.id', 'content[].name', 'slide.notes', 'validation before save'] },
			contentStory: { audience: 'gate', outcome: 'prove durable generated-image hydration', remember: 'the same opaque handle rehydrates across a cold process' },
			visualDesign: { world: 'Quiet verification canvas', framing: 'clear title and image hierarchy' },
			motionTime: { masterClock: 'authored slide timeline', timingSource: 'Authoring Excellence Motion/Time plan', syncPolicy: 'One governed clock coordinates builds and transitions.' },
			styleIntent: { density: 'medium' }, theme: { name: 'G', palette: ['0B1220', '2563EB', '14B8A6', 'F59E0B', 'F8FAFC'], fontFace: 'Aptos' },
			sections: [{ id: 'm', title: 'M', slideIds: ['s1'] }],
			slides: [{ id: 's1', title: 'Image', role: 'opener', message: 'Image', layoutIntent: 'title-body', notes: 'gate', content: [
				{ kind: 'title', name: 'title', text: 'Durable image' },
				{ kind: 'image', name: 'hero', image: `gen://image/${hash}` },
			] }],
		}
		const generated = await dispatcher.call('betterpptx.deck.generate_from_spec', { spec, phase: 'commit', plan: 'free', detail: 'summary' })
		const data = generated?.data || generated || {}
		let saved = false
		if (data.deckId) {
			const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bpx-image-embed-'))
			const quality = await dispatcher.call('betterpptx.deck.validate_quality', { deckId: data.deckId })
			const save = await dispatcher.call('betterpptx.deck.save', { deckId: data.deckId, fileName: 'durable-image.pptx', outputDir })
			saved = quality?.ok === true && save?.ok === true
			try { await dispatcher.call('betterpptx.deck.dispose', { deckId: data.deckId }) } catch {}
			try { fs.rmSync(outputDir, { recursive: true, force: true }) } catch {}
		}
		console.log('RESULT ' + JSON.stringify({ hydrated: Boolean(entry), imageSha, embed: generated?.ok === true && saved, embedErr: generated?.error?.message }))
		return
	}
	throw new Error(`unknown step ${step}`)
}
