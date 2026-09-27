// Read-only source audit for the dedicated 18-slot authoring-v3 interaction
// contract. Historical raw-source candidates remain separate from the current
// approved, hash-bound dedicated library and its native playback evidence.
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { NodeIO } from '@gltf-transform/core'
import { authoringMotionCatalog } from './ir/authoring-motion-catalog.mjs'
import { motionSourceProviderPolicy } from './assets/authoring-motion-sources.mjs'
import { inspectMotionLibraryEvidence } from './motion-library-evidence.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')
const clipmapPath = path.join(here, 'deploy', 'model3d-worker', 'canonical', 'authoring-clipmap-v3.json')
const ordinaryMocapRoot = path.join(here, 'deploy', 'model3d-worker', 'mocap')
const kineticMocapRoot = path.join(ordinaryMocapRoot, 'kinetic')
const clipmap = JSON.parse(fs.readFileSync(clipmapPath, 'utf8'))
const catalog = authoringMotionCatalog()
const runtimePolicy = motionSourceProviderPolicy()
const activeMixamoOnly = runtimePolicy.mode === 'mixamo-only'
const dedicatedSourceEvidence = inspectMotionLibraryEvidence({
	assetId: 'authoring-interaction-18',
	libraryPath: path.join(here, 'assets', 'authoring-interaction-clips-v3-proven.glb'),
	proofPath: path.join(here, 'assets', 'authoring-interaction-clips-v3-proof.json'),
	releaseManifestPath: path.join(here, 'docs', 'release-safety', 'G5-PRODUCT-ASSET-RELEASE-MANIFEST.json'),
	expectedClipNames: clipmap.slots.map(slot => `${String(slot.slot).padStart(2, '0')}_${slot.slug}`),
})
const interactionRows = catalog.records.filter(row => row.family === 'interaction')
const dedicatedSourceReady = dedicatedSourceEvidence.status === 'PASS' && interactionRows.length === clipmap.slots.length && interactionRows.every(row => row.selectable)
function listFiles(root) {
	if (!fs.existsSync(root)) return new Set()
	return new Set(fs.readdirSync(root, { withFileTypes: true }).filter(entry => entry.isFile()).map(entry => entry.name.toLowerCase()))
}
function sourceEvidence(root, file) {
	const absolutePath = path.join(root, file)
	if (!fs.existsSync(absolutePath)) return null
	const bytes = fs.readFileSync(absolutePath)
	return {
		file,
		bytes: bytes.length,
		sha256: sha256(bytes),
	}
}
const ordinaryFiles = listFiles(ordinaryMocapRoot)
const kineticFiles = listFiles(kineticMocapRoot)

