#!/usr/bin/env node
// Gate for the catalog-vs-bundle architecture.  It proves that the full
// vocabulary is accounted for while only current executable rows are public by
// default and while the 18-motion PowerPoint ceiling remains a bundle limit.

import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

import { authoringMotionCatalog, publicAuthoringMotionCatalog, resolveAuthoringMotionSelection, resolveAuthoringMotionSelectionForCatalog, AUTHORING_MOTION_BUNDLE_CEILING } from './ir/authoring-motion-catalog.mjs'
import { unavailableMotionCatalogFixture } from './test/fixtures/unavailable-motion-catalog.mjs'

const failures = []
let passed = 0
function ok(label, condition, detail = '') {
	if (condition) {
		passed += 1
		console.log(`PASS ${label}`)
	} else {
		failures.push(`${label}${detail ? ` — ${detail}` : ''}`)
		console.log(`FAIL ${label}${detail ? ` — ${detail}` : ''}`)
	}
}

const catalog = authoringMotionCatalog({ refresh: true })
const repeat = authoringMotionCatalog({ refresh: true })
const schemaPath = fileURLToPath(new URL('./deploy/model3d-worker/canonical/authoring-motion-catalog.schema.json', import.meta.url))
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'))
const canonicalPath = fileURLToPath(new URL('./deploy/model3d-worker/canonical/authoring-motion-catalog.json', import.meta.url))
const canonical = JSON.parse(fs.readFileSync(canonicalPath, 'utf8'))
const publicSelectable = publicAuthoringMotionCatalog({ family: 'motion', limit: 500 })
const publicAll = publicAuthoringMotionCatalog({ family: 'motion', includePlanned: true, limit: 500 })
const selectableIds = catalog.records.filter(row => row.selectable).map(row => row.motionId)

ok('catalog schema and deterministic fingerprint',
	catalog.schemaVersion === 'betterpptx.authoring-motion-catalog.v1'
	&& catalog.catalogFingerprint === repeat.catalogFingerprint
	&& catalog.verification.ok,
	JSON.stringify(catalog.verification.issues))
const canonicalIds = canonical.records.map(row => row.motionId).sort()
const currentIds = catalog.records.map(row => row.motionId).sort()
ok('frozen canonical ledger remains complete while the runtime policy overlays availability',
	canonical.schemaVersion === catalog.schemaVersion
	&& canonical.catalogVersion === catalog.catalogVersion
	&& canonical.bundleCeiling === catalog.bundleCeiling
	&& canonical.inventory.total === 96
	&& canonical.records.length === 96
	&& JSON.stringify(canonicalIds) === JSON.stringify(currentIds)
	&& canonical.verification?.ok === true
	&& catalog.runtimeMotionPolicy?.mode === 'mixamo-only'
	&& JSON.stringify(catalog.runtimeMotionPolicy?.activeProviders || []) === JSON.stringify(['mixamo'])
	&& JSON.stringify(catalog.runtimeMotionPolicy?.quarantinedProviders || []) === JSON.stringify(['nvidia-kimodo']),
	JSON.stringify({ canonical: canonical.catalogFingerprint, reconciled: catalog.catalogFingerprint, runtimePolicy: catalog.runtimeMotionPolicy }))
ok('canonical catalog schema freezes the 18-per-bundle law without limiting catalog rows',
	schema.$id === catalog.schemaVersion
	&& schema.properties?.bundleCeiling?.const === 18
	&& schema.properties?.records?.type === 'array'
	&& schema.$defs?.motionRecord?.properties?.motionId?.pattern,
	JSON.stringify({ id: schema.$id, ceiling: schema.properties?.bundleCeiling }))
ok('full catalog accounting remains distinct from deployment ceiling',
	catalog.inventory.kineticPlanEntries === 60
	&& catalog.inventory.kineticBakedEntries === 60
	&& catalog.inventory.ordinaryGestureEntries === 18
	&& catalog.inventory.interactionCandidateEntries === 18
	&& catalog.inventory.total === 96
	&& catalog.bundleCeiling === AUTHORING_MOTION_BUNDLE_CEILING,
	JSON.stringify(catalog.inventory))
ok('current executable catalog exposes only active Mixamo-backed kinetic and ordinary rows',
	catalog.inventory.selectable === 56
	&& catalog.records.filter(row => row.family === 'kinetic' && row.selectable).length === 38
	&& catalog.records.filter(row => row.family === 'interaction' && row.selectable).length === 0
	&& catalog.records.filter(row => row.family === 'ordinary-gesture' && row.selectable).length === 18
	&& catalog.records.filter(row => row.selectable).every(row => row.lifecycle.measurementState === 'POWERPOINT_MEASURED')
	&& catalog.records.filter(row => row.selectable && row.privateEvidence?.sourceProvider).every(row => row.privateEvidence.sourceProvider === 'mixamo')
	&& catalog.records.filter(row => row.privateEvidence?.sourceProvider === 'nvidia-kimodo').every(row => !row.selectable && row.privateEvidence.sourceProviderStatus === 'QUARANTINED'),
	JSON.stringify(catalog.inventory))
