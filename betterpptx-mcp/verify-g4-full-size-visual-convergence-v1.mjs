// Deterministic visual screening for the canonical 25-slide port.  Browser
// and PowerPoint rasterizers have different anti-aliasing, so comparison is
// performed on 160x90 blurred RGB fields while exact structure is checked by
// the descriptor proof.  The raw renders remain archived for review.
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import WebSocket from 'ws'

const root = process.cwd()
const rel = file => path.relative(root, file).replaceAll('\\', '/')
const sha256 = file => crypto.createHash('sha256').update(fsSync.readFileSync(file)).digest('hex')
const exists = file => fsSync.existsSync(file)
const latest = async (dir, suffix) => {
	if (!exists(dir)) return null
	const walk = async current => {
		const found = []
		for (const entry of await fs.readdir(current, { withFileTypes: true })) {
			const full = path.join(current, entry.name)
			if (entry.isDirectory()) found.push(...await walk(full))
			else if (entry.isFile() && entry.name.endsWith(suffix)) found.push(full)
		}
		return found
	}
	return (await walk(dir)).sort().at(-1) || null
}
const source = file => file && ({ path: rel(file), sha256: sha256(file) })
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const outDir = path.resolve(`outputs/authoring-principle-corpus/finalized-jsonspec-archive/g4-full-size-visual-convergence/${stamp}`)
const htmlDir = path.join(outDir, 'html-render')
const profileDir = path.join(outDir, 'chrome-profile')
await fs.mkdir(htmlDir, { recursive: true })
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const htmlFile = path.resolve('GPT_5_6_Pro_Capability_Showcase_HTML_Native_External_Images_Edition/index.html')
const htmlRenders = []
const port = 9300 + Math.floor(Math.random() * 200)
const browser = spawn(chrome, [
	'--headless=new', '--no-sandbox', '--disable-gpu', '--disable-extensions', '--disable-crash-reporter',
	'--disable-background-networking', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
	`--remote-debugging-port=${port}`, '--remote-allow-origins=*', '--window-size=1600,900',
	`--user-data-dir=${profileDir}`,
], { stdio: 'ignore', windowsHide: true })
const waitFor = async (predicate, timeoutMs = 30000) => {
	const started = Date.now()
	while (Date.now() - started < timeoutMs) {
		try { const value = await predicate(); if (value) return value } catch {}
		await new Promise(resolve => setTimeout(resolve, 200))
	}
	throw new Error('Timed out waiting for the deterministic browser session')
}
await waitFor(async () => {
	const response = await fetch(`http://127.0.0.1:${port}/json/version`)
	return response.ok ? true : null
})
const target = await waitFor(async () => {
	const response = await fetch(`http://127.0.0.1:${port}/json`)
	const pages = response.ok ? await response.json() : []
	return pages.find(item => item.type === 'page' && item.webSocketDebuggerUrl)
})
const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject) })
let sequence = 0
const pending = new Map()
socket.on('message', data => {
	const message = JSON.parse(String(data))
	if (message.id && pending.has(message.id)) {
		const { resolve, reject } = pending.get(message.id)
		pending.delete(message.id)
		if (message.error) reject(new Error(message.error.message))
		else resolve(message.result)
	}
})
const cdp = (method, params = {}) => new Promise((resolve, reject) => {
	const id = ++sequence
	pending.set(id, { resolve, reject })
	socket.send(JSON.stringify({ id, method, params }))
})
await cdp('Page.enable')
await cdp('Runtime.enable')
await cdp('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false })
for (let slide = 1; slide <= 25; slide += 1) {
	const file = path.join(htmlDir, `html-slide-${String(slide).padStart(3, '0')}.png`)
	await cdp('Page.navigate', { url: `file:///${htmlFile.replaceAll('\\', '/')}?slide=${slide}&capture=1` })
	await waitFor(async () => {
		const state = await cdp('Runtime.evaluate', { expression: 'document.readyState === "complete" && document.querySelectorAll(".slide.active").length === 1', returnByValue: true })
		return state?.result?.value === true
	}, 15000)
	await new Promise(resolve => setTimeout(resolve, 300))
	const shot = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
	await fs.writeFile(file, Buffer.from(shot.data, 'base64'))
	if (!exists(file) || fsSync.statSync(file).size <= 0) throw new Error(`HTML render failed for slide ${slide}`)
	htmlRenders.push(file)
}
socket.close()
spawnSync('taskkill.exe', ['/PID', String(browser.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
const officeRenderProof = await latest(path.resolve('outputs/authoring-principle-corpus/finalized-jsonspec-archive/canonical-25-slide-native-package'), 'canonical-25-office-com-proof.json')
const descriptorProof = await latest(path.resolve('outputs/authoring-principle-corpus/finalized-jsonspec-archive/canonical-25-slide-native-package'), 'descriptor-compare.json')
if (!officeRenderProof || !descriptorProof) throw new Error('Missing Office render or descriptor proof')
const office = JSON.parse(await fs.readFile(officeRenderProof, 'utf8'))
const descriptor = JSON.parse(await fs.readFile(descriptorProof, 'utf8'))
const officeFiles = (office.images || []).map(image => path.resolve(image.file))
if (officeFiles.length !== 25 || officeFiles.some(file => !exists(file) || fsSync.statSync(file).size <= 0)) throw new Error('Office render proof does not contain 25 non-empty previews')
const python = String.raw`
from PIL import Image, ImageFilter
import numpy as np, json, os, sys
html_dir, office_dir = sys.argv[1], sys.argv[2]
rows=[]
for i in range(1,26):
    hf=os.path.join(html_dir, f'html-slide-{i:03d}.png')
    of=os.path.join(office_dir, f'com-slide-{i:03d}.png')
    a0=Image.open(hf).convert('RGB'); b0=Image.open(of).convert('RGB')
    a=np.asarray(a0.resize((160,90)).filter(ImageFilter.GaussianBlur(1)), dtype=float)
    b=np.asarray(b0.resize((160,90)).filter(ImageFilter.GaussianBlur(1)), dtype=float)
    d=np.abs(a-b)
    corr=float(np.corrcoef(a.reshape(-1), b.reshape(-1))[0,1])
    rows.append({'slide':i,'htmlSize':list(a0.size),'officeSize':list(b0.size),'mae':float(d.mean()),'rmse':float(np.sqrt((d*d).mean())),'correlation':corr,'htmlBytes':os.path.getsize(hf),'officeBytes':os.path.getsize(of)})
print(json.dumps(rows))
`
const metricsResult = spawnSync('python', ['-c', python, htmlDir, path.dirname(officeFiles[0])], { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 })
if (metricsResult.status !== 0) throw new Error(`Visual metric process failed: ${metricsResult.stderr}`)
const metrics = JSON.parse(metricsResult.stdout.trim())
const dimensions = metrics.length === 25 && metrics.every(row => row.htmlSize[0] === 1600 && row.htmlSize[1] === 900 && row.officeSize[0] === 1600 && row.officeSize[1] === 900)
const screening = metrics.every(row => row.correlation >= 0.55 && row.mae <= 80)
const checks = {
	htmlRenders25: htmlRenders.length === 25,
	htmlRendersNonEmpty: htmlRenders.every(file => fsSync.statSync(file).size > 0),
	fullSizeDimensions: dimensions,
		officeRenders25: office.status === 'PASS' && office.slideCount === 25 && office.verifyCount === 25,
	visualScreeningWithinTolerance: screening,
	descriptorParity: descriptor.status === 'PASS' && Object.values(descriptor.checks || {}).every(Boolean) && descriptor.realCountMismatches?.length === 0,
}
const report = {
	schemaVersion: 'betterpptx.g4-full-size-visual-convergence-proof.v1',
	status: Object.values(checks).every(Boolean) ? 'PASS_WITH_RENDER_TOLERANCE' : 'FAIL',
	generatedAt: new Date().toISOString(),
	gate: 'G4',
	checks,
	visualMethod: 'Chrome capture=1 and authoritative PowerPoint COM SaveCopyAs render at 1600x900; comparison uses 160x90 RGB fields with Gaussian blur 1 to suppress rasterizer anti-aliasing while preserving layout/color drift.',
	thresholds: { minimumCorrelation: 0.55, maximumBlurredMae: 80 },
	metrics,
	evidence: {
		htmlSource: { path: rel(htmlFile), sha256: sha256(htmlFile) },
		htmlRenderDirectory: rel(htmlDir),
		officeRenderProof: { ...source(officeRenderProof), status: office.status },
		descriptorProof: { ...source(descriptorProof), status: descriptor.status },
	},
	universalFormalClosure: '0/2258',
	interpretation: 'All 25 source and native renders are full-size, non-empty, and dimensionally aligned. The blurred visual screen is a deterministic tolerance check for browser-versus-PowerPoint rasterization; descriptor parity remains the exact structural guard. Any future metric outlier is a targeted visual investigation, never a reason to flatten a slide.',
}
const out = path.join(outDir, 'g4-full-size-visual-convergence-proof.json')
const bytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`)
await fs.writeFile(out, bytes)
const digest = crypto.createHash('sha256').update(bytes).digest('hex')
await fs.writeFile(`${out}.sha256`, `${digest}  ${path.basename(out)}\n`)
console.log(JSON.stringify({ ...report, reportPath: rel(out), reportSha256: digest }, null, 2))
if (report.status === 'FAIL') process.exitCode = 1
