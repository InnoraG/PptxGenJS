import fs from 'node:fs'
import path from 'node:path'

const outDir = path.resolve('D:/PptxGenJS_Claude/betterpptx-mcp/outputs')
const visualizationDir = path.resolve('D:/PptxGenJS_Claude/betterpptx-mcp/outputs/visualizations')
const videos = [
	['A · Existing default LP + MuseTalk', path.join(visualizationDir, 'avatar-motion-consented-long-liveportrait-telcomgapp.mp4'), 'Baseline: original LivePortrait motion behavior; 106.75 GPU seconds.'],
	['B · Low motion profile', 'avatar-motion-consented-long-low-telcomgapp.mp4', 'Supported LP controls: expression-friendly, multiplier 0.35, pose-only region, stronger smoothing; 108.90 GPU seconds.'],
	['C · Balanced / full-region LP + MuseTalk mouth', 'avatar-motion-consented-long-balanced-telcomgapp.mp4', 'Supported LP controls: expression-friendly, multiplier 0.60, all region; MuseTalk is the final mouth owner; 73.28 GPU seconds.'],
	['D · Mouth-only profile', 'avatar-motion-consented-long-mouth-only-telcomgapp.mp4', 'Supported LP controls: expression-friendly, multiplier 0.20, lip-only region; MuseTalk still owns audio lip-sync; 69.39 GPU seconds.'],
	['E · Static-head MuseTalk', path.join(visualizationDir, 'avatar-motion-consented-long-musetalk-telcomgapp.mp4'), 'LP stage bypassed; mouth animation retained and eye/head motion minimized; 86.33 GPU seconds.'],
]
const card = ([title, file, note]) => {
	const filePath = path.isAbsolute(file) ? file : path.join(outDir, file)
	if (!fs.existsSync(filePath)) throw new Error(`missing video: ${filePath}`)
	return `<section class="card"><h2>${title}</h2><p>${note}</p><video controls playsinline preload="metadata" src="data:video/mp4;base64,${fs.readFileSync(filePath).toString('base64')}"></video></section>`
}
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Consented LivePortrait motion profiles</title><style>body{font-family:system-ui;background:#101521;color:#eef2f7;margin:0;padding:28px}h1{margin:0 0 8px}.muted{color:#aab6c7}.grid{display:grid;grid-template-columns:repeat(2,minmax(280px,1fr));gap:18px;margin-top:22px}.card{background:#182131;border:1px solid #2d3b51;border-radius:12px;padding:16px}.card h2{font-size:18px;margin:0 0 6px}.card p{color:#b8c4d4;min-height:58px}video{width:100%;background:#000;border-radius:8px}@media(max-width:760px){.grid{grid-template-columns:1fr}}</style></head><body><h1>Consented real-person head-talker motion profiles</h1><p class="muted">Private consented research only. All outputs use the same untouched-source-derived 512×640 head-to-neck crop and identical narration. The original image is not embedded. Select a card and compare eye stability, head movement, mouth intelligibility, identity preservation, and PowerPoint suitability.</p><div class="grid">${videos.map(card).join('')}</div><p class="muted" style="margin-top:22px">The default path remains unchanged. The low and mouth-only options are now implemented against supported LivePortrait controls and were verified on the redeployed private worker.</p></body></html>`
const output = path.join(visualizationDir, 'avatar-motion-consented-long-motion-profiles.html')
fs.mkdirSync(path.dirname(output), { recursive: true })
fs.writeFileSync(output, html)
console.log(JSON.stringify({ output, bytes: Buffer.byteLength(html), videos: videos.length }))
