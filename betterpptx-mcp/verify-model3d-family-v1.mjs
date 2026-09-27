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
const read = async relative => JSON.parse(await fs.readFile(path.join(root, relative), 'utf8'))
const hash = async relative => sha256(await fs.readFile(path.join(root, relative)))
const nativePath = 'outputs/authoring-principle-corpus/global-extended-option-five-point/model3d-view-parameters-native/20260825T075301Z/model3d-view-parameters-native-proof.json'
const publicPath = 'outputs/authoring-principle-corpus/global-extended-option-five-point/model3d-view-parameters-public/20260825T081744Z/model3d-view-parameters-public-proof.json'

const rows = matrix.catalogRows.filter(row => row.family === 'model3d')
assert.equal(rows.length, 33)
assert.equal(rows.filter(row => row.capabilityMode === 'preset-plus-parameters' && row.capabilityStatus === 'executable-exact-structured').length, 31)
assert.equal(rows.filter(row => row.capabilityMode === 'preset-plus-parameters' && row.capabilityStatus === 'structured-partial').length, 0)
assert.equal(rows.filter(row => row.capabilityMode === 'parameterized' && row.capabilityStatus === 'structured-partial').length, 2)
const surfaces = Object.fromEntries(listOptionCatalog({ format: 'full' }).surfaces.map(surface => [surface.id, surface]))
assert.equal(surfaces.model3dViewPreset.canonical.length, 18)
assert.equal(surfaces.model3dViewPreset.parameters.length, 14)
assert.equal(surfaces.shape3D.parameters.length, 16)
assert.equal(surfaces.picture3D.parameters.length, 4)
const native = await read(nativePath)
const pub = await read(publicPath)
assert.equal(native.status, 'PASS')
assert.equal(native.office.status, 'PASS')
assert.equal(pub.status, 'PASS')
assert.ok(Object.values(pub.checks).every(Boolean))
assert.deepEqual(pub.privateLeakMatches || [], [])

const testSpecs = [
	['model3d-authoring-family-contract', ['betterpptx-mcp/test/model3d-authoring-family-contract.test.mjs']],
	['model3d-view-parameters', ['betterpptx-mcp/test/model3d-view-parameters.test.mjs']],
  ['model3d-scene-contract', ['betterpptx-mcp/test/model3d-scene-contract.test.mjs']],
  ['native3d-production-route', ['betterpptx-mcp/test/native3d-production-route.test.mjs']],
]
const testRuns = testSpecs.map(([name, files]) => {
  const result = spawnSync(process.execPath, ['--test', ...files], { cwd: root, encoding: 'utf8' })
  assert.equal(result.status, 0, `${name}\n${result.stdout}\n${result.stderr}`)
  return { name, result }
})
const testOutput = testRuns.map(run => run.result.stdout + run.result.stderr).join('\n')
const manifest = await read('release/betterpptx-public/betterpptx-public-manifest.json')
const teaching = manifest.projection.files.find(row => row.path === 'skills/betterpptx/references/native-model3d-view.md')
assert.ok(teaching && teaching.bytes > 1000)
const git = spawnSync('git', ['-C', path.join(root, 'release', 'betterpptx-public'), 'rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' })
assert.equal(git.status, 0)
const report = {
  schemaVersion: 'betterpptx.model3d-family-proof.v1', status: 'PASS',
  family: { matrixRows: 33, executableExactRows: 31, executableExactViewRows: 18, structuredPartialRows: 2, model3dViewPresets: 18, model3dViewTypedParameters: 14, shape3DParameters: 16, picture3DParameters: 4, nullReset: true, formalUniversalClosure: '0/2258 (unchanged; this family proof does not inflate global closure)' },
  native: { proof: nativePath, proofSha256: await hash(nativePath), officeRoundtrip: 'PASS_repair_free_Open2007_SaveCopyAs_reopen_render' },
  public: { proof: publicPath, proofSha256: await hash(publicPath), freshRoleA: true, fiveCheckpoints: true, upperBoundaryRejection: true, pointLightCardinalityBoundary: true, noPrivateLeakage: true },
  teachingRelease: { commit: git.stdout.trim(), manifestSha256: await hash('release/betterpptx-public/betterpptx-public-manifest.json'), projectionSha256: manifest.projection.sha256, teachingReferenceSha256: teaching.sha256 },
  focusedRegression: { command: 'four sequential isolated node --test invocations: model3d-authoring-family-contract, model3d-view-parameters, model3d-scene-contract, native3d-production-route', exitCode: testRuns.every(run => run.result.status === 0) ? 0 : 1, outputSha256: sha256(testOutput), outputTail: testOutput.slice(-1000) },
  interpretation: 'Model 3-D authoring is certified as a native editable family: 18 exact view presets are expanded by 14 typed camera/transform/viewport/light controls, with explicit Office carrier boundaries and point-light cardinality validation. A rendered poster is not treated as a model substitute.'
}
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const outDir = path.join(root, 'outputs', 'authoring-principle-corpus', 'finalized-jsonspec-archive', 'model3d-family', stamp)
await fs.mkdir(outDir, { recursive: true })
const outPath = path.join(outDir, 'model3d-family-proof.json')
await fs.writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
console.log(JSON.stringify({ status: report.status, report: path.relative(root, outPath), sha256: await hash(path.relative(root, outPath)), matrixRows: rows.length, releaseCommit: git.stdout.trim() }, null, 2))
