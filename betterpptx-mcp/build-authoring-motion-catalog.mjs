#!/usr/bin/env node
// Deterministically reconciles the full Authoring-v3 motion catalog from the
// tracked kinetic plan, actual baked GLB inventories, frozen interaction
// candidates, and G5 release manifest.  This is a maintainer build artifact;
// public clients receive only the sanitized projection from the engine.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { authoringMotionCatalog, writeAuthoringMotionCatalog } from './ir/authoring-motion-catalog.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const valueAfter = flag => {
	const index = args.indexOf(flag)
	return index >= 0 ? args[index + 1] : null
}
const canonicalPath = path.resolve(valueAfter('--canonical') || path.join(here, 'deploy', 'model3d-worker', 'canonical', 'authoring-motion-catalog.json'))
const reportPath = path.resolve(valueAfter('--report') || path.join(here, 'outputs', 'authoring-motion-catalog-reconciliation.json'))
const catalog = authoringMotionCatalog({ refresh: true })

if (!catalog.verification.ok) {
	console.error(`AUTHORING MOTION CATALOG BLOCKED: ${catalog.verification.issues.map(item => item.code).join(', ')}`)
	process.exitCode = 1
} else {
	for (const destination of [canonicalPath, reportPath]) {
		fs.mkdirSync(path.dirname(destination), { recursive: true })
		fs.writeFileSync(destination, `${JSON.stringify(catalog, null, 2)}\n`)
	}
	console.log(`AUTHORING MOTION CATALOG: total=${catalog.inventory.total} selectable=${catalog.inventory.selectable} kinetic=${catalog.inventory.kineticPlanEntries}/${catalog.inventory.kineticBakedEntries} ordinary=${catalog.inventory.ordinaryGestureEntries} interaction=${catalog.inventory.interactionCandidateEntries} fingerprint=${catalog.catalogFingerprint}`)
	console.log(`CANONICAL ${path.relative(here, canonicalPath).replaceAll('\\', '/')}`)
	console.log(`REPORT ${path.relative(here, reportPath).replaceAll('\\', '/')}`)
}

// Keep this exported helper reachable for programmatic build harnesses without
// requiring callers to know private catalog paths.
export { writeAuthoringMotionCatalog }
