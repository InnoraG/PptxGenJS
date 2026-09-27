import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
	LAYOUT_THEME_MASTER_INHERITANCE_ROWS,
	LAYOUT_THEME_MASTER_INHERITANCE_UNIT_ID,
	runLayoutThemeMasterInheritanceProof,
} from '../verify-layout-theme-master-inheritance-unit-v1.mjs'

test('layout/theme/master inheritance unit freezes the exact six canonical rows', () => {
	assert.equal(LAYOUT_THEME_MASTER_INHERITANCE_UNIT_ID, 'impl-b-d35240484bb536ac')
	assert.equal(LAYOUT_THEME_MASTER_INHERITANCE_ROWS.length, 6)
	assert.equal(new Set(LAYOUT_THEME_MASTER_INHERITANCE_ROWS.map(([id]) => id)).size, 6)
})

test('one-master/two-layout/three-slide lifecycle closes graph, inheritance, reset, replacement, and topology mutations', async () => {
	const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-layout-theme-master-inheritance-test-'))
	try {
		const proof = await runLayoutThemeMasterInheritanceProof({ outputDir, office: false })
		assert.equal(proof.status, 'LAYOUT_THEME_MASTER_INHERITANCE_PACKAGE_VERIFIED_OFFICE_GATED')
		assert.deepEqual(proof.blockers, [])
		assert.ok(proof.lifecycle.length >= 13)
		assert.deepEqual(proof.negativeMutationGates.map(item => item.label), [
			'missing layout binding', 'missing layout parent master', 'conflicting slide parent', 'self layout parent',
			'peer layout parent', 'duplicate authored layout', 'duplicate authored master',
		])
		assert.ok(proof.lifecycle.every(state => state.masterCount === 1 && [3, 4].includes(state.slideCount) && state.layoutCount >= 1))
		for (const state of ['initial', 'reset', 'reedited', 'slide-duplicated', 'slide-reordered', 'slide-deleted', 'component-reset', 'component-reedited', 'collections-empty', 'replacement', 'collections-null', 'final-reedited', 'recompiled']) {
			assert.ok(proof.lifecycle.some(item => item.state === state), `missing lifecycle state ${state}`)
		}
		assert.ok(Object.entries(proof.checks)
			.filter(([name, value]) => name !== 'powerPointOpen2007SaveCopyAsReopen' && typeof value === 'boolean')
			.every(([, pass]) => pass === true))
	} finally {
		await fs.rm(outputDir, { recursive: true, force: true })
	}
})
