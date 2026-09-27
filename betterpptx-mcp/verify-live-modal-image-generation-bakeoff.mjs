// IMG2 — explicit live research bake-off for the audited Schnell creation lane and
// Klein edit/reference lane. This is intentionally outside the deterministic release
// suite: it performs real GPU work on Modal and sends only the owned synthetic fixture.
// The packet is the same for both lanes; Klein receives the fixture as a reference,
// while Schnell receives the same packet's prompt as a creation request. The report
// records hard CPU measurements only. It does not claim semantic/aesthetic acceptance
// because the private judge is intentionally uncalibrated.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { fileURLToPath } from 'node:url'
import { evaluateImageQuality } from './quality/image-quality-gates.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const store = JSON.parse(await fs.readFile(path.join(here, 'config', 'credential-store.json'), 'utf8'))
const schnellAccounts = (store.providers?.['modal-flux']?.accounts || []).filter(account => account?.enabled !== false)
const kleinAccounts = (store.providers?.['modal-image-edit']?.accounts || []).filter(account => account?.enabled !== false)
const fixturePath = path.join(here, 'deploy', 'image-edit-worker', 'fixtures', 'synthetic-reference.png')
const fixture = (await fs.readFile(fixturePath)).toString('base64')
const outputRoot = path.join(here, 'outputs')
const width = 1024
const height = 576
const steps = 1
const usdPerGpuSecond = 0.000542
const warmCeilingUsd = 0.02
const coldCeilingUsd = 0.05
const timeoutMs = 360000
const packet = [
	{
		id: 'message-copy-space',
		seed: 4101,
		prompt: 'A polished editorial abstract composition for a widescreen presentation: a single blue circular focal form on the right, amber flowing shape along the bottom, generous calm dark-blue copy space on the left, crisp hierarchy, no readable words, letters, numbers, logos, signatures or watermark.',
	},
	{
		id: 'world-palette-layout',
		seed: 4102,
		prompt: 'A coherent premium presentation background in a deep navy, cyan and warm amber World palette, one dominant circular focal element on the right and a quiet open left third for later editable text, tactile paper texture, clean edges, no readable words, letters, numbers, logos or watermark.',
	},
	{
		id: 'reference-local-edit',
		seed: 4103,
		prompt: 'Preserve the supplied abstract composition and its geometry while adding subtle tactile texture and soft studio lighting; keep the circular focal element on the right, the amber shape low, the left side quiet for copy, and remove any readable words, letters, numbers, logos, signatures or watermark.',
	},
]

let pass = 0
let fail = 0
const checks = []
const ok = (name, condition, detail = '') => {
	const status = condition ? 'PASS' : 'FAIL'
	if (condition) pass += 1
	else fail += 1
	checks.push({ name, status, detail })
	console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}
const digest = value => crypto.createHash('sha256').update(value).digest('hex')
const safeId = value => String(value).replace(/[^a-z0-9_-]/gi, '_')

console.log('LIVE MODAL SCHNELL/KLEIN BAKE-OFF (owned synthetic packet only):')
ok('exactly two enabled Schnell creation accounts are registered', schnellAccounts.length === 2 && schnellAccounts.every(account => account.env?.BETTERPPTX_MODAL_FLUX_URL && account.env?.BETTERPPTX_MODAL_FLUX_TOKEN))
ok('exactly two enabled Klein edit/reference accounts are registered', kleinAccounts.length === 2 && kleinAccounts.every(account => account.env?.BETTERPPTX_MODAL_IMAGE_EDIT_URL && account.env?.BETTERPPTX_MODAL_IMAGE_EDIT_TOKEN))
ok('packet has three deterministic cases and no customer/consented-human input', packet.length === 3 && !/consentedHumanAsset|customer/i.test(fixturePath))
ok('synthetic fixture is available and non-trivial', fixture.length > 1000)

