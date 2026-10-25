import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyBillingTool } from '../billing/classifier.mjs'
import { consumeLockedCompilePlan, resetLockedCompilePlansForTests, rememberLockedCompilePlan } from '../ir/compile-plan-store.mjs'

const previous = { ...process.env }
Object.assign(process.env, { BETTERPPTX_BILLING_MODEL: 'free_publication', BETTERPPTX_BILLING_PROVIDER: 'none', BETTERPPTX_BILLING_ENFORCE: '1' })
test.after(() => { for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key]; Object.assign(process.env, previous) })

test('catalogue and bundled emoji models are free authoring in the publication profile', () => {
	for (const modelAsset of [
		'asset://catalog/model3d/' + 'a'.repeat(32),
		'model3d://betterpptx-face-motions/ceramic-party-face',
		'model3d://betterpptx-emoji-motions/handshake-approved',
	]) {
		assert.equal(classifyBillingTool('betterpptx.slide.add_model3d', { options: { modelAsset } }).category, 'draft-accrual', modelAsset)
	}
})

test('raw or unknown model sources stay heavy', () => {
	for (const options of [
		{ modelAsset: 'asset://catalog/model3d/' + 'a'.repeat(32), glbFile: 'local.glb' },
		{ modelAsset: 'asset://upload/model3d/' + 'a'.repeat(32) },
		{ modelAsset: 'model3d://betterpptx-face-motions/../secret' },
		{ modelAsset: 'https://example.com/model.glb' },
	]) {
		assert.equal(classifyBillingTool('betterpptx.slide.add_model3d', { options }).category, 'heavy', JSON.stringify(options))
	}
})

test('a commit on another instance accepts a recompiled plan with the same digest', () => {
	resetLockedCompilePlansForTests()
	const compiled = { planDigest: 'p'.repeat(64), lockedPlanDigest: 'p'.repeat(64), specDigest: 's'.repeat(64) }
	const result = consumeLockedCompilePlan('p'.repeat(64), compiled)
	assert.equal(result.usedLockedPlan, true)
	assert.equal(result.compiled, compiled)
	assert.throws(() => consumeLockedCompilePlan('q'.repeat(64), compiled), { code: 'PLAN_ID_UNKNOWN' })
})

test('a remembered plan still wins and still rejects a changed spec', () => {
	resetLockedCompilePlansForTests()
	const original = { planDigest: 'p'.repeat(64), specDigest: 's'.repeat(64) }
	rememberLockedCompilePlan(original)
	assert.equal(consumeLockedCompilePlan('p'.repeat(64), { ...original }).compiled, original)
	assert.throws(() => consumeLockedCompilePlan('p'.repeat(64), { planDigest: 'p'.repeat(64), specDigest: 't'.repeat(64) }), { code: 'PLAN_ID_MISMATCH' })
})
