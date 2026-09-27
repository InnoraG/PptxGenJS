import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { applyMixamoNonMetalMaterialProfile } from './glb-material-profile.mjs'
import { canonicalizeMixamoBoneNames } from './glb-rig-profile.mjs'
import { optimizeGlbTexturesSafeBuffer } from './optimize-glb-textures-safe.mjs'
import { parseGlb, transplantMotionSet } from '../ir/kinetic-transplant.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.dirname(path.dirname(here))
const sourcePath = path.join(repo, 'outputs', 'kimodo', 'joe-fresh-original-preserved-v1', 'joe-fresh-original-flat.glb')
const libraryPath = path.join(repo, 'outputs', 'kimodo', 'standing-motion-candidates-v1', 'standing-motion-candidates.glb')
const clipmapPath = path.join(repo, 'betterpptx-mcp', 'deploy', 'model3d-worker', 'canonical', 'standing-motion-candidates.json')
const outputPath = path.join(repo, 'outputs', 'kimodo', 'standing-motion-candidates-v1', 'joe-standing-motion-candidates.glb')

const source = fs.readFileSync(sourcePath)
const library = fs.readFileSync(libraryPath)
const clipmap = JSON.parse(fs.readFileSync(clipmapPath, 'utf8'))
const canonical = canonicalizeMixamoBoneNames(source)
const names = clipmap.clipNames
const selections = names.map(name => {
	const sourceSlug = name.slice(name.indexOf('_') + 1)
	return { motionId: sourceSlug, sourceSlug, outputSlug: sourceSlug, library, libraryKey: 'standing-candidates' }
})
const motion = transplantMotionSet(canonical.buffer, selections, { strict: true, channelPolicy: 'rotation-only' })
const parsed = parseGlb(motion.glb)
const counts = (parsed.json.animations || []).map(animation =>
	(animation.channels || []).reduce((result, channel) => {
		const target = channel.target?.path || 'unknown'
		result[target] = (result[target] || 0) + 1
		return result
	}, {}))
if (counts.length !== names.length || counts.some(count => count.rotation !== 22 || (count.translation || 0) !== 0 || (count.scale || 0) !== 0)) {
	throw new Error(`standing candidate channel drift: ${JSON.stringify(counts)}`)
}
if (motion.report.some(row => !String(row.status).includes('skip=0'))) throw new Error(`standing candidate skipped channels: ${JSON.stringify(motion.report)}`)
const matte = applyMixamoNonMetalMaterialProfile(motion.glb, { keepSourceSpecular: false })
const optimized = await optimizeGlbTexturesSafeBuffer(matte.buffer, { maxTextureSize: 512 })
fs.writeFileSync(outputPath, optimized.buffer)
console.log(JSON.stringify({
	outputPath,
	bytes: optimized.buffer.length,
	canonicalNamesChanged: canonical.changed,
	canonicalBoneCount: canonical.canonicalBoneCount,
	clips: names,
	channelCounts: counts,
	report: motion.report,
	matteChanges: matte.changed,
	textureReport: optimized.report,
}, null, 2))
