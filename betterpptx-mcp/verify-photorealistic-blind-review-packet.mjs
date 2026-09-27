// Current photorealistic corpus review packet. It creates two independent
// reviewer slots with opaque IDs and no prefilled labels.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { fileURLToPath } from 'node:url'
import { buildBlindReviewPacket, REVIEW_DIMENSIONS, validateBlindReviewLabels } from './quality/blind-review-packet.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const outputRoot = path.join(here, 'outputs')
const corpus = JSON.parse(await fs.readFile(path.join(outputRoot, 'photorealistic-contextual-corpus-report.json'), 'utf8'))
const sourceFiles = corpus.results.flatMap(item => ['create', 'edit'].map(lane => path.join(outputRoot, path.basename(item[lane].outputPath))))
const outputDir = path.join(outputRoot, 'photorealistic-blind-review')
await fs.mkdir(outputDir, { recursive: true })
const records = sourceFiles.map((_, index) => ({ id: `photorealistic-${String(index + 1).padStart(2, '0')}`, aspect: 'landscape', series: 'photorealistic-contextual-corpus' }))
const packet = buildBlindReviewPacket({ records, reviewerCount: 2, minRecords: records.length })
const assets = []
for (const [index, sourcePath] of sourceFiles.entries()) {
  const buffer = await fs.readFile(sourcePath)
  const blindName = `visual-${String(index + 1).padStart(2, '0')}.png`
  await fs.writeFile(path.join(outputDir, blindName), buffer)
  assets.push({ blindId: packet.records[index].id, fileName: blindName, sha256: crypto.createHash('sha256').update(buffer).digest('hex') })
}
const tiles = await Promise.all(assets.map(asset => sharp(path.join(outputDir, asset.fileName)).resize(320, 192, { fit: 'fill' }).png().toBuffer()))
const contact = path.join(outputRoot, 'photorealistic-blind-review-contact-sheet.png')
await sharp({ create: { width: 1280, height: 2 * 220, channels: 4, background: '#0b111b' } }).composite(tiles.map((input, index) => ({ input, left: (index % 4) * 320, top: Math.floor(index / 4) * 220 }))).png().toFile(contact)
const esc = value => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Photorealistic contextual blind review</title><style>body{font:14px system-ui;background:#0b111b;color:#f4f7fb;margin:24px}h1{margin:0 0 6px}.note{color:#a9b9ce;max-width:900px}.reviewer{border:1px solid #30445e;border-radius:12px;padding:16px;margin:18px 0;background:#121a27}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.card{background:#0d141f;border:1px solid #29384d;border-radius:8px;padding:8px}.card img{width:100%;aspect-ratio:5/3;object-fit:cover;display:block}.score{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-top:6px}.score label{font-size:11px;color:#b4c3d8}.score input{width:100%;box-sizing:border-box}button{background:#46d39a;color:#07130f;border:0;border-radius:6px;padding:8px 12px;font-weight:700;cursor:pointer}@media(max-width:900px){.grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:600px){.grid{grid-template-columns:1fr}}</style><body data-customer-images="false" data-owned-synthetic-only="true"><h1>Photorealistic contextual blind review</h1><p class="note">Private research packet. Rate each blinded visual from 1–5 for message fit, composition, World fit and series coherence. Do not infer identity or sensitive traits. No labels are prefilled; each reviewer exports a local JSON file. The packet never calls external AI.</p>${[1, 2].map(reviewer => `<section class="reviewer"><h2>Reviewer ${reviewer}</h2><div class="grid">${assets.map(asset => `<article class="card" data-id="${esc(asset.blindId)}"><img src="${asset.fileName}" alt="Blinded owned-synthetic visual"><div class="score">${REVIEW_DIMENSIONS.map(dimension => `<label>${dimension}<input required type="number" min="1" max="5" step="1" name="${reviewer}:${asset.blindId}:${dimension}"></label>`).join('')}</div></article>`).join('')}</div><p><button type="button" data-export="${reviewer}">Export reviewer ${reviewer} labels</button></p></section>`).join('')}<script>for(const button of document.querySelectorAll('[data-export]'))button.addEventListener('click',()=>{const reviewer=button.dataset.export;const labels=[...button.closest('.reviewer').querySelectorAll('.card')].map(card=>{const row={id:card.dataset.id};for(const d of ['messageFit','composition','worldFit','seriesCoherence']){const input=[...card.querySelectorAll('input')].find(item=>item.name.startsWith(reviewer+':')&&item.name.endsWith(':'+d));row[d]=Number(input?.value||0)}return row});const blob=new Blob([JSON.stringify({reviewer,labels},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='photorealistic-review-'+reviewer+'.json';a.click();URL.revokeObjectURL(a.href)})</script></body></html>`
const htmlPath = path.join(outputRoot, 'photorealistic-blind-review.html')
await fs.writeFile(htmlPath, html)
const machinePacket = { ...packet, assets, contactSheet: 'betterpptx-mcp/outputs/photorealistic-blind-review-contact-sheet.png', htmlPacket: 'betterpptx-mcp/outputs/photorealistic-blind-review.html' }
await fs.writeFile(path.join(outputRoot, 'photorealistic-blind-review-packet.json'), JSON.stringify(machinePacket, null, 2) + '\n')
// Rebuild the exported review surface from the now-frozen packet so labels carry
// the packet digest and image paths resolve from the asset subdirectory.
await import('./build-photorealistic-blind-review-html.mjs')
const checks = [
  ['packet has two independent reviewer slots', packet.status === 'ready-for-independent-review' && packet.reviewerCount === 2],
  ['packet contains eight blinded photorealistic assets', assets.length === 8 && new Set(assets.map(asset => asset.sha256)).size === 8],
  ['contact sheet and all opaque image files are written', (await fs.stat(contact)).size > 1000 && assets.every(asset => asset.fileName.endsWith('.png') && /^[a-f0-9]{64}$/.test(asset.sha256))],
  ['HTML exposes both reviewers and all rubric dimensions', html.includes('Reviewer 1') && html.includes('Reviewer 2') && REVIEW_DIMENSIONS.every(dimension => html.includes(`>${dimension}<`))],
  ['HTML contains exactly two export controls and 16 blinded cards', (html.match(/data-export=/g) || []).length === 2 && (html.match(/data-id=/g) || []).length === 16],
  ['labels are not fabricated and calibration remains blocked', packet.humanLabelsIncluded === false && packet.judgeLabelsIncluded === false && validateBlindReviewLabels(packet, []).status === 'blocked-missing-independent-labels'],
  ['packet has no customer or consented-human path', html.includes('data-customer-images="false"') && html.includes('data-owned-synthetic-only="true"') && !/consentedHumanAsset|customer\.png|modal|flux|qwen|huggingface/i.test(html)],
]
let pass = 0
for (const [name, condition] of checks) { if (condition) pass += 1; console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${name}`) }
const report = { schemaVersion: 'betterpptx.photorealistic-blind-review.v1', status: pass === checks.length ? 'research-ready-for-independent-review' : 'research-review-packet-fail', ownedSyntheticOnly: true, customerImages: false, externalAi: false, labelsIncluded: false, reviewerCount: 2, recordCount: 8, assets: 8, checks: pass, failures: checks.length - pass, contactSheet: 'betterpptx-mcp/outputs/photorealistic-blind-review-contact-sheet.png', htmlPacket: 'betterpptx-mcp/outputs/photorealistic-blind-review.html' }
await fs.writeFile(path.join(outputRoot, 'photorealistic-blind-review-report.json'), JSON.stringify(report, null, 2) + '\n')
assert.equal(pass, checks.length)
console.log(`\nPASSED: ${pass}/${checks.length}; status=${report.status}`)
