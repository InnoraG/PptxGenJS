// Build the >=20-record pairwise calibration packet from existing owned-synthetic
// contextual rasters. No generation or network call occurs here. The first four
// pairs are the already-reviewed packet; the remaining comparisons are new,
// blinded candidates retained for the judge-vs-human gate.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, 'outputs')
const read = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8').replace(/^\uFEFF/, ''))
const hash = value => crypto.createHash('sha256').update(value).digest('hex')
const existing = read('photorealistic-pairwise-review-packet.json')
const photo = read('photorealistic-contextual-corpus-report.json')
const series = read('photorealistic-series-corpus-report.json')
const contextual = read('contextual-authoring-corpus-report.json')

const pairs = []
const add = ({ caseId, message, world, left, right, carryForwardPairId = null }) => {
	const ordinal = pairs.length + 1
	const pairId = carryForwardPairId || `calpair://${hash(`${caseId}:${left.fileName}:${right.fileName}`).slice(0, 20)}`
	pairs.push({ pairId, caseId, message, world, position: 'right-focal/left-copy', left, right, ordinal, carryForwardPairId })
}

// Preserve the exact four reviewed comparisons and their opaque IDs.
for (const pair of existing.pairs) add({ ...pair, carryForwardPairId: pair.pairId })

// Three stable series comparisons.
for (const item of series.variants) add({
	caseId: `series-${item.id}`,
	message: series.series.message,
	world: series.series.world,
	left: { fileName: path.basename(item.create.outputPath), lane: 'create', digest: item.create.digest },
	right: { fileName: path.basename(item.edit.outputPath), lane: 'edit', digest: item.edit.digest },
})

// Four additional contextual comparisons from the earlier owned-synthetic corpus.
for (const item of contextual.results.slice(0, 4)) add({
	caseId: `contextual-${item.id}`,
	message: item.message,
	world: item.world,
	left: { fileName: path.basename(item.create.outputPath), lane: 'create', digest: item.create.digest },
	right: { fileName: path.basename(item.edit.outputPath), lane: 'edit', digest: item.edit.digest },
})

// Nine additional same-brief field-engineer comparisons across five existing
// variants. These are distinct image pairs, not duplicated labels.
const field = [
	{ fileName: 'photorealistic-corpus-climate-field-engineer-create.png', lane: 'photo-create' },
	{ fileName: 'photorealistic-corpus-climate-field-engineer-edit.png', lane: 'photo-edit' },
	{ fileName: 'photorealistic-corpus-climate-field-engineer-repaired.png', lane: 'photo-repaired' },
	{ fileName: 'photorealistic-series-field-engineer-create.png', lane: 'series-create' },
	{ fileName: 'photorealistic-series-field-engineer-edit.png', lane: 'series-edit' },
]
const existingPairKey = new Set(pairs.slice(0, 4).map(pair => [pair.left.fileName, pair.right.fileName].sort().join('|')))
let added = 0
for (let i = 0; i < field.length && added < 9; i++) {
	for (let j = i + 1; j < field.length && added < 9; j++) {
		const key = [field[i].fileName, field[j].fileName].sort().join('|')
		if (existingPairKey.has(key)) continue
		const swap = Number.parseInt(hash(`${key}:calibration-swap`).slice(0, 2), 16) % 2 === 0
		add({
			caseId: `field-engineer-variant-${added + 1}`,
			message: 'Clean infrastructure turns climate ambition into measurable field progress.',
			world: 'sunlit renewable-energy field editorial photography',
			left: swap ? field[j] : field[i], right: swap ? field[i] : field[j],
		})
		added++
	}
}

