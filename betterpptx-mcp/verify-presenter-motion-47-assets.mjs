#!/usr/bin/env node
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { NodeIO } from '@gltf-transform/core'

import { inspectMaterialProfile } from './assets/glb-material-profile.mjs'
import { constrainPresenterArmArticulations, DEFAULT_CONSTRAINTS } from './assets/glb-joint-rotation-constraints.mjs'
import { smoothRotationAnimations } from './assets/glb-motion-smoothing.mjs'
import { applyStaticPoseFromSource, assertPowerPointSafeStaticPose } from './assets/glb-static-pose-profile.mjs'
import { parseGlb, serializeGlb } from './ir/kinetic-transplant.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.dirname(here)
const proofRoot = path.join(repo, 'outputs', 'kimodo', 'presenter-motion-47-proof')
const identities = ['joe', 'louise', 'pete']
const families = [
	{ name: 'interaction', clipmap: path.join(here, 'deploy', 'model3d-worker', 'canonical', 'authoring-clipmap-v3.json'), expected: 18 },
	{ name: 'kinetic-extension', clipmap: path.join(here, 'deploy', 'model3d-worker', 'canonical', 'kinetic-extension-clipmap.json'), expected: 15 },
]
const io = new NodeIO()
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const accessorDigest = accessor => {
	const array = accessor?.getArray()
	return array ? sha256(Buffer.from(array.buffer, array.byteOffset, array.byteLength)) : null
}
const visiblePayloadFingerprint = document => ({
	meshes: document.getRoot().listMeshes().map(mesh => mesh.listPrimitives().map(primitive => ({
		attributes: primitive.listSemantics().map(semantic => [semantic, accessorDigest(primitive.getAttribute(semantic))]),
		indices: accessorDigest(primitive.getIndices()),
	}))),
	textures: document.getRoot().listTextures().map(texture => [texture.getName(), texture.getMimeType(), sha256(texture.getImage())]),
	skins: document.getRoot().listSkins().map(skin => skin.listJoints().map(joint => joint.getName())),
})

const failures = []
const checks = []
const check = (name, condition, evidence = null) => {
	checks.push({ name, status: condition ? 'PASS' : 'FAIL', ...(evidence ? { evidence } : {}) })
	if (!condition) failures.push(name)
}

const sourceFingerprints = {}
const sourceBuffers = {}
for (const identity of identities) {
	const sourcePath = path.join(here, 'assets', `presenter-source-${identity}-static.glb`)
	sourceBuffers[identity] = fs.readFileSync(sourcePath)
	sourceFingerprints[identity] = visiblePayloadFingerprint(await io.read(sourcePath))
}

function withConstructionRestNodes(buffer, constructionBuffer) {
	const current = parseGlb(buffer)
	const construction = parseGlb(constructionBuffer)
	const restByName = new Map((construction.json.nodes || []).filter(node => node.name).map(node => [node.name, node]))
	for (const node of current.json.nodes || []) {
		const rest = restByName.get(node.name)
		if (!rest) continue
		for (const field of ['rotation', 'translation', 'scale']) {
			if (rest[field]) node[field] = [...rest[field]]
			else delete node[field]
		}
	}
	return serializeGlb(current.json, current.bin)
}

