// IMG11 reviewer-ready visual packet. Owned synthetic rasters only; no labels are
// fabricated and no customer/consented-human asset is read or uploaded.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { fileURLToPath } from 'node:url'
import { buildBlindReviewPacket, REVIEW_DIMENSIONS, validateBlindReviewLabels } from './quality/blind-review-packet.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const fixtureRoot = path.join(here, 'deploy', 'image-edit-worker', 'fixtures')
const outputRoot = path.join(here, 'outputs', 'img11-blind-review')
await fs.mkdir(outputRoot, { recursive: true })
const [reference, style] = await Promise.all([
	fs.readFile(path.join(fixtureRoot, 'synthetic-reference.png')),
	fs.readFile(path.join(fixtureRoot, 'synthetic-style-reference.png')),
])
const records = Array.from({ length: 20 }, (_, index) => ({
	id: `c${String(index + 1).padStart(2, '0')}`,
	aspect: index % 2 ? 'portrait' : 'landscape',
	series: `series-${index % 4}`,
}))
const packet = buildBlindReviewPacket({ records, reviewerCount: 2, minRecords: 20 })
const esc = value => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))
const assets = []
for (const [index, record] of records.entries()) {
	const source = index % 2 ? style : reference
	const angle = [-4, 0, 3, 0, -2][index % 5]
	const brightness = [0.9, 1.0, 1.08, 0.96, 1.04][index % 5]
	const saturation = [0.85, 1.0, 1.16, 0.92, 1.08][index % 5]
	const hue = ['#2563eb', '#0f766e', '#ea580c', '#7c3aed', '#b45309'][index % 5]
	const labelSvg = Buffer.from(`<svg width="240" height="180"><rect x="0" y="0" width="240" height="180" fill="none" stroke="${hue}" stroke-width="6"/><rect x="8" y="8" width="42" height="24" rx="5" fill="#09101a"/><text x="18" y="25" fill="#ffffff" font-family="Arial" font-size="14">${record.id.toUpperCase()}</text></svg>`)
	const out = await sharp(source)
		.resize(224, 164, { fit: 'cover' })
		.modulate({ brightness, saturation })
		.rotate(angle, { background: '#0b111b' })
		.extend({ top: 8, bottom: 8, left: 8, right: 8, background: '#0b111b' })
		.resize(240, 180, { fit: 'fill' })
		.composite([{ input: labelSvg }])
		.png()
		.toBuffer()
	const fileName = `${record.id}.png`
	await fs.writeFile(path.join(outputRoot, fileName), out)
	assets.push({ ...record, fileName, sha256: crypto.createHash('sha256').update(out).digest('hex') })
}
const tiles = await Promise.all(assets.map(asset => fs.readFile(path.join(outputRoot, asset.fileName))))
const contact = await sharp({ create: { width: 1200, height: 720, channels: 4, background: '#0b111b' } })
	.composite(tiles.map((input, index) => ({ input, left: (index % 5) * 240, top: Math.floor(index / 5) * 180 })))
	.png()
	.toBuffer()
await fs.writeFile(path.join(here, 'outputs', 'img11-blind-review-contact-sheet.png'), contact)