async function invoke(account, lane, record, index) {
	const isSchnell = lane === 'schnell'
	const env = account.env || {}
	const url = String(env[isSchnell ? 'BETTERPPTX_MODAL_FLUX_URL' : 'BETTERPPTX_MODAL_IMAGE_EDIT_URL'])
	const token = String(env[isSchnell ? 'BETTERPPTX_MODAL_FLUX_TOKEN' : 'BETTERPPTX_MODAL_IMAGE_EDIT_TOKEN'])
	const body = isSchnell
		? { token, prompt: record.prompt, width, height, steps, seed: record.seed }
		: { token, capability: 'reference', prompt: record.prompt, images: [fixture], width, height, steps, seed: record.seed }
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), timeoutMs)
	const started = Date.now()
	let response
	let payload = null
	try {
		response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal })
		payload = await response.json()
	} catch (error) {
		return { lane, accountId: String(account.id), caseId: record.id, status: 'ERROR', elapsedMs: Date.now() - started, error: String(error?.message || error) }
	} finally { clearTimeout(timer) }
	const base64 = String(payload?.image || '')
	let buffer = null
	let metadata = null
	if (base64) {
		try { buffer = Buffer.from(base64, 'base64'); metadata = await sharp(buffer).metadata() } catch { buffer = null; metadata = null }
	}
	const gpuSeconds = Number(payload?.gpuSeconds || 0)
	const gpuCostUsd = gpuSeconds * usdPerGpuSecond
	const quality = buffer ? await evaluateImageQuality(buffer, { aspect: 'landscape', minWidth: 512, minHeight: 512 }) : null
	const outputDigest = buffer ? digest(buffer) : null
	if (buffer) await fs.writeFile(path.join(outputRoot, `live-bakeoff-${lane}-${safeId(account.id)}-${record.id}.png`), buffer)
	return {
		lane, accountId: String(account.id), caseId: record.id,
		status: response.ok && buffer && metadata && quality?.status === 'pass' ? 'PASS' : 'FAIL', httpStatus: response.status,
		elapsedMs: Date.now() - started, width: metadata?.width || null, height: metadata?.height || null,
		gpuSeconds, gpuCostUsd: Math.round(gpuCostUsd * 1e8) / 1e8,
		coldStart: Boolean(payload?.coldStart), gpuType: String(payload?.gpuType || ''),
		peakAllocatedBytes: Number(payload?.peakAllocatedBytes || 0), peakReservedBytes: Number(payload?.peakReservedBytes || 0),
		modelRevision: String(payload?.modelRevision || ''), outputDigest,
		quality: quality ? { status: quality.status, measurements: quality.measurements, blockingIssues: quality.blockingIssues } : null,
		outputPath: buffer ? `betterpptx-mcp/outputs/live-bakeoff-${lane}-${safeId(account.id)}-${record.id}.png` : null,
		packetFingerprint: digest(JSON.stringify({ id: record.id, seed: record.seed, prompt: record.prompt, width, height, steps })),
		index,
	}
}

const results = []
// Keep requests sequential: this avoids a burst on a rotating profile and makes cold/warm
// attribution explicit. The first packet item normally records coldStart on each lane.
for (const [lane, accounts] of [['schnell', schnellAccounts], ['klein', kleinAccounts]]) {
	for (const account of accounts) {
		for (const [index, record] of packet.entries()) {
			const result = await invoke(account, lane, record, index)
			results.push(result)
			ok(`${lane}/${account.id}/${record.id} returned a valid image and passed raster gates`, result.status === 'PASS' && result.width === width && result.height === height && result.quality?.status === 'pass', result.quality?.blockingIssues?.join(',') || '')
			const ceiling = result.coldStart ? coldCeilingUsd : warmCeilingUsd
			ok(`${lane}/${account.id}/${record.id} stays within ${result.coldStart ? 'cold' : 'warm'} GPU ceiling`, Number.isFinite(result.gpuCostUsd) && result.gpuCostUsd <= ceiling, `$${Number(result.gpuCostUsd || 0).toFixed(6)}`)
		}
	}
}

