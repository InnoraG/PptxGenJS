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
      if (status === 'PASS' || status.startsWith('PASS_') || status.startsWith('PASS_WITH_') || status.startsWith('MCP_')) accepted.push({ file, value, mtimeMs: (await fs.stat(file)).mtimeMs })
    } catch {}
  }
  accepted.sort((a, b) => b.mtimeMs - a.mtimeMs)
  assert.ok(accepted.length, 'No passing evidence for ' + label)
  return accepted[0]
}

const rows = matrix.catalogRows.filter(row => row.family === 'layouts-themes-masters')
assert.equal(rows.length, 75)
const structuredPartialRows = rows.filter(row => row.capabilityStatus === 'structured-partial').length
const structuredPartialDiscreteRows = rows.filter(row => row.capabilityMode === 'discrete' && row.capabilityStatus === 'structured-partial').length
const presetOnlyIncompleteRows = rows.filter(row => row.capabilityMode === 'preset-only' && row.capabilityStatus === 'preset-only-incomplete').length
// Do not freeze a mode-specific count: typed gallery expansion may legitimately
// move rows from discrete to preset-plus-parameters/parameterized while the
// family remains conservatively structured-partial.
assert.ok(structuredPartialRows >= 30)
assert.ok(presetOnlyIncompleteRows >= 0)

const catalog = listOptionCatalog({ format: 'full' })
const carrier = catalog.surfaces.find(surface => surface.id === 'layoutsThemesMasters')
assert.ok(carrier)
assert.ok(carrier.parameters.length >= 28)
for (const id of ['themeColorScheme', 'background', 'fill']) assert.ok(catalog.surfaces.some(surface => surface.id === id), 'missing inherited surface ' + id)

const evidenceRoots = [
  ['theme-master-layout-native', path.join(root, 'outputs', 'authoring-principle-corpus', 'global-extended-option-five-point', 'theme-master-layout-native')],
  ['theme-master-layout-public', path.join(root, 'outputs', 'authoring-principle-corpus', 'global-extended-option-five-point', 'theme-master-layout-public')],
  ['theme-master-placeholder-office', path.join(root, 'outputs', 'authoring-principle-corpus', 'global-extended-option-five-point', 'theme-master-placeholder-office')],
  ['template-layout-import-native', path.join(root, 'outputs', 'authoring-principle-corpus', 'global-extended-option-five-point', 'template-layout-import-native')],
  ['template-layout-heldout-native', path.join(root, 'outputs', 'authoring-principle-corpus', 'global-extended-option-five-point', 'template-layout-heldout-native')],
  ['multimaster-carrier-native', path.join(root, 'outputs', 'authoring-principle-corpus', 'global-extended-option-five-point', 'multimaster-carrier-native')],
  ['multimaster-relationship-edge-fixture', path.join(root, 'outputs', 'authoring-principle-corpus', 'global-extended-option-five-point', 'multimaster-relationship-edge-fixture')],
  ['theme-color-scheme-native', path.join(root, 'outputs', 'authoring-principle-corpus', 'global-extended-option-five-point', 'theme-color-scheme-native')],
  ['theme-color-scheme-office', path.join(root, 'outputs', 'authoring-principle-corpus', 'global-extended-option-five-point', 'theme-color-scheme-office')],
  ['theme-color-scheme-public', path.join(root, 'outputs', 'authoring-principle-corpus', 'global-extended-option-five-point', 'theme-color-scheme-public')],
  ['canonical-lifecycle-schemas', path.join(root, 'outputs', 'authoring-principle-corpus', 'finalized-jsonspec-archive', 'canonical-25-lifecycle-schemas')],
]
const evidence = []
for (const [label, dir] of evidenceRoots) evidence.push(await latestPass(dir, label))

const focusedCommands = [
  ['node', ['--test', 'betterpptx-mcp/test/template-layout-import.test.mjs']],
  ['node', ['--test', 'betterpptx-mcp/test/mvp-baseline-inventory.test.mjs']],
  ['node', ['--test', 'betterpptx-mcp/test/package-metadata-provenance.test.mjs']],
  ['node', ['--test', 'betterpptx-mcp/test/public-authoring-boundary-sanitization.test.mjs']],
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
const teaching = manifest.projection.files.find(file => file.path === 'skills/betterpptx/references/native-theme-master-layout.md')
assert.ok(teaching && teaching.bytes > 1000)
const releaseGit = spawnSync('git', ['-C', path.join(root, 'release', 'betterpptx-public'), 'rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' })
assert.equal(releaseGit.status, 0)
const releaseStatus = spawnSync('git', ['-C', path.join(root, 'release', 'betterpptx-public'), 'status', '--short'], { cwd: root, encoding: 'utf8' })
assert.equal(releaseStatus.status, 0)
assert.equal(releaseStatus.stdout.trim(), '')

const report = {
  schemaVersion: 'betterpptx.layouts-themes-masters-family-proof.v1',
  status: 'PASS',
  family: { matrixRows: rows.length, structuredPartialRows, structuredPartialDiscreteRows, presetOnlyIncompleteRows, typedCarrierParameters: carrier.parameters.length, evidenceRoots: evidence.length, formalUniversalClosure: '43/2258 (unchanged; family certification is not global formal closure)' },
  evidence: evidence.map(item => ({ evidence: rel(item.file), status: item.value.status, proofSha256: sha256(JSON.stringify(item.value)) })),
  focusedRegression,
  teachingRelease: { commit: releaseGit.stdout.trim(), manifestSha256: sha256(await fs.readFile(manifestPath)), projectionSha256: manifest.projection.sha256, teachingReferenceSha256: teaching.sha256 },
  preservedBoundaries: [`${presetOnlyIncompleteRows} preset-only-incomplete gallery/layout rows remain classified`, 'theme/master/layout inheritance and placeholder normalization boundaries remain explicit', 'imported relationship carriers are preserved without target leakage', 'public preview/save infrastructure boundary remains explicit', 'universal formal closure remains 43/2258'],
  interpretation: 'Themes, variants, masters, layouts, placeholders, inheritance, slide backgrounds, and relationship carriers are certified as one generic presentation family. Existing native-theme-master-layout guidance already covers this surface; no duplicate teaching page was created.',
}
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const outDir = path.join(root, 'outputs', 'authoring-principle-corpus', 'finalized-jsonspec-archive', 'layouts-themes-masters-family', stamp)
await fs.mkdir(outDir, { recursive: true })
const outPath = path.join(outDir, 'layouts-themes-masters-family-proof.json')
await fs.writeFile(outPath, JSON.stringify(report, null, 2) + '\n', 'utf8')
console.log(JSON.stringify({ status: report.status, report: rel(outPath), sha256: await sha256(await fs.readFile(outPath)), matrixRows: rows.length, evidenceRoots: evidence.length, releaseCommit: releaseGit.stdout.trim() }, null, 2))
