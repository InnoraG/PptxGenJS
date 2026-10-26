#!/usr/bin/env node
// Assemble the narration image build context from git: download the approved
// voices (MD5-checked by the downloader) and require that every file matches
// the pinned production runtime manifest's SHA-256, so the image contains
// exactly the reviewed voice set. Usage: node prepare-build-context.mjs <dir>
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const narration = path.resolve(here, '../../narration')
const out = path.resolve(process.argv[2] || '')
if (!process.argv[2]) throw new Error('Pass the build-context directory.')
const voicesDir = path.join(out, 'voices')
const pinned = JSON.parse(fs.readFileSync(path.join(narration, 'voices', 'runtime-manifest.production.json'), 'utf8'))

const result = spawnSync(process.execPath, [path.join(narration, 'download-approved-voices.mjs')], {
	stdio: 'inherit',
	env: { ...process.env, BETTERPPTX_VOICE_OUTPUT_DIR: voicesDir, BETTERPPTX_REQUIRED_VOICE_LANGS: 'approved', BETTERPPTX_ALLOW_ATTRIBUTION_VOICES: '1' },
})
if (result.status !== 0) throw new Error('Approved voice download failed.')

const sha256 = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const generated = JSON.parse(fs.readFileSync(path.join(voicesDir, 'runtime-manifest.json'), 'utf8'))
const ids = list => list.map(voice => voice.id).sort().join(' ')
if (ids(generated.voices) !== ids(pinned.voices)) throw new Error('The approved voice set differs from the pinned production manifest.')
for (const voice of pinned.voices) {
	if (sha256(path.join(voicesDir, `${voice.id}.onnx`)) !== voice.modelSha256) throw new Error(`Model checksum mismatch: ${voice.id}`)
	if (sha256(path.join(voicesDir, `${voice.id}.onnx.json`)) !== voice.configSha256) throw new Error(`Config checksum mismatch: ${voice.id}`)
}
// The image serves the pinned manifest (what the MCP license gate also reads).
fs.copyFileSync(path.join(narration, 'voices', 'runtime-manifest.production.json'), path.join(voicesDir, 'runtime-manifest.json'))
fs.copyFileSync(path.join(narration, 'piper-http-runtime.py'), path.join(out, 'piper-http-runtime.py'))
fs.copyFileSync(path.join(here, 'Dockerfile'), path.join(out, 'Dockerfile'))
console.log(`Narration build context ready: ${pinned.voices.length} verified voices.`)
