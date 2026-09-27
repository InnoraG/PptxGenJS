#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { listOptionCatalog } from './option-registry.mjs'

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const matrixPath = path.join(root, 'betterpptx-mcp', 'preset-decomposition-matrix.json')
const nativeProofPath = path.join(root, 'outputs', 'authoring-principle-corpus', 'global-extended-option-five-point', 'style-effect-preset-overrides-native', '20260826T061039Z', 'style-effect-preset-overrides-native-proof.json')
const publicProofPath = path.join(root, 'outputs', 'authoring-principle-corpus', 'global-extended-option-five-point', 'style-effect-preset-overrides-public', '20260826T061103Z', 'style-effect-preset-overrides-public-proof-v1.json')
const manifestPath = path.join(root, 'release', 'betterpptx-public', 'betterpptx-public-manifest.json')
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'))
const readSha = async file => sha256(await fs.readFile(file))

const matrix = await readJson(matrixPath)
const nativeProof = await readJson(nativeProofPath)
const publicProof = await readJson(publicProofPath)
const manifest = await readJson(manifestPath)
const galleryLabel = /(?:(?:shape-style|wordart-style)-\d+|(?:shape-effect|text-effect)-[a-z-]+-\d+)/i
const galleryRows = matrix.catalogRows.filter(row => galleryLabel.test(row.label || ''))
assert.equal(galleryRows.length, 369, 'Expected the four style/effect galleries to cover 369 catalog rows.')
assert.ok(galleryRows.every(row => row.capabilityMode === 'preset-plus-parameters' && row.capabilityStatus === 'executable-exact-structured'), 'Every gallery row must be executable and parameterized.')
assert.ok(galleryRows.every(row => row.overrideFields.length > 0 && row.resetBehavior?.full), 'Every gallery row must expose typed overrides and full reset behavior.')

const expectedSurfaces = ['shapeStylePreset', 'shapeEffectPreset', 'wordArtStylePreset', 'textEffectPreset']
const catalog = listOptionCatalog({ format: 'full' })
const surfaceRows = Object.fromEntries(expectedSurfaces.map(id => [id, catalog.surfaces.find(row => row.id === id)]))
assert.ok(expectedSurfaces.every(id => surfaceRows[id]), 'All four public gallery surfaces must be discoverable.')
assert.ok(expectedSurfaces.every(id => surfaceRows[id].capabilityMode === 'preset-plus-parameters' && surfaceRows[id].capabilityStatus === 'executable-exact-structured'), 'All four public gallery surfaces must advertise exact structured execution.')
assert.ok(expectedSurfaces.every(id => Array.isArray(surfaceRows[id].overrideFields) && surfaceRows[id].overrideFields.length > 0 && surfaceRows[id].parameters), 'All four public gallery surfaces must expose overrides and parameter catalogs.')

assert.equal(nativeProof.status, 'PASS')
assert.deepEqual(nativeProof.failures, [])
assert.equal(nativeProof.office.status, 'PASS')
assert.equal(publicProof.status, 'PASS')
assert.deepEqual(publicProof.privateLeakMatches, [])
assert.ok(Object.values(publicProof.checks).every(Boolean))
assert.equal(manifest.releaseState, 'development')
const projectedDoc = manifest.projection.files.find(row => row.path === 'skills/betterpptx/references/native-shape-effect-overrides.md')
assert.equal(projectedDoc?.sha256, '2e9e1796563f6374322dd0bce45f7573b311b50fc4b74ca7bbd3123e04fd0314')
assert.equal(projectedDoc?.bytes, 2681)

const tests = spawnSync(process.execPath, ['--test', 'betterpptx-mcp/test/g0-capability-truth.test.mjs', 'betterpptx-mcp/test/mvp-baseline-inventory.test.mjs'], { cwd: root, encoding: 'utf8' })
assert.equal(tests.status, 0, `${tests.stdout}\n${tests.stderr}`)
const git = spawnSync('git', ['-C', path.join(root, 'release', 'betterpptx-public'), 'rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' })
assert.equal(git.status, 0)
const releaseCommit = git.stdout.trim()
const output = tests.stdout + tests.stderr

const report = {
  schemaVersion: 'betterpptx.global-style-gallery-override-family-proof.v1',
  status: 'PASS',
  family: {
    name: 'shape-style-wordart-shape-effect-text-effect-gallery-bases',
    catalogRows: galleryRows.length,
    executableExactStructuredRows: galleryRows.filter(row => row.capabilityMode === 'preset-plus-parameters' && row.capabilityStatus === 'executable-exact-structured').length,
    publicSurfaces: expectedSurfaces,
    formalUniversalClosure: '0/2258 (unchanged; this family proof does not inflate global closure)',
  },
  matrix: { file: 'betterpptx-mcp/preset-decomposition-matrix.json', sha256: await readSha(matrixPath), catalogRows: matrix.counts.catalogRows, optionSurfaces: matrix.counts.optionSurfaces },
  native: { proof: 'outputs/authoring-principle-corpus/global-extended-option-five-point/style-effect-preset-overrides-native/20260826T061039Z/style-effect-preset-overrides-native-proof.json', sha256: await readSha(nativeProofPath), status: nativeProof.status, office: nativeProof.office.status },
  public: { proof: 'outputs/authoring-principle-corpus/global-extended-option-five-point/style-effect-preset-overrides-public/20260826T061103Z/style-effect-preset-overrides-public-proof-v1.json', sha256: await readSha(publicProofPath), status: publicProof.status, checks: publicProof.checks, noPrivateImplementationLeakage: publicProof.privateLeakMatches.length === 0 },
  teachingRelease: { commit: releaseCommit, manifestSha256: await readSha(manifestPath), projectionSha256: manifest.projection.sha256, styleEffectReferenceSha256: projectedDoc.sha256 },
  focusedRegression: { command: 'node --test betterpptx-mcp/test/g0-capability-truth.test.mjs betterpptx-mcp/test/mvp-baseline-inventory.test.mjs', exitCode: tests.status, outputSha256: sha256(output), outputTail: output.slice(-800) },
  interpretation: 'Style and effect gallery tiles are editable native bases. Typed overrides, deterministic precedence, null component reset, full selector reset, public discovery, and Office/package proof are all certified for this family.'
}

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const outDir = path.join(root, 'outputs', 'authoring-principle-corpus', 'finalized-jsonspec-archive', 'global-style-gallery-override-family', stamp)
await fs.mkdir(outDir, { recursive: true })
const outPath = path.join(outDir, 'global-style-gallery-override-family-proof.json')
await fs.writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
console.log(JSON.stringify({ status: report.status, report: path.relative(root, outPath), sha256: await readSha(outPath), rows: galleryRows.length, releaseCommit }, null, 2))
