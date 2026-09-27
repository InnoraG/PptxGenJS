import fs from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve('D:/PptxGenJS_Claude')
const out = path.join(root, 'betterpptx-mcp', 'outputs', 'visualizations', 'avatar-lpmt-identity-review.html')
const deployedRevisionPath = path.join(root, 'betterpptx-mcp', 'outputs', 'avatar-deployed-revision-report.json')
const deployedRevision = JSON.parse(await fs.readFile(deployedRevisionPath, 'utf8').catch(() => '{}'))
const activeServingRevision = deployedRevision.activeRevision || deployedRevision.servingRevision || 'UNKNOWN'
const media = [
	{ id: 'source', label: 'Consented source · head to neck', file: path.join(root, 'betterpptx-mcp', 'outputs', 'consented-head-talker-face-crop-long.png'), kind: 'image', note: 'Identity reference supplied to the LP/MT branch.' },
	{ id: 'commercial-low', label: 'Commercial master · LP/MT low pose-only', file: path.join(root, 'betterpptx-mcp', 'outputs', 'commercial-eval', 'upstream-low-bbox-0.mp4'), kind: 'video', note: 'Upstream commercial-evaluation path: LivePortrait InsightFace alignment + MuseTalk BiSeNet parsing; constrained pose motion.' },
	{ id: 'commercial-balanced', label: 'Commercial master · LP/MT balanced', file: path.join(root, 'betterpptx-mcp', 'outputs', 'commercial-eval', 'upstream-bbox-0.mp4'), kind: 'video', note: 'Same upstream InsightFace + BiSeNet path with broader LivePortrait motion; compare eyes and mouth stability.' },
	{ id: 'commercial-blink', label: 'Commercial master · LP/MT blink profile', file: path.join(root, 'betterpptx-mcp', 'outputs', 'commercial-eval', 'upstream-blink-bbox-0.mp4'), kind: 'video', note: 'Same upstream commercial path with explicit eye/blink motion for the PowerPoint talking-head target.' },
	{ id: 'production-blink-telcomgapp', label: 'Promoted production canary · telcomgapp blink · RestoreFormer++', file: path.join(root, 'betterpptx-mcp', 'outputs', 'commercial-promotion-20260727', 'telcomgapp-blink-canary.mp4'), kind: 'video', note: 'Current owner-authenticated canary from the RestoreFormer++ promoted worker; same consented source and blink profile.' },
	{ id: 'production-blink-fluxworkerai', label: 'Promoted production canary · fluxworkerai blink · RestoreFormer++', file: path.join(root, 'betterpptx-mcp', 'outputs', 'commercial-promotion-20260727', 'fluxworkerai-blink-canary.mp4'), kind: 'video', note: 'Current rotated RestoreFormer++ canary from the second commercial worker; compare identity continuity across account rotation.' },
]

