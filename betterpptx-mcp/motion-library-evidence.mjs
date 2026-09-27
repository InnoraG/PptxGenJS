// Private, read-only source-audit helper. Approval of a source library is not
// authorization to deploy it or visual acceptance of a newly built presenter.
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { parseGlb } from './ir/kinetic-transplant.mjs'

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

export function inspectMotionLibraryEvidence({ assetId, libraryPath, proofPath, releaseManifestPath, expectedClipNames, readFile = file => fs.readFileSync(file) }) {
	const issues = []
	const check = (code, passed) => { if (!passed) issues.push(code) }
	let library, proof, release, clipNames = []
	try { library = Buffer.from(readFile(libraryPath)) } catch { issues.push('MOTION_LIBRARY_MISSING') }
	try { proof = JSON.parse(readFile(proofPath)) } catch { issues.push('MOTION_LIBRARY_PROOF_MISSING') }
	try { release = JSON.parse(readFile(releaseManifestPath)) } catch { issues.push('MOTION_LIBRARY_APPROVAL_MISSING') }
	const digest = library ? sha256(library) : null
	const approval = release?.assets?.find(asset => asset.id === assetId)
	if (library) {
		try { clipNames = (parseGlb(library).json.animations || []).map(animation => animation.name) } catch { issues.push('MOTION_LIBRARY_INVALID') }
		check('MOTION_LIBRARY_APPROVAL_MISMATCH', approval?.approvalStatus === 'APPROVED' && approval.sha256 === digest && approval.bytes === library.length)
		check('MOTION_LIBRARY_PROOF_HASH_MISMATCH', proof?.output?.sha256 === digest && proof.output.bytes === library.length)
	}
	check('MOTION_LIBRARY_CLIP_ORDER_MISMATCH', Array.isArray(expectedClipNames) && expectedClipNames.length > 0 && same(clipNames, expectedClipNames) && same(proof?.clipNames, expectedClipNames))
	check('MOTION_LIBRARY_PROOF_NOT_PASSED', proof?.status === 'PASS' && Array.isArray(proof.pendingGates) && proof.pendingGates.length === 0)
	const powerpoint = proof?.powerpointEvidence
	check('MOTION_LIBRARY_PLAYBACK_NOT_PASSED', powerpoint?.status === 'PASS' && powerpoint.repairDisabledDecksPassed > 0 && powerpoint.nativeVideoSamplesPassed > 0)
	for (const key of ['powerpointOracle', 'visualReview']) {
		const evidence = powerpoint?.[key]
		try {
			const bytes = Buffer.from(readFile(evidence?.path))
			check(`MOTION_LIBRARY_${key.toUpperCase()}_MISMATCH`, bytes.length === evidence.bytes && sha256(bytes) === evidence.sha256)
		} catch { issues.push(`MOTION_LIBRARY_${key.toUpperCase()}_MISSING`) }
	}
	return {
		assetId, status: issues.length ? 'NOT_READY' : 'PASS', issues,
		sha256: digest, bytes: library?.length || 0, clipNames,
		approvalStatus: approval?.approvalStatus || 'NOT_REVIEWED',
		playbackStatus: powerpoint?.status || 'NOT_PROVEN',
		productionPromotionAuthorized: false,
	}
}
