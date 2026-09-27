// IMG6 multi-case deterministic repair corpus. The callback is local and synthetic:
// it proves diagnosis, bounded acceptance and pixel evidence without pretending to
// be the calibrated Modal/provider callback. No human/customer input is used.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { fileURLToPath } from 'node:url'
import { applyImageOpsToBuffer } from './media/image-ops.mjs'
import { evaluateImageQuality } from './quality/image-quality-gates.mjs'
import { runProviderBackedImageRepair } from './quality/provider-repair.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..')
const source = fs.readFileSync(path.join(repo, 'betterpptx-mcp', 'outputs', 'img11-modal-canary-512-1707.png'))
const sourceDigest = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const ownedOcr = { status: 'complete', text: '' }

async function buildCutout(bytes) {
	const mask = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><circle cx="365" cy="195" r="148" fill="white"/><path d="M46 308 C160 230 254 350 350 362 C416 370 456 330 470 304 L470 468 L46 468 Z" fill="white"/></svg>')
	return sharp(bytes).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer()
}

function reportFor(bytes, request) {
	return evaluateImageQuality(bytes, { aspect: 'square', minWidth: 512, minHeight: 512, noText: true, ocr: ownedOcr, ...request })
}

const cases = [
	{
		id: 'texture', issue: 'MINIMUMVISUALINFORMATION',
		baseline: await sharp(source).blur(30).png().toBuffer(),
		request: { minEntropy: 6.8, minStdev: 4 },
		repair: async () => ({ bytes: source, costUsd: 0.001 }),
	},
	{
		id: 'quiet-space', issue: 'QUIETSPACE',
		baseline: (await applyImageOpsToBuffer(source, [{ op: 'highlightRegion', x: 0, y: 0, w: 45, h: 100, color: '#F59E0B', thickness: 24 }])).buffer,
		request: { quietRegion: { x: 0, y: 0, w: 45, h: 100 }, maxQuietEdgeDensity: 0.1, maxQuietOccupancy: 0.72 },
		repair: async () => ({ bytes: source, costUsd: 0.001 }),
	},
	{
		id: 'alpha-integrity', issue: 'ALPHAINTEGRITY',
		baseline: source,
		request: { cutout: true, minAlphaCoverage: 0.01, maxAlphaCoverage: 0.995, minAlphaEdgeDensity: 0.001 },
		repair: async () => ({ bytes: await buildCutout(source), costUsd: 0.001 }),
	},
]

let pass = 0
let fail = 0
const ok = (name, condition, detail = '') => { if (condition) { pass++; console.log(`  ok   ${name}`) } else { fail++; console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) } }
console.log('IMG6 SEEDED MULTI-CASE REPAIR CORPUS (owned synthetic, deterministic evaluator):')
const records = []
for (const item of cases) {
	const baselineQuality = await reportFor(item.baseline, item.request)
	const result = await runProviderBackedImageRepair({
		initialCandidate: { id: `${item.id}-baseline`, bytes: item.baseline },
		maxAttempts: 1,
		costCeilingUsd: 0.02,
		evaluate: async candidate => {
			const quality = await reportFor(candidate.bytes, item.request)
			return { status: quality.status, deterministic: { status: quality.status, checks: quality.checks, blockingIssues: quality.blockingIssues }, semantic: { status: 'abstain' }, score: quality.status === 'pass' ? 1 : 0.5, measurements: quality.measurements }
		},
		generate: async () => item.repair(),
	})
	const repaired = result.bestCandidate?.bytes
	const repairedQuality = repaired ? await reportFor(repaired, item.request) : null
	const record = { id: item.id, issue: item.issue, baselineSha256: sourceDigest(item.baseline), repairedSha256: repaired ? sourceDigest(repaired) : null, baselineStatus: baselineQuality.status, repairedStatus: repairedQuality?.status || 'missing', attempts: result.attempts, totalCostUsd: result.totalCostUsd, inputKind: 'owned-synthetic', customerImages: false, trainingEnabled: false }
	records.push(record)
	ok(`${item.id} starts with the declared failing gate`, baselineQuality.status === 'fail' && baselineQuality.blockingIssues.includes(item.issue))
	ok(`${item.id} diagnosis selects a bounded repair action`, result.attempts[0]?.action && result.attempts[0]?.status === 'accepted')
	ok(`${item.id} repair passes the same hard evaluator`, result.status === 'complete' && repairedQuality?.status === 'pass')
	ok(`${item.id} accepted candidate has a distinct digest`, record.baselineSha256 !== record.repairedSha256)
}
ok('multi-case corpus exercises three distinct diagnosed failures', new Set(records.map(record => record.issue)).size === 3)
ok('at least 80% of repair attempts improve and are accepted', records.filter(record => record.repairedStatus === 'pass' && record.baselineStatus === 'fail').length / records.length >= 0.8)
ok('all repair attempts remain within the one-attempt/cost ceiling', records.every(record => record.attempts.length <= 1 && record.totalCostUsd <= 0.02))
ok('corpus records contain no provider/model or private-path provenance', !JSON.stringify(records).match(/modal|flux|betterpptx-mcp|claude|gpt/i))

// Contact sheet is intentionally visual evidence, not a semantic acceptance claim.
const tiles = []
for (const item of cases) {
	const result = records.find(record => record.id === item.id)
	const repaired = result?.repairedSha256 === sourceDigest(source) ? source : item.id === 'alpha-integrity' ? await buildCutout(source) : source
	const [left, right] = await Promise.all([sharp(item.baseline).resize(256, 256).png().toBuffer(), sharp(repaired).resize(256, 256).png().toBuffer()])
	tiles.push({ input: left, left: (tiles.length % 3) * 512, top: Math.floor(tiles.length / 3) * 512 })
	tiles.push({ input: right, left: (tiles.length % 3) * 512, top: Math.floor(tiles.length / 3) * 512 })
}
const contactSheet = await sharp({ create: { width: 1536, height: 1024, channels: 3, background: '#0B1220' } }).composite(tiles).png().toBuffer()
const outputDir = path.join(repo, 'betterpptx-mcp', 'outputs')
fs.writeFileSync(path.join(outputDir, 'img6-repair-multicase-contact-sheet.png'), contactSheet)
fs.writeFileSync(path.join(outputDir, 'img6-repair-multicase-report.json'), JSON.stringify({ schemaVersion: 'betterpptx.image-repair-multicase.v1', corpusKind: 'owned-synthetic', customerImages: false, trainingEnabled: false, records }, null, 2) + '\n')

assert.equal(fail, 0)
console.log(`\n${fail ? 'FAILED' : 'PASSED'}: ${pass} passed, ${fail} failed`)
