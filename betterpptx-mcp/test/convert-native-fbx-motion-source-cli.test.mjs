import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { convertNativeFbxMotionSourceFiles, parseNativeMotionSourceCliArgs } from '../scripts/convert-native-fbx-motion-source.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const cli = path.resolve(here, '../scripts/convert-native-fbx-motion-source.mjs')
const originalFile = path.resolve(here, '../deploy/model3d-worker/mocap/kinetic/Lifting.fbx')
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
function temporary(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'native-fbx-source-cli-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  return directory
}

test('CLI options require explicit source, name and new output; unknown/duplicate/force fail', () => {
  assert.deepEqual(parseNativeMotionSourceCliArgs(['--help']), { help: true })
  assert.deepEqual(parseNativeMotionSourceCliArgs(['--input', 'a.fbx', '--animation', 'lift', '--output', 'b.glb']), { input: 'a.fbx', animation: 'lift', output: 'b.glb' })
  for (const args of [[], ['--input'], ['--input', 'a.fbx'], ['--force'], ['--input', 'a', '--input', 'b'], ['--help', '--input', 'a']]) assert.throws(() => parseNativeMotionSourceCliArgs(args))
})

test('CLI help is read-only and communicates nonactivation', () => {
  const run = spawnSync(process.execPath, [cli, '--help'], { encoding: 'utf8', windowsHide: true })
  assert.equal(run.status, 0, run.stderr)
  assert.match(run.stdout, /does not activate a governed source/)
})

test('CLI writes one hash-bound versioned source and private report without mutating original', { skip: !fs.existsSync(originalFile) }, t => {
  const directory = temporary(t), output = path.join(directory, 'v1', 'lift.glb'), before = hash(fs.readFileSync(originalFile))
  const run = spawnSync(process.execPath, [cli, '--input', originalFile, '--animation', 'lift', '--output', output], { encoding: 'utf8', windowsHide: true })
  assert.equal(run.status, 0, run.stderr)
  const result = JSON.parse(run.stdout), report = JSON.parse(fs.readFileSync(`${output}.conversion.json`, 'utf8'))
  assert.equal(result.status, 'CONVERTED_NOT_ACTIVATED')
  assert.equal(report.outputDurationMs, 7200)
  assert.equal(report.sourceSha256, before)
  assert.equal(hash(fs.readFileSync(originalFile)), before)
  assert.equal(report.outputSha256, hash(fs.readFileSync(output)))
  assert.equal(report.activationStatus, 'NOT_ACTIVATED')
  assert.equal(report.nativePlaybackStatus, 'NOT_VERIFIED')
  const bytes = fs.readFileSync(output), reportBytes = fs.readFileSync(`${output}.conversion.json`)
  assert.throws(() => convertNativeFbxMotionSourceFiles({ input: originalFile, animation: 'lift', output }), /overwrite/)
  assert.deepEqual(fs.readFileSync(output), bytes)
  assert.deepEqual(fs.readFileSync(`${output}.conversion.json`), reportBytes)
})

test('existing report prevents any GLB creation; malformed sources produce no output', { skip: !fs.existsSync(originalFile) }, t => {
  const directory = temporary(t), output = path.join(directory, 'lift.glb'), report = path.join(directory, 'existing.json')
  fs.writeFileSync(report, 'private existing evidence')
  assert.throws(() => convertNativeFbxMotionSourceFiles({ input: originalFile, animation: 'lift', output, report }), /overwrite/)
  assert.equal(fs.existsSync(output), false)
  assert.equal(fs.readFileSync(report, 'utf8'), 'private existing evidence')
  const invalid = path.join(directory, 'bad.fbx'); fs.writeFileSync(invalid, 'not an FBX')
  assert.throws(() => convertNativeFbxMotionSourceFiles({ input: invalid, animation: 'lift', output }), /FBX motion import failed/)
  assert.equal(fs.existsSync(output), false)
  assert.equal(fs.existsSync(`${output}.conversion.json`), false)
})
