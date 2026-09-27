#!/usr/bin/env node
/**
 * Read-only structural audit for the three exact G5 product-bundle candidates.
 *
 * This is technical evidence only. It never infers owner approval, licensing
 * clearance, public enablement, or readiness of the separate authoring-v3
 * interaction contract.
 */
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..')
const manifestPath = path.join(here, 'docs/release-safety/G5-PRODUCT-ASSET-RELEASE-MANIFEST.json')
const clipMapPath = path.join(here, 'deploy/model3d-worker/canonical/canonical-clipmap.json')
const reportPath = path.join(here, 'outputs/g5-bundle-candidate-evidence.json')
const candidateIds = new Set(['ordinary-18-gesture-library', 'default-presenter-joe', 'default-presenter-louise'])

const [manifest, clipMap] = await Promise.all([
	fs.readFile(manifestPath, 'utf8').then(JSON.parse),
	fs.readFile(clipMapPath, 'utf8').then(JSON.parse),
])
const expectedClipNames = [...clipMap.clipNames]
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
const issues = []
const checks = []

function durationSeconds(animation) {
	let maximum = 0
	for (const sampler of animation.listSamplers()) {
		const array = sampler.getInput()?.getArray()
		if (!array) continue
		for (const value of array) maximum = Math.max(maximum, Number(value) || 0)
	}
	return Number(maximum.toFixed(6))
}

for (const asset of manifest.assets.filter(item => candidateIds.has(item.id))) {
	const absolute = path.resolve(repo, asset.path)
	const bytes = await fs.readFile(absolute)
	const sha256 = crypto.createHash('sha256').update(bytes).digest('hex')
	const document = await io.read(absolute)
	const root = document.getRoot()
	const animations = root.listAnimations()
	const clipNames = animations.map(animation => animation.getName())
	const clipDurationsSeconds = animations.map(durationSeconds)
	const meshCount = root.listMeshes().length
	const primitiveCount = root.listMeshes().reduce((total, mesh) => total + mesh.listPrimitives().length, 0)
	const evidence = {
		id: asset.id,
		path: asset.path,
		sha256,
		bytes: bytes.length,
		sceneCount: root.listScenes().length,
		nodeCount: root.listNodes().length,
		meshCount,
		primitiveCount,
		skinCount: root.listSkins().length,
		materialCount: root.listMaterials().length,
		textureCount: root.listTextures().length,
		animationCount: animations.length,
		clipNames,
		clipDurationsSeconds,
		channelsPerAnimation: animations.map(animation => animation.listChannels().length),
	}
	const failures = []
	if (sha256 !== String(asset.sha256).toLowerCase()) failures.push('hash mismatch')
	if (bytes.length !== Number(asset.bytes)) failures.push('byte-size mismatch')
	if (animations.length !== 18) failures.push(`expected 18 animations, found ${animations.length}`)
	if (JSON.stringify(clipNames) !== JSON.stringify(expectedClipNames)) failures.push('canonical clip order/name mismatch')
	if (root.listSkins().length !== 1) failures.push(`expected one skin, found ${root.listSkins().length}`)
	if (asset.id === 'ordinary-18-gesture-library' && (meshCount !== 0 || root.listMaterials().length !== 0 || root.listTextures().length !== 0)) {
		failures.push('skeletal-only deployment bundle unexpectedly contains mesh/material/texture content')
	}
	if (asset.id !== 'ordinary-18-gesture-library' && meshCount === 0) failures.push('presenter bundle has no visible mesh')
	if (failures.length) issues.push({ id: asset.id, failures })
	checks.push({ ...evidence, status: failures.length ? 'FAIL' : 'PASS', failures })
}

const candidates = Object.fromEntries(checks.map(item => [item.id, item]))
const referenceDurations = candidates['ordinary-18-gesture-library']?.clipDurationsSeconds
for (const id of ['default-presenter-joe', 'default-presenter-louise']) {
	if (JSON.stringify(candidates[id]?.clipDurationsSeconds) !== JSON.stringify(referenceDurations)) {
		issues.push({ id, failures: ['clip durations differ from the curated 18-clip deployment bundle'] })
		if (candidates[id]) candidates[id].status = 'FAIL'
	}
}

const report = {
	schemaVersion: 'betterpptx.g5-bundle-candidate-evidence.v1',
	measuredAt: new Date().toISOString(),
	status: issues.length ? 'FAIL' : 'PASS',
	ownerApprovalInferred: false,
	scope: 'exact bytes, GLB readability, visible/skeletal inventory, and canonical 18-clip alignment only',
	architectureBoundary: {
		plannedMasterKineticCatalogEntries: 60,
		currentlyBakedKineticPoolClips: 31,
		maximumEmbeddedClipsPerPresenterOrDeck: 18,
		curatedPresenterDeploymentBundleClips: 18,
		dedicatedAuthoringV3SemanticSlots: 18,
		dedicatedAuthoringV3Status: '18/18 TO_SOURCE — outside this approval',
	},
	canonicalClipNames: expectedClipNames,
	checks,
	issues,
}
await fs.mkdir(path.dirname(reportPath), { recursive: true })
await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
if (issues.length) process.exitCode = 1
