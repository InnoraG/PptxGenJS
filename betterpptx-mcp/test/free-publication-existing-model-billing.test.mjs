import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { classifyBillingTool } from '../billing/classifier.mjs'
import { estimateBillingForTool } from '../billing/estimator.mjs'
import { preflightBillingReservation } from '../billing/reservations.mjs'
import { createAssetGrantManager } from '../auth/asset-grants.mjs'
import { withResourceAuthorization, bindNewResourceOwner } from '../auth/resource-authorization.mjs'

const handle = 'gen://rigged3d/' + 'a'.repeat(40)
const modelArgs = { options: { modelAsset: handle, nativeOnly: true } }
const previous = { ...process.env }
Object.assign(process.env, {
  BETTERPPTX_BILLING_MODEL: 'free_publication', BETTERPPTX_BILLING_PROVIDER: 'none',
  BETTERPPTX_BILLING_ENFORCE: '1', BETTERPPTX_ENV: 'test',
  BETTERPPTX_DEPLOYMENT_STAGE: 'test', NODE_ENV: 'test',
})
test.after(() => { for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key]; Object.assign(process.env, previous) })

test('existing-model insertion is free drafting in the publication profile, with matching execution and estimate', async () => {
  const estimate = estimateBillingForTool({ name: 'betterpptx.slide.add_model3d', args: modelArgs })
  assert.equal(estimate.estimatedCredits, 0)
  assert.equal(estimate.classification.category, 'draft-accrual')
  const store = new Proxy({}, { get() { throw new Error('Draft insertion must not access the credit ledger') } })
  const result = await preflightBillingReservation({ name: 'betterpptx.slide.add_model3d', args: modelArgs, store })
  assert.equal(result.active, false)
  assert.equal(result.reason, 'draft-accrual')
  assert.equal(classifyBillingTool('betterpptx.deck.save').category, 'checkpoint')
})

test('raw acquisition and providers retain their existing heavy boundary', () => {
  for (const args of [{ options: { modelAsset: 'https://example.com/model.glb' } }, {}, { options: { modelAsset: handle, glbFile: 'local.glb' } }]) {
    assert.equal(classifyBillingTool('betterpptx.slide.add_model3d', args).category, 'heavy')
  }
  for (const name of ['betterpptx.assets.generate_rigged3d', 'betterpptx.assets.generate_model3d', 'betterpptx.assets.generate_image', 'betterpptx.sketchfab.import']) {
    assert.equal(classifyBillingTool(name, modelArgs).category, 'heavy')
  }
  process.env.BETTERPPTX_BILLING_MODEL = 'pay_per_job'
  try { assert.equal(estimateBillingForTool({ name: 'betterpptx.slide.add_model3d', args: modelArgs }).classification.category, 'heavy') }
  finally { process.env.BETTERPPTX_BILLING_MODEL = 'free_publication' }
})

test('free price does not authorize an absent or another-owner model grant', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-free-model-grants-'))
  try {
    const grants = createAssetGrantManager({ env: { BETTERPPTX_ASSET_GRANT_STORE: 'local', BETTERPPTX_ASSET_GRANT_DIR: directory } })
    const bytes = Buffer.from('Synthetic generated model grant bytes')
    await withResourceAuthorization({ installHash: 'install_' + 'a'.repeat(64), sessionId: 'free-model-producer' }, () => grants.withAccess(async () => {
      const operation = bindNewResourceOwner({ operationId: 'free-model-test-production', state: 'running' })
      await grants.produce({ operation, source: 'generation' }, receipt => { receipt.capture(handle, bytes); return { ok: true } })
      await grants.authorize([handle])
      assert.equal(grants.assertBytesSync(handle, bytes), bytes)
      assert.throws(() => grants.assertBytesSync(handle, Buffer.from('changed')), { code: 'ASSET_CONTENT_CONFLICT' })
      assert.equal((await preflightBillingReservation({ name: 'betterpptx.slide.add_model3d', args: modelArgs })).active, false)
    }))
    await withResourceAuthorization({ installHash: 'install_' + 'b'.repeat(64), sessionId: 'free-model-boundary' }, () => grants.withAccess(async () => {
      assert.equal(estimateBillingForTool({ name: 'betterpptx.slide.add_model3d', args: modelArgs }).estimatedCredits, 0)
      await assert.rejects(grants.authorize([handle]), { code: 'ASSET_NOT_FOUND' })
    }))
  } finally { await fs.rm(directory, { recursive: true, force: true }) }
})
