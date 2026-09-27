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
const native = {
  media: 'outputs/authoring-principle-corpus/global-extended-option-five-point/media-format-parameters-native/20260825T032204Z/media-format-parameters-native-proof.json',
  adjustments: 'outputs/authoring-principle-corpus/global-extended-option-five-point/image-adjustments-native/20260824T211200Z/image-adjustments-native-proof.json',
  artistic: 'outputs/authoring-principle-corpus/global-extended-option-five-point/image-color-artistic-native/20260825T003500Z/image-color-artistic-native-proof.json',
  framing: 'outputs/authoring-principle-corpus/global-extended-option-five-point/image-framing-native/20260824T204700Z/image-framing-native-proof.json',
  accessibility: 'outputs/authoring-principle-corpus/global-extended-option-five-point/image-accessibility-native/20260825T040827Z/image-accessibility-native-proof.json',
  pictureFill: 'outputs/authoring-principle-corpus/global-extended-option-five-point/fill-picture-asset-native/20260825T141800Z/fill-picture-asset-native-proof.json',
}
const pub = {
  media: 'outputs/authoring-principle-corpus/global-extended-option-five-point/media-format-parameters-public/20260825T034034Z/media-format-parameters-public-proof.json',
  adjustments: 'outputs/authoring-principle-corpus/global-extended-option-five-point/image-adjustments-public/20260824T212242Z/image-adjustments-public-proof-v1.json',
  artistic: 'outputs/authoring-principle-corpus/global-extended-option-five-point/image-color-artistic-public/20260824T214128Z/picture-color-artistic-public-proof-v1.json',
  framing: 'outputs/authoring-principle-corpus/global-extended-option-five-point/image-framing-public/20260824T204518Z/image-framing-public-proof-v1.json',
  accessibility: 'outputs/authoring-principle-corpus/global-extended-option-five-point/image-accessibility-public/20260825T090000Z-semantic29/image-accessibility-public-semantic-proof.json',
  pictureFill: 'outputs/authoring-principle-corpus/global-extended-option-five-point/fill-picture-asset-public/20260825T142800Z/fill-picture-asset-public-proof.json',
}

const rows = matrix.catalogRows.filter(row => row.family === 'media-images-avatar')
const statusCounts = Object.fromEntries([...new Set(rows.map(row => row.capabilityStatus))].sort()
  .map(status => [status, rows.filter(row => row.capabilityStatus === status).length]))
const familyAggregate = rows.find(row => row.id === 'cap_7db8092e40c3e870d0a3')
assert.ok(familyAggregate, 'media/image authoring-family aggregate is missing')
assert.equal(familyAggregate.capabilityMode, 'preset-plus-parameters')
assert.equal(familyAggregate.capabilityStatus, 'executable-exact-structured')
assert.ok((statusCounts['executable-exact-structured'] || 0) >= 68)
assert.ok((statusCounts['structured-partial'] || 0) <= 5)
assert.equal(Object.values(statusCounts).reduce((sum, count) => sum + count, 0), rows.length)

const surfaces = Object.fromEntries(listOptionCatalog({ format: 'full' }).surfaces.map(surface => [surface.id, surface]))
assert.equal(surfaces.pictureStylePreset.canonical.length, 28)
assert.equal(surfaces.pictureStylePreset.parameters.length, 11)
assert.equal(surfaces.mediaPlayback.canonical.length, 3)
assert.equal(surfaces.mediaPlayback.parameters.length, 12)
assert.equal(surfaces.imageAdjustments.parameters.length, 10)
assert.equal(surfaces.imageAccessibility.parameters.length, 1)
assert.equal(surfaces.imageFraming.parameters.length, 1)
assert.equal(surfaces.picture3D.parameters.length, 4)
assert.equal(surfaces.artisticEffect.canonical.length, 23)

for (const file of Object.values(native)) {
  const proof = await read(file)
  assert.equal(proof.status, 'PASS', file)
  assert.deepEqual(proof.failures || [], [], file)
}
for (const file of Object.values(pub)) {
  const proof = await read(file)
  assert.equal(proof.status, 'PASS', file)
  if (Array.isArray(proof.privateLeakMatches)) assert.deepEqual(proof.privateLeakMatches, [], file)
}

