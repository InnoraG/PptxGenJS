#!/usr/bin/env node
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { constrainPresenterArmArticulations, DEFAULT_CONSTRAINTS } from './assets/glb-joint-rotation-constraints.mjs'
import { smoothRotationAnimations } from './assets/glb-motion-smoothing.mjs'
import { applyStaticPoseFromSource, assertPowerPointSafeStaticPose } from './assets/glb-static-pose-profile.mjs'
import { transplantMotionSet } from './ir/kinetic-transplant.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.dirname(here)
const outputRoot = path.join(repo, 'outputs', 'kimodo', 'presenter-motion-47-proof')
const identities = ['joe', 'louise', 'pete']
const families = [
	{
		name: 'interaction',
		libraryPath: path.join(here, 'assets', 'authoring-interaction-clips-v3-proven.glb'),
		clipmapPath: path.join(here, 'deploy', 'model3d-worker', 'canonical', 'authoring-clipmap-v3.json'),
	},
	{
		name: 'kinetic-extension',
		libraryPath: path.join(here, 'assets', 'kinetic-clips-extension.glb'),
		clipmapPath: path.join(here, 'deploy', 'model3d-worker', 'canonical', 'kinetic-extension-clipmap.json'),
	},
]
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const rows = []

for (const family of families) {
	const library = fs.readFileSync(family.libraryPath)
	const contract = readJson(family.clipmapPath)
	const clipNames = Array.isArray(contract.clipNames)
		? contract.clipNames
		: (contract.slots || []).map(slot => `${String(slot.slot).padStart(2, '0')}_${slot.slug}`)
	const constraints = Object.fromEntries(Object.entries(DEFAULT_CONSTRAINTS).map(([joint, constraint]) => [
		joint,
		constraint.twistMaxDegrees ? { ...constraint, twistAnimationNames: clipNames } : constraint,
	]))
	for (const identity of identities) {
		const basePath = path.join(here, 'assets', `presenter-source-${identity}-static.glb`)
		const displayPoseSourcePath = path.join(here, 'assets', `default-presenter-${identity}.glb`)
		const outputDir = path.join(outputRoot, family.name, identity)
		const outputPath = path.join(outputDir, `default-presenter-${identity}-${family.name}.glb`)
		const base = fs.readFileSync(basePath)
		const displayPoseSource = fs.readFileSync(displayPoseSourcePath)
		const transplanted = transplantMotionSet(base, clipNames.map(clipName => ({
			motionId: clipName,
			sourceSlug: clipName,
			outputSlug: clipName.replace(/^\d{2}_/, ''),
			library,
			libraryKey: family.name,
		})), { rotationRetargetSpace: 'global' })
		const constrained = constrainPresenterArmArticulations(transplanted.glb, { animationNames: clipNames, constraints })
		const stabilized = smoothRotationAnimations(constrained.buffer, { passes: 2, animationNames: clipNames, maxStepDegrees: 18, preserveFirstKey: true })
		// Retargeting intentionally uses the rig's T-pose bind/rest basis.  That
		// pose must never escape into PowerPoint, whose editor/zoom/static render
		// can reveal the GLB node transforms before playScene starts.
		const staticPose = applyStaticPoseFromSource(stabilized.buffer, displayPoseSource, { clipName: '00_idle' })
		const powerPointStaticPose = assertPowerPointSafeStaticPose(staticPose.buffer, { label: `${family.name}/${identity}` })
		fs.mkdirSync(outputDir, { recursive: true })
		fs.writeFileSync(outputPath, staticPose.buffer)
		rows.push({
			family: family.name,
			identity,
			path: outputPath,
			bytes: staticPose.buffer.length,
			sha256: sha256(staticPose.buffer),
			clips: clipNames.length,
			displayPoseSourcePath,
			staticPose: {
				clipName: staticPose.clipName,
				clipIndex: staticPose.clipIndex,
				sampleTimeMs: staticPose.sampleTimeMs,
				changedNodeChannels: staticPose.changedNodeChannels,
				powerPointStaticPose,
			},
			transplant: transplanted.report,
			retargetValidation: transplanted.retargetValidation,
			articulation: constrained.report,
			stabilization: stabilized.report,
		})
	}
}

const report = {
	schemaVersion: 'betterpptx.presenter-motion-47-proof-models.v1',
	status: 'PASS',
	rows,
}
fs.mkdirSync(outputRoot, { recursive: true })
fs.writeFileSync(path.join(outputRoot, 'model-build-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
console.log(JSON.stringify({ status: report.status, models: rows.map(row => ({ family: row.family, identity: row.identity, bytes: row.bytes, sha256: row.sha256, clips: row.clips })) }, null, 2))
