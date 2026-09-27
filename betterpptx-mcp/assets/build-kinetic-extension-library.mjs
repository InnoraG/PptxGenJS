import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { NodeIO } from '@gltf-transform/core'
import { prune } from '@gltf-transform/functions'

import { smoothRotationAnimations } from './glb-motion-smoothing.mjs'
import { parseGlb, serializeGlb } from '../ir/kinetic-transplant.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.dirname(path.dirname(here))
const runRoot = path.join(repo, 'outputs', 'kimodo', 'betterpptx-kinetic-extension-v2-selected', 'betterpptx-kinetic-extension-v2')
const sourcePath = path.join(runRoot, 'kinetic-extension-kimodo-candidate.glb')
const sourceReportPath = path.join(runRoot, 'candidate-bake-report.json')
const runManifestPath = path.join(runRoot, 'run-manifest.json')
const clipmapPath = path.join(repo, 'betterpptx-mcp', 'deploy', 'model3d-worker', 'canonical', 'kinetic-extension-clipmap.json')
const interactionLibraryPath = path.join(here, 'authoring-interaction-clips-v3-proven.glb')
const outputPath = path.join(here, 'kinetic-clips-extension.glb')
const proofPath = path.join(here, 'kinetic-clips-extension-proof.json')

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
for (const file of [sourcePath, sourceReportPath, runManifestPath, clipmapPath, interactionLibraryPath]) {
	if (!fs.existsSync(file)) throw new Error(`Missing kinetic-extension input: ${file}`)
}

const source = fs.readFileSync(sourcePath)
const sourceReport = readJson(sourceReportPath)
const runManifest = readJson(runManifestPath)
const clipmap = readJson(clipmapPath)
if (sourceReport.glbSha256 !== sha256(source)) throw new Error('Kinetic extension candidate hash does not match its bake report')
if (runManifest.completeProfileRun !== true || runManifest.allKinematicGatesPassed !== true) {
	throw new Error('Kinetic extension source run is not a complete kinematic pass')
}
if ((clipmap.clipNames || []).length !== 15 || Object.keys(clipmap.aliases || {}).length !== 14) {
	throw new Error('Kinetic extension contract must contain 15 source clips and 14 declared aliases')
}

// Match the already-proven 22-bone interaction source envelope. Keeping only
// these body rotations removes generated finger/wrist-detail tracks that are
// not reliable on every presenter skin and eliminates translation/scale so
// PowerPoint controls slide travel without stretching the mesh.
const interaction = parseGlb(fs.readFileSync(interactionLibraryPath))
const safeBones = new Set()
for (const animation of interaction.json.animations || []) {
	for (const channel of animation.channels || []) {
		if (channel.target?.path === 'rotation') safeBones.add(interaction.json.nodes?.[channel.target.node]?.name)
	}
}
if (safeBones.size !== 22) throw new Error(`Expected the proven 22-bone envelope, found ${safeBones.size}`)

const parsedSource = parseGlb(source)
for (const animation of parsedSource.json.animations || []) {
	const sourceSamplers = animation.samplers || []
	const selected = (animation.channels || []).filter(channel => {
		const node = parsedSource.json.nodes?.[channel.target?.node]
		return channel.target?.path === 'rotation' && safeBones.has(node?.name)
	})
	const usedSamplers = [...new Set(selected.map(channel => channel.sampler))]
	const samplerMap = new Map(usedSamplers.map((samplerIndex, index) => [samplerIndex, index]))
	animation.samplers = usedSamplers.map(samplerIndex => sourceSamplers[samplerIndex])
	animation.channels = selected.map(channel => ({ ...channel, sampler: samplerMap.get(channel.sampler) }))
}
const rotationOnly = serializeGlb(parsedSource.json, parsedSource.bin)
const smoothed = smoothRotationAnimations(rotationOnly, { passes: 8, maxStepDegrees: 14, preserveFirstKey: true })
const io = new NodeIO()
const document = await io.readBinary(smoothed.buffer)
const root = document.getRoot()
for (const mesh of root.listMeshes()) mesh.dispose()
for (const skin of root.listSkins()) skin.dispose()
for (const material of root.listMaterials()) material.dispose()
for (const texture of root.listTextures()) texture.dispose()
await document.transform(prune())
const compact = Buffer.from(await io.writeBinary(document))
const parsed = parseGlb(compact)
const names = (parsed.json.animations || []).map(animation => String(animation.name || ''))
if (JSON.stringify(names) !== JSON.stringify(clipmap.clipNames)) throw new Error(`Kinetic extension clip order drift: ${JSON.stringify(names)}`)
const channels = (parsed.json.animations || []).map(animation => (animation.channels || []).reduce((counts, channel) => {
	const target = String(channel.target?.path || 'unknown')
	counts[target] = (counts[target] || 0) + 1
	return counts
}, {}))
if (channels.some(count => count.rotation !== 22 || (count.translation || 0) !== 0 || (count.scale || 0) !== 0)) {
	throw new Error(`Unsafe kinetic extension channels: ${JSON.stringify(channels)}`)
}

const slots = []
for (const reportRow of runManifest.reports || []) {
	const prefix = `${String(reportRow.slot).padStart(2, '0')}-${reportRow.slug}`
	const report = readJson(path.join(runRoot, prefix, 'slot-report.json'))
	const selected = (report.candidates || []).find(candidate => candidate.candidateId === report.selectedCandidateId)
	if (report.selectionStatus !== 'KINEMATIC_GATE_PASSED_REVIEW_REQUIRED' || !selected?.kinematicGatesPassed) {
		throw new Error(`Kinetic extension slot ${report.slug} is not gate-passing`)
	}
	slots.push({
		slot: report.slot,
		slug: report.slug,
		selectedCandidateId: report.selectedCandidateId,
		bvhSha256: selected.bvhSha256,
		score: selected.score,
		gates: selected.gates,
		durationMs: selected.metrics?.durationMs,
		motionEnergy: selected.metrics?.motionEnergy,
		rootDisplacementNormalized: selected.metrics?.rootDisplacementNormalized,
	})
}

fs.writeFileSync(outputPath, compact)
const proof = {
	schemaVersion: 'betterpptx.kinetic-extension-library-proof.v1',
	status: 'SOURCE_AND_KINEMATIC_GATES_PASS_POWERPOINT_PROOF_PENDING',
	profile: { path: path.join(repo, 'betterpptx-mcp', 'deploy', 'model3d-worker', 'kimodo', 'kinetic-extension-profile.json'), sha256: runManifest.profileSha256 },
	sourceRun: { runId: runManifest.runId, candidatePath: sourcePath, bytes: source.length, sha256: sha256(source), completeProfileRun: true, allKinematicGatesPassed: true },
	output: { path: outputPath, bytes: compact.length, sha256: sha256(compact), sourceOnly: true },
	safeBoneEnvelope: [...safeBones].sort(),
	clipNames: names,
	aliases: clipmap.aliases,
	channelCounts: channels,
	smoothing: smoothed.report,
	slots,
	pendingGates: ['powerpoint-oracle-timeline'],
}
fs.writeFileSync(proofPath, `${JSON.stringify(proof, null, 2)}\n`, 'utf8')
console.log(JSON.stringify({ status: proof.status, output: proof.output, sourceClips: names.length, aliases: Object.keys(proof.aliases).length, minimumScore: Math.min(...slots.map(row => row.score)) }, null, 2))
