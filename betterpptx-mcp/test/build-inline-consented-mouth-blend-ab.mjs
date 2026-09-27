import fs from 'node:fs'
import path from 'node:path'

const visualizationDir = path.resolve('D:/PptxGenJS_Claude/betterpptx-mcp/outputs/visualizations')
const source = path.join(visualizationDir, 'avatar-motion-consented-long-source.png')
const cards = [
	['Source reference (no animation)', 'image', source, 'Untouched-source-derived 512×640 head-to-neck crop. This is the identity and lip-texture reference.'],
	['Balanced · default jaw mask', 'video', path.join(visualizationDir, 'avatar-motion-consented-long-balanced-telcomgapp.mp4'), 'Current balanced LivePortrait + MuseTalk path using the default jaw-region blend.'],
	['Balanced · tight raw mouth mask', 'video', path.join(visualizationDir, 'avatar-motion-consented-long-balanced-raw-telcomgapp.mp4'), 'Experimental opt-in MuseTalk raw/lip-only mask; reduces jaw-area paste and upper-lip diffusion.'],
	['Balanced · raw-sharp eroded mask', 'video', path.join(visualizationDir, 'avatar-motion-consented-long-balanced-raw-sharp-telcomgapp.mp4'), 'Eroded raw mask diagnostic; still leaves a doubled upper contour and is not recommended.'],
	['Balanced · inner-mouth-only diagnostic', 'video', path.join(visualizationDir, 'avatar-motion-consented-long-balanced-inner-telcomgapp.mp4'), 'Preserves the source lips completely but loses useful lip motion; retained to prove the mask-boundary cause.'],
	['Balanced · lower-mouth mask', 'video', path.join(visualizationDir, 'avatar-motion-consented-long-balanced-lower-telcomgapp.mp4'), 'Leading candidate: preserves one source upper-lip contour while MuseTalk animates the lower lip, mouth opening, and teeth.'],
	['Balanced · aligned full-lip compositor', 'video', path.join(visualizationDir, 'avatar-motion-consented-long-balanced-aligned-telcomgapp.mp4'), 'Full-lip candidate: derives the feathered mask from MuseTalk’s generated face crop so the upper-lip movement and mask boundary share the same geometry.'],
	['Balanced · warped full-lip compositor', 'video', path.join(visualizationDir, 'avatar-motion-consented-long-balanced-warp-telcomgapp.mp4'), 'Final geometric candidate: registers the generated face crop to target face landmarks before applying the full-lip mask.'],
	['Balanced · upper-teeth clean compositor', 'video', path.join(visualizationDir, 'avatar-motion-consented-long-balanced-warp-upper-teeth-clean-telcomgapp.mp4'), 'Fix candidate: full upper-lip/teeth motion, a short lower mask feather, and localized lower-lip texture smoothing to remove the false second/third teeth band.'],
	['Balanced · lower-mouth mask (rotated worker)', 'video', path.join(visualizationDir, 'avatar-motion-consented-long-balanced-lower-fluxworkerai.mp4'), 'Same lower-mouth candidate verified on the redundant fluxworkerai account.'],
	['Balanced · aligned full-lip (rotated worker)', 'video', path.join(visualizationDir, 'avatar-motion-consented-long-balanced-aligned-fluxworkerai.mp4'), 'Same full-lip aligned compositor verified on the redundant fluxworkerai account.'],
	['Balanced · warped full-lip (rotated worker)', 'video', path.join(visualizationDir, 'avatar-motion-consented-long-balanced-warp-fluxworkerai.mp4'), 'Same geometric full-lip compositor verified on the redundant fluxworkerai account.'],
	['Balanced · upper-teeth clean (rotated worker)', 'video', path.join(visualizationDir, 'avatar-motion-consented-long-balanced-warp-upper-teeth-clean-fluxworkerai.mp4'), 'Same clean upper-teeth compositor verified on the redundant fluxworkerai account.'],
	['D-ID · Talks photo avatar', 'video', path.join(visualizationDir, 'avatar-motion-consented-long-did-talk.mp4'), 'Third-party reference using the same consented image and narration; output is watermarked.'],
]
const esc = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
const card = ([title, kind, file, note]) => {
	if (!fs.existsSync(file)) throw new Error(`missing media: ${file}`)
	const encoded = fs.readFileSync(file).toString('base64')
	const element = kind === 'image'
		? `<img src="data:image/png;base64,${encoded}" alt="${esc(title)}">`
		: `<video controls playsinline preload="metadata" src="data:video/mp4;base64,${encoded}"></video>`
	return `<section class="card"><h2>${esc(title)}</h2><p>${esc(note)}</p>${element}</section>`
}
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MuseTalk mouth-blend bakeoff</title><style>body{font-family:system-ui;background:#101521;color:#eef2f7;margin:0;padding:28px}h1{margin:0 0 8px}.muted{color:#aab6c7;max-width:1050px}.grid{display:grid;grid-template-columns:repeat(2,minmax(280px,1fr));gap:18px;margin-top:22px}.card{background:#182131;border:1px solid #2d3b51;border-radius:12px;padding:16px}.card h2{font-size:18px;margin:0 0 6px}.card p{color:#b8c4d4;min-height:58px}video,img{display:block;width:100%;aspect-ratio:4/5;object-fit:contain;background:#000;border-radius:8px}@media(max-width:760px){.grid{grid-template-columns:1fr}}</style></head><body><h1>MuseTalk mouth-blend bakeoff</h1><p class="muted">Same consented source image, narration, and balanced LivePortrait motion. Compare the first frame and the talking sequence for upper-lip texture, mouth seam, identity preservation, and intelligibility. The upper-teeth clean compositor is the current fix candidate; the production default remains unchanged until visual validation is accepted.</p><div class="grid">${cards.map(card).join('')}</div><p class="muted" style="margin-top:22px">Implementation note: the fix keeps full upper-lip motion, shortens the lower mask feather, and smooths only source lower-lip highlight ridges that were being perceived as an extra teeth band. It is not a proprietary D-ID recreation.</p></body></html>`
const output = path.join(visualizationDir, 'avatar-motion-consented-mouth-blend-ab.html')
fs.mkdirSync(path.dirname(output), { recursive: true })
fs.writeFileSync(output, html)
console.log(JSON.stringify({ output, bytes: Buffer.byteLength(html), cards: cards.length }))
