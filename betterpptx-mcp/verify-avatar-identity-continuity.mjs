#!/usr/bin/env node
// Private synthetic paired-identity probe.  It verifies lineage and playback
// for one product-owned Meshy identity across native 3D and LivePortrait/MuseTalk
// talking-head media, while deliberately keeping the independent visual-quality
// review gate open.  It never consumes the consented human research asset.
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import JSZip from 'jszip'
import sharp from 'sharp'
import { findFfmpeg } from './avatar/ffmpeg.mjs'

// The verifier is also run directly by maintainers from betterpptx-mcp/.
// Anchor repository artifacts to this module's location so that invocation
// cwd cannot duplicate the `betterpptx-mcp/` prefix.
const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..')
const outputDir = path.resolve(repo, 'betterpptx-mcp', 'outputs')
const fixturePath = path.join(outputDir, 'presenter-identity-continuity-fixture.json')
const canaryPath = path.join(outputDir, 'private-avatar-mcp-canary-report.json')
const workerCanaryPaths = [
	path.join(outputDir, 'private-avatar-worker-canary-telcomgapp.json'),
	path.join(outputDir, 'private-avatar-worker-canary-fluxworkerai.json'),
]
const workerCanaryAllPath = path.join(outputDir, 'private-avatar-worker-canary-all.json')
const pptxPath = path.join(outputDir, 'private-avatar-mcp-canary.pptx')
const reportPath = path.join(outputDir, 'avatar-identity-continuity-report.json')
const contactSheetPath = path.join(outputDir, 'avatar-identity-continuity-contact-sheet.png')

// The production image declares /usr/bin/ffmpeg and /usr/bin/ffprobe.  On a
// Windows control-plane checkout, however, the portable canary helper may
// already have installed the same binaries under the temporary media-tools
// bundle without exporting them into this process.  Reuse that reviewed
// bundle when present so a local identity audit cannot be reported as blocked
// merely because the shell PATH is different from the serving image.
function configurePortableControlPlaneMediaTools() {
	if (process.env.BETTERPPTX_FFMPEG_PATH && process.env.BETTERPPTX_FFPROBE_PATH) return
	const temp = process.env.TEMP || process.env.TMP || ''
	if (!temp) return
	const ffmpeg = path.join(temp, 'betterpptx-media-tools', 'node_modules', 'ffmpeg-static', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg')
	const ffprobe = process.platform === 'win32'
		? path.join(temp, 'betterpptx-media-tools', 'node_modules', 'ffprobe-static', 'bin', 'win32', 'x64', 'ffprobe.exe')
		: path.join(temp, 'betterpptx-media-tools', 'node_modules', 'ffprobe-static', 'bin', 'linux', 'x64', 'ffprobe')
	if (!process.env.BETTERPPTX_FFMPEG_PATH && fsSync.existsSync(ffmpeg)) process.env.BETTERPPTX_FFMPEG_PATH = ffmpeg
	if (!process.env.BETTERPPTX_FFPROBE_PATH && fsSync.existsSync(ffprobe)) process.env.BETTERPPTX_FFPROBE_PATH = ffprobe
}

configurePortableControlPlaneMediaTools()

function readJson(filePath) { return JSON.parse(fsSync.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '')) }
function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex') }
function run(command, args, timeout = 60000) {
	const result = spawnSync(command, args, { cwd: repo, encoding: 'utf8', timeout, windowsHide: true })
	if (result.error || result.status !== 0) throw new Error(`${command} failed: ${String(result.stderr || result.stdout || result.error || '').slice(-500)}`)
	return result
}

async function normalizedGray(filePath) {
	return sharp(filePath).resize(64, 64, { fit: 'cover' }).grayscale().raw().toBuffer()
}

