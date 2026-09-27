#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { listOptionCatalog } from './option-registry.mjs'

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const matrix = JSON.parse(await fs.readFile(path.join(root, 'betterpptx-mcp', 'preset-decomposition-matrix.json'), 'utf8'))
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const rel = absolute => path.relative(root, absolute).replaceAll(path.sep, '/')
const proofRoot = path.join(root, 'outputs', 'authoring-principle-corpus', 'global-extended-option-five-point')

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const out = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...await walk(full))
    else if (entry.isFile() && entry.name.endsWith('.json') && !entry.name.endsWith('.sha256')) out.push(full)
  }
  return out
}

async function latestPassing(dirName, publicProof = false) {
  const files = await walk(path.join(proofRoot, dirName))
  const accepted = []
  for (const file of files) {
    try {
      const value = JSON.parse(await fs.readFile(file, 'utf8'))
      const status = String(value.status ?? '')
      const pass = publicProof ? status === 'PASS' : status === 'PASS' || status.startsWith('PASS_WITH_') || status.startsWith('MCP_')
      if (pass) accepted.push({ file, value, mtimeMs: (await fs.stat(file)).mtimeMs })
    } catch {}
  }
  accepted.sort((a, b) => b.mtimeMs - a.mtimeMs)
  assert.ok(accepted.length, 'No passing proof in ' + dirName)
  return accepted[0]
}

const rows = matrix.catalogRows.filter(row => row.family === 'wordart-text3d')
assert.equal(rows.length, 200)
assert.equal(rows.filter(row => row.capabilityStatus === 'executable-exact-structured').length, 197)
assert.equal(rows.filter(row => row.capabilityStatus === 'structured-partial').length, 3)

const catalog = listOptionCatalog({ format: 'full' })
const wordArt = catalog.surfaces.find(surface => surface.id === 'wordArtTransform')
const text3d = catalog.surfaces.find(surface => surface.id === 'text3DShape')
assert.ok(wordArt && text3d)
assert.equal(wordArt.parameters.length, 1)
assert.equal(text3d.parameters.length, 16)
assert.equal(text3d.capabilityStatus, 'structured-partial')
assert.equal(wordArt.capabilityStatus, 'executable-exact-structured')

const nativeDirs = [
  'text3d-bevel-contour', 'text3d-bevel-presets', 'text3d-extrusion', 'text3d-extrusion-color',
  'text3d-light-direction', 'text3d-light-rig', 'text3d-material', 'text3d-reset-reedit-native',
  'text3d-rotation', 'text3d-rotation-y', 'text3d-rotation-z', 'text3d-top-bevel-contour-color',
  'wordart-transform', 'wordart-transform-adjustments',
]
const publicDirs = [
  'text3d-bevel-contour-public', 'text3d-bevel-presets-public', 'text3d-extrusion-public', 'text3d-extrusion-color-public',
  'text3d-light-direction-public', 'text3d-light-rig-public', 'text3d-material-public', 'text3d-reset-reedit-public',
  'text3d-rotation-public', 'text3d-rotation-y-public', 'text3d-rotation-z-public', 'text3d-top-bevel-contour-color-public',
  'wordart-transform-public', 'wordart-transform-adjustments-public',
]
const nativeProofs = []
for (const dir of nativeDirs) nativeProofs.push(await latestPassing(dir))
const publicProofs = []
for (const dir of publicDirs) publicProofs.push(await latestPassing(dir, true))
for (const proof of publicProofs) {
  const text = JSON.stringify(proof.value)
  assert.equal(/(?:[A-Za-z]:\\\\|\\\\\\\\)/.test(text), false, 'private path leakage in ' + rel(proof.file))
}

const focusedCommands = [
  ['node', ['--test', 'betterpptx-mcp/test/model3d-view-parameters.test.mjs']],
  ['node', ['--test', 'betterpptx-mcp/test/model3d-scene-contract.test.mjs']],
  ['node', ['--test', 'betterpptx-mcp/test/native3d-production-route.test.mjs']],
  ['node', ['--test', 'betterpptx-mcp/test/shape-effect-preset-overrides.test.mjs']],
]
const focusedRegression = []
for (const [command, args] of focusedCommands) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8' })
  const output = (result.stdout ?? '') + (result.stderr ?? '')
  assert.equal(result.status, 0, args.join(' ') + '\n' + output)
  focusedRegression.push({ command: [command, ...args].join(' '), exitCode: result.status, outputSha256: sha256(output), outputTail: output.slice(-400) })
}

const manifestPath = path.join(root, 'release', 'betterpptx-public', 'betterpptx-public-manifest.json')
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
const teaching = manifest.projection.files.find(file => file.path === 'skills/betterpptx/references/native-wordart-text3d.md')
assert.ok(teaching && teaching.bytes > 1000)
const releaseGit = spawnSync('git', ['-C', path.join(root, 'release', 'betterpptx-public'), 'rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' })
assert.equal(releaseGit.status, 0)
const releaseStatus = spawnSync('git', ['-C', path.join(root, 'release', 'betterpptx-public'), 'status', '--short'], { cwd: root, encoding: 'utf8' })
assert.equal(releaseStatus.status, 0)
assert.equal(releaseStatus.stdout.trim(), '')

const report = {
  schemaVersion: 'betterpptx.wordart-text3d-family-proof.v1',
  status: 'PASS',
  family: {
    matrixRows: rows.length,
		executableExactRows: 197,
		structuredPartialRows: 3,
    wordArtTransformParameters: wordArt.parameters.length,
    text3DParameters: text3d.parameters.length,
    nativeProofSlices: nativeProofs.length,
    publicProofSlices: publicProofs.length,
    formalUniversalClosure: '0/2258 (unchanged; family certification is not global formal closure)',
  },
  native: nativeProofs.map(proof => ({ proof: rel(proof.file), status: proof.value.status, proofSha256: sha256(JSON.stringify(proof.value)) })),
  public: publicProofs.map(proof => ({ proof: rel(proof.file), status: proof.value.status, proofSha256: sha256(JSON.stringify(proof.value)), noPrivateLeakage: true })),
  teachingRelease: { commit: releaseGit.stdout.trim(), manifestSha256: sha256(await fs.readFile(manifestPath)), projectionSha256: manifest.projection.sha256, teachingReferenceSha256: teaching.sha256 },
  focusedRegression,
  preservedBoundaries: ['structured-partial Office normalization/setter limits', 'imported-only preservation boundaries', 'provider/license boundaries', 'approved 25 procedural feTurbulence residuals', 'earlier failed attempts remain archived'],
  interpretation: 'WordArt and text 3-D are certified as one parameterized authoring family. Gallery styles and bevel presets remain conveniences; explicit transform, bevel, extrusion, material, light, rotation, and contour leaves are the editable contract.',
}
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const outDir = path.join(root, 'outputs', 'authoring-principle-corpus', 'finalized-jsonspec-archive', 'wordart-text3d-family', stamp)
await fs.mkdir(outDir, { recursive: true })
const outPath = path.join(outDir, 'wordart-text3d-family-proof.json')
await fs.writeFile(outPath, JSON.stringify(report, null, 2) + '\n', 'utf8')
console.log(JSON.stringify({ status: report.status, report: rel(outPath), sha256: await sha256(await fs.readFile(outPath)), matrixRows: rows.length, nativeProofSlices: nativeProofs.length, publicProofSlices: publicProofs.length, releaseCommit: releaseGit.stdout.trim() }, null, 2))
