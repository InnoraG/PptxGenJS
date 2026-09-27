import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve('D:/PptxGenJS_Claude/betterpptx-mcp')
const visualDir = path.join(root, 'outputs', 'visualizations')
const comparisonDir = path.join(root, 'outputs', 'commercial-eval', 'enhanced-comparison')
const candidateDir = path.join(root, 'outputs', 'commercial-eval', 'enhanced-w095-rvm-resnet50')

const relativeFromVisual = file => path.relative(visualDir, file).replaceAll('\\', '/')
const media = {
	raw: path.join(root, 'outputs', 'commercial-eval', 'upstream-low-bbox-0.mp4'),
	enhanced: path.join(candidateDir, 'commercial-upstream-codeformer.mp4'),
	transparent: path.join(candidateDir, 'commercial-upstream-codeformer-alpha.webm'),
	powerPoint: path.join(candidateDir, 'commercial-upstream-codeformer-powerpoint-preview.mp4'),
	alpha: path.join(candidateDir, 'commercial-upstream-alpha-matte.mp4'),
	mouthSheet: path.join(comparisonDir, 'commercial-enhancement-mouth-contact-sheet.jpg'),
}
for (const [name, file] of Object.entries(media)) {
	if (!fs.existsSync(file)) throw new Error(`missing ${name}: ${file}`)
}

const html = `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width,initial-scale=1">
	<title>Commercial avatar enhancement comparison</title>
	<style>
		:root{color-scheme:dark}*{box-sizing:border-box}body{font:14px/1.45 system-ui,sans-serif;background:#0e1420;color:#eef3f9;margin:0;padding:24px}main{max-width:1440px;margin:auto}h1{margin:0 0 6px;font-size:25px}h2{margin:0 0 5px;font-size:17px}.muted,.card p{color:#b8c4d5}.controls{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0}button{background:#25344a;color:#eef3f9;border:1px solid #3b4c66;border-radius:8px;padding:8px 12px;cursor:pointer}.sheet{display:block;width:100%;border:1px solid #30405a;border-radius:10px}.grid{display:grid;grid-template-columns:repeat(2,minmax(280px,1fr));gap:16px;margin-top:18px}.card{background:#182233;border:1px solid #30405a;border-radius:12px;padding:14px}.card p{margin:0 0 10px;min-height:42px}.flag{color:#79d7a7;font-weight:600}.warn{color:#f1bd69}video{display:block;width:100%;aspect-ratio:4/5;object-fit:contain;background:#000;border-radius:8px}.checker video{background-color:#e9edf2;background-image:linear-gradient(45deg,#bcc5d1 25%,transparent 25%),linear-gradient(-45deg,#bcc5d1 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#bcc5d1 75%),linear-gradient(-45deg,transparent 75%,#bcc5d1 75%);background-size:28px 28px;background-position:0 0,0 14px,14px -14px,-14px 0}.wide{grid-column:1/-1}.facts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:16px 0}.fact{background:#182233;border:1px solid #30405a;border-radius:10px;padding:10px}.fact strong{display:block;font-size:18px}@media(max-width:760px){body{padding:14px}.grid,.facts{grid-template-columns:1fr}.wide{grid-column:auto}}
	</style>
</head>
<body>
	<main>
		<h1>Commercial avatar · enhancement and alpha validation</h1>
		<p class="muted">Same consented 154-frame source. Selected technical candidate: CodeFormer fidelity 0.95 + RVM ResNet50 + corrected FFmpeg foreground/alpha composition. This remains an isolated evaluation lane until written model/checkpoint rights are attached.</p>
		<div class="facts"><div class="fact"><strong>2.29×</strong>Mouth-region sampled edge detail</div><div class="fact"><strong>54.46 s</strong>CodeFormer processing</div><div class="fact"><strong>5.60 s</strong>Temporal matting</div></div>
		<img class="sheet" src="${relativeFromVisual(media.mouthSheet)}" alt="Six sampled mouth frames comparing raw commercial output, CodeFormer fidelity 0.80 and fidelity 0.95">
		<div class="controls"><button type="button" id="play">Play all</button><button type="button" id="pause">Pause all</button><button type="button" id="restart">Restart</button></div>
		<div class="grid">
			<section class="card"><h2>1 · Raw commercial candidate</h2><p>Upstream low/pose-only LivePortrait + MuseTalk. Mouth is coherent but visibly soft.</p><video controls playsinline preload="metadata" src="${relativeFromVisual(media.raw)}"></video></section>
			<section class="card"><h2>2 · CodeFormer 0.95</h2><p><span class="flag">Selected enhancement setting.</span> Sharper full upper lip and coherent teeth with the more conservative identity-fidelity weight.</p><video controls playsinline preload="metadata" src="${relativeFromVisual(media.enhanced)}"></video></section>
			<section class="card checker"><h2>3 · Transparent RGBA master</h2><p>VP9 WebM with alpha on a checkerboard. Intended for alpha-aware renderers, not native PowerPoint playback.</p><video controls playsinline preload="metadata" src="${relativeFromVisual(media.transparent)}"></video></section>
			<section class="card"><h2>4 · PowerPoint-safe delivery</h2><p><span class="flag">Corrected compositor.</span> Foreground and matte are merged directly, then precomposited to H.264/AAC MP4.</p><video controls playsinline preload="metadata" src="${relativeFromVisual(media.powerPoint)}"></video></section>
			<section class="card wide"><h2>5 · Alpha matte evidence</h2><p><span class="warn">Known input-dependent edge limitation:</span> dark hair against the original dark background leaves a soft fringe; source guidance or a higher-contrast portrait may still be required for premium transparent output.</p><video controls playsinline preload="metadata" src="${relativeFromVisual(media.alpha)}"></video></section>
		</div>
	</main>
	<script>
		const videos=[...document.querySelectorAll('video')]
		document.getElementById('play').addEventListener('click',()=>{for(const video of videos){video.play().catch(()=>{})}})
		document.getElementById('pause').addEventListener('click',()=>{for(const video of videos)video.pause()})
		document.getElementById('restart').addEventListener('click',()=>{for(const video of videos){video.currentTime=0;video.pause()}})
	</script>
</body>
</html>`

fs.mkdirSync(visualDir, { recursive: true })
const output = path.join(visualDir, 'avatar-commercial-enhancement-comparison.html')
fs.writeFileSync(output, html)
console.log(JSON.stringify({ output, bytes: Buffer.byteLength(html), media: Object.keys(media).length }))
