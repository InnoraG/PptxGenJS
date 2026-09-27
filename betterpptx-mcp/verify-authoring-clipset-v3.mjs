#!/usr/bin/env node
// Production gate for the dedicated 18-slot interaction clip contract.
// It is intentionally read-only: a slot is not promoted by bookkeeping. The
// Mixamo source, baked GLB and rendered PowerPoint oracle manifest must all be
// present before a production profile is allowed to advertise interactions.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const clipmapPath = path.join(here, 'deploy', 'model3d-worker', 'canonical', 'authoring-clipmap-v3.json')
const clipmap = JSON.parse(fs.readFileSync(clipmapPath, 'utf8'))
const manifestArg = process.argv.find(arg => arg.startsWith('--manifest='))
const manifestPath = manifestArg ? path.resolve(manifestArg.slice('--manifest='.length)) : null
const manifest = manifestPath && fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : null
const failures = []
const slots = Array.isArray(clipmap.slots) ? clipmap.slots : []
if (slots.length !== Number(clipmap.clipCeiling || 18)) failures.push(`expected ${clipmap.clipCeiling} slots, found ${slots.length}`)
for (const slot of slots) {
  const status = String(slot?.source?.status || '')
  if (status !== 'SHIPPABLE') failures.push(`slot ${slot.slot} ${slot.slug}: source status is ${status || 'MISSING'}, expected SHIPPABLE`)
}
if (!manifest) failures.push('no --manifest supplied; provide the Baker manifest from the final baked GLB')
if (manifest && manifest.interactionClipset !== 'authoring-clipmap-v3') failures.push(`manifest.interactionClipset is ${manifest.interactionClipset || 'missing'}, expected authoring-clipmap-v3`)
const timelines = manifest?.clipTimelines?.timelines || manifest?.timelines
if (!timelines || typeof timelines !== 'object') failures.push('manifest.clipTimelines.timelines is missing (PowerPoint oracle measurement required)')
else {
	const expectedKeys = slots.map(slot => String(slot.slot))
	const actualKeys = Object.keys(timelines).sort((a, b) => Number(a) - Number(b))
	const missingKeys = expectedKeys.filter(key => !Object.prototype.hasOwnProperty.call(timelines, key))
	const extraKeys = actualKeys.filter(key => !expectedKeys.includes(key))
	if (missingKeys.length) failures.push(`manifest.clipTimelines.timelines is missing slots: ${missingKeys.join(', ')}`)
	if (extraKeys.length) failures.push(`manifest.clipTimelines.timelines contains unexpected slots: ${extraKeys.join(', ')}`)
	for (const slot of slots) {
		const points = timelines[String(slot.slot)]
		if (!Array.isArray(points) || points.length < 5) failures.push(`slot ${slot.slot} ${slot.slug}: fewer than 5 oracle points`)
		if (!Array.isArray(points) || points.length < 5) continue
		const malformed = points.some(point => !Array.isArray(point) || point.length < 3 || point.slice(0, 3).some(value => typeof value !== 'number' || !Number.isFinite(value)))
		if (malformed) {
			failures.push(`slot ${slot.slot} ${slot.slug}: oracle points must be numeric [timeMs,x,y] triples`)
			continue
		}
		const times = points.map(point => point[0])
		if (times.some((time, index) => index > 0 && time < times[index - 1])) failures.push(`slot ${slot.slot} ${slot.slug}: oracle timestamps are not ordered`)
		const observedDurationMs = times[times.length - 1] - times[0]
		const requiredPlateauMs = Math.max(Number(slot.plateauMs || 0), Number(slot.grabPlateauMs || 0), Number(slot.dropPlateauMs || 0))
		if (requiredPlateauMs > 0 && observedDurationMs < requiredPlateauMs) {
			failures.push(`slot ${slot.slot} ${slot.slug}: oracle span ${observedDurationMs}ms is shorter than required ${requiredPlateauMs}ms contract plateau`)
		}
	}
}
const report = {
  contract: 'betterpptx.authoring-clipset-v3.gate',
  clipmap: path.relative(here, clipmapPath).replaceAll('\\', '/'),
  slots: slots.length,
  manifest: manifestPath || null,
  status: failures.length ? 'BLOCKED' : 'SHIPPABLE',
  failures,
  next: failures.length
    ? 'Stage the licensed Mixamo source takes, bake the 18-slot library, render each final clip in PowerPoint, and attach the resulting clipTimelines manifest before deployment.'
    : 'Interaction-heavy production slides may use slides[].interactions; the compiler will require a solved _synergyPlan.',
}
console.log(JSON.stringify(report, null, 2))
process.exitCode = failures.length ? 1 : 0
