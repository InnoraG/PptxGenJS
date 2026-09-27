import fs from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve('D:/PptxGenJS_Claude')
const sourcePath = path.join(root, 'betterpptx-mcp', 'outputs', 'visualizations', 'avatar-motion-consented-mouth-blend-ab.html')
const outputPath = path.join(root, 'betterpptx-mcp', 'outputs', 'visualizations', 'avatar-final-quality-packet.html')

const escapeHtml = value => String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]))
const source = await fs.readFile(sourcePath, 'utf8')
const cards = []
for (const match of source.matchAll(/<section class="card">([\s\S]*?)<\/section>/g)) {
	const body = match[1]
	const title = body.match(/<h2>([\s\S]*?)<\/h2>/)?.[1] || ''
	const description = body.match(/<p>([\s\S]*?)<\/p>/)?.[1] || ''
	const media = body.match(/<(video|img)\b[^>]*\bsrc="([^"]+)"/)
	if (media) cards.push({ title, description, kind: media[1], src: media[2] })
}
const selectedTitles = [
	'Source reference (no animation)',
	'Balanced · default jaw mask',
	'Balanced · warped full-lip compositor',
	'Balanced · upper-teeth clean compositor',
	'D-ID · Talks photo avatar',
]
const selected = selectedTitles.map(title => cards.find(card => card.title === title)).filter(Boolean)
if (selected.length !== selectedTitles.length) throw new Error(`Missing quality-packet cards: ${selectedTitles.filter(title => !cards.some(card => card.title === title)).join(', ')}`)

const renderMedia = card => card.kind === 'img'
	? `<img src="${card.src}" alt="${escapeHtml(card.title)}" loading="lazy">`
	: `<video controls playsinline preload="metadata" loop src="${card.src}"></video>`
const renderCard = card => `<article class="card"><h2>${escapeHtml(card.title)}</h2><p>${escapeHtml(card.description)}</p>${renderMedia(card)}</article>`
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Final talking-head quality packet</title><style>
:root{color-scheme:dark}body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#0f1520;color:#eef2f7;margin:0;padding:28px}h1{margin:0 0 8px}h2{font-size:18px;margin:0 0 8px}.lede{color:#b7c2d2;max-width:1050px;line-height:1.5}.notice{background:#172337;border:1px solid #355071;border-radius:12px;padding:14px 16px;margin:18px 0;max-width:1050px}.notice strong{color:#7ee2a8}.grid{display:grid;grid-template-columns:repeat(2,minmax(280px,1fr));gap:18px;max-width:1100px}.card{background:#182131;border:1px solid #2d3b51;border-radius:12px;padding:16px}.card p{color:#b8c4d4;min-height:58px;line-height:1.4}video,img{display:block;width:100%;aspect-ratio:4/5;object-fit:contain;background:#000;border-radius:8px}@media(max-width:760px){body{padding:16px}.grid{grid-template-columns:1fr}}
</style></head><body><h1>Final talking-head quality packet</h1><p class="lede">Same consented head-to-neck source and narration. This packet isolates the current full-upper-lip decision from the broader motion bakeoff so the owner can compare identity, upper-lip coherence, teeth continuity, and PowerPoint suitability.</p><div class="notice"><strong>Current recommendation:</strong> <code>warp</code> is the leading full-upper-lip candidate because it registers the generated face crop to stable target landmarks before blending. <code>warp-upper-teeth-clean</code> is the fallback when the reviewer prefers the cleaner teeth band. Neither profile is promoted automatically until the visual acceptance packet records PASS.</div><div class="grid">${selected.map(renderCard).join('')}</div></body></html>`
await fs.writeFile(outputPath, html, 'utf8')
console.log(JSON.stringify({ ok: true, outputPath, selected: selected.map(card => card.title), bytes: Buffer.byteLength(html) }, null, 2))
