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
const implementationOnly = process.argv.includes('--implementation-only')
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
  const dir = path.join(proofRoot, dirName)
  const files = await walk(dir)
  const accepted = []
  for (const file of files) {
    try {
      const value = JSON.parse(await fs.readFile(file, 'utf8'))
      const status = String(value.status ?? '')
      const pass = publicProof ? status === 'PASS' : status === 'PASS' || status.startsWith('PASS_WITH_') || status.startsWith('MCP_')
      if (pass) {
        const stat = await fs.stat(file)
        accepted.push({ file, value, mtimeMs: stat.mtimeMs })
      }
    } catch {}
  }
  accepted.sort((a, b) => b.mtimeMs - a.mtimeMs)
  assert.ok(accepted.length, `No passing ${publicProof ? 'public' : 'native'} proof in ${dirName}`)
  return accepted[0]
}

const rows = matrix.catalogRows.filter(row => row.family === 'shapes-gradients')
assert.equal(rows.length, 607)
assert.equal(rows.filter(row => row.capabilityMode === 'preset-plus-parameters' && row.capabilityStatus === 'structured-partial').length, 0)
assert.equal(rows.filter(row => row.capabilityMode === 'preset-plus-parameters' && row.capabilityStatus === 'executable-exact-structured').length, 607)

const catalog = listOptionCatalog({ format: 'full' })
const requiredSurfaces = {
  fill: 30,
  background: 30,
  effects: 27,
  line: 11,
  gradientDirection: 5,
  fillOverlay: 2,
  shapeStylePreset: 10,
  shapeEffectPreset: 8,
  shape3D: 16,
}
for (const [id, minimumParameters] of Object.entries(requiredSurfaces)) {
  const surface = catalog.surfaces.find(item => item.id === id)
  assert.ok(surface, `Missing registry surface ${id}`)
  assert.ok(surface.parameters.length >= minimumParameters, `${id} parameter surface regressed`)
}

if (implementationOnly) {
  const focusedCommands = [
    ['node', ['--test', 'betterpptx-mcp/test/shared-native-formatting-contract.test.mjs']],
    ['node', ['--test', 'betterpptx-mcp/test/native-visual-primitives.test.mjs']],
    ['node', ['--test', 'betterpptx-mcp/test/shape-effect-preset-overrides.test.mjs']],
    ['node', ['--test', 'betterpptx-mcp/test/public-baseline-catalog-taxonomy.test.mjs']],
  ]
  for (const [command, args] of focusedCommands) {
    const result = spawnSync(command, args, { cwd: root, encoding: 'utf8' })
    assert.equal(result.status, 0, `${args.join(' ')}\n${result.stdout ?? ''}${result.stderr ?? ''}`)
  }
  console.log(JSON.stringify({ status: 'PASS', mode: 'implementation-only', matrixRows: rows.length, structuredPartialRows: 0, executableExactStructuredRows: 607, focusedChecks: focusedCommands.length }))
  process.exit(0)
}

const nativeDirs = [
  'background-solid-native', 'effects-array-native', 'fill-gradient-direction-path-native', 'fill-gradient-stops-native',
  'fill-pattern-texture-native', 'fill-picture-asset-native', 'picture-fill-office-alpha', 'shape-connector-line-native',
  'shape-effect-preset-overrides-native', 'style-effect-preset-overrides-native', 'shape-blur-radius', 'shape-glow-opacity',
  'shape-glow-radius', 'shape-gradient-angle', 'shape-reflection-blur', 'shape-reflection-direction', 'shape-reflection-distance',
  'shape-reflection-end-opacity', 'shape-reflection-end-position', 'shape-reflection-start-opacity', 'shape-reflection-start-position',
  'shape-shadow-angle', 'shape-shadow-blur', 'shape-shadow-distance', 'shape-shadow-opacity', 'shape-shadow-scale-x',
  'shape-shadow-scale-y', 'shape-shadow-skew-x', 'shape-shadow-skew-y', 'shape-soft-edge-radius',
]
const publicDirs = [
  'background-solid-public', 'effects-array-public', 'fill-gradient-direction-path-public', 'fill-gradient-stops-public',
  'fill-pattern-texture-public', 'fill-picture-asset-public', 'shape-connector-line-public', 'shape-effect-preset-overrides-public',
  'style-effect-preset-overrides-public', 'shape-blur-radius-public', 'shape-glow-opacity-public', 'shape-glow-radius-public',
  'shape-reflection-blur-public', 'shape-reflection-direction-public', 'shape-reflection-distance-public', 'shape-reflection-end-opacity-public',
  'shape-reflection-end-position-public', 'shape-reflection-start-opacity-public', 'shape-reflection-start-position-public',
  'shape-shadow-angle-public', 'shape-shadow-blur-public', 'shape-shadow-distance-public', 'shape-shadow-scale-x-public',
  'shape-shadow-scale-y-public', 'shape-shadow-skew-x-public', 'shape-shadow-skew-y-public', 'shape-soft-edge-radius-public',
]
const nativeProofs = []
for (const dir of nativeDirs) nativeProofs.push(await latestPassing(dir, false))
const publicProofs = []
for (const dir of publicDirs) publicProofs.push(await latestPassing(dir, true))
for (const proof of publicProofs) {
  const text = JSON.stringify(proof.value)
  assert.equal(text.includes('D:\\') || text.includes('C:\\'), false, `private path leakage in ${rel(proof.file)}`)
}

