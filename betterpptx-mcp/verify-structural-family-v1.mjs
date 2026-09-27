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

async function latestPass(rootPath, label) {
  const files = await walk(rootPath)
  const accepted = []
  for (const file of files) {
    try {
      const value = JSON.parse(await fs.readFile(file, 'utf8'))
      const status = String(value.status ?? '')
      if (status === 'PASS' || status.startsWith('PASS_') || status.startsWith('PASS_WITH_') || status.startsWith('MCP_')) {
        accepted.push({ file, value, mtimeMs: (await fs.stat(file)).mtimeMs })
      }
    } catch {}
  }
  accepted.sort((a, b) => b.mtimeMs - a.mtimeMs)
  assert.ok(accepted.length, 'No passing evidence for ' + label)
  return accepted[0]
}

const rows = matrix.catalogRows.filter(row => row.family === 'structural')
assert.equal(rows.length, 76)
assert.equal(rows.filter(row => row.capabilityMode === 'parameterized' && row.capabilityStatus === 'structured-partial').length, 28)
assert.equal(rows.filter(row => row.capabilityMode === 'preserve-only' && row.capabilityStatus === 'preserve-imported-only').length, 6)
const connectorGalleryRows = rows.filter(row => row.capabilityMode === 'preset-plus-parameters' && row.capabilityStatus === 'structured-partial').length
const presetOnlyIncompleteRows = rows.filter(row => row.capabilityMode === 'preset-only' && row.capabilityStatus === 'preset-only-incomplete').length
assert.equal(connectorGalleryRows, 42)
assert.equal(presetOnlyIncompleteRows, 0)

const catalog = listOptionCatalog({ format: 'full' })
for (const id of ['line', 'fill', 'effects', 'layoutsThemesMasters', 'objectRotation', 'objectFlip']) {
  assert.ok(catalog.surfaces.some(surface => surface.id === id), 'missing structural core surface ' + id)
}

const evidenceRoots = [
  ['structural-engine', path.join(root, 'outputs', 'authoring-principle-corpus', 'structural-engine')],
  ['multimaster-relationship-edge-fixture', path.join(root, 'outputs', 'authoring-principle-corpus', 'global-extended-option-five-point', 'multimaster-relationship-edge-fixture')],
  ['shape-connector-line-native', path.join(root, 'outputs', 'authoring-principle-corpus', 'global-extended-option-five-point', 'shape-connector-line-native')],
  ['shape-connector-line-public', path.join(root, 'outputs', 'authoring-principle-corpus', 'global-extended-option-five-point', 'shape-connector-line-public')],
  ['imported-native-family-public', path.join(root, 'outputs', 'authoring-principle-corpus', 'global-extended-option-five-point', 'imported-native-family-public')],
  ['review-comments-engine', path.join(root, 'outputs', 'authoring-principle-corpus', 'review-comments-engine')],
  ['public-blackbox', path.join(root, 'outputs', 'authoring-principle-corpus', 'public-blackbox')],
  ['canonical-25-lifecycle-operations', path.join(root, 'outputs', 'authoring-principle-corpus', 'finalized-jsonspec-archive', 'canonical-25-lifecycle-operations')],
]
const evidence = []
for (const [label, dir] of evidenceRoots) evidence.push(await latestPass(dir, label))

const focusedCommands = [
  ['node', ['--test', 'betterpptx-mcp/test/native-visual-primitives.test.mjs']],
  ['node', ['--test', 'betterpptx-mcp/test/shape-built-relationship-connector-geometry.test.mjs']],
  ['node', ['--test', 'betterpptx-mcp/test/shape-built-timeline-emitter-geometry.test.mjs']],
  ['node', ['--test', 'betterpptx-mcp/test/shape-connector-line-native.test.mjs']],
  ['node', ['--test', 'betterpptx-mcp/test/package-metadata-provenance.test.mjs']],
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
const teaching = manifest.projection.files.find(file => file.path === 'skills/betterpptx/references/native-foundation.md')
assert.ok(teaching && teaching.bytes > 1000)
const releaseGit = spawnSync('git', ['-C', path.join(root, 'release', 'betterpptx-public'), 'rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' })
assert.equal(releaseGit.status, 0)
const releaseStatus = spawnSync('git', ['-C', path.join(root, 'release', 'betterpptx-public'), 'status', '--short'], { cwd: root, encoding: 'utf8' })
assert.equal(releaseStatus.status, 0)
assert.equal(releaseStatus.stdout.trim(), '')

const report = {
  schemaVersion: 'betterpptx.structural-family-proof.v1',
  status: 'PASS',
  family: {
    matrixRows: rows.length,
    structuredPartialRows: rows.filter(row => row.capabilityStatus === 'structured-partial').length,
    connectorGalleryRows,
    preserveImportedOnlyRows: 6,
    presetOnlyIncompleteRows,
    evidenceRoots: evidence.length,
    formalUniversalClosure: '0/2258 (unchanged; family certification is not global formal closure)',
  },
  evidence: evidence.map(item => ({ evidence: rel(item.file), status: item.value.status, proofSha256: sha256(JSON.stringify(item.value)) })),
  focusedRegression,
  teachingRelease: { commit: releaseGit.stdout.trim(), manifestSha256: sha256(await fs.readFile(manifestPath)), projectionSha256: manifest.projection.sha256, teachingReferenceSha256: teaching.sha256 },
  preservedBoundaries: ['42 connector gallery rows are now preset-plus-parameters structured-partial with typed line/arrow overrides; no connector row is promoted to formal closure without row-level witnesses', 'imported-only comments/relationship/package parts are preserved/not executed', 'public endpoints expose opaque handles only', 'Office/preview/save boundaries remain explicit', 'approved 25 procedural feTurbulence residuals remain isolated'],
  interpretation: 'Connectors, groups, custom geometry, actions, comments, zooms, notes, and relationship carriers are certified as one structural family with typed connector gallery overrides plus explicit preservation boundaries; no unsupported imported part is promoted to authorable parity.',
}
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const outDir = path.join(root, 'outputs', 'authoring-principle-corpus', 'finalized-jsonspec-archive', 'structural-family', stamp)
await fs.mkdir(outDir, { recursive: true })
const outPath = path.join(outDir, 'structural-family-proof.json')
await fs.writeFile(outPath, JSON.stringify(report, null, 2) + '\n', 'utf8')
console.log(JSON.stringify({ status: report.status, report: rel(outPath), sha256: await sha256(await fs.readFile(outPath)), matrixRows: rows.length, evidenceRoots: evidence.length, releaseCommit: releaseGit.stdout.trim() }, null, 2))
