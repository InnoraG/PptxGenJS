import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { runChartPackageLifecycleProof } from '../verify-chart-package-lifecycle-unit-v1.mjs'

test('chart unit has exact inventory and repair-safe create/re-edit/export/recompile package closure', async () => {
	const outputDir = path.join(os.tmpdir(), `betterpptx-chart-package-test-${Date.now()}-${process.pid}`)
	try {
		const report = await runChartPackageLifecycleProof({ outputDir, office: false })
		assert.equal(report.unitId, 'impl-c-e9cb65d5f0db72c7')
		assert.equal(report.status, 'CHART_PACKAGE_LIFECYCLE_VERIFIED_OFFICE_GATED')
		assert.equal(report.inventory.unit.fanOutRows, 120)
		assert.deepEqual(report.inventory.counts, {
			styles: 49,
			typesAndPresets: 45,
			structural: 11,
			shapeBuiltOrComposite: 10,
			package: 5,
		})
		assert.equal(report.inventory.rows.length, 120)
		assert.equal(new Set(report.inventory.rows.map(row => row.id)).size, 120)
		assert.equal(report.lifecycle.length, 3)
		assert.deepEqual(report.lifecycle.map(item => item.label), ['initial', 're-edited', 'recompiled'])
		assert.equal(report.lifecycle.every(item => item.chartRows.length === 3), true)
		assert.equal(report.lifecycle.every(item => item.workbookRows.length === 2), true)
		assert.equal(report.checks.selectorReeditReplacesStaleResources, true)
		assert.equal(report.checks.exportAndPortableRecompile, true)
		assert.equal(report.blockers.length, 0)
	} finally {
		await fs.rm(outputDir, { recursive: true, force: true })
	}
})
