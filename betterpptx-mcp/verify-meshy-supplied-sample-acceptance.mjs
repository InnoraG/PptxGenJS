#!/usr/bin/env node
// One bounded, no-network proof for the actual supplied Meshy GLB.
// Meshy geometry/material/texture are hybridized with the frozen Mixamo
// runtime, then sent through the premium authoring and native PowerPoint
// acceptance path. This is intentionally separate from the owner-authorized
// live canary and never retries automatically.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { hybridizeMeshyWithProvenMixamo } from './ir/meshy-mixamo-hybrid.mjs'
import { writeJsonReport } from './lib/atomic-report.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..')
const demo = path.join(repo, 'research-demos', '2026-07-18-meshy-avatar')
const defaultMeshy = path.join(repo, 'Meshy_AI_Casual_Denim_Look_biped', 'Meshy_AI_Casual_Denim_Look_biped_Character_output.glb')
const defaultProven = path.join(here, 'assets', 'powerpoint-proven-mixamo-library.glb')
const defaultPoster = path.join(demo, 'visual-artifacts', 'meshy-poster', 'meshy-native-poster.png')
const defaultOutDir = path.join(demo, 'visual-artifacts', 'release-gates', 'sample-meshy-supplied-acceptance-20260719')

function argValue(name, fallback) {
	const argv = process.argv.slice(2)
	const index = argv.indexOf(name)
	if (index >= 0) return argv[index + 1] || fallback
	const prefix = `${name}=`
	const inline = argv.find(value => value.startsWith(prefix))
	return inline ? inline.slice(prefix.length) : fallback
}

const meshyPath = path.resolve(argValue('--meshy-glb', defaultMeshy))
const provenPath = path.resolve(argValue('--proven-glb', defaultProven))
const posterPath = path.resolve(argValue('--poster', defaultPoster))
const outDir = path.resolve(argValue('--out-dir', defaultOutDir))
const hybridPath = path.join(outDir, 'sample-meshy-hybrid.glb')
const manifestPath = path.join(outDir, 'manifest.json')
const pptxPath = path.join(outDir, 'sample-meshy-powerpoint-proof.pptx')
const exportDir = path.join(outDir, 'static-export')
const reportPath = path.join(outDir, 'sample-meshy-supplied-acceptance.json')

function sha256(value) { return createHash('sha256').update(value).digest('hex').toUpperCase() }
function fileHash(file) { return sha256(fs.readFileSync(file)) }
function ensureFile(file, label) {
	if (!fs.existsSync(file)) throw new Error(`${label} is missing: ${file}`)
}
function terminateProcessTree(pid) {
	if (process.platform !== 'win32' || !pid) return
	spawnSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
}
function run(command, args, env = {}, timeoutMs = 240000) {
	const result = spawnSync(command, args, {
		cwd: repo,
		encoding: 'utf8',
		timeout: timeoutMs,
		windowsHide: true,
		env: { ...process.env, BETTERPPTX_PREMIUM: '1', ...env },
	})
	if (result.error) {
		if (result.error.code === 'ETIMEDOUT') {
			terminateProcessTree(result.pid)
			throw new Error(`${command} ${args.join(' ')} timed out after ${timeoutMs} ms; child process tree was terminated.`)
		}
		throw result.error
	}
	if (result.status !== 0) {
		const detail = String(result.stderr || result.stdout || '').slice(-2400)
		throw new Error(`${command} ${args.join(' ')} failed (${result.status}): ${detail}`)
	}
	return String(result.stdout || '')
}
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) }
function writeReport(report) {
	fs.mkdirSync(path.dirname(reportPath), { recursive: true })
	writeJsonReport(reportPath, report)
	console.log(JSON.stringify(report, null, 2))
}

