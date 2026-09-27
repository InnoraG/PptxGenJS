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
const nativePath = path.join(root, 'outputs', 'authoring-principle-corpus', 'global-extended-option-five-point', 'smartart-format-parameters-native', '20260826T072249Z', 'smartart-format-parameters-native-proof.json')
const publicPath = path.join(root, 'outputs', 'authoring-principle-corpus', 'global-extended-option-five-point', 'smartart-family-public', '20260826T072723Z', 'smartart-family-public-proof.json')
const manifestPath = path.join(root, 'release', 'betterpptx-public', 'betterpptx-public-manifest.json')
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'))
const readSha = async file => sha256(await fs.readFile(file))

const matrix = await readJson(matrixPath)
const rows = matrix.catalogRows.filter(row => row.family === 'smartart')
assert.equal(rows.length, 27)
assert.ok(rows.every(row => ['structured-partial', 'preserve-imported-only'].includes(row.capabilityStatus)))
assert.equal(rows.filter(row => row.capabilityMode === 'preset-plus-parameters' && row.capabilityStatus === 'structured-partial').length, 18)
assert.equal(rows.filter(row => row.capabilityMode === 'parameterized' && row.capabilityStatus === 'structured-partial').length, 1)
assert.equal(rows.filter(row => row.capabilityMode === 'preserve-only' && row.capabilityStatus === 'preserve-imported-only').length, 8)

const catalog = listOptionCatalog({ surface: 'smartArtLayout', format: 'full' })
const surface = catalog.surfaces.find(row => row.id === 'smartArtLayout')
assert.equal(surface.parameters.length, 13)
for (const id of ['layoutId', 'quickStyleId', 'colorStyleId', 'presetFallback', 'rightToLeft', 'fontFace', 'fontSize', 'color', 'textColors', 'palette', 'nodes', 'title', 'altText']) assert.ok(surface.parameters.some(row => row.id === id), id)

const native = await readJson(nativePath)
const pub = await readJson(publicPath)
assert.equal(native.status, 'PASS')
assert.deepEqual(native.failures, [])
assert.equal(native.office.status, 'PASS')
assert.equal(pub.status, 'PASS')
assert.ok(Object.values(pub.checks).every(Boolean))
assert.deepEqual(pub.privateLeakMatches, [])

const tests = spawnSync(process.execPath, ['--test', 'betterpptx-mcp/test/smartart-format-parameters.test.mjs'], { cwd: root, encoding: 'utf8' })
assert.equal(tests.status, 0, `${tests.stdout}\n${tests.stderr}`)
const manifest = await readJson(manifestPath)
const teachingDoc = manifest.projection.files.find(row => row.path === 'skills/betterpptx/references/native-smartart-format.md')
assert.ok(teachingDoc && teachingDoc.bytes > 1000)
const git = spawnSync('git', ['-C', path.join(root, 'release', 'betterpptx-public'), 'rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' })
assert.equal(git.status, 0)
const output = tests.stdout + tests.stderr

const report = {
  schemaVersion: 'betterpptx.smartart-family-proof.v1', status: 'PASS',
  family: { matrixRows: rows.length, structuredPartialRows: 19, importedOnlyRows: 8, typedParameters: surface.parameters.length, capabilityMode: 'preset-plus-parameters-plus-imported-boundaries', nullReset: true, formalUniversalClosure: '0/2258 (unchanged; this family proof does not inflate global closure)' },
  native: { proof: path.relative(root, nativePath), proofSha256: await readSha(nativePath), officeRoundtrip: 'PASS_repair_free_Open2007_SaveCopyAs_reopen_render' },
  public: { proof: path.relative(root, publicPath), proofSha256: await readSha(publicPath), freshRoleA: true, commitQualityPreviewSave: true, upperBoundaryRejection: true, noPrivateLeakage: true },
  teachingRelease: { commit: git.stdout.trim(), manifestSha256: await readSha(manifestPath), projectionSha256: manifest.projection.sha256, smartArtTeachingReferenceSha256: teachingDoc.sha256 },
  focusedRegression: { command: 'node --test betterpptx-mcp/test/smartart-format-parameters.test.mjs', exitCode: tests.status, outputSha256: sha256(output), outputTail: output.slice(-800) },
  interpretation: 'SmartArt is a native starting family, not an authoring ceiling: thirteen typed selectors and overrides, deterministic null resets, fresh public lifecycle, and native Office/package proof are certified. Structured-partial and preserve-imported-only boundaries remain explicit for layout and picture-node cases.'
}
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const outDir = path.join(root, 'outputs', 'authoring-principle-corpus', 'finalized-jsonspec-archive', 'smartart-family', stamp)
await fs.mkdir(outDir, { recursive: true })
const outPath = path.join(outDir, 'smartart-family-proof.json')
await fs.writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
console.log(JSON.stringify({ status: report.status, report: path.relative(root, outPath), sha256: await readSha(outPath), matrixRows: rows.length, releaseCommit: git.stdout.trim() }, null, 2))
