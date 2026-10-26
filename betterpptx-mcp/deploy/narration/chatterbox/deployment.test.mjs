import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { verifyPinnedFiles, prepareBuildContext } from './prepare-build-context.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
test('pinned file checks reject altered bytes and traversal without copying weights', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'speech-bundle-test-'))
  try {
    const bytes = Buffer.from('small synthetic model fixture')
    await fs.writeFile(path.join(root, 'model.bin'), bytes)
    const identity = { files: { 'model.bin': { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') } } }
    await verifyPinnedFiles(root, identity)
    await fs.writeFile(path.join(root, 'model.bin'), Buffer.alloc(bytes.length))
    await assert.rejects(verifyPinnedFiles(root, identity), /digest mismatch/)
    await assert.rejects(verifyPinnedFiles(root, { files: { '../model.bin': identity.files['model.bin'] } }), /Invalid pinned/)
    await assert.rejects(prepareBuildContext(root), /already exists/)
  } finally { await fs.rm(root, { recursive: true, force: true }) }
})
test('release defaults preserve Piper and both application roles mount optional private storage', async () => {
  const workflow = await fs.readFile(path.resolve(here, '../../../../.github/workflows/betterpptx-mcp-cloudrun-free-beta.yml'), 'utf8')
  assert.match(workflow, /narration_provider:[\s\S]*default: piper-http/)
  assert.equal(workflow.split('source betterpptx-mcp/deploy/narration/chatterbox/private-voice-volume.sh').length - 1, 2)
  const script = await fs.readFile(path.join(here, 'deploy-private-runtime.sh'), 'utf8')
  assert.match(script, /--memory=8Gi --concurrency=1/)
  assert.match(script, /--min=0/)
  assert.match(script, /publicAccessPrevention == "enforced"/)
  assert.doesNotMatch(script, /buckets add-iam-policy-binding/)
  const catalog = JSON.parse(await fs.readFile(path.join(here, 'runtime-manifest.json'), 'utf8'))
  assert.equal(catalog.voices.length, 8)
  assert.ok(catalog.voices.every(voice => /^sha256:[a-f0-9]{64}$/.test(voice.referenceDigest)))
})