const models = []
for (const family of families) {
	const contract = readJson(family.clipmap)
	const expectedNames = Array.isArray(contract.clipNames)
		? contract.clipNames
		: (contract.slots || []).map(slot => `${String(slot.slot).padStart(2, '0')}_${slot.slug}`)
	check(`${family.name} contract has ${family.expected} ordered clips`, expectedNames.length === family.expected, { clipNames: expectedNames })
	for (const identity of identities) {
		const filePath = path.join(proofRoot, family.name, identity, `default-presenter-${identity}-${family.name}.glb`)
		const buffer = fs.readFileSync(filePath)
		const parsed = parseGlb(buffer)
		const displayPoseSource = fs.readFileSync(path.join(here, 'assets', `default-presenter-${identity}.glb`))
		const reappliedStaticPose = applyStaticPoseFromSource(buffer, displayPoseSource, { clipName: '00_idle' })
		const powerPointStaticPose = assertPowerPointSafeStaticPose(buffer, { label: `${family.name}/${identity}` })
		const names = (parsed.json.animations || []).map(animation => String(animation.name || ''))
		const channels = (parsed.json.animations || []).map(animation => (animation.channels || []).reduce((counts, channel) => {
			const target = String(channel.target?.path || 'unknown')
			counts[target] = (counts[target] || 0) + 1
			return counts
		}, {}))
		const materials = inspectMaterialProfile(buffer)
		const fingerprint = visiblePayloadFingerprint(await io.read(filePath))
		const articulationAuditBuffer = withConstructionRestNodes(buffer, sourceBuffers[identity])
		const constraints = Object.fromEntries(Object.entries(DEFAULT_CONSTRAINTS).map(([joint, constraint]) => [
			joint,
			constraint.twistMaxDegrees ? { ...constraint, twistAnimationNames: names } : constraint,
		]))
		const articulationAudit = constrainPresenterArmArticulations(articulationAuditBuffer, { animationNames: names, constraints }).report
		const handOpeningAudit = constrainPresenterArmArticulations(articulationAuditBuffer, {
			animationNames: names,
			constraints: {
				'mixamorig:LeftHand': DEFAULT_CONSTRAINTS['mixamorig:LeftHand'],
				'mixamorig:RightHand': DEFAULT_CONSTRAINTS['mixamorig:RightHand'],
			},
		}).report
		const smoothingAudit = smoothRotationAnimations(buffer, { passes: 1 }).report
		const twistRows = articulationAudit.filter(row => Number.isFinite(row.twistMaxDegrees))
		const envelopeRows = articulationAudit.filter(row => Number.isFinite(row.maxDegrees))
		const handRows = handOpeningAudit.filter(row => row.joint.endsWith('Hand'))
		const worstStep = Math.max(0, ...smoothingAudit.map(row => Number(row.before?.maxStepDegrees || 0)))
		const worstStepRow = [...smoothingAudit].sort((a, b) => Number(b.before?.maxStepDegrees || 0) - Number(a.before?.maxStepDegrees || 0))[0]
		const worstReversalP95 = Math.max(0, ...smoothingAudit.map(row => Number(row.before?.reversalRateP95 || 0)))
		const worstRoughnessP95 = Math.max(0, ...smoothingAudit.map(row => Number(row.before?.roughnessP95 || 0)))
		const worstRoughnessRow = [...smoothingAudit].sort((a, b) => Number(b.before?.roughnessP95 || 0) - Number(a.before?.roughnessP95 || 0))[0]
		// Athletic recovery/impact clips have intentional acceleration changes, so
		// they use a wider roughness envelope while retaining the same strict
		// reversal and 20-degree physical frame-step limits.
		const roughnessLimit = family.name === 'kinetic-extension' ? 0.6 : 0.35

		check(`${family.name}/${identity} clip order is exact`, JSON.stringify(names) === JSON.stringify(expectedNames), { names })
		check(`${family.name}/${identity} uses rotation-only 22-bone tracks`, channels.length === family.expected && channels.every(row => row.rotation === 22 && !row.translation && !row.scale), { channels })
		check(`${family.name}/${identity} preserves mesh, texture, and skin payload exactly`, JSON.stringify(fingerprint) === JSON.stringify(sourceFingerprints[identity]))
		check(`${family.name}/${identity} never exposes a T-pose in PowerPoint`, powerPointStaticPose.armDropRatio.left > powerPointStaticPose.requiredMinimumArmDropRatio && powerPointStaticPose.armDropRatio.right > powerPointStaticPose.requiredMinimumArmDropRatio, powerPointStaticPose)
		check(`${family.name}/${identity} neutral display pose is idempotent`, JSON.stringify(parsed.json.nodes) === JSON.stringify(parseGlb(reappliedStaticPose.buffer).json.nodes), { clipName: reappliedStaticPose.clipName, sampleTimeMs: reappliedStaticPose.sampleTimeMs })
		check(`${family.name}/${identity} remains strict matte`, materials.length > 0 && materials.every(row => row.metallicFactor === 0 && row.roughnessFactor === 1 && !row.hasMetallicRoughnessTexture && !row.hasSpecularExtension), { materials })
		check(`${family.name}/${identity} arm and forearm twist stays in the configured envelope`, twistRows.length > 0 && twistRows.every(row => Math.abs(Number(row.twistBeforeMaxDegrees || 0)) <= Number(row.twistMaxDegrees) + 0.1), { worst: twistRows.sort((a, b) => Math.abs(b.twistBeforeMaxDegrees || 0) - Math.abs(a.twistBeforeMaxDegrees || 0))[0] })
		check(`${family.name}/${identity} total forearm articulation stays in the configured envelope`, envelopeRows.length > 0 && envelopeRows.every(row => Number(row.beforeMaxDegrees || 0) <= Number(row.maxDegrees) + 0.1), { worst: envelopeRows.sort((a, b) => Number(b.beforeMaxDegrees || 0) - Number(a.beforeMaxDegrees || 0))[0] })
		check(`${family.name}/${identity} has no opening wrist spike`, handRows.length > 0 && handRows.every(row => row.openingSpikeAnchored === false), { affected: handRows.filter(row => row.openingSpikeAnchored).map(row => row.animation) })
		check(`${family.name}/${identity} has bounded frame-to-frame articulation speed`, worstStep <= 20, { worstStepDegrees: worstStep, worst: worstStepRow })
		check(`${family.name}/${identity} smoothing removed high-frequency reversals`, worstReversalP95 <= 0.12 && worstRoughnessP95 <= roughnessLimit, { worstReversalP95, worstRoughnessP95, roughnessLimit, worst: worstRoughnessRow })
		models.push({ family: family.name, identity, path: filePath, bytes: buffer.length, sha256: sha256(buffer), clips: names.length, materials, powerPointStaticPose, worstStepDegrees: worstStep, worstReversalP95, worstRoughnessP95 })
	}
}

const report = {
	schemaVersion: 'betterpptx.presenter-motion-47-asset-gates.v2',
	status: failures.length ? 'FAIL' : 'PASS_CHEAP_GATES_POWERPOINT_PENDING',
	models,
	checks,
	failures,
	pendingGates: failures.length ? [] : ['powerpoint-open-without-repair', 'powerpoint-visible-motion', 'human-deformation-review'],
}
fs.mkdirSync(proofRoot, { recursive: true })
fs.writeFileSync(path.join(proofRoot, 'asset-gates.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
console.log(JSON.stringify({ status: report.status, checks: checks.length, failed: failures.length, failures }, null, 2))
if (failures.length) process.exitCode = 1
