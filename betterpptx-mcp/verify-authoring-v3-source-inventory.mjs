#!/usr/bin/env node
// Private maintainer inventory for authoring-clipmap-v3. This is deliberately
// an inventory, not release authorization. Frozen acquisition-plan state is
// reported separately from today's approved library and executable catalog.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { authoringMotionCatalog } from './ir/authoring-motion-catalog.mjs'
import { inspectMotionLibraryEvidence } from './motion-library-evidence.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const contractPath = path.join(repoRoot, 'betterpptx-mcp', 'deploy', 'model3d-worker', 'canonical', 'authoring-clipmap-v3.json')
const outPath = path.resolve(process.argv[2] || path.join(repoRoot, 'betterpptx-mcp', 'outputs', 'authoring-v3-source-inventory.json'))
const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'))
const catalogRows = authoringMotionCatalog().records.filter(row => row.family === 'interaction')
const sourceEvidence = inspectMotionLibraryEvidence({
	assetId: 'authoring-interaction-18',
	libraryPath: path.join(repoRoot, 'betterpptx-mcp', 'assets', 'authoring-interaction-clips-v3-proven.glb'),
	proofPath: path.join(repoRoot, 'betterpptx-mcp', 'assets', 'authoring-interaction-clips-v3-proof.json'),
	releaseManifestPath: path.join(repoRoot, 'betterpptx-mcp', 'docs', 'release-safety', 'G5-PRODUCT-ASSET-RELEASE-MANIFEST.json'),
	expectedClipNames: contract.slots.map(slot => `${String(slot.slot).padStart(2, '0')}_${slot.slug}`),
})
const sourceLibraryReady = sourceEvidence.status === 'PASS' && catalogRows.length === contract.slots.length && catalogRows.every(row => row.selectable)

const roots = [
	{ id: 'gestures-pack-basic', dir: path.join(repoRoot, 'Gestures_Pack_Basic'), policy: 'owner-staged-build-input' },
	{ id: 'worker-mocap', dir: path.join(repoRoot, 'betterpptx-mcp', 'deploy', 'model3d-worker', 'mocap'), policy: 'gitignored-build-time-only' },
	{ id: 'presenter-roster', dir: path.join(repoRoot, 'research-demos', '2026-07-10-presenter-roster'), policy: 'private-research-roster' },
]

function walk(dir, prefix = '') {
	if (!fs.existsSync(dir)) return []
	const out = []
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name)
		const rel = path.join(prefix, entry.name)
		if (entry.isDirectory()) out.push(...walk(full, rel))
		else if (/\.(fbx|bvh)$/i.test(entry.name)) out.push({ name: entry.name, relative: rel.replaceAll('\\', '/'), bytes: fs.statSync(full).size })
	}
	return out
}
function normalize(value) { return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '') }

const inventories = roots.map(root => ({
	...root,
	exists: fs.existsSync(root.dir),
	files: walk(root.dir),
}))
const allFiles = inventories.flatMap(root => root.files.map(file => ({ ...file, root: root.id, path: `${root.id}/${file.relative}` })))
const basenames = allFiles.map(file => ({ ...file, normalized: normalize(path.basename(file.name, path.extname(file.name))) }))

// Conservative research hints only. These are semantic neighbors, not claims
// that a v3 slot is sourced, licensed, baked, or oracle-measured.
const semanticHints = {
	6: ['worker-mocap/point.fbx'], 7: ['worker-mocap/point.fbx'],
	10: ['worker-mocap/kinetic/Lifting.fbx'], 11: ['worker-mocap/walk.fbx'],
	12: ['worker-mocap/kinetic/Turning.fbx'], 13: ['worker-mocap/idle.fbx'],
	14: ['worker-mocap/emphasize.fbx'], 15: ['worker-mocap/bow.fbx', 'worker-mocap/greet.fbx'],
	16: ['worker-mocap/agree.fbx'], 17: ['worker-mocap/disagree.fbx'],
}

const slots = contract.slots.map(slot => {
	const runtime = catalogRows.find(row => row.motionId === `motion.interaction.${slot.slug.replaceAll('_', '-')}`)
	const candidateMatches = slot.source.candidates.flatMap(candidate => {
		const token = normalize(candidate)
		return basenames.filter(file => file.normalized === token)
			.map(file => ({ candidate, path: file.path, match: 'normalized-basename' }))
	})
	return {
		slot: slot.slot,
		slug: slot.slug,
		statusInContract: slot.source.status,
		candidateNames: slot.source.candidates,
		candidateFileMatches: candidateMatches,
		semanticResearchHints: semanticHints[slot.slot] || [],
		currentAvailability: runtime?.lifecycle.productState || 'NOT_IN_CATALOG',
		promotionStatus: sourceLibraryReady && runtime?.selectable ? 'APPROVED_SOURCE_LIBRARY' : 'SOURCE_GATES_OPEN',
		promotionBlockers: sourceLibraryReady && runtime?.selectable ? [] : [...sourceEvidence.issues, ...(!runtime?.selectable ? ['runtime-motion-not-selectable'] : [])],
	}
})

const report = {
	schemaVersion: 'betterpptx.authoring-v3-source-inventory.v1',
	status: 'INVENTORY_ONLY_WITH_CURRENT_SOURCE_EVIDENCE',
	publicEnablementAllowed: false,
	ownerApprovalNotInferred: true,
	contract: { path: path.relative(repoRoot, contractPath).replaceAll('\\', '/'), slots: contract.slots.length, clipCeiling: contract.clipCeiling },
	contractStatusCounts: contract.slots.reduce((acc, slot) => { acc[slot.source.status] = (acc[slot.source.status] || 0) + 1; return acc }, {}),
	localInventory: inventories.map(root => ({ id: root.id, policy: root.policy, exists: root.exists, fileCount: root.files.length, files: root.files.map(file => file.relative) })),
	allLocalMotionFileCount: allFiles.length,
	slots,
	exactCandidateMatchSlotCount: slots.filter(slot => slot.candidateFileMatches.length > 0).length,
	semanticHintSlotCount: slots.filter(slot => slot.semanticResearchHints.length > 0).length,
	sourceEvidence,
	gateTruth: {
		historicalContractAll18ToSource: contract.slots.every(slot => slot.source.status === 'TO_SOURCE'),
		all18RemainToSource: catalogRows.length === contract.slots.length && catalogRows.every(row => !row.selectable),
		sourceRowsRecorded: catalogRows.length === contract.slots.length && catalogRows.every(row => row.lifecycle.sourceState === 'SOURCE_IDENTIFIED'),
		bakedV3ManifestPresent: sourceEvidence.bytes > 0 && sourceEvidence.clipNames.length === contract.slots.length,
		oracleTimelineManifestPresent: sourceEvidence.playbackStatus === 'PASS' && !sourceEvidence.issues.some(issue => /POWERPOINT|VISUALREVIEW|PLAYBACK/.test(issue)),
		sourceLibraryReady,
		shippable: false,
		productionPromotionAuthorized: false,
		note: 'Current source readiness does not authorize deployment or substitute for visual acceptance of newly generated presenters.',
	},
}
fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ status: report.status, outPath, slots: report.contract.slots, historicalStatusCounts: report.contractStatusCounts, localMotionFiles: report.allLocalMotionFileCount, sourceLibraryReady, all18RemainToSource: report.gateTruth.all18RemainToSource }, null, 2))
