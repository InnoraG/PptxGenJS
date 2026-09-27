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
const runRoot = process.env.BETTERPPTX_AUTHORING_INTERACTION_RUN_ROOT
	? path.resolve(process.env.BETTERPPTX_AUTHORING_INTERACTION_RUN_ROOT)
	: path.join(repo, 'outputs', 'kimodo', 'betterpptx-authoring-v3-quality-001-final-expanded', 'betterpptx-authoring-v3-quality-001')
const sourcePath = path.join(runRoot, 'authoring-interaction-clips-v3-candidate.glb')
const sourceReportPath = path.join(runRoot, 'candidate-bake-report.json')
const runManifestPath = path.join(runRoot, 'run-manifest.json')
const contractPath = path.join(repo, 'betterpptx-mcp', 'deploy', 'model3d-worker', 'canonical', 'authoring-clipmap-v3.json')
const outputPath = process.env.BETTERPPTX_AUTHORING_INTERACTION_OUTPUT
	? path.resolve(process.env.BETTERPPTX_AUTHORING_INTERACTION_OUTPUT)
	: path.join(here, 'authoring-interaction-clips-v3-proven.glb')
const proofPath = process.env.BETTERPPTX_AUTHORING_INTERACTION_PROOF
	? path.resolve(process.env.BETTERPPTX_AUTHORING_INTERACTION_PROOF)
	: path.join(here, 'authoring-interaction-clips-v3-proof.json')

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
for (const file of [sourcePath, sourceReportPath, runManifestPath, contractPath]) {
	if (!fs.existsSync(file)) throw new Error(`Missing interaction-library input: ${file}`)
}

const source = fs.readFileSync(sourcePath)
const sourceReport = readJson(sourceReportPath)
const runManifest = readJson(runManifestPath)
const contract = readJson(contractPath)
const expectedNames = (contract.slots || []).map(slot => `${String(slot.slot).padStart(2, '0')}_${slot.slug}`)
if (expectedNames.length !== 18) throw new Error(`Expected 18 interaction slots, found ${expectedNames.length}`)
if (sourceReport.glbSha256 !== sha256(source)) throw new Error('Kimodo interaction candidate hash does not match its immutable bake report')
if (runManifest.complete18SlotRun !== true || runManifest.allKinematicGatesPassed !== true) {
	throw new Error('Kimodo interaction run is not a complete 18-slot kinematic pass')
}

const slotProof = []
for (const slot of contract.slots) {
	const prefix = `${String(slot.slot).padStart(2, '0')}-${slot.slug}`
	const reportPath = path.join(runRoot, prefix, 'slot-report.json')
	const report = readJson(reportPath)
	if (report.selectionStatus !== 'KINEMATIC_GATE_PASSED_REVIEW_REQUIRED') {
		throw new Error(`Interaction slot ${slot.slug} has not passed its kinematic gate`)
	}
	const selected = (report.candidates || []).find(candidate => candidate.candidateId === report.selectedCandidateId)
	if (!selected?.kinematicGatesPassed) throw new Error(`Interaction slot ${slot.slug} selected candidate is not gate-passing`)
	slotProof.push({
		slot: slot.slot,
		slug: slot.slug,
		selectedCandidateId: report.selectedCandidateId,
		bvhSha256: selected.bvhSha256,
		score: selected.score,
		gates: selected.gates,
		durationMs: selected.metrics?.durationMs,
		footSkate: selected.metrics?.footSkate,
		rootDisplacementNormalized: selected.metrics?.rootDisplacementNormalized,
	})
}

const sourceParsed = parseGlb(source)
const canonicalSkeleton = readJson(path.join(repo, 'betterpptx-mcp', 'deploy', 'model3d-worker', 'canonical', 'canonical_skeleton.json'))
const presenterBones = new Set(canonicalSkeleton.bones.map(bone => bone.name))
for (const animation of sourceParsed.json.animations || []) {
	const sourceSamplers = animation.samplers || []
	const selected = (animation.channels || []).filter(channel => {
		const node = sourceParsed.json.nodes?.[channel.target?.node]
		return channel.target?.path === 'rotation' && presenterBones.has(node?.name)
	})
	const usedSamplers = [...new Set(selected.map(channel => channel.sampler))]
	const samplerMap = new Map(usedSamplers.map((samplerIndex, index) => [samplerIndex, index]))
	animation.samplers = usedSamplers.map(samplerIndex => sourceSamplers[samplerIndex])
	animation.channels = selected.map(channel => ({ ...channel, sampler: samplerMap.get(channel.sampler) }))
}
const rotationOnlySource = serializeGlb(sourceParsed.json, sourceParsed.bin)
const smoothed = smoothRotationAnimations(rotationOnlySource, { passes: 6 })
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
if (JSON.stringify(names) !== JSON.stringify(expectedNames)) throw new Error(`Interaction clip order drift: ${JSON.stringify(names)}`)
const channels = (parsed.json.animations || []).map(animation => (animation.channels || []).reduce((counts, channel) => {
	const target = String(channel.target?.path || 'unknown')
	counts[target] = (counts[target] || 0) + 1
	return counts
}, {}))
if (channels.some(count => count.rotation !== 22 || (count.translation || 0) !== 0 || (count.scale || 0) !== 0)) {
	throw new Error(`Unsafe interaction source channels: ${JSON.stringify(channels)}`)
}

fs.writeFileSync(outputPath, compact)
const proof = {
	schemaVersion: 'betterpptx.authoring-interaction-library-proof.v1',
	status: 'SOURCE_AND_KINEMATIC_GATES_PASS_POWERPOINT_PROOF_PENDING',
	contract: { path: contractPath, slots: expectedNames.length },
	sourceRun: {
		runId: runManifest.runId,
		profileSha256: runManifest.profileSha256,
		candidatePath: sourcePath,
		bytes: source.length,
		sha256: sha256(source),
		complete18SlotRun: true,
		allKinematicGatesPassed: true,
	},
	output: { path: outputPath, bytes: compact.length, sha256: sha256(compact), sourceOnly: true },
	clipNames: names,
	channelCounts: channels,
	smoothing: smoothed.report,
	slots: slotProof,
	pendingGates: ['powerpoint-oracle-timeline'],
}
fs.writeFileSync(proofPath, `${JSON.stringify(proof, null, 2)}\n`, 'utf8')
console.log(JSON.stringify({ status: proof.status, output: proof.output, clips: names.length, minimumScore: Math.min(...slotProof.map(row => row.score)) }, null, 2))
