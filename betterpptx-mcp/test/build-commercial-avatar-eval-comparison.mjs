import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve('D:/PptxGenJS_Claude/betterpptx-mcp')
const outputDir = path.join(root, 'outputs', 'visualizations')
const rows = [
	{
		title: 'Resale-safe · current clean compositor',
		lane: 'Production-eligible after normal release gates',
		file: path.join(root, 'outputs', 'avatar-motion-consented-long-balanced-warp-upper-teeth-clean-telcomgapp.mp4'),
		note: 'YuNet + LivePortrait + MediaPipe mask + MuseTalk. Fully isolated from restricted InsightFace and BiSeNet weights.',
	},
	{
		title: 'Commercial evaluation · upstream balanced',
		lane: 'Contract required before any product use',
		file: path.join(root, 'outputs', 'commercial-eval', 'upstream-bbox-0.mp4'),
		note: 'Original LivePortrait/InsightFace preprocessing and MuseTalk BiSeNet compositor. Better mouth coherence, but excessive eye motion remains visible.',
	},
	{
		title: 'Commercial evaluation · upstream low/pose-only',
		lane: 'Leading isolated quality candidate',
		file: path.join(root, 'outputs', 'commercial-eval', 'upstream-low-bbox-0.mp4'),
		note: 'Same original upstream mouth path with constrained LivePortrait pose motion. Full upper-lip movement and much steadier eyes.',
	},
	{
		title: 'D-ID · external quality reference',
		lane: 'Third-party commercial service',
		file: path.join(root, 'outputs', 'visualizations', 'avatar-motion-consented-long-did-talk.mp4'),
		note: 'Same consented identity and narration. Used only as the visual reference target; trial output includes the D-ID watermark.',
	},
]

const encode = file => fs.readFileSync(file).toString('base64')
for (const row of rows) {
	if (!fs.existsSync(row.file)) throw new Error(`missing comparison media: ${row.file}`)
}

const contactSheet = path.join(root, 'outputs', 'commercial-eval', 'four-way-contact-sheet.jpg')
if (!fs.existsSync(contactSheet)) throw new Error(`missing contact sheet: ${contactSheet}`)

const cards = rows.map(row => `
	<section class="card">
		<h2>${row.title}</h2>
		<p class="lane">${row.lane}</p>
		<video controls playsinline preload="metadata" src="data:video/mp4;base64,${encode(row.file)}"></video>
		<p>${row.note}</p>
	</section>`).join('')

const html = `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width,initial-scale=1">
	<title>Avatar commercial evaluation comparison</title>
	<style>
		:root{color-scheme:dark}body{font-family:system-ui,sans-serif;background:#0e1420;color:#eef3f9;margin:0;padding:28px}main{max-width:1440px;margin:auto}h1{margin:0 0 8px}.intro{color:#b8c4d5;max-width:1050px;margin:0 0 22px}.sheet{width:100%;display:block;border-radius:12px;border:1px solid #30405a}.grid{display:grid;grid-template-columns:repeat(2,minmax(300px,1fr));gap:18px;margin-top:20px}.card{background:#182233;border:1px solid #30405a;border-radius:12px;padding:16px}.card h2{margin:0 0 4px;font-size:18px}.card p{color:#bdc8d7}.card .lane{color:#7fd3a4;margin:0 0 12px;font-weight:600}video{display:block;width:100%;aspect-ratio:4/5;object-fit:contain;background:#000;border-radius:8px}@media(max-width:760px){body{padding:16px}.grid{grid-template-columns:1fr}}
	</style>
</head>
<body>
	<main>
		<h1>Avatar quality and licensing lane comparison</h1>
		<p class="intro">Same consented portrait, narration, 25 fps output and pinned MuseTalk 1.5 model. Compare mouth coherence, upper-lip movement, teeth continuity, eye stability and identity preservation. The commercial-evaluation lane is technically isolated and cannot be routed to production until written licenses clear every restricted model.</p>
		<img class="sheet" src="data:image/jpeg;base64,${encode(contactSheet)}" alt="Frame-by-frame comparison of the resale-safe, upstream commercial-evaluation and D-ID avatar outputs">
		<div class="grid">${cards}</div>
	</main>
</body>
</html>`

fs.mkdirSync(outputDir, { recursive: true })
const output = path.join(outputDir, 'avatar-commercial-eval-comparison.html')
fs.writeFileSync(output, html)
console.log(JSON.stringify({ output, bytes: Buffer.byteLength(html), cards: rows.length }))
