// Maintainer-only: bounded app context, never a copy of model caches or recordings.
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repository = path.resolve(here, '../../../..')
export async function verifyPinnedFiles(directory, identity) {
  for (const [name, expected] of Object.entries(identity.files)) {
    if (path.basename(name) !== name) throw new Error('Invalid pinned file name')
    const file = path.join(directory, name)
    if ((await fs.stat(file)).size !== expected.bytes) throw new Error(`Pinned file size mismatch: ${name}`)
    const hash = createHash('sha256')
    for await (const bytes of createReadStream(file)) hash.update(bytes)
    if (hash.digest('hex') !== expected.sha256) throw new Error(`Pinned file digest mismatch: ${name}`)
  }
}
export async function prepareBuildContext(output, { modelCache } = {}) {
  const root = path.resolve(output)
  if (root === repository || root === here || root.startsWith(repository + path.sep)) throw new Error('Use a separate task-owned temporary context outside the source checkout')
  try { await fs.access(root); throw new Error('Context already exists; use an empty new task-owned path') } catch (error) { if (error.code !== 'ENOENT') throw error }
  const identity = JSON.parse(await fs.readFile(path.join(here, 'model-source.json'), 'utf8'))
  if (modelCache) await verifyPinnedFiles(modelCache, identity)
  await fs.mkdir(root, { recursive: true })
  const files = ['Dockerfile', 'verify-bundle.py', 'model-source.json', 'runtime-manifest.json', 'source-identity.json', 'install-source.py', 'provision-tokenizers.py']
  for (const name of files) await fs.copyFile(path.join(here, name), path.join(root, name))
  await fs.copyFile(path.join(repository, 'deploy/docker/chatterbox_http_runtime.py'), path.join(root, 'runtime.py'))
  await fs.copyFile(path.join(repository, 'deploy/docker/speech_loudness.py'), path.join(root, 'speech_loudness.py'))
  let bytes = 0
  for (const name of await fs.readdir(root)) bytes += (await fs.stat(path.join(root, name))).size
  if (bytes > 256 * 1024) throw new Error('Unexpected speech build context growth')
  return { files: files.length + 2, bytes, weightsCopied: false, referencesCopied: false, modelRevision: identity.revision }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error('Pass a new task-owned build-context directory')
  console.log(JSON.stringify(await prepareBuildContext(process.argv[2], { modelCache: process.env.CHATTERBOX_MODEL_CACHE })))
}
