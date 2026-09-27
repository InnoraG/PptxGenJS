import fs from 'node:fs'
import path from 'node:path'

const visualizationDir = path.resolve('D:/PptxGenJS_Claude/betterpptx-mcp/outputs/visualizations')
const localDir = visualizationDir
const videos = [
	['D-ID · Talks photo avatar', path.join(localDir, 'avatar-motion-consented-long-did-talk.mp4'), 'Third-party D-ID image-compatible Talks lane using the same 512×640 consented derivative and identical WAV narration.'],
	['Our · Low LivePortrait + MuseTalk', path.join(localDir, 'avatar-motion-consented-long-low-telcomgapp.mp4'), 'Supported low-motion profile: pose-only LivePortrait plate, then MuseTalk audio lip-sync.'],
	['Our · Balanced LivePortrait + MuseTalk mouth', path.join(localDir, 'avatar-motion-consented-long-balanced-telcomgapp.mp4'), 'Supported full-region LivePortrait plate at multiplier 0.60; MuseTalk is the final mouth owner.'],
	['Our · Mouth-only LivePortrait + MuseTalk', path.join(localDir, 'avatar-motion-consented-long-mouth-only-telcomgapp.mp4'), 'Supported lip-only LivePortrait profile, then MuseTalk audio lip-sync.'],
	['Our · Static-head MuseTalk', path.join(visualizationDir, 'avatar-motion-consented-long-musetalk-telcomgapp.mp4'), 'No LivePortrait stage; MuseTalk retains mouth animation with maximum eye/head stability.'],
]
function card([title, file, note]) {
	if (!fs.existsSync(file)) throw new Error(`missing video: ${file}`)
	return `<section class="card"><h2>${title}</h2><p>${note}</p><video controls playsinline preload="metadata" src="data:video/mp4;base64,${fs.readFileSync(file).toString('base64')}"></video></section>`
}
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>D-ID vs BetterPPTX consented avatar comparison</title><style>body{font-family:system-ui;background:#101521;color:#eef2f7;margin:0;padding:28px}h1{margin:0 0 8px}.muted{color:#aab6c7}.grid{display:grid;grid-template-columns:repeat(2,minmax(280px,1fr));gap:18px;margin-top:22px}.card{background:#182131;border:1px solid #2d3b51;border-radius:12px;padding:16px}.card h2{font-size:18px;margin:0 0 6px}.card p{color:#b8c4d4;min-height:58px}video{width:100%;background:#000;border-radius:8px}@media(max-width:760px){.grid{grid-template-columns:1fr}}</style></head><body><h1>D-ID vs BetterPPTX consented head-talker comparison</h1><p class="muted">Private consented research only. Every card uses the same 512×640 head-to-neck derivative and identical narration. The original image and API credential are not embedded. Compare face framing, eye stability, mouth intelligibility, identity preservation, visual quality, and PowerPoint suitability.</p><div class="grid">${videos.map(card).join('')}</div><p class="muted" style="margin-top:22px">D-ID V4 Expressive requires a pre-created avatar ID; this test therefore uses D-ID's image-compatible Talks lane for a same-image comparison. That is not a claim that the V4 Expressive path accepts an arbitrary still image.</p></body></html>`
const output = path.join(visualizationDir, 'avatar-motion-consented-long-did-comparison.html')
fs.mkdirSync(path.dirname(output), { recursive: true })
fs.writeFileSync(output, html)
console.log(JSON.stringify({ output, bytes: Buffer.byteLength(html), videos: videos.length }))