const testSpecs = [
  ['media-image-family-aggregate', ['betterpptx-mcp/test/media-image-family-aggregate.test.mjs']],
  ['media-format-parameters', ['betterpptx-mcp/test/media-format-parameters.test.mjs']],
  ['image-accessibility', ['betterpptx-mcp/test/image-accessibility.test.mjs']],
  ['picture-format-native-effects', ['betterpptx-mcp/test/picture-format-native-effects.test.mjs']],
]
const testRuns = testSpecs.map(([name, files]) => {
  const result = spawnSync(process.execPath, ['--test', ...files], { cwd: root, encoding: 'utf8' })
  assert.equal(result.status, 0, `${name}\n${result.stdout}\n${result.stderr}`)
  return { name, result }
})
const tests = { status: testRuns.every(run => run.result.status === 0) ? 0 : 1, stdout: testRuns.map(run => run.result.stdout).join('\n'), stderr: testRuns.map(run => run.result.stderr).join('\n') }
const manifest = await read('release/betterpptx-public/betterpptx-public-manifest.json')
const teaching = manifest.projection.files.find(row => row.path === 'skills/betterpptx/references/native-media-images-avatar.md')
assert.ok(teaching && teaching.bytes > 1000)
const git = spawnSync('git', ['-C', path.join(root, 'release', 'betterpptx-public'), 'rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' })
assert.equal(git.status, 0)
const testOutput = tests.stdout + tests.stderr
const nativeEvidence = Object.fromEntries(await Promise.all(Object.entries(native).map(async ([key, file]) => [key, { proof: file, proofSha256: await hash(file) }])))
const publicEvidence = Object.fromEntries(await Promise.all(Object.entries(pub).map(async ([key, file]) => [key, { proof: file, proofSha256: await hash(file) }])))
const report = {
  schemaVersion: 'betterpptx.media-images-avatar-family-proof.v1', status: 'PASS',
  family: { matrixRows: rows.length, capabilityStatusCounts: statusCounts, aggregateRowId: familyAggregate.id, aggregateCapabilityStatus: familyAggregate.capabilityStatus, pictureStylePresets: 28, pictureStyleParameters: 11, mediaPlaybackParameters: 12, imageAdjustmentParameters: 10, artisticEffects: 23, picture3DParameters: 4, nullReset: true, formalUniversalClosure: 'Derived from the canonical implementation matrix; this verifier does not inflate global closure.' },
  native: nativeEvidence,
  public: publicEvidence,
  teachingRelease: { commit: git.stdout.trim(), manifestSha256: await hash('release/betterpptx-public/betterpptx-public-manifest.json'), projectionSha256: manifest.projection.sha256, teachingReferenceSha256: teaching.sha256 },
  focusedRegression: { command: 'four sequential isolated node --test invocations: family aggregate, media format, image accessibility, and picture-format native effects', exitCode: tests.status, outputSha256: sha256(testOutput), outputTail: testOutput.slice(-1000) },
  interpretation: 'Native image, media, and narration authoring is certified as one child-derived aggregate: playback, accessibility, framing, corrections, recolor/artistic effects, picture fills, editable Picture Style presets, typed 3-D controls, captions, and narration are covered. Identity-media render/job workflows remain explicitly external-gated and are not promoted by this proof.'
}
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const outDir = path.join(root, 'outputs', 'authoring-principle-corpus', 'finalized-jsonspec-archive', 'media-images-avatar-family', stamp)
await fs.mkdir(outDir, { recursive: true })
const outPath = path.join(outDir, 'media-images-avatar-family-proof.json')
await fs.writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
console.log(JSON.stringify({ status: report.status, report: path.relative(root, outPath), sha256: await hash(path.relative(root, outPath)), matrixRows: rows.length, capabilityStatusCounts: statusCounts, releaseCommit: git.stdout.trim() }, null, 2))