ok('Kimodo-backed rows remain explicitly held without silent substitution',
	catalog.inventory.notSelectable === 40
	&& catalog.records.filter(row => row.privateEvidence?.sourceProvider === 'nvidia-kimodo').length === 40
	&& catalog.records.filter(row => row.privateEvidence?.sourceProvider === 'nvidia-kimodo').every(row => row.lifecycle.productState === 'IMPLEMENTED_NOT_SELECTABLE'),
	JSON.stringify(catalog.inventory))
ok('public default projection exposes only executable semantic rows',
	publicSelectable.status === 'PUBLIC_AUTHORING_MOTION_CATALOG'
	&& publicSelectable.principle.selectionAuthority === 'AI'
	&& publicSelectable.principle.catalogDoesNotSelect === true
	&& publicSelectable.principle.privateAnimationIndicesHidden === true
	&& publicSelectable.pagination.total === 56
	&& publicSelectable.motions.every(row => row.selectable && !Object.hasOwn(row, 'privateEvidence') && !Object.hasOwn(row, 'animId')),
	JSON.stringify(publicSelectable.pagination))
ok('full catalog projection accounts for every currently executable row',
	publicAll.pagination.total === 96
	&& publicAll.motions.filter(row => row.selectable).length === 56
	&& publicAll.motions.filter(row => row.selectable === false).length === 40,
	JSON.stringify(publicAll.pagination))
const valid = resolveAuthoringMotionSelection(selectableIds.slice(0, AUTHORING_MOTION_BUNDLE_CEILING))
ok('exact 18 semantic selections are valid', valid.ok && valid.budget.used === 18 && valid.budget.remaining === 0, JSON.stringify(valid.errors))
const over = resolveAuthoringMotionSelection(selectableIds.slice(0, AUTHORING_MOTION_BUNDLE_CEILING + 1))
ok('19 semantic selections fail before bundle construction', !over.ok && over.errors.some(error => error.code === 'MOTION_BUNDLE_LIMIT_EXCEEDED'), JSON.stringify(over.errors))
const unknown = resolveAuthoringMotionSelection(['motion.unknown.nope'])
ok('unknown IDs fail explicitly', !unknown.ok && unknown.errors.some(error => error.code === 'MOTION_ID_UNKNOWN'), JSON.stringify(unknown.errors))
const plannedId = selectableIds[0]
const planned = resolveAuthoringMotionSelectionForCatalog(unavailableMotionCatalogFixture(catalog, plannedId), [plannedId])
ok('controlled planned IDs fail explicitly', !planned.ok && planned.errors.some(error => error.code === 'MOTION_NOT_EXECUTABLE') && planned.selectedMotionIds[0] === plannedId, JSON.stringify(planned.errors))
const heldId = 'motion.ordinary.enumerate'
const playbackHeld = resolveAuthoringMotionSelectionForCatalog(unavailableMotionCatalogFixture(catalog, heldId, 'IMPLEMENTED_NOT_SELECTABLE'), [heldId])
ok('controlled playback-held IDs fail explicitly without substitution', !playbackHeld.ok && playbackHeld.errors.some(error => error.code === 'MOTION_NOT_EXECUTABLE') && playbackHeld.selectedMotionIds[0] === heldId, JSON.stringify(playbackHeld.errors))
ok('the live resolver delegates to the same fixture-tested selection gate', JSON.stringify(valid) === JSON.stringify(resolveAuthoringMotionSelectionForCatalog(catalog, selectableIds.slice(0, AUTHORING_MOTION_BUNDLE_CEILING))))
const duplicate = resolveAuthoringMotionSelection([selectableIds[0], selectableIds[0]])
ok('duplicate IDs fail explicitly', !duplicate.ok && duplicate.errors.some(error => error.code === 'MOTION_ID_DUPLICATE'), JSON.stringify(duplicate.errors))
const blank = resolveAuthoringMotionSelection([selectableIds[0], '   '])
ok('blank selection positions fail explicitly instead of being dropped', !blank.ok && blank.errors.some(error => error.code === 'MOTION_ID_INVALID'), JSON.stringify(blank.errors))
const ceilingOverride = resolveAuthoringMotionSelection(selectableIds.slice(0, 19), { max: 99 })
ok('callers cannot raise the PowerPoint bundle ceiling above 18', !ceilingOverride.ok && ceilingOverride.budget.maximum === 18 && ceilingOverride.errors.some(error => error.code === 'MOTION_BUNDLE_LIMIT_EXCEEDED'), JSON.stringify(ceilingOverride))

console.log(`AUTHORING MOTION CATALOG GATE: ${passed} passed, ${failures.length} failed`)
if (failures.length) {
	console.error(failures.join('\n'))
	process.exitCode = 1
}