const startedAt = new Date().toISOString()
try {
	for (const [file, label] of [[meshyPath, 'Meshy GLB'], [provenPath, 'proven Mixamo library'], [posterPath, 'Meshy poster']]) ensureFile(file, label)
	fs.mkdirSync(outDir, { recursive: true })

	const hybrid = await hybridizeMeshyWithProvenMixamo({
		meshyGlb: fs.readFileSync(meshyPath),
		provenGlb: fs.readFileSync(provenPath),
	})
	fs.writeFileSync(hybridPath, hybrid.glb)
	fs.writeFileSync(manifestPath, `${JSON.stringify(hybrid.manifest, null, 2)}\n`)

	run(process.execPath, [path.join(demo, 'production-hybrid-proof.mjs')], {
		MESHY_HYBRID_GLB: hybridPath,
		MESHY_HYBRID_MANIFEST: manifestPath,
		MESHY_NATIVE_POSTER: posterPath,
		MESHY_OUTPUT_GLB: hybridPath,
		MESHY_OUTPUT_PPTX: pptxPath,
		MESHY_BASIS_KEY: 'supplied-sample-acceptance.v1',
		MESHY_LICENSE_SOURCE: 'meshy-supplied-sample',
		MESHY_COMMERCIAL_USE: 'evaluation',
	}, 240000)

	const repairOutput = run(process.execPath, [path.join(here, 'verify-public-gallery-repair.mjs'), '--deck', pptxPath, '--require-com'], {}, 180000)
	run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(repo, 'tools', 'export-native-pptx-png.ps1'), '-Pptx', pptxPath, '-OutDir', exportDir], {}, 180000)
	const staticExport = {}
	for (const slide of [1, 2]) {
		const file = path.join(exportDir, `Slide${slide}.PNG`)
		ensureFile(file, `native Slide${slide} PNG export`)
		staticExport[`slide${slide}`] = { path: file, bytes: fs.statSync(file).size, sha256: fileHash(file) }
	}

	const motion = {}
	for (const slide of [1, 2]) {
		const motionDir = path.join(outDir, `motion-slide-${slide}`)
		run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(repo, 'tools', 'render-oracle', 'slideshow-motion-probe.ps1'), '-Pptx', pptxPath, '-OutDir', motionDir, '-Slide', String(slide), '-SampleDelaysMs', '700,2200'], {}, 60000)
		const infoPath = path.join(motionDir, 'motion-info.json')
		const info = readJson(infoPath)
		if (info.comparison?.pass !== true) throw new Error(`Native slideshow motion failed on slide ${slide}.`)
		motion[`slide${slide}`] = { motionInfo: infoPath, changedFraction: info.comparison.changedFraction, pass: true, createVideoIndependent: info.createVideoIndependent === true }
	}

	writeReport({
		schemaVersion: 'betterpptx.native-3d-supplied-sample-acceptance.v1',
		status: 'PASS',
		scope: 'native-3d-presenter-only',
		developmentMode: 'premium',
		networkAttempted: false,
		startedAt,
		completedAt: new Date().toISOString(),
		retryPolicy: 'One bounded hybridization, authoring, repair/export, and one motion probe per slide; no automatic retry.',
		inputs: {
			meshy: { path: meshyPath, bytes: fs.statSync(meshyPath).size, sha256: fileHash(meshyPath) },
			provenMixamo: { path: provenPath, bytes: fs.statSync(provenPath).size, sha256: fileHash(provenPath) },
			poster: { path: posterPath, bytes: fs.statSync(posterPath).size, sha256: fileHash(posterPath) },
		},
		hybrid: { path: hybridPath, bytes: fs.statSync(hybridPath).size, sha256: fileHash(hybridPath), manifest: hybrid.manifest },
		powerpoint: {
			path: pptxPath,
			bytes: fs.statSync(pptxPath).size,
			sha256: fileHash(pptxPath),
			repairVerifierPassed: repairOutput.includes('PUBLIC GALLERY REPAIR VERIFY: PASS'),
			staticExport,
			motion,
		},
		interpretation: 'The exact supplied Meshy sample enters the premium local authoring path as Meshy-visible geometry/material/texture on the frozen Mixamo runtime. This proves local integration only; it does not approve live Meshy use, deployment, billing, or rights.',
	})
} catch (error) {
	writeReport({
		schemaVersion: 'betterpptx.native-3d-supplied-sample-acceptance.v1',
		status: 'FAIL',
		scope: 'native-3d-presenter-only',
		developmentMode: 'premium',
		networkAttempted: false,
		startedAt,
		completedAt: new Date().toISOString(),
		error: error?.message || String(error),
		retryPolicy: 'No automatic retry; stop on the first diagnosed failure.',
	})
	process.exitCode = 2
}
