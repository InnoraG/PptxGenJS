import fs from 'node:fs'
import path from 'node:path'
import { authoringMotionById } from './authoring-motion-catalog.mjs'

// Private compiler adapter. Ordinary catalog selectability and source-transfer
// metadata are not native cross-slide qualification. A separate frozen release
// record must exist, and its referenced bytes are re-read on each compile.
export function qualifiedContinuityReleaseByMotionId({ motionId, presenterIdentity } = {}) {
	const row = authoringMotionById(motionId)
	const release = row?.privateEvidence?.continuityRelease
	if (!row?.selectable || release?.status !== 'QUALIFIED' || release.presenterIdentity !== presenterIdentity) return null
	const files = ['sourceFile', 'assetFile', 'targetRigFile', 'nativeProofFile']
	if (files.some(key => typeof release[key] !== 'string' || !path.isAbsolute(release[key]))) return null
	try {
		return {
			...structuredClone(release),
			sourceBytes: fs.readFileSync(release.sourceFile),
			assetBytes: fs.readFileSync(release.assetFile),
			targetRigBytes: fs.readFileSync(release.targetRigFile),
			nativeProofBytes: fs.readFileSync(release.nativeProofFile),
		}
	} catch { return null }
}
