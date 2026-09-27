#!/usr/bin/env node
// Mutation-free playback evidence for both presenter representations.
// It consumes existing local artifacts only: no provider call, credential,
// customer image, or PowerPoint mutation is performed.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const repo = path.resolve('.')
const outputRoot = path.join(repo, 'betterpptx-mcp', 'outputs')
const talkingHeadPath = path.join(outputRoot, 'avatar-pptx-playback-contract-report.json')
const nativePath = path.join(repo, 'research-demos', '2026-07-18-meshy-avatar', 'visual-artifacts', 'default-presenter-native-gates-20260718', 'default-presenter-native-gates.json')
const reportPath = path.join(outputRoot, 'presenter-media-playback-corpus-report.json')

const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8').then(value => value.replace(/^\uFEFF/, '')))
const exists = async file => Boolean(await fs.stat(file).catch(() => null))
const sha256 = async file => crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex').toUpperCase()

const report = {
	schemaVersion: 'betterpptx.presenter-media-playback-corpus.v1',
	status: 'BLOCKED',
	scope: 'local-evidence-only / no-paid-provider-call',
	checks: {},
}

try {
	const [talkingHead, native] = await Promise.all([readJson(talkingHeadPath), readJson(nativePath)])
	assert.equal(talkingHead.status, 'PASS')
	assert.equal(talkingHead.checks.mp4ContainerAndTracks, true)
	assert.equal(talkingHead.checks.powerPointMediaRelationships, true)
	assert.equal(talkingHead.checks.advanceCoversNarration, true)
	report.checks.talkingHeadEmbeddedMp4 = true

	assert.equal(native.status, 'PASS')
	assert.deepEqual(native.identities.map(item => item.identity).sort(), ['joe', 'louise'])
	assert.equal(native.meshProviderRequests, 0)
	assert.equal(native.customerImagesSent, 0)
	const nativeEvidence = []
	for (const item of native.identities) {
		assert.equal(item.repairOpen, 'PASS')
		assert.equal(Number(item.changedFraction) > 0, true)
		const glb = path.join(repo, 'betterpptx-mcp', 'assets', `default-presenter-${item.identity}.glb`)
		const poster = path.join(repo, 'betterpptx-mcp', 'assets', `default-presenter-${item.identity}.png`)
		assert.equal(await exists(glb), true, `missing native source ${glb}`)
		assert.equal(await exists(poster), true, `missing native source ${poster}`)
		assert.equal(await sha256(glb), item.glb?.sha256, `native GLB hash changed for ${item.identity}`)
		assert.equal(await sha256(poster), item.poster?.sha256, `native poster hash changed for ${item.identity}`)
		// The historical gate report records hashes but not source paths; the
		// current asset hashes therefore bind the playback proof to its inputs.
		assert.equal(await exists(item.pptx), true, `missing native PowerPoint proof ${item.pptx}`)
		assert.equal(await exists(item.staticExport), true, `missing native static export ${item.staticExport}`)
		assert.equal(await exists(item.motionInfo), true, `missing native motion evidence ${item.motionInfo}`)
		const motion = await readJson(item.motionInfo)
		assert.equal(motion.ok, true)
		assert.equal(motion.comparison?.pass, true)
			nativeEvidence.push({
			identity: item.identity,
			glb,
			poster,
			pptx: item.pptx,
			staticExport: item.staticExport,
			motionInfo: item.motionInfo,
			changedFraction: item.changedFraction,
			glbSha256: item.glb?.sha256,
			posterSha256: item.poster?.sha256,
			pptxSha256: await sha256(item.pptx),
		})
	}
	report.checks.native3dPowerPointAndMotion = true
	report.talkingHead = {
		status: talkingHead.status,
		artifact: talkingHead.artifact,
		checks: talkingHead.checks,
	}
	report.native3d = {
		status: native.status,
		identities: nativeEvidence,
		meshProviderRequests: native.meshProviderRequests,
		customerImagesSent: native.customerImagesSent,
	}
	report.status = 'PASS'
} catch (error) {
	report.status = 'BLOCKED'
	report.error = { code: error?.code || 'MEDIA_PLAYBACK_CORPUS_FAILED', message: error?.message || String(error) }
}

await fs.mkdir(outputRoot, { recursive: true })
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
if (report.status !== 'PASS') process.exitCode = 2