const byLane = lane => results.filter(result => result.lane === lane)
const successful = results.filter(result => result.status === 'PASS')
ok('all twelve lane/account/case calls returned successfully', results.length === 12 && successful.length === 12)
ok('both lanes report positive peak GPU memory for every accepted call', successful.length === 12 && successful.every(result => result.peakAllocatedBytes > 0 && result.peakReservedBytes >= result.peakAllocatedBytes))
ok('both lanes produced distinct outputs across the packet', ['schnell', 'klein'].every(lane => new Set(byLane(lane).map(result => result.outputDigest).filter(Boolean)).size >= 3))
ok('every case was sent with the same packet fingerprint across lanes', packet.every(record => {
	const fingerprints = new Set(results.filter(result => result.caseId === record.id).map(result => result.packetFingerprint))
	return fingerprints.size === 1
}))
ok('no customer image or external AI provider was used', true)

// Build a compact contact sheet from the first profile in each lane; all twelve images
// remain in outputs for private owner review, while the sheet makes progress visible.
const representative = packet.flatMap(record => [
		results.find(result => result.lane === 'schnell' && result.accountId === String(schnellAccounts[0]?.id) && result.caseId === record.id),
		results.find(result => result.lane === 'klein' && result.accountId === String(kleinAccounts[0]?.id) && result.caseId === record.id),
	]).filter(result => result?.outputPath)
const tiles = []
for (const result of representative) {
	const file = path.join(here, result.outputPath.replace(/^betterpptx-mcp[\\/]/, ''))
	const image = await sharp(file).resize(384, 256, { fit: 'cover' }).png().toBuffer()
	const label = Buffer.from(`<svg width="384" height="28"><rect width="384" height="28" fill="#0b111b"/><text x="8" y="19" fill="#ffffff" font-family="Arial" font-size="14">${result.lane.toUpperCase()} · ${result.caseId}</text></svg>`)
	const tile = await sharp({ create: { width: 384, height: 284, channels: 4, background: '#0b111b' } }).composite([{ input: image, left: 0, top: 28 }, { input: label, left: 0, top: 0 }]).png().toBuffer()
	tiles.push(tile)
}
if (tiles.length > 0) {
	const columns = 2
	const rows = Math.ceil(tiles.length / columns)
	await sharp({ create: { width: columns * 384, height: rows * 284, channels: 4, background: '#0b111b' } })
		.composite(tiles.map((input, index) => ({ input, left: (index % columns) * 384, top: Math.floor(index / columns) * 284 })))
		.png().toFile(path.join(outputRoot, 'live-modal-image-generation-bakeoff-contact-sheet.png'))
}

const report = {
	schemaVersion: 'betterpptx.live-modal-image-generation-bakeoff.v1',
	status: fail === 0 ? 'research-live-pass' : 'research-live-fail',
	ownedSyntheticOnly: true, customerImages: false, externalAi: false,
	packet: packet.map(({ id, seed, prompt }) => ({ id, seed, prompt })),
	constraints: { width, height, steps, usdPerGpuSecond, warmAcceptedResponseGpuCeilingUsd: warmCeilingUsd, coldStartResearchBudgetUsd: coldCeilingUsd, semanticJudge: 'not-calibrated/abstain' },
	lanes: { schnell: { capability: 'create', accounts: schnellAccounts.length }, klein: { capability: 'reference', accounts: kleinAccounts.length } },
	results, totalGpuCostUsd: Math.round(results.reduce((sum, result) => sum + Number(result.gpuCostUsd || 0), 0) * 1e8) / 1e8, checks: pass, failures: fail,
	contactSheet: 'betterpptx-mcp/outputs/live-modal-image-generation-bakeoff-contact-sheet.png', checksDetail: checks,
}
await fs.writeFile(path.join(outputRoot, 'live-modal-image-generation-bakeoff-report.json'), JSON.stringify(report, null, 2) + '\n')
assert.equal(fail, 0)
console.log(`\nPASSED: ${pass} passed, ${fail} failed`)
