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
  assert.match(script, /inputs_digest=.*source-identity\.json.*install-source\.py/)
  assert.match(script, /publicAccessPrevention == "enforced"/)
  assert.doesNotMatch(script, /buckets add-iam-policy-binding/)
  const catalog = JSON.parse(await fs.readFile(path.join(here, 'runtime-manifest.json'), 'utf8'))
  assert.equal(catalog.voices.length, 8)
  assert.ok(catalog.voices.every(voice => /^sha256:[a-f0-9]{64}$/.test(voice.referenceDigest)))
})

test('official speech bundle selects V3 and pins both weights and selector-capable upstream source', async () => {
  const [docker, installer, identity, source, catalog] = await Promise.all([
    fs.readFile(path.join(here, 'Dockerfile'), 'utf8'),
    fs.readFile(path.join(here, 'install-source.py'), 'utf8'),
    fs.readFile(path.join(here, 'model-source.json'), 'utf8').then(JSON.parse),
    fs.readFile(path.join(here, 'source-identity.json'), 'utf8').then(JSON.parse),
    fs.readFile(path.join(here, 'runtime-manifest.json'), 'utf8').then(JSON.parse),
  ])
  assert.match(docker, /CHATTERBOX_MULTILINGUAL_VERSION=v3/)
  assert.match(docker, /torch==2\.6\.0 torchaudio==2\.6\.0/)
  assert.match(docker, /chatterbox-tts==0\.1\.7 resemble-perth==1\.0\.1/)
  assert.match(docker, /transformers==5\.2\.0 gradio==6\.8\.0/)
  assert.match(docker, /install-source\.py --identity/)
  assert.match(installer, /'--no-deps', '--force-reinstall'/)
  assert.doesNotMatch(docker, /git\+|@master|git clone/)
  assert.equal(source.commit, '5de7a54aa4e5e2baadb0182dde554908b48b85c2')
  assert.equal(source.archiveSha256, 'bb7363a76c0c0432a0305681fe2e533bbfb0f10fcf7b98d75a439d9a909f1576')
  assert.equal(identity.runtimeSourceCommit, source.commit)
  assert.equal(catalog.runtimeSourceCommit, source.commit)
  assert.equal(identity.multilingualVersion, 'v3')
  assert.equal(catalog.multilingualVersion, 'v3')
  assert.equal(identity.files['t3_mtl23ls_v3.safetensors'].sha256, '5abca8321ede76f8e61f1cc0d19aea6c946b28871017ce8726f8a69203f05953')
  assert.ok(!('t3_mtl23ls_v2.safetensors' in identity.files))
  const aggregate = createHash('sha256')
  for (const name of Object.keys(identity.files).sort()) aggregate.update(`${name}\0sha256:${identity.files[name].sha256}\n`)
  assert.equal(catalog.modelDigest, `sha256:${aggregate.digest('hex')}`)
})

test('bounded context includes the pinned source installer without copying the archive, models or recordings', async () => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'speech-v3-context-'))
  try {
    const context = path.join(parent, 'app')
    const result = await prepareBuildContext(context)
    assert.equal(result.weightsCopied, false)
    assert.equal(result.referencesCopied, false)
    assert.ok(result.bytes < 256 * 1024)
    assert.ok((await fs.readdir(context)).includes('install-source.py'))
    assert.ok((await fs.readdir(context)).includes('source-identity.json'))
    assert.ok(!(await fs.readdir(context)).some(name => /\.zip$|\.wav$|\.safetensors$/.test(name)))
  } finally { await fs.rm(parent, { recursive: true, force: true }) }
})