// Inventory the actual baked GLBs as a separate evidence layer. A file with 18
// animations is not automatically the v3 interaction library: the ordinary
// presenter library also has 18, while the kinetic pool has 31. Classification
// is exact-name based and is deliberately informational; only the frozen v3
// clipmap + G5 rows + PowerPoint timeline manifest can make a slot shippable.
const ordinaryAnimationNames = [
	'idle', 'talk', 'greet', 'point', 'emphasize', 'magnitude', 'contrast', 'enumerate',
	'ask', 'present', 'agree', 'bow', 'think', 'disagree', 'happy', 'surprise', 'walk', 'clap',
]
const animationCandidates = [
	{ id: 'authoring-interaction-18', absolutePath: path.join(here, 'assets', 'authoring-interaction-clips-v3-proven.glb') },
	{ id: 'ordinary-18-gesture-library', absolutePath: path.join(here, 'assets', 'powerpoint-proven-mixamo-library.glb') },
	{ id: 'kinetic-31-clip-pool', absolutePath: path.join(here, 'assets', 'kinetic-clips.glb') },
	{ id: 'joe-ordinary-presenter-research', absolutePath: path.join(repoRoot, 'research-demos', '2026-07-10-presenter-roster', 'joe-presenter.glb') },
	{ id: 'joe-kinetic-presenter-research', absolutePath: path.join(repoRoot, 'research-demos', '2026-07-12-presenter-cofire', 'kinetic-joe-fixed.glb') },
	{ id: 'meshy-ordinary-hybrid-research', absolutePath: path.join(repoRoot, 'research-demos', '2026-07-18-meshy-avatar', 'production-hybrid-proof.glb') },
]
const io = new NodeIO()
function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex') }
function animationClassification(names) {
	const slugs = names.map(name => String(name).replace(/^\d+_/, ''))
	const ordinary = slugs.length === ordinaryAnimationNames.length && ordinaryAnimationNames.every((name, index) => slugs[index] === name)
	const kinetic = slugs.length === 31 && slugs.includes('superhero_landing') && slugs.includes('atlas_lift')
	const dedicated = clipmap.slots.length === slugs.length && clipmap.slots.every((slot, index) => slugs[index] === slot.slug)
	if (dedicated) return 'dedicated-authoring-v3-name-shape'
	if (ordinary) return 'ordinary-18-gesture-library'
	if (kinetic) return 'kinetic-31-clip-pool'
	return 'other-animation-library'
}
async function inspectAnimationCandidate(candidate) {
	const relativePath = path.relative(repoRoot, candidate.absolutePath).replaceAll('\\', '/')
	if (!fs.existsSync(candidate.absolutePath)) return { id: candidate.id, path: relativePath, status: 'MISSING' }
	const bytes = fs.readFileSync(candidate.absolutePath)
	try {
		const document = await io.readBinary(bytes)
		const names = document.getRoot().listAnimations().map(animation => animation.getName())
		return {
			id: candidate.id,
			path: relativePath,
			status: 'PRESENT',
			bytes: bytes.length,
			sha256: sha256(bytes),
			animationCount: names.length,
			animationNames: names,
			classification: animationClassification(names),
		}
	} catch (error) {
		return { id: candidate.id, path: relativePath, status: 'UNREADABLE', error: String(error?.message || error) }
	}
}
const animationInventory = await Promise.all(animationCandidates.map(inspectAnimationCandidate))
const dedicatedAnimationLibraries = animationInventory.filter(item => item.classification === 'dedicated-authoring-v3-name-shape')

// These are exact, conservative observations of the ordinary gesture pack;
// fuzzy matching is intentionally avoided because a near-name is not proof of
// a contact pose or a licensed v3 source take.
const ordinaryCandidateFiles = new Map([
	['pointing', 'point.fbx'],
	['pointing gesture', 'point.fbx'],
	['breathing idle', 'idle.fbx'],
	['idle', 'idle.fbx'],
	['talking', 'talk.fbx'],
	['emphasize', 'emphasize.fbx'],
	['waving', 'greet.fbx'],
	['bow', 'bow.fbx'],
	['head nod yes', 'agree.fbx'],
	['agreeing', 'agree.fbx'],
	['head shake no', 'disagree.fbx'],
	['disagreeing', 'disagree.fbx'],
	['walking', 'walk.fbx'],
	['walking (in place)', 'walk.fbx'],
])

// A kinetic take may be worth reviewing as raw source, but it is not an exact
// interaction-v3 candidate. These rows remain dedicated-source-missing until
// the pose, plateau, rest return, side/height semantics and distribution basis
// are all proven. Keeping this list explicit prevents broad fuzzy filename
// matching from quietly promoting the wrong motion.
const adjacentLocalReviewCandidates = new Map([
	[10, [{ family: 'kinetic', file: 'Lifting.fbx', rationale: 'Potential far-carry base take; grab/drop plateaus and carried-object posture are unproven.' }]],
	[12, [{ family: 'kinetic', file: 'Turning.fbx', rationale: 'Potential turn base take; walking-turn travel and final rest return are unproven.' }]],
])

const acquisitionGroups = new Map([
	[0, 'reach-low'], [1, 'reach-low'],
	[2, 'reach-mid'], [3, 'reach-mid'],
	[4, 'reach-high'], [5, 'reach-high'],
	[7, 'point-high'],
	[8, 'press-tap'],
	[9, 'grab-carry-near'],
])