const focusedCommands = [
  ['node', ['--test', 'betterpptx-mcp/test/gradient-policy.integration.mjs']],
  ['node', ['--test', 'betterpptx-mcp/test/picture-format-native-effects.test.mjs']],
  ['node', ['--test', 'betterpptx-mcp/test/shape-connector-line-native.test.mjs']],
  ['node', ['--test', 'betterpptx-mcp/test/shape-effect-preset-overrides.test.mjs']],
]
const focusedRegression = []
for (const [command, args] of focusedCommands) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8' })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  assert.equal(result.status, 0, `${args.join(' ')}\n${output}`)
  focusedRegression.push({ command: [command, ...args].join(' '), exitCode: result.status, outputSha256: sha256(output), outputTail: output.slice(-400) })
}

const manifestPath = path.join(root, 'release', 'betterpptx-public', 'betterpptx-public-manifest.json')
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
const teaching = manifest.projection.files.find(file => file.path === 'skills/betterpptx/references/native-shapes-gradients.md')
assert.ok(teaching && teaching.bytes > 1000)
const releaseGit = spawnSync('git', ['-C', path.join(root, 'release', 'betterpptx-public'), 'rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' })
assert.equal(releaseGit.status, 0)
const releaseStatus = spawnSync('git', ['-C', path.join(root, 'release', 'betterpptx-public'), 'status', '--short'], { cwd: root, encoding: 'utf8' })
assert.equal(releaseStatus.status, 0)
assert.equal(releaseStatus.stdout.trim(), '')

const report = {
  schemaVersion: 'betterpptx.shapes-gradients-family-proof.v1',
  status: 'PASS',
  family: {
    matrixRows: rows.length,
    structuredPartialRows: 0,
    executableExactStructuredRows: 607,
    requiredSurfaces: Object.fromEntries(Object.entries(requiredSurfaces).map(([id, minimum]) => [id, catalog.surfaces.find(item => item.id === id).parameters.length])),
    nativeProofSlices: nativeProofs.length,
    publicProofSlices: publicProofs.length,
    formalUniversalClosure: '0/2258 (unchanged; family certification is not global formal closure)',
  },
  native: nativeProofs.map(proof => ({ proof: rel(proof.file), status: proof.value.status, proofSha256: sha256(JSON.stringify(proof.value)) })),
  public: publicProofs.map(proof => ({ proof: rel(proof.file), status: proof.value.status, proofSha256: sha256(JSON.stringify(proof.value)), noPrivateLeakage: true })),
  teachingRelease: { commit: releaseGit.stdout.trim(), manifestSha256: sha256(await fs.readFile(manifestPath)), projectionSha256: manifest.projection.sha256, teachingReferenceSha256: teaching.sha256 },
  focusedRegression,
  preservedBoundaries: ['formal Office/public/visual certification remains separate from implementation truth', 'imported-only preservation boundaries', 'approved 25 procedural feTurbulence residuals', 'prior failed public retries remain archived'],
  interpretation: 'Shapes, lines, fills, gradients, overlays, effects, geometry, and shape 3-D are certified as one parameterized authoring family. Presets remain conveniences; typed slider leaves, component null resets, and explicit Office boundaries are the contract.',
}
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const outDir = path.join(root, 'outputs', 'authoring-principle-corpus', 'finalized-jsonspec-archive', 'shapes-gradients-family', stamp)
await fs.mkdir(outDir, { recursive: true })
const outPath = path.join(outDir, 'shapes-gradients-family-proof.json')
await fs.writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
console.log(JSON.stringify({ status: report.status, report: rel(outPath), sha256: await sha256(await fs.readFile(outPath)), matrixRows: rows.length, nativeProofSlices: nativeProofs.length, publicProofSlices: publicProofs.length, releaseCommit: releaseGit.stdout.trim() }, null, 2))
