// Maintainer-only bounded bridge context: no models, recordings or credentials.
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repository = path.resolve(here, '../../../..')
export async function prepareBuildContext(output) {
  const root = path.resolve(output)
  if (root === repository || root.startsWith(repository + path.sep)) throw new Error('Use a new task-owned context outside the checkout')
  try { await fs.access(root); throw new Error('Context already exists') } catch (error) { if (error.code !== 'ENOENT') throw error }
  const files = [
    ...['Dockerfile.bridge', 'bridge.py', 'budget.py', 'fallback.py', 'fallback-map.json'].map(name => `betterpptx-mcp/deploy/narration/modal/${name}`),
    'betterpptx-mcp/deploy/narration/chatterbox/runtime-manifest.json',
    'betterpptx-mcp/narration/voices/runtime-manifest.production.json',
    'deploy/docker/speech_loudness.py',
  ]
  let bytes = 0
  for (const file of files) {
    const data = await fs.readFile(path.join(repository, file))
    bytes += data.length
    if (bytes > 256 * 1024) throw new Error('Unexpected bridge context growth')
    const target = path.join(root, file)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, data)
  }
  return { files: files.length, bytes, weightsCopied: false, referencesCopied: false, credentialsCopied: false }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error('Pass a new task-owned context directory')
  console.log(JSON.stringify(await prepareBuildContext(process.argv[2])))
}