const rows = clipmap.slots.map(slot => {
	const runtime = interactionRows.find(row => row.motionId === `motion.interaction.${slot.slug.replaceAll('_', '-')}`)
	const sourceReady = dedicatedSourceReady && runtime?.selectable === true
	const candidates = slot.source?.candidates || []
	const matches = candidates.map(candidate => ({ candidate, file: ordinaryCandidateFiles.get(String(candidate).toLowerCase()) }))
		.filter(item => item.file && ordinaryFiles.has(item.file.toLowerCase()))
		.map(item => ({ ...item, evidence: sourceEvidence(ordinaryMocapRoot, item.file) }))
	const kineticNearMatches = candidates.filter(candidate => kineticFiles.has(`${String(candidate).toLowerCase()}.fbx`))
	const adjacentReviewCandidates = (adjacentLocalReviewCandidates.get(slot.slot) || [])
		.filter(item => item.family !== 'kinetic' || kineticFiles.has(item.file.toLowerCase()))
		.map(item => ({ ...item, evidence: sourceEvidence(kineticMocapRoot, item.file) }))
	const sourceAction = sourceReady ? 'USE_APPROVED_DEDICATED_SOURCE' : matches.length
		? 'REVIEW_EXISTING_ORDINARY_SOURCE'
		: adjacentReviewCandidates.length
			? 'REVIEW_ADJACENT_LOCAL_SOURCE'
			: 'DOWNLOAD_OR_AUTHOR_SOURCE'
	return {
		slot: slot.slot,
		slug: slot.slug,
		candidates,
		ordinaryGestureMatches: matches,
		kineticPoolNearMatches: kineticNearMatches,
		adjacentLocalReviewCandidates: adjacentReviewCandidates,
		catalogAvailability: runtime?.lifecycle.productState || 'NOT_IN_CATALOG',
		sourceAction,
		acquisitionGroup: acquisitionGroups.get(slot.slot) || null,
		downloadSettings: sourceAction === 'DOWNLOAD_OR_AUTHOR_SOURCE'
			? { provider: 'mixamo', format: 'FBX Binary', skin: 'Without Skin', framesPerSecond: 30, keyframeReduction: 'None', inPlace: slot.role === 'travel' ? 'review-per-take' : true }
			: null,
		status: sourceReady ? 'EXECUTABLE_INTERACTION_MOTION' : matches.length ? 'ORDINARY_GESTURE_CANDIDATE_ONLY' : 'DEDICATED_SOURCE_MISSING',
	}
})

