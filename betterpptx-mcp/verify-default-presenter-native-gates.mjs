// Native 3D only: prove both built-in fallback identities through the same
// PowerPoint generate, repair/open, static export, and slideshow-motion path.
// No Meshy request, customer image, or external provider is used.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ensureDefaultPresenterRegistered } from './assets/default-presenter-roster.mjs'
import { getCachedGeneratedRigged3d } from './assets/model3d-gen-providers.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..')
const demo = path.join(repo, 'research-demos', '2026-07-18-meshy-avatar')
const evidenceRoot = path.join(demo, 'visual-artifacts', 'default-presenter-native-gates-20260718')
const exportScript = path.join(repo, 'tools', 'export-native-pptx-png.ps1')
const motionScript = path.join(repo, 'tools', 'render-oracle', 'slideshow-motion-probe.ps1')

function run(command, args, env = {}, timeout = 180000) {
	const result = spawnSync(command, args, {
		cwd: repo,
		encoding: 'utf8',
		timeout,
		env: { ...process.env, BETTERPPTX_PREMIUM: '1', ...env },
	})
	if (result.error) throw result.error
	if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed (${result.status}): ${String(result.stderr || result.stdout).slice(-1500)}`)
	return String(result.stdout || '')
}

function hash(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase() }
function file(file) { assert.equal(fs.existsSync(file), true, `missing ${file}`); return file }
function readJson(filePath) { return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '')) }

fs.mkdirSync(evidenceRoot, { recursive: true })
const identities = ['joe', 'louise']
const results = []
for (const identity of identities) {
	const rawGlb = file(path.join(here, 'assets', `default-presenter-${identity}.glb`))
	const poster = file(path.join(here, 'assets', `default-presenter-${identity}.png`))
	const registered = ensureDefaultPresenterRegistered(identity)
	const cached = getCachedGeneratedRigged3d(registered.hash)
	assert.ok(cached?.glbBase64, `missing registered ${identity} GLB`)
	const resolvedGlb = path.join(evidenceRoot, identity, `default-presenter-${identity}-resolved.glb`)
	fs.writeFileSync(resolvedGlb, Buffer.from(cached.glbBase64, 'base64'))
	const glb = file(resolvedGlb)
	const proofName = `default-presenter-${identity}-native-proof`
	const pptx = path.join(demo, `${proofName}.pptx`)
	const exportDir = path.join(evidenceRoot, identity, 'static-export')
	const motionDir = path.join(evidenceRoot, identity, 'motion')
	fs.mkdirSync(path.dirname(pptx), { recursive: true })
	fs.mkdirSync(exportDir, { recursive: true })
	fs.mkdirSync(motionDir, { recursive: true })

	run(process.execPath, [path.join(demo, 'native-motion-proof.mjs')], {
		MOTION_GLB: glb,
		MOTION_POSTER: poster,
		MOTION_PROOF_NAME: proofName,
		MOTION_ANIM_ID: '2',
	})
	run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', exportScript, '-Pptx', pptx, '-OutDir', exportDir])
	run(process.execPath, [path.join(here, 'verify-public-gallery-repair.mjs'), '--deck', pptx, '--require-com'])
	run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', motionScript, '-Pptx', pptx, '-OutDir', motionDir, '-Slide', '1', '-SampleDelaysMs', '700,2200'])

	const motion = readJson(path.join(motionDir, 'motion-info.json'))
	const exportInfo = readJson(path.join(exportDir, 'export-info.json'))
	assert.equal(motion.ok, true)
	assert.equal(motion.comparison.pass, true)
	assert.equal(exportInfo.slides, 1)
	assert.equal(fs.existsSync(path.join(exportDir, 'Slide1.PNG')), true)
	results.push({
		identity,
		rawGlb: { path: rawGlb, bytes: fs.statSync(rawGlb).size, sha256: hash(rawGlb) },
		resolvedGlb: { path: glb, bytes: fs.statSync(glb).size, sha256: hash(glb) },
		materialProfile: cached.manifest?.materialProfile || null,
		poster: { bytes: fs.statSync(poster).size, sha256: hash(poster) },
		pptx,
		staticExport: path.join(exportDir, 'Slide1.PNG'),
		motionInfo: path.join(motionDir, 'motion-info.json'),
		changedFraction: motion.comparison.changedFraction,
		powerpointVersion: exportInfo.powerpointVersion,
		repairOpen: 'PASS',
	})
}

const report = {
	schemaVersion: 'betterpptx.default-presenter-native-gates.v1',
	status: 'PASS',
	scope: 'native-3d-presenter-only',
	developmentMode: 'premium',
	identities: results,
	meshProviderRequests: 0,
	customerImagesSent: 0,
}
const output = path.join(evidenceRoot, 'default-presenter-native-gates.json')
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
