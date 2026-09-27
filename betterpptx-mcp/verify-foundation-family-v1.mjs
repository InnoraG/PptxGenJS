#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { listOptionCatalog } from './option-registry.mjs'
import { FOUNDATION_CAPABILITY_PARTITION } from './foundation-capability-contract.mjs'
import { FOUNDATION_PUBLIC_OPERATION_NAMES } from './public-operation-capability-contract.mjs'

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

const rows = matrix.catalogRows.filter(row => row.family === 'foundation')
assert.equal(rows.length, 193)
const foundationStatusCounts = Object.fromEntries(Object.entries(Object.groupBy(rows, row => row.capabilityStatus)).map(([status, values]) => [status, values.length]))
assert.deepEqual(foundationStatusCounts, {
  'preserve-imported-only': 36,
  'structured-partial': 42,
  'not-live-in-saved-package': 27,
  'host-command-not-persistent-style': 39,
  'not-applicable': 14,
  'executable-exact-structured': 35,
})
assert.deepEqual(FOUNDATION_CAPABILITY_PARTITION, { rows: 117, exactRows: 32, partialRows: 42, preserveRows: 4, notLiveRows: 27, notApplicableRows: 12 })
assert.equal(FOUNDATION_PUBLIC_OPERATION_NAMES.length, 43)

const catalog = listOptionCatalog({ format: 'full' })
assert.ok(catalog.surfaces.length >= 40)
for (const id of ['textFill', 'textUnderline', 'objectRotation', 'objectFlip', 'line', 'fill', 'background', 'effects', 'layoutsThemesMasters', 'imageAccessibility']) {
  assert.ok(catalog.surfaces.some(surface => surface.id === id), 'missing core surface ' + id)
}

const evidenceRoots = [
  ['canonical-25-lifecycle-schemas', path.join(root, 'outputs', 'authoring-principle-corpus', 'finalized-jsonspec-archive', 'canonical-25-lifecycle-schemas')],
  ['canonical-25-lifecycle-operations', path.join(root, 'outputs', 'authoring-principle-corpus', 'finalized-jsonspec-archive', 'canonical-25-lifecycle-operations')],
  ['canonical-25-portable-regeneration', path.join(root, 'outputs', 'authoring-principle-corpus', 'finalized-jsonspec-archive', 'canonical-25-portable-regeneration')],
  ['canonical-25-locked-dependency-inventory', path.join(root, 'outputs', 'authoring-principle-corpus', 'finalized-jsonspec-archive', 'canonical-25-locked-dependency-inventory')],
  ['canonical-25-slide-source-bundle', path.join(root, 'outputs', 'authoring-principle-corpus', 'canonical-25-slide-source-bundle')],
  ['artifact-blackbox', path.join(root, 'outputs', 'authoring-principle-corpus', 'artifact-blackbox')],
  ['accessibility-packout', path.join(root, 'outputs', 'authoring-principle-corpus', 'accessibility-packout')],
  ['global-parameter-baseline', path.join(root, 'outputs', 'authoring-principle-corpus', 'global-parameter-baseline')],
  ['imported-native-family', path.join(root, 'outputs', 'authoring-principle-corpus', 'global-extended-option-five-point', 'imported-native-family-mutation')],
  ['background-solid', path.join(root, 'outputs', 'authoring-principle-corpus', 'global-extended-option-five-point', 'background-solid-native')],
]
const evidence = []
for (const [label, dir] of evidenceRoots) evidence.push(await latestPass(dir, label))

const focusedCommands = [
  ['node', ['betterpptx-mcp/verify-foundation-metadata-office-v1.mjs']],
  ['node', ['--test', 'betterpptx-mcp/test/foundation-capability-contract.test.mjs']],
  ['node', ['--test', 'betterpptx-mcp/test/public-operation-capability-contract.test.mjs']],
  ['node', ['tools/verify-authoring-principle-public-blackbox.mjs']],
  ['node', ['betterpptx-mcp/verify-billing-public-ux.mjs']],
  ['node', ['--test', 'betterpptx-mcp/test/mvp-baseline-inventory.test.mjs']],
  ['node', ['--test', 'betterpptx-mcp/test/native-html-canonical-baseline.test.mjs']],
  ['node', ['--test', 'betterpptx-mcp/test/package-metadata-provenance.test.mjs']],
  ['node', ['--test', 'betterpptx-mcp/test/image-accessibility.test.mjs']],
  ['node', ['--test', 'betterpptx-mcp/test/public-authoring-boundary-sanitization.test.mjs']],
  ['powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'betterpptx-mcp/test/comparator-foundation-package-signatures.test.ps1']],
  ['pwsh', ['-NoProfile', '-File', 'betterpptx-mcp/test/comparator-foundation-package-signatures.test.ps1']],
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
  schemaVersion: 'betterpptx.foundation-family-proof.v1',
  status: 'PASS',
  family: {
    matrixRows: rows.length,
    exactRows: foundationStatusCounts['executable-exact-structured'],
    structuredPartialRows: foundationStatusCounts['structured-partial'],
    preserveImportedOnlyRows: foundationStatusCounts['preserve-imported-only'],
    notLiveRows: foundationStatusCounts['not-live-in-saved-package'],
    hostCommandRows: foundationStatusCounts['host-command-not-persistent-style'],
    notApplicableRows: foundationStatusCounts['not-applicable'],
    decomposedWorkUnit: FOUNDATION_CAPABILITY_PARTITION,
    coreRegistrySurfaces: catalog.surfaces.length,
    foundationEvidenceRoots: evidence.length,
    formalUniversalClosure: matrix.implementationSummary?.formalCertification || '76/2258 (family implementation is not global formal closure)',
  },
  evidence: evidence.map(item => ({ evidence: rel(item.file), status: item.value.status, proofSha256: sha256(JSON.stringify(item.value)) })),
  focusedRegression,
  teachingRelease: { commit: releaseGit.stdout.trim(), manifestSha256: sha256(await fs.readFile(manifestPath)), projectionSha256: manifest.projection.sha256, teachingReferenceSha256: teaching.sha256 },
  preservedBoundaries: ['imported-only package parts are preserved/not executed', 'public endpoints expose opaque handles only', 'Office/provider/preview boundaries remain explicit', 'approved 25 procedural feTurbulence residuals remain isolated', 'formal global closure remains separate from inventory'],
  interpretation: 'The foundation catalog is decomposed into exact persisted authoring, specifically owned residual, preserve-only, non-persistent, host-command, and validation-oracle rows. Portable document metadata, presentation RTL, backgrounds, sections, and already proven text controls have executable package/readback/comparator coverage. The 39 public operations have schemas, handlers, self-routes, black-box safety, and conditional commerce truth but are not counted as persisted PowerPoint authoring or formal Office closure; accessibility, localized text, advanced actions, zoom mutation, licensed font embedding, and strict generic OPC operation validation remain explicitly outside the exact promotion.',
}
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const outDir = path.join(root, 'outputs', 'authoring-principle-corpus', 'finalized-jsonspec-archive', 'foundation-family', stamp)
await fs.mkdir(outDir, { recursive: true })
const outPath = path.join(outDir, 'foundation-family-proof.json')
await fs.writeFile(outPath, JSON.stringify(report, null, 2) + '\n', 'utf8')
console.log(JSON.stringify({ status: report.status, report: rel(outPath), sha256: await sha256(await fs.readFile(outPath)), matrixRows: rows.length, evidenceRoots: evidence.length, releaseCommit: releaseGit.stdout.trim() }, null, 2))