const ordinaryCandidateSlots = rows.filter(row => row.ordinaryGestureMatches.length > 0)
const adjacentLocalReviewSlots = rows.filter(row => row.adjacentLocalReviewCandidates.length > 0)
const externalSourceRows = rows.filter(row => row.sourceAction === 'DOWNLOAD_OR_AUTHOR_SOURCE')
const missingDedicatedSlots = rows.filter(row => row.status === 'DEDICATED_SOURCE_MISSING')
const acquisitionQueue = [...new Set(externalSourceRows.map(row => row.acquisitionGroup))].map(group => {
	const groupRows = externalSourceRows.filter(row => row.acquisitionGroup === group)
	return {
		group,
		slots: groupRows.map(row => row.slot),
		slugs: groupRows.map(row => row.slug),
		searchTerms: [...new Set(groupRows.flatMap(row => row.candidates))],
		downloadSettings: groupRows[0]?.downloadSettings || null,
		note: groupRows.length > 1 ? 'One approved base take may serve multiple slots only after explicit mirroring/height editing and per-slot oracle proof.' : 'Acquire one suitable take, then verify the exact interaction-v3 contract.',
	}
})
const report = {
	schema: 'betterpptx.authoring-v3-source-availability.v1',
	clipmap: 'betterpptx-mcp/deploy/model3d-worker/canonical/authoring-clipmap-v3.json',
	measuredAt: new Date().toISOString(),
	ordinaryMocapRoot: 'betterpptx-mcp/deploy/model3d-worker/mocap',
	kineticPoolRoot: 'betterpptx-mcp/deploy/model3d-worker/mocap/kinetic',
	sourceRoots: {
		ordinary: fs.existsSync(ordinaryMocapRoot) ? 'PRESENT' : 'MISSING',
		kinetic: fs.existsSync(kineticMocapRoot) ? 'PRESENT' : 'MISSING',
	},
	slotCount: rows.length,
	ordinaryCandidateSlotCount: ordinaryCandidateSlots.length,
	adjacentLocalReviewSlotCount: adjacentLocalReviewSlots.length,
	externalSourceRequiredSlotCount: externalSourceRows.length,
	uniqueExternalAcquisitionGroupCount: acquisitionQueue.length,
	dedicatedSourceMissingSlotCount: missingDedicatedSlots.length,
	acquisitionQueue,
	animationInventory,
	dedicatedAnimationLibraryCount: dedicatedAnimationLibraries.length,
	dedicatedSourceEvidence,
	dedicatedAuthoringV3Ready: dedicatedSourceReady,
	eligibleForPromotion: dedicatedSourceReady,
	productionPromotionAuthorized: false,
	runtimePolicy,
	activeRuntimeStatus: activeMixamoOnly && !dedicatedSourceReady ? 'MIXAMO_ONLY_ACTIVE_KIMODO_INTERACTION_PATH_QUARANTINED' : dedicatedSourceReady ? 'DEDICATED_INTERACTION_SOURCE_READY_FOR_SEPARATE_REVIEW' : 'DEDICATED_INTERACTION_SOURCE_NOT_READY',
	interpretation: dedicatedSourceReady
		? 'The dedicated interaction library has exact approved bytes, ordered clips, native playback evidence, and executable runtime catalog rows. No further source acquisition is required for this contract. Source-library eligibility does not authorize deployment or approve newly generated presenter visuals. Historical ordinary/kinetic candidate hints remain informational only.'
		: 'Historical candidate matches do not prove dedicated interaction readiness. Resolve the explicit source-evidence issues and unavailable runtime rows; do not substitute ordinary or kinetic clips silently.',
	rows,
}
const outputDir = path.join(here, 'outputs')
fs.mkdirSync(outputDir, { recursive: true })
fs.writeFileSync(path.join(outputDir, 'authoring-v3-source-availability-report.json'), JSON.stringify(report, null, 2) + '\n')
fs.writeFileSync(path.join(outputDir, 'authoring-v3-mixamo-download-queue.json'), JSON.stringify({
	schema: 'betterpptx.authoring-v3-mixamo-download-queue.v1',
	status: externalSourceRows.length ? 'AUTHENTICATED_DOWNLOADS_REQUIRED' : 'NO_DOWNLOADS_REQUIRED',
	destinationRoot: 'betterpptx-mcp/deploy/model3d-worker/mocap/authoring-v3',
	doNotCommitRawFbx: true,
	acquisitionGroups: acquisitionQueue,
	postDownloadGates: ['record-actual-take-and-source-row', 'g5-license-record', 'retarget-and-bake', 'powerpoint-oracle-timeline', 'owner-release-approval'],
}, null, 2) + '\n')
console.log(`AUTHORING-V3 SOURCE AVAILABILITY: executable=${rows.filter(row => row.status === 'EXECUTABLE_INTERACTION_MOTION').length}/${rows.length} external-source=${externalSourceRows.length} acquisition-groups=${acquisitionQueue.length} source-library=${dedicatedSourceReady ? 'READY' : activeMixamoOnly ? 'QUARANTINED_NOT_ACTIVE' : 'NOT_READY'} production-promotion=NOT_AUTHORIZED_BY_AUDIT`)
// A disabled dedicated provider is an intentional, fail-closed runtime state;
// it must not make the active Mixamo-only pipeline look unhealthy. Preserve a
// non-zero audit result when a future provider is enabled but genuinely lacks
// its source/proof gates.
if (!dedicatedSourceReady && !activeMixamoOnly) process.exitCode = 1
for (const row of rows) console.log(`${row.sourceAction.padEnd(34)} slot=${row.slot} ${row.slug}`)
