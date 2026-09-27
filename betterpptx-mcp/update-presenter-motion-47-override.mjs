#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(here, 'implementation-gap-overrides.json')
const document = JSON.parse(fs.readFileSync(file, 'utf8'))
const id = 'impl-g-fadfa11e0ec0b8be'
const unit = document.workUnits?.[id]
if (!unit) throw new Error(`Missing implementation work unit ${id}`)

unit.gapInventoryStatus = 'complete'
unit.executionStatus = 'implemented'
delete unit.blockedReason
unit.ownerModules = [
	'betterpptx-mcp/ir/authoring-motion-catalog.mjs',
	'betterpptx-mcp/ir/kinetic-transplant.mjs',
	'betterpptx-mcp/assets/model3d-gen-providers.mjs',
	'betterpptx-mcp/assets/glb-motion-smoothing.mjs',
	'betterpptx-mcp/assets/glb-joint-rotation-constraints.mjs',
	'betterpptx-mcp/assets/kinetic-clips-extension.glb',
	'betterpptx-mcp/assets/authoring-interaction-clips-v3-proven.glb',
	'betterpptx-mcp/deploy/model3d-worker/canonical/kinetic-extension-clipmap.json',
	'betterpptx-mcp/deploy/model3d-worker/canonical/authoring-clipmap-v3.json',
	'betterpptx-mcp/presenter-motion-selection-contract.mjs',
	'betterpptx-mcp/docs/release-safety/G5-PRESENTER-MOTION-OWNER-DECISION-20260831.json',
	'betterpptx-mcp/test/authoring-motion-provider-routing.test.mjs',
	'betterpptx-mcp/test/presenter-motion-selection-contract.test.mjs',
]
unit.dependencies = [
	'Existing approved 31-clip kinetic pool and exact 14-row alias map',
	'Existing Modal Kimodo profiles and authenticated Meta Llama 3 model access',
	'Completed six-deck native PowerPoint repair/playback/visual proof across Joe, Louise, and Pete',
	'No hard external blocker',
]
unit.cheapChecks = [
	'node betterpptx-mcp/verify-presenter-motion-47-assets.mjs',
	'node betterpptx-mcp/verify-authoring-motion-catalog.mjs',
	'node --test betterpptx-mcp/test/authoring-motion-provider-routing.test.mjs betterpptx-mcp/test/presenter-motion-selection-contract.test.mjs',
	'npx tsc --noEmit',
	'npm run build:implementation-program',
	'npm run reconcile:implementation-program -- --start',
]
unit.notes = 'Implemented and retired. The 18 interaction rows now use the existing proven Kimodo authoring-v3 source library. The 29 kinetic rows resolve to fifteen newly baked Kimodo source clips plus fourteen explicit plan aliases across the original and extension pools. Every new clip is rotation-only inside the proven 22-bone envelope, uses bounded articulation/twist and angular-step stabilization, preserves each presenter’s original mesh/skin/texture payload and strict matte material, and passed repair-disabled native PowerPoint open plus rendered motion review across Joe, Louise, and Pete. The public catalog exposes 95 exact semantic choices while retaining the single ordinary enumerate playback hold; each presenter bundle remains capped at eighteen.'
unit.retired = true

fs.writeFileSync(file, `${JSON.stringify(document, null, 2)}\n`, 'utf8')
console.log(JSON.stringify({ id, executionStatus: unit.executionStatus, retired: unit.retired, ownerModules: unit.ownerModules.length, cheapChecks: unit.cheapChecks.length }, null, 2))