const esc = value => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))
const embed = async item => {
	const bytes = await fs.readFile(item.file)
	const mime = item.kind === 'image' ? 'image/png' : 'video/mp4'
	return { ...item, src: `data:${mime};base64,${bytes.toString('base64')}` }
}
const items = await Promise.all(media.map(embed))
const renderMedia = item => item.kind === 'image'
	? `<img src="${item.src}" alt="${esc(item.label)}">`
	: `<video controls preload="metadata" playsinline src="${item.src}" aria-label="${esc(item.label)}"></video>`

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>LivePortrait MuseTalk identity review</title>
<style>
:root{color-scheme:dark;--bg:#101318;--panel:#171b22;--line:#2b323e;--text:#eef2f7;--muted:#a8b2c1;--good:#58d68d;--warn:#f4c76a}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.45 system-ui,-apple-system,Segoe UI,sans-serif}main{max-width:1080px;margin:auto;padding:24px}h1{font-size:24px;margin:0 0 5px}.meta{color:var(--muted);font-size:12px}.status{display:inline-block;margin:12px 0;padding:5px 9px;border:1px solid #765f2b;border-radius:999px;color:var(--warn);background:#2d2511}.lede{color:var(--muted);max-width:850px}.scope{border:1px solid var(--line);background:var(--panel);padding:13px;border-radius:10px;margin:14px 0}.scope strong{color:var(--text)}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.card{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:10px}.card h2{font-size:15px;margin:0 0 8px}.card img,.card video{display:block;width:100%;aspect-ratio:16/10;object-fit:contain;background:#0b0d11;border-radius:6px}.card img{object-fit:cover}.card p{margin:8px 0 0;color:var(--muted);font-size:12px}.rubric{margin-top:16px;width:100%;border-collapse:separate;border-spacing:0;background:var(--panel);border:1px solid var(--line);border-radius:10px;overflow:hidden}.rubric th,.rubric td{text-align:left;vertical-align:top;padding:9px;border-bottom:1px solid var(--line)}.rubric th{color:var(--muted);font-weight:500}.rubric tr:last-child td{border-bottom:0}.open{color:var(--warn)}.foot{margin-top:14px;color:var(--muted);font-size:12px}@media(max-width:700px){main{padding:15px}.grid{grid-template-columns:1fr}}
</style></head><body><main>
<div class="meta">PowerPoint-native narration recording · commercial LP/MT line · one-time quality gate</div>
<h1>LivePortrait + MuseTalk talking-head identity review</h1>
<div class="status">OPEN · explicit owner PASS/FAIL still required</div>
<div class="scope"><strong>Private owner-review artifact.</strong> Internal processing labels on this page are diagnostic evidence only. They must not be copied into delivered PowerPoint decks, public tool results, customer-facing metadata, or download responses.</div>
<p class="lede">This packet has two explicit layers: (1) our engineering-owned input-quality gate, which checks the user-provided source image(s) without changing identity pixels, and (2) a visual acceptance of the commercial LP/MT render. The first clips are the upstream commercial-evaluation lane—the same InsightFace + BiSeNet reference path used for the commercial master—and the final two cards are the current owner-authenticated production canaries from the promoted revision ${esc(activeServingRevision)}. The resale-safe YuNet + MediaPipe worker is not being reviewed here.</p>
<div class="scope"><strong>Scope boundary.</strong> We own input framing/pose/lighting/sharpness/consistency validation and preserve the original pixels. LivePortrait/MuseTalk owns head-talker animation and its temporal facial output. Native 3D likeness is not judged here; Meshy → Mixamo provider acceptance owns that separate 3D gate. No face recognition or biometric identity matching is performed.</div>
<section class="grid">${items.map(item => `<article class="card"><h2>${esc(item.label)}</h2>${renderMedia(item)}<p>${esc(item.note)}</p></article>`).join('')}</section>
<table class="rubric"><thead><tr><th>LP/MT acceptance item</th><th>Reviewer must inspect</th><th>Status</th></tr></thead><tbody>
<tr><td>Input image quality (engineering-owned)</td><td>Source image(s) have usable head/neck framing, adequate sharpness, lighting, pose, and multi-view consistency. Originals remain immutable; only alpha/segmentation may be derived.</td><td class="pass">PASS · current tolerant ingestion corpus</td></tr>
<tr><td>Commercial LP/MT source continuity</td><td>Face proportions, skin texture, hairline, eyes, and head-to-neck framing remain stable in the upstream InsightFace + BiSeNet commercial render. This is visual QA, not biometric matching.</td><td class="open">OPEN</td></tr>
<tr><td>LivePortrait motion</td><td>Natural blink and low-to-balanced pose motion; no excessive eye excursion, jitter, face drift, or identity collapse.</td><td class="open">OPEN</td></tr>
<tr><td>MuseTalk mouth</td><td>Full upper lip moves as one surface; no double lip, false teeth bands, mouth seam, or frozen lower-face residue.</td><td class="open">OPEN</td></tr>
<tr><td>Temporal stability</td><td>Start frame is clean, transitions are stable, and motion remains coherent for the full narration clip.</td><td class="open">OPEN</td></tr>
<tr><td>PowerPoint handoff</td><td>Native MP4 poster, autoplay, square cameo framing, narration timing, and playback remain correct.</td><td class="open">OPEN</td></tr>
</tbody></table>
<p class="foot">Evidence shown here is visual review material only. Automated LP/MT canaries and PowerPoint checks do not infer approval. Record an explicit PASS or FAIL in the consolidated owner closure form. 3D identity review belongs exclusively to the Meshy → Mixamo gate.</p>
</main></body></html>`
await fs.writeFile(out, html, 'utf8')
console.log(JSON.stringify({ ok: true, out, bytes: Buffer.byteLength(html), media: items.map(item => ({ id: item.id, bytes: Buffer.byteLength(item.src) })) }, null, 2))