const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BetterPPTX blind visual review</title><style>body{font:14px system-ui;background:#0b111b;color:#f4f7fb;margin:24px}h1{margin:0 0 6px}.note{color:#a9b9ce;max-width:900px}.reviewer{border:1px solid #30445e;border-radius:12px;padding:16px;margin:18px 0;background:#121a27}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.card{background:#0d141f;border:1px solid #29384d;border-radius:8px;padding:8px}.card img{width:100%;aspect-ratio:4/3;object-fit:cover;display:block}.score{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-top:6px}.score label{font-size:11px;color:#b4c3d8}.score input{width:100%;box-sizing:border-box}button{background:#46d39a;color:#07130f;border:0;border-radius:6px;padding:8px 12px;font-weight:700;cursor:pointer}@media(max-width:900px){.grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:600px){.grid{grid-template-columns:1fr}}</style><body data-customer-images="false" data-owned-synthetic-only="true"><h1>Blind visual review packet</h1><p class="note">Private research packet. Rate each visual from 1–5 for message fit, composition, World fit and series coherence. Do not infer identity or sensitive traits. No labels are prefilled. Each reviewer exports a JSON file locally; the packet never calls an external AI service.</p>${[1, 2].map(reviewer => `<section class="reviewer"><h2>Reviewer ${reviewer}</h2><div class="grid">${assets.map(asset => `<article class="card" data-id="${packet.records.find(record => record.id.endsWith(asset.id.slice(-2)))?.id || ''}"><img src="${asset.fileName}" alt="Owned synthetic visual ${asset.id}"><div class="score">${REVIEW_DIMENSIONS.map(dimension => `<label>${dimension}<input required type="number" min="1" max="5" step="1" name="${reviewer}:${asset.id}:${dimension}"></label>`).join('')}</div></article>`).join('')}</div><p><button type="button" data-export="${reviewer}">Export reviewer ${reviewer} labels</button></p></section>`).join('')}<script>for(const button of document.querySelectorAll('[data-export]'))button.addEventListener('click',()=>{const reviewer=button.dataset.export;const labels=[...button.closest('.reviewer').querySelectorAll('.card')].map(card=>{const row={id:card.dataset.id};for(const d of ['messageFit','composition','worldFit','seriesCoherence']){const input=[...card.querySelectorAll('input')].find(item=>item.name.startsWith(reviewer+':')&&item.name.endsWith(':'+d));row[d]=Number(input?.value||0)}return row});const blob=new Blob([JSON.stringify({reviewer,labels},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='blind-review-'+reviewer+'.json';a.click();URL.revokeObjectURL(a.href)})</script></body></html>`
await fs.writeFile(path.join(here, 'outputs', 'img11-blind-review.html'), html)
const machinePacket = { ...packet, assets: assets.map(({ fileName, sha256, ...record }) => ({ ...record, fileName, sha256 })), contactSheet: 'betterpptx-mcp/outputs/img11-blind-review-contact-sheet.png', htmlPacket: 'betterpptx-mcp/outputs/img11-blind-review.html' }
await fs.writeFile(path.join(here, 'outputs', 'img11-blind-review-packet.json'), JSON.stringify(machinePacket, null, 2) + '\n')

let pass = 0
let fail = 0
const ok = (name, condition, detail = '') => { if (condition) { pass++; console.log(`  ok   ${name}`) } else { fail++; console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) } }
console.log('IMG11 REVIEWER-READY VISUAL PACKET (owned synthetic, no labels):')
ok('packet is ready for two independent reviewers', packet.status === 'ready-for-independent-review' && packet.reviewerCount === 2)
ok('packet has 20 distinct visual assets', assets.length === 20 && new Set(assets.map(asset => asset.sha256)).size === 20)
ok('contact sheet and all image files are written', (await fs.stat(path.join(here, 'outputs', 'img11-blind-review-contact-sheet.png'))).size > 1000 && assets.every(asset => fs.stat(path.join(outputRoot, asset.fileName))))
ok('HTML exposes two reviewer slots and all rubric dimensions', html.includes('Reviewer 1') && html.includes('Reviewer 2') && REVIEW_DIMENSIONS.every(dimension => html.includes(`>${dimension}<`)))
ok('HTML is explicitly synthetic/private and has no customer-image path', html.includes('data-customer-images="false"') && html.includes('data-owned-synthetic-only="true"') && !/consentedHumanAsset|customer\.png|modal|flux|qwen|huggingface/i.test(html))
ok('local reviewer export handler is scoped per reviewer', html.includes("closest('.reviewer')") && html.includes("download='blind-review-" ) && html.includes("startsWith(reviewer+':')"))
ok('HTML contains exactly two export controls and 40 blinded cards', (html.match(/data-export=/g) || []).length === 2 && (html.match(/data-id=/g) || []).length === 40)
ok('HTML contains four required score inputs per card', (html.match(/type="number"/g) || []).length === 160)
ok('no judge or human labels are fabricated', packet.humanLabelsIncluded === false && packet.judgeLabelsIncluded === false && validateBlindReviewLabels(packet, []).status === 'blocked-missing-independent-labels')
ok('machine packet keeps opaque blind IDs and private asset digests', machinePacket.records.every(record => /^blind:\/\/[a-f0-9]{20}$/.test(record.id)) && machinePacket.assets.length === 20)
const report = { schemaVersion: 'betterpptx.img11-blind-review-visual-packet.v1', ownedSyntheticOnly: true, customerImages: false, externalAi: false, labelsIncluded: false, reviewerCount: 2, recordCount: 20, assets: assets.length, checks: pass, failures: fail, contactSheet: 'betterpptx-mcp/outputs/img11-blind-review-contact-sheet.png', htmlPacket: 'betterpptx-mcp/outputs/img11-blind-review.html' }
await fs.writeFile(path.join(here, 'outputs', 'img11-blind-review-visual-report.json'), JSON.stringify(report, null, 2) + '\n')
assert.equal(fail, 0)
console.log(`\n${fail ? 'FAILED' : 'PASSED'}: ${pass} passed, ${fail} failed`)