if (pairs.length !== 20) throw new Error(`Expected exactly 20 calibration pairs; got ${pairs.length}`)
const packet = {
	schemaVersion: 'betterpptx.photorealistic-pairwise-calibration-packet.v1',
	status: 'ready-for-independent-review',
	reviewerCount: 2,
	minimumRecords: 20,
	packetSeed: hash(JSON.stringify(pairs.map(pair => [pair.pairId, pair.left.digest, pair.right.digest]))),
	pairs,
	customerImages: false,
	consentedHumanImages: false,
	training: false,
	externalAi: false,
	note: 'Owned-synthetic contextual calibration packet. Four first pairs carry forward the completed human review; the remaining sixteen require independent labels before judge calibration can be evaluated.',
}
const packetPath = path.join(root, 'photorealistic-pairwise-calibration-packet.json')
fs.writeFileSync(packetPath, JSON.stringify(packet, null, 2) + '\n')
const packetDigest = hash(fs.readFileSync(packetPath))
const esc = value => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))
const newPairs = pairs.filter(pair => !pair.carryForwardPairId)
const reviewer = slot => `<section class="reviewer"><h2>Reviewer ${slot}</h2><p class="carry">Four comparisons are already carried forward from the validated review and are not repeated here. Please label only these ${newPairs.length} new comparisons.</p>${newPairs.map(pair => `<article class="pair"><h3>Comparison ${pair.ordinal}</h3><p class="brief">${esc(pair.message)}<br><span>${esc(pair.world)} · ${esc(pair.position)}</span></p><div class="candidates"><figure><img src="${esc(pair.left.fileName)}" alt="Blinded candidate left"><figcaption>Candidate A</figcaption></figure><figure><img src="${esc(pair.right.fileName)}" alt="Blinded candidate right"><figcaption>Candidate B</figcaption></figure></div><fieldset><legend>Which is better for this brief?</legend><label><input required type="radio" name="${slot}:${pair.pairId}" value="left"> Candidate A</label><label><input required type="radio" name="${slot}:${pair.pairId}" value="right"> Candidate B</label><label><input required type="radio" name="${slot}:${pair.pairId}" value="tie"> No clear winner</label></fieldset></article>`).join('')}<button type="button" data-export="${slot}">Export reviewer ${slot} choice file</button></section>`
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Photorealistic pairwise calibration</title><style>body{font:15px system-ui;background:#0b111b;color:#f4f7fb;margin:24px;max-width:1180px}h1{margin-bottom:4px}.note,.brief,.carry{color:#b8c6d8}.reviewer{border:1px solid #30445e;border-radius:12px;padding:18px;margin:20px 0;background:#121a27}.pair{border-top:1px solid #30445e;padding:18px 0}.pair:first-child{border-top:0}.brief span{font-size:12px;color:#91a4bd}.candidates{display:grid;grid-template-columns:1fr 1fr;gap:14px}.candidates figure{margin:0;background:#0d141f;border-radius:8px;padding:8px}.candidates img{width:100%;aspect-ratio:5/3;object-fit:cover;display:block}.candidates figcaption{padding-top:6px;font-weight:700}.pair fieldset{border:0;padding:12px 0 0;display:flex;gap:18px;flex-wrap:wrap}.pair label{background:#1a2738;border-radius:6px;padding:8px 12px}button{background:#46d39a;color:#07130f;border:0;border-radius:6px;padding:10px 14px;font-weight:700;cursor:pointer}@media(max-width:700px){.candidates{grid-template-columns:1fr}}</style><body data-customer-images="false" data-owned-synthetic-only="true"><h1>Photorealistic pairwise calibration</h1><p class="note">Choose the better of two blinded candidates. One choice per comparison; “No clear winner” is allowed. The first four validated comparisons are carried forward automatically. This form asks only for the 16 new comparisons needed for the semantic judge calibration gate.</p>${reviewer(1)}${reviewer(2)}<script>const packetDigest='${packetDigest}';const pairs=${JSON.stringify(newPairs.map(pair => pair.pairId))};for(const button of document.querySelectorAll('[data-export]'))button.addEventListener('click',()=>{const reviewerSlot=Number(button.dataset.export);const labels=pairs.map(pairId=>({pairId,choice:document.querySelector('input[name="'+reviewerSlot+':'+pairId+'"]:checked')?.value||''}));const blob=new Blob([JSON.stringify({schemaVersion:'betterpptx.pairwise-calibration-labels.v1',reviewerSlot,packetDigest,labels},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='photorealistic-pairwise-calibration-'+reviewerSlot+'.json';a.click();URL.revokeObjectURL(a.href)})</script></body></html>`
const htmlPath = path.join(root, 'photorealistic-pairwise-calibration.html')
fs.writeFileSync(htmlPath, html)
console.log(JSON.stringify({ status: 'rebuilt', pairCount: pairs.length, carriedHumanPairs: 4, newPairs: pairs.length - 4, packetDigest, packetPath, htmlPath }))
