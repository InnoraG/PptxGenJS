// Native 3D only: one bounded handoff from the owner-authorized Meshy canary
// to the production hybrid PPTX acceptance path. Default is dry-run; --fixture
// exercises the complete local path without network. There is no automatic retry.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { writeJsonReport } from './lib/atomic-report.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..')
const demo = path.join(repo, 'research-demos', '2026-07-18-meshy-avatar')
const root = path.join(demo, 'visual-artifacts', 'live-meshy-acceptance-20260718')
const argv = process.argv.slice(2)
const live = argv.includes('--live')
const fixture = argv.includes('--fixture')
const inputs = []
for (let i = 0; i < argv.length; i++) {
	if (argv[i] === '--input') inputs.push(argv[++i] || '')
	else if (argv[i].startsWith('--input=')) inputs.push(argv[i].slice('--input='.length))
}

function terminateProcessTree(pid) {
	if (process.platform !== 'win32' || !pid) return
	spawnSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
}
function run(command, args, env = {}, timeout = 240000) {
	const result = spawnSync(command, args, { cwd: repo, encoding: 'utf8', timeout, windowsHide: true, env: { ...process.env, BETTERPPTX_PREMIUM: '1', ...env } })
	if (result.error) {
		if (result.error.code === 'ETIMEDOUT') {
			terminateProcessTree(result.pid)
			throw new Error(`${command} ${args.join(' ')} timed out after ${timeout} ms; child process tree was terminated.`)
		}
		throw result.error
	}
	if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed (${result.status}): ${String(result.stderr || result.stdout).slice(-1800)}`)
	return String(result.stdout || '')
}
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) }
function sha256(file) { return createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase() }
function writeReport(report) {
	const output = path.join(root, 'acceptance-report.json')
	writeJsonReport(output, report)
	console.log(JSON.stringify(report, null, 2))
}

if (!fixture && inputs.length === 0) {
	writeReport({ schemaVersion: 'betterpptx.meshy-live-acceptance.v1', status: 'OPEN_INPUT_REQUIRED', scope: 'native-3d-presenter-only', developmentMode: 'premium', networkAttempted: false, nextAction: 'Provide 1–4 owner-approved full-body PNG/JPG/JPEG paths, then run --dry-run or the explicitly approved --live path.', retryPolicy: 'No automatic retry.' })
	process.exitCode = 2
} else {
	try {
		const canaryDir = fixture ? path.join(root, 'fixture-canary') : path.join(root, 'live-canary')
		const canaryArgs = [path.join(here, 'verify-meshy-presenter-live-canary.mjs'), fixture ? '--dry-run' : (live ? '--live' : '--dry-run'), '--out-dir', canaryDir]
		for (const input of inputs) canaryArgs.push('--input', input)
		let acquisitionReportPath = null
		let acquisitionDir = canaryDir
		if (fixture) {
			acquisitionDir = path.join(root, 'fixture-mock-acquisition')
			run(process.execPath, [path.join(here, 'verify-meshy-presenter-mock-acquisition.mjs'), '--out-dir', acquisitionDir], {}, 120000)
			acquisitionReportPath = path.join(acquisitionDir, 'mock-acquisition-report.json')
			const acquisitionReport = readJson(acquisitionReportPath)
			if (acquisitionReport.status !== 'PASS' || acquisitionReport.networkAttempted !== false) throw new Error('Mock Meshy acquisition fixture did not pass its no-network contract.')
		}
		if (!fixture) {
			const canaryOutput = run(process.execPath, canaryArgs, {}, 120000)
			const canaryReport = readJson(path.join(canaryDir, 'canary-report.json'))
			if (!live || canaryReport.status !== 'PASS') {
				writeReport({ schemaVersion: 'betterpptx.meshy-live-acceptance.v1', status: canaryReport.status === 'DRY_RUN_PASS' ? 'DRY_RUN_PASS' : canaryReport.status, scope: 'native-3d-presenter-only', developmentMode: 'premium', networkAttempted: canaryReport.networkAttempted === true, canaryReport: path.join(canaryDir, 'canary-report.json'), inputCount: canaryReport.inputCount, nextAction: live ? 'Resolve the bounded canary report before continuing to PowerPoint acceptance.' : 'Owner approval is required before one live request; no PPTX acceptance run was attempted.', retryPolicy: 'No automatic retry.', canaryOutputDigest: sha256(path.join(canaryDir, 'canary-report.json')), canaryStdoutPresent: Boolean(canaryOutput) })
				process.exitCode = canaryReport.status === 'DRY_RUN_PASS' ? 0 : 2
				process.exit(canaryReport.status === 'DRY_RUN_PASS' ? 0 : 2)
			}
		}

		const acceptanceDir = fixture ? path.join(root, 'fixture') : path.join(root, 'live')
		const glb = path.join(acquisitionDir, 'hybrid.glb')
		const poster = path.join(acquisitionDir, 'meshy-poster.png')
		const manifest = path.join(acquisitionDir, 'manifest.json')
		const outputGlb = path.join(acceptanceDir, 'production-hybrid-proof.glb')
		const outputPptx = path.join(acceptanceDir, 'production-hybrid-proof.pptx')
		fs.mkdirSync(acceptanceDir, { recursive: true })
		const builderEnv = { MESHY_HYBRID_GLB: glb, MESHY_HYBRID_MANIFEST: manifest, MESHY_NATIVE_POSTER: poster, MESHY_OUTPUT_GLB: outputGlb, MESHY_OUTPUT_PPTX: outputPptx, MESHY_BASIS_KEY: `live-acceptance:${fixture ? 'mock-acquisition' : 'meshy-canary'}`, MESHY_LICENSE_SOURCE: fixture ? 'meshy-mock-acquisition' : 'meshy-live-canary', MESHY_COMMERCIAL_USE: fixture ? 'evaluation' : 'owner-approved-pending-release' }
		run(process.execPath, [path.join(demo, 'production-hybrid-proof.mjs')], builderEnv, 240000)
		const exportDir = path.join(acceptanceDir, 'static-export')
		run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(repo, 'tools', 'export-native-pptx-png.ps1'), '-Pptx', outputPptx, '-OutDir', exportDir], {}, 180000)
		const staticExport = {
			slide1: path.join(exportDir, 'Slide1.PNG'),
			slide2: path.join(exportDir, 'Slide2.PNG'),
		}
		for (const file of Object.values(staticExport)) {
			if (!fs.existsSync(file) || fs.statSync(file).size < 1024) throw new Error(`Native PowerPoint export missing or unexpectedly small: ${file}`)
		}
		const motion = {}
		for (const slide of [1, 2]) {
			const outDir = path.join(acceptanceDir, `motion-slide-${slide}`)
			run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(repo, 'tools', 'render-oracle', 'slideshow-motion-probe.ps1'), '-Pptx', outputPptx, '-OutDir', outDir, '-Slide', String(slide), '-SampleDelaysMs', '700,2200'], {}, 60000)
			motion[`slide${slide}`] = readJson(path.join(outDir, 'motion-info.json'))
		}
		// Run the isolated repair/open oracle last.  Its COM child may remain
		// alive briefly after returning; exporting first keeps the strict export
		// guard from mistaking that verifier-owned process for a user session.
		const repair = run(process.execPath, [path.join(here, 'verify-public-gallery-repair.mjs'), '--deck', outputPptx, '--require-com'], {}, 180000)
		const report = {
			schemaVersion: 'betterpptx.meshy-live-acceptance.v1',
			status: 'PASS',
			scope: 'native-3d-presenter-only',
			developmentMode: 'premium',
			networkAttempted: !fixture && live,
			fixture,
			canaryReport: fixture ? null : path.join(canaryDir, 'canary-report.json'),
			mockAcquisitionReport: acquisitionReportPath,
			artifacts: {
				glb: { path: outputGlb, bytes: fs.statSync(outputGlb).size, sha256: sha256(outputGlb) },
				pptx: { path: outputPptx, bytes: fs.statSync(outputPptx).size, repairVerifierPassed: repair.includes('PUBLIC GALLERY REPAIR VERIFY: PASS') },
				staticExport,
				motion: Object.fromEntries(Object.entries(motion).map(([key, value]) => [key, { changedFraction: value.comparison.changedFraction, pass: value.comparison.pass, motionInfo: path.join(acceptanceDir, `motion-${key.replace('slide', 'slide-')}`, 'motion-info.json') }])),
			},
			ownerActionAfterPass: fixture ? 'Use the same bounded command with owner-approved images and --live after account/consent/license approval.' : 'Record the owner-approved account/license decision before release.',
			retryPolicy: 'No automatic retry. One canary request and one downstream acceptance run per immutable input/output hash.',
		}
		writeReport(report)
	} catch (error) {
		writeReport({ schemaVersion: 'betterpptx.meshy-live-acceptance.v1', status: 'BLOCKED_ACCEPTANCE', scope: 'native-3d-presenter-only', developmentMode: 'premium', networkAttempted: !fixture && live, error: error?.message || String(error), retryPolicy: 'No automatic retry; stop on the first diagnosed failure.' })
		process.exitCode = 2
	}
}
