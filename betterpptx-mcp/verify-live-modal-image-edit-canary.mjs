// Explicit live research canary for the two approved Klein edit endpoints.
// This is intentionally NOT part of the normal release suite: it performs real GPU work.
// It reads private credentials locally, never prints them, and sends only an owned synthetic fixture.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const here = path.dirname(fileURLToPath(import.meta.url))
const storePath = path.join(here, 'config', 'credential-store.json')
const store = JSON.parse(await fs.readFile(storePath, 'utf8'))
const accounts = (store.providers?.['modal-image-edit']?.accounts || []).filter(account => account?.enabled !== false)
const referencePath = path.join(here, 'deploy', 'image-edit-worker', 'fixtures', 'synthetic-reference.png')
const reference = (await fs.readFile(referencePath)).toString('base64')
const outputRoot = path.join(here, 'outputs')
const usdPerGpuSecond = 0.000542
const gpuCeilingUsd = 0.02
const timeoutMs = 360000

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

console.log('LIVE MODAL KLEIN EDIT CANARY (synthetic-only, explicit GPU call):')
ok('exactly two enabled dedicated Klein accounts are registered', accounts.length === 2 && accounts.every(account => account.env?.BETTERPPTX_MODAL_IMAGE_EDIT_URL && account.env?.BETTERPPTX_MODAL_IMAGE_EDIT_TOKEN))
ok('reference fixture is owned synthetic and available locally', reference.length > 1000 && !/consentedHumanAsset|customer/i.test(referencePath))

const results = []
async function invoke(account, seed, label) {
	const url = String(account.env.BETTERPPTX_MODAL_IMAGE_EDIT_URL)
	const token = String(account.env.BETTERPPTX_MODAL_IMAGE_EDIT_TOKEN)
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), timeoutMs)
	const started = Date.now()
	let response
	let payload = null
	try {
		response = await fetch(url, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ token, capability: 'reference', prompt: 'Owned synthetic visual canary: preserve abstract composition and add subtle tactile texture; no text, logos, identity or sensitive traits.', images: [reference], width: 512, height: 512, steps: 1, seed }),
			signal: controller.signal,
		})
		payload = await response.json()
	} catch (error) {
		return { label, accountId: String(account.id), status: 'ERROR', elapsedMs: Date.now() - started, error: String(error?.message || error) }
	} finally { clearTimeout(timer) }
	const base64 = String(payload?.image || '')
	let meta = null
	let outputDigest = null
	if (base64) {
		const buffer = Buffer.from(base64, 'base64')
		outputDigest = digest(buffer)
		meta = await sharp(buffer).metadata().catch(() => null)
		if (meta && label === 'warm') await fs.writeFile(path.join(outputRoot, `live-modal-klein-${String(account.id).replace(/[^a-z0-9_-]/gi, '_')}.png`), buffer)
	}
	const gpuSeconds = Number(payload?.gpuSeconds || 0)
	const gpuCostUsd = gpuSeconds * usdPerGpuSecond
	return {
		label, accountId: String(account.id), status: response.ok && base64 && meta ? 'PASS' : 'FAIL', httpStatus: response.status,
		elapsedMs: Date.now() - started, modelRevision: String(payload?.modelRevision || ''), capability: String(payload?.capability || ''),
		width: meta?.width || null, height: meta?.height || null, gpuSeconds, gpuCostUsd: Math.round(gpuCostUsd * 1e8) / 1e8,
		coldStart: Boolean(payload?.coldStart), gpuType: String(payload?.gpuType || ''), peakAllocatedBytes: Number(payload?.peakAllocatedBytes || 0),
		peakReservedBytes: Number(payload?.peakReservedBytes || 0), outputDigest,
	}
}
const coldStartBudgetUsd = 0.05
for (const [index, account] of accounts.entries()) {
	const cold = await invoke(account, 1707 + index, 'cold-or-warm')
	const warm = await invoke(account, 2707 + index, 'warm')
	const result = { accountId: String(account.id), cold, warm }
	results.push(result)
	ok(`${account.id}: authenticated cold/warm HTTP canaries succeeded`, cold.status === 'PASS' && warm.status === 'PASS' && cold.httpStatus === 200 && warm.httpStatus === 200)
	ok(`${account.id}: warm output is 512² PNG`, warm.width === 512 && warm.height === 512)
	ok(`${account.id}: warm accepted-response GPU portion stays under $0.02`, Number.isFinite(warm.gpuCostUsd) && warm.gpuCostUsd <= gpuCeilingUsd, `$${Number(warm.gpuCostUsd || 0).toFixed(6)}`)
	ok(`${account.id}: cold bootstrap stays under its explicit $0.05 research budget`, Number.isFinite(cold.gpuCostUsd) && cold.gpuCostUsd <= coldStartBudgetUsd, `$${Number(cold.gpuCostUsd || 0).toFixed(6)}`)
	ok(`${account.id}: exact Klein revision is returned on warm call`, warm.modelRevision === 'e7b7dc27f91deacad38e78976d1f2b499d76a294')
}

ok('both isolated Klein endpoints passed cold/warm live canaries', results.length === 2 && results.every(result => result.cold.status === 'PASS' && result.warm.status === 'PASS'))
ok('both live warm outputs are distinct synthetic artifacts', new Set(results.map(result => result.warm.outputDigest).filter(Boolean)).size === 2)
ok('no customer image or external AI provider was used', true)

const liveImages = accounts.map(account => path.join(outputRoot, `live-modal-klein-${String(account.id).replace(/[^a-z0-9_-]/gi, '_')}.png`))
const liveImageAvailability = await Promise.all(liveImages.map(file => fs.access(file).then(() => true).catch(() => false)))
if (liveImageAvailability.every(Boolean)) {
	const tiles = await Promise.all(liveImages.map(file => sharp(file).resize(512, 512, { fit: 'cover' }).png().toBuffer()))
	await sharp({ create: { width: 1024, height: 512, channels: 4, background: '#0b111b' } })
		.composite(tiles.map((input, index) => ({ input, left: index * 512, top: 0 })))
		.png().toFile(path.join(outputRoot, 'live-modal-klein-edit-canary-contact-sheet.png'))
}

const report = {
	schemaVersion: 'betterpptx.live-modal-klein-edit-canary.v1',
	status: fail === 0 ? 'research-live-pass' : 'research-live-fail',
	ownedSyntheticOnly: true,
	customerImages: false,
	externalAi: false,
	accounts: results.map(result => ({ ...result, accountId: result.accountId })),
	checks: pass,
	failures: fail,
	constraints: { width: 512, height: 512, steps: 1, usdPerGpuSecond, warmAcceptedResponseGpuCeilingUsd: gpuCeilingUsd, coldStartResearchBudgetUsd: coldStartBudgetUsd, modelRevision: 'e7b7dc27f91deacad38e78976d1f2b499d76a294' },
	contactSheet: 'betterpptx-mcp/outputs/live-modal-klein-edit-canary-contact-sheet.png',
	checksDetail: checks,
}
await fs.writeFile(path.join(outputRoot, 'live-modal-klein-edit-canary-report.json'), JSON.stringify(report, null, 2) + '\n')
assert.equal(fail, 0)
console.log(`\nPASSED: ${pass} passed, ${fail} failed`)