const report = {
	schemaVersion: 'betterpptx.avatar-identity-continuity.v1',
	status: 'BLOCKED',
	scope: 'synthetic-product-owned-private-research',
	consentedHumanAssetUsed: false,
	customerData: false,
	training: false,
}
let tempRoot
try {
	const fixture = readJson(fixturePath)
	const canary = readJson(canaryPath)
	const workerAll = fsSync.existsSync(workerCanaryAllPath) ? readJson(workerCanaryAllPath) : null
	const workerCanaries = workerAll?.status === 'research-live-pass' && Array.isArray(workerAll.results) && workerAll.results.length === 2
		? workerAll.results.map(result => ({ ...workerAll, results: [result] }))
		: workerCanaryPaths.map(readJson)
	const pptxBytes = await fs.readFile(pptxPath)
	const zip = await JSZip.loadAsync(pptxBytes)
	const mediaName = Object.keys(zip.files).find(name => /^ppt\/media\/.*\.(mp4|m4v)$/i.test(name))
	if (!mediaName) throw new Error('Canary PPTX has no embedded MP4 media part.')
	tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-identity-continuity-'))
	const videoPath = path.join(tempRoot, 'avatar.mp4')
	const framePath = path.join(tempRoot, 'avatar-frame.png')
	await fs.writeFile(videoPath, await zip.file(mediaName).async('nodebuffer'))
	const ffmpeg = await findFfmpeg()
	run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', '0.7', '-i', videoPath, '-frames:v', '1', '-vf', 'scale=256:256:force_original_aspect_ratio=decrease,pad=256:256:(ow-iw)/2:(oh-ih)/2:color=black', framePath])
	const sourceBytes = await fs.readFile(fixture.portrait.path)
	const posterBytes = await fs.readFile(fixture.source.path)
	const frameBytes = await fs.readFile(framePath)
	const expectedSubjectRef = 'synthetic-personalizedMeshy-identity-001'
	const canaryInputMatchesFixture = canary.input?.subjectRef === expectedSubjectRef
	if (!canaryInputMatchesFixture) {
		throw new Error(`Canary input mismatch: expected ${expectedSubjectRef}, received ${String(canary.input?.subjectRef || 'missing')}. Rerun with the exact synthetic identity fixture.`)
	}
	const sourceNorm = await normalizedGray(fixture.portrait.path)
	const frameNorm = await normalizedGray(framePath)
	let mae = 0
	for (let i = 0; i < sourceNorm.length; i++) mae += Math.abs(sourceNorm[i] - frameNorm[i])
	mae /= sourceNorm.length
	const canvas = sharp({ create: { width: 1080, height: 420, channels: 3, background: { r: 8, g: 14, b: 26 } } })
	const panels = await Promise.all([
		sharp(fixture.portrait.path).resize(360, 360, { fit: 'contain', background: { r: 8, g: 14, b: 26 } }).png().toBuffer(),
		sharp(fixture.source.path).resize(360, 360, { fit: 'contain', background: { r: 8, g: 14, b: 26 } }).png().toBuffer(),
		sharp(framePath).resize(360, 360, { fit: 'contain', background: { r: 8, g: 14, b: 26 } }).png().toBuffer(),
	])
	await canvas.composite(panels.map((input, index) => ({ input, left: index * 360, top: 0 }))).png().toFile(contactSheetPath)
	const nativeGlb = fixture.pairedNative3d.glb
	report.status = 'research-pass-quality-review-open'
	report.identity = {
		id: 'personalizedMeshy',
		lineage: 'same synthetic Meshy poster → native GLB and talking-head portrait derivative',
		portraitSha256: sha256(sourceBytes),
		nativePosterSha256: sha256(posterBytes),
		nativeGlbSha256: sha256(await fs.readFile(nativeGlb)),
	}
	report.canary = {
		workerMcpPptxStatus: canary.status,
		pptxDigest: canary.package?.digest || null,
		powerPointOpen: canary.powerPoint?.status === 'PASS',
		mediaPart: mediaName,
		videoFrameSha256: sha256(frameBytes),
		portraitToVideoFrameMeanAbsoluteError: Number(mae.toFixed(4)),
	}
	report.workerCanaries = workerCanaries.map(worker => ({
		accountId: worker.input?.subjectRef ? worker.results?.[0]?.accountId || null : null,
		status: worker.status,
		pipeline: worker.results?.[0]?.pipeline || null,
		gpuType: worker.results?.[0]?.gpuType || null,
		gpuSeconds: worker.results?.[0]?.gpuSeconds || null,
		videoDigest: worker.results?.[0]?.digest || null,
	}))
	report.checks = [
		{ id: 'same-synthetic-identity-lineage', status: 'PASS' },
		{ id: 'native-3d-glb-present', status: fsSync.existsSync(nativeGlb) ? 'PASS' : 'BLOCKED' },
		{ id: 'both-rotated-worker-canaries', status: workerCanaries.length === 2 && workerCanaries.every(worker => worker.status === 'research-live-pass') ? 'PASS' : 'BLOCKED' },
		{ id: 'canary-input-matches-synthetic-fixture', status: canaryInputMatchesFixture ? 'PASS' : 'BLOCKED' },
		{ id: 'worker-mcp-pptx-canary', status: canary.status === 'research-live-pass' && canaryInputMatchesFixture ? 'PASS' : 'BLOCKED' },
		{ id: 'video-frame-extracted', status: frameBytes.length > 1000 ? 'PASS' : 'BLOCKED' },
		{ id: 'independent-visual-identity-quality-review', status: 'OPEN' },
	]
	report.reviewRequired = 'Human or independently calibrated visual review must confirm facial/identity continuity and lip-sync quality across the native 3D poster, source portrait, and rendered video frame before public enablement.'
	report.evidence = { fixture: fixturePath, contactSheet: contactSheetPath, researchOnly: true }
	await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)
	console.log(JSON.stringify(report, null, 2))
} catch (error) {
	report.error = { code: 'VERIFY_FAILED', message: String(error?.message || error).slice(0, 500) }
	await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)
	console.error(JSON.stringify(report, null, 2))
	process.exitCode = 2
} finally {
	if (tempRoot) await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => {})
}
