import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import {
	SECTION_SUMMARY_ZOOM_ROWS,
	SECTION_SUMMARY_ZOOM_UNIT_ID,
	probeSectionSummaryZoomRuntime,
	runSectionSummaryZoomUnitProof,
} from '../verify-section-summary-zoom-unit-v1.mjs'

test('Section and Summary Zoom generated-unit identity is frozen', () => {
	assert.equal(SECTION_SUMMARY_ZOOM_UNIT_ID, 'impl-b-b788572e1bb6d7f7')
	assert.deepEqual(SECTION_SUMMARY_ZOOM_ROWS, [
		['cap_5adc3514c23e1839a324', 'summary zoom'],
		['cap_8955ad9479da6e1f4185', 'section zoom'],
	])
})

test('core serializer emits exact native Section/Summary Zoom Choice/Fallback topology', async () => {
	const probe = await probeSectionSummaryZoomRuntime()
	assert.equal(probe.ready, true, probe.message)
	assert.equal(probe.topology.sectionZoom.targetTitle, 'Details')
	assert.deepEqual(probe.topology.summaryZoom.targets.map(item => item.targetTitle), ['Overview', 'Details'])
})

test('public Section/Summary Zoom lifecycle preserves section identity and package closure', async () => {
	const outputDir = path.join(os.tmpdir(), `betterpptx-section-summary-zoom-test-${Date.now()}-${process.pid}`)
	const proof = await runSectionSummaryZoomUnitProof({ outputDir, office: false })
	assert.equal(proof.status, 'SECTION_SUMMARY_ZOOM_PACKAGE_VERIFIED_OFFICE_GATED')
	assert.equal(proof.checks.exportPortableReplay, true)
	assert.equal(proof.checks.invalidTargetsFailClosedNoMutation, true)
})

