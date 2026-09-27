// Simplified review surface: one best-of-two choice per photorealistic case.
// Lane identity is hidden from reviewers and retained only in the private packet.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, 'outputs')
const corpusPath = path.join(root, 'photorealistic-contextual-corpus-report.json')
const corpusBytes = fs.readFileSync(corpusPath)
const corpus = JSON.parse(corpusBytes.toString('utf8'))
const digest = value => crypto.createHash('sha256').update(value).digest('hex')
const packetSeed = digest(corpusBytes)
const pairs = (corpus.results || []).map((item, index) => {
  const pairId = `pair://${digest(`${packetSeed}:${item.id}`).slice(0, 20)}`
  const swap = Number.parseInt(digest(`${packetSeed}:${item.id}:swap`).slice(0, 2), 16) % 2 === 0
  const create = { fileName: path.basename(item.create.outputPath), lane: 'create', digest: item.create.digest }
  const edit = { fileName: path.basename(item.edit.outputPath), lane: 'edit', digest: item.edit.digest }
  return { pairId, caseId: item.id, message: item.message, world: item.world, position: 'right-focal/left-copy', left: swap ? edit : create, right: swap ? create : edit, ordinal: index + 1 }
})
const packet = { schemaVersion: 'betterpptx.photorealistic-pairwise-review-packet.v1', status: 'ready-for-independent-review', reviewerCount: 2, packetSeed, pairs, customerImages: false, consentedHumanImages: false, training: false, externalAi: false }
const packetPath = path.join(root, 'photorealistic-pairwise-review-packet.json')
fs.writeFileSync(packetPath, JSON.stringify(packet, null, 2) + '\n')
const packetDigest = digest(fs.readFileSync(packetPath))
const esc = value => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))
const reviewer = slot => `<section class="reviewer"><h2>Reviewer ${slot}</h2>${pairs.map(pair => `<article class="pair"><h3>Comparison ${pair.ordinal}</h3><p class="brief">${esc(pair.message)}<br><span>${esc(pair.world)} · ${esc(pair.position)}</span></p><div class="candidates"><figure><img src="${esc(pair.left.fileName)}" alt="Blinded candidate left"><figcaption>Candidate A</figcaption></figure><figure><img src="${esc(pair.right.fileName)}" alt="Blinded candidate right"><figcaption>Candidate B</figcaption></figure></div><fieldset><legend>Which is better for this brief?</legend><label><input required type="radio" name="${slot}:${pair.pairId}" value="left"> Candidate A</label><label><input required type="radio" name="${slot}:${pair.pairId}" value="right"> Candidate B</label><label><input required type="radio" name="${slot}:${pair.pairId}" value="tie"> No clear winner</label></fieldset></article>`).join('')}<button type="button" data-export="${slot}">Export reviewer ${slot} choice file</button></section>`
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Photorealistic pairwise review</title><style>body{font:15px system-ui;background:#0b111b;color:#f4f7fb;margin:24px;max-width:1180px}h1{margin-bottom:4px}.note,.brief{color:#b8c6d8}.reviewer{border:1px solid #30445e;border-radius:12px;padding:18px;margin:20px 0;background:#121a27}.pair{border-top:1px solid #30445e;padding:18px 0}.pair:first-child{border-top:0}.brief span{font-size:12px;color:#91a4bd}.candidates{display:grid;grid-template-columns:1fr 1fr;gap:14px}.candidates figure{margin:0;background:#0d141f;border-radius:8px;padding:8px}.candidates img{width:100%;aspect-ratio:5/3;object-fit:cover;display:block}.candidates figcaption{padding-top:6px;font-weight:700}.pair fieldset{border:0;padding:12px 0 0;display:flex;gap:18px;flex-wrap:wrap}.pair label{background:#1a2738;border-radius:6px;padding:8px 12px}button{background:#46d39a;color:#07130f;border:0;border-radius:6px;padding:10px 14px;font-weight:700;cursor:pointer}@media(max-width:700px){.candidates{grid-template-columns:1fr}}</style><body data-customer-images="false" data-owned-synthetic-only="true"><h1>Photorealistic pairwise review</h1><p class="note">Choose the better of two blinded candidates for each brief. This is intentionally simple: one choice per comparison. Do not infer identity or sensitive traits. “No clear winner” is allowed.</p>${reviewer(1)}${reviewer(2)}<script>const packetDigest='${packetDigest}';const pairs=${JSON.stringify(pairs.map(pair => pair.pairId))};for(const button of document.querySelectorAll('[data-export]'))button.addEventListener('click',()=>{const reviewerSlot=Number(button.dataset.export);const labels=pairs.map(pairId=>({pairId,choice:document.querySelector('input[name="'+reviewerSlot+':'+pairId+'"]:checked')?.value||''}));const blob=new Blob([JSON.stringify({schemaVersion:'betterpptx.pairwise-review-labels.v1',reviewerSlot,packetDigest,labels},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='photorealistic-pairwise-review-'+reviewerSlot+'.json';a.click();URL.revokeObjectURL(a.href)})</script></body></html>`
const htmlPath = path.join(root, 'photorealistic-pairwise-review.html')
fs.writeFileSync(htmlPath, html)
console.log(JSON.stringify({ status: 'rebuilt', pairCount: pairs.length, packetDigest, htmlPath, packetPath }))
