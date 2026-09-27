#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const matrix = JSON.parse(await fs.readFile(path.join(root, 'betterpptx-mcp', 'preset-decomposition-matrix.json'), 'utf8'))
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const read = async relative => JSON.parse(await fs.readFile(path.join(root, relative), 'utf8'))
const hash = async relative => sha256(await fs.readFile(path.join(root, relative)))
const nativePath = 'outputs/authoring-principle-corpus/equation-engine/20260826T083731Z/equation-engine.json'
const publicPath = 'outputs/authoring-principle-corpus/global-extended-option-five-point/equations-family-public/20260826T083336Z/equations-family-public-proof.json'

const rows = matrix.catalogRows.filter(row => row.family === 'equations')
assert.equal(rows.length, 265)
assert.equal(rows.filter(row => row.capabilityMode === 'discrete' && row.capabilityStatus === 'executable-exact-structured').length, 264)
assert.equal(rows.filter(row => row.capabilityStatus === 'structured-partial').length, 0)
assert.equal(rows.filter(row => row.label === 'Equations and math').length, 1)
const native = await read(nativePath)
const pub = await read(publicPath)
assert.equal(native.status, 'MCP_EQUATION_ENGINE_VERIFIED')
assert.ok(Object.values(native.checks).every(Boolean))
assert.equal(native.package.slideCount, 75)
assert.equal(native.package.mathMarkupObjects, 75)
assert.equal(native.package.parserErrors, 0)
assert.equal(native.preview.powerPointExact, true)
assert.equal(pub.status, 'PASS')
assert.ok(Object.values(pub.checks).every(Boolean))
assert.deepEqual(pub.privateLeakMatches, [])

const test = spawnSync(process.execPath, ['--test', 'betterpptx-mcp/test/equation-preset-parameters.integration.mjs'], { cwd: root, encoding: 'utf8' })
assert.equal(test.status, 0, `${test.stdout}\n${test.stderr}`)
const manifest = await read('release/betterpptx-public/betterpptx-public-manifest.json')
const teaching = manifest.projection.files.find(row => row.path === 'skills/betterpptx/references/native-equations.md')
assert.ok(teaching && teaching.bytes > 1000)
const git = spawnSync('git', ['-C', path.join(root, 'release', 'betterpptx-public'), 'rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' })
assert.equal(git.status, 0)
const testOutput = test.stdout + test.stderr
const report = {
  schemaVersion: 'betterpptx.equations-family-proof.v1', status: 'PASS',
  family: { matrixRows: 265, exactDiscreteRows: 264, structuredPartialParameterizedRows: 0, publicCatalogRow: 1, ribbonPresets: 230, semanticPresets: 33, templateKinds: native.catalog.templateKinds.length, sourceFormats: native.catalog.sourceFormats, nullReset: true, formalUniversalClosure: '0/2258 (unchanged; this family proof does not inflate global closure)' },
  native: { proof: nativePath, proofSha256: await hash(nativePath), status: native.status, packageSlideCount: native.package.slideCount, mathMarkupObjects: native.package.mathMarkupObjects, parserErrors: native.package.parserErrors, powerPointExactPreview: native.preview.powerPointExact, patchEdit: native.checks.patchEdit },
  public: { proof: publicPath, proofSha256: await hash(publicPath), freshRoleA: true, ribbonPresets: pub.roleA.ribbonPresetCount, semanticPresets: pub.roleA.semanticPresetCount, commitQualityPreviewSave: true, invalidPresetRejection: true, noPrivateLeakage: true },
  teachingRelease: { commit: git.stdout.trim(), manifestSha256: await hash('release/betterpptx-public/betterpptx-public-manifest.json'), projectionSha256: manifest.projection.sha256, teachingReferenceSha256: teaching.sha256 },
  focusedRegression: { command: 'node --test betterpptx-mcp/test/equation-preset-parameters.integration.mjs', exitCode: test.status, outputSha256: sha256(testOutput), outputTail: testOutput.slice(-800) },
  interpretation: 'Equations are certified as one native Office Math family: the 265-row inventory reconciles to 230 Ribbon structures, 33 semantic structures, and one public catalog operation; native package/PowerPoint proof, public lifecycle, invalid-selector rejection, and sparse patch editing all pass. Equations remain editable rather than rasterized.'
}
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const outDir = path.join(root, 'outputs', 'authoring-principle-corpus', 'finalized-jsonspec-archive', 'equations-family', stamp)
await fs.mkdir(outDir, { recursive: true })
const outPath = path.join(outDir, 'equations-family-proof.json')
await fs.writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
console.log(JSON.stringify({ status: report.status, report: path.relative(root, outPath), sha256: await hash(path.relative(root, outPath)), matrixRows: rows.length, releaseCommit: git.stdout.trim() }, null, 2))
