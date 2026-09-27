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
const nativeAnimationPath = path.join(root, 'outputs', 'authoring-principle-corpus', 'global-extended-option-five-point', 'animation-format-parameters-native', '20260826T063121Z', 'animation-format-parameters-native-proof.json')
const nativeTransitionPath = path.join(root, 'outputs', 'authoring-principle-corpus', 'global-extended-option-five-point', 'transition-format-parameters-native', '20260826T063120Z', 'transition-format-parameters-native-proof.json')
const publicAnimationPath = path.join(root, 'outputs', 'authoring-principle-corpus', 'global-extended-option-five-point', 'animation-format-parameters-public', '20260826T063424Z', 'animation-format-parameters-public-proof.json')
const publicTransitionPath = path.join(root, 'outputs', 'authoring-principle-corpus', 'global-extended-option-five-point', 'transition-format-parameters-public', '20260826T063219Z', 'transition-format-parameters-public-proof.json')
const manifestPath = path.join(root, 'release', 'betterpptx-public', 'betterpptx-public-manifest.json')
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'))
const readSha = async file => sha256(await fs.readFile(file))

const matrix = await readJson(matrixPath)
const rows = matrix.catalogRows.filter(row => row.family === 'motion-transitions-morph')
assert.equal(rows.length, 411)
const exactRows = rows.filter(row => row.capabilityStatus === 'executable-exact-structured')
const partialRows = rows.filter(row => row.capabilityStatus === 'structured-partial')
const preserveRows = rows.filter(row => row.capabilityStatus === 'preserve-imported-only')
assert.equal(exactRows.length, 410)
assert.equal(partialRows.length, 0)
assert.equal(preserveRows.length, 1)
assert.ok(exactRows.every(row => ['preset-plus-parameters', 'parameterized'].includes(row.capabilityMode)))
assert.ok(partialRows.every(row => row.overrideFields.includes('duration') && (row.overrideFields.includes('effectOptions') || row.overrideFields.includes('pattern') || row.overrideFields.includes('transition'))))

const catalog = listOptionCatalog({ format: 'full' })
const animation = catalog.surfaces.find(row => row.id === 'animationPreset')
const transition = catalog.surfaces.find(row => row.id === 'transitionPreset')
assert.equal(animation.canonical.length, 166)
assert.equal(animation.parameters.length, 20)
assert.equal(transition.canonical.length, 49)
assert.equal(transition.parameters.length, 16)
assert.ok(animation.parameters.some(row => row.id === 'repeatCount') && animation.parameters.some(row => row.id === 'autoReverse'))
assert.ok(transition.parameters.some(row => row.id === 'option') && transition.parameters.some(row => row.id === 'p14dur'))

const nativeAnimation = await readJson(nativeAnimationPath)
const nativeTransition = await readJson(nativeTransitionPath)
const publicAnimation = await readJson(publicAnimationPath)
const publicTransition = await readJson(publicTransitionPath)
for (const proof of [nativeAnimation, nativeTransition, publicAnimation, publicTransition]) assert.equal(proof.status, 'PASS')
for (const proof of [nativeAnimation, nativeTransition]) { assert.deepEqual(proof.failures, []); assert.equal(proof.office.status, 'PASS') }
for (const proof of [publicAnimation, publicTransition]) { assert.ok(Object.values(proof.checks).every(Boolean)); assert.deepEqual(proof.privateLeakMatches, []) }

const tests = spawnSync(process.execPath, ['--test', 'betterpptx-mcp/test/animation-format-parameters.test.mjs', 'betterpptx-mcp/test/transition-format-parameters.test.mjs'], { cwd: root, encoding: 'utf8' })
assert.equal(tests.status, 0, `${tests.stdout}\n${tests.stderr}`)
const manifest = await readJson(manifestPath)
assert.equal(manifest.releaseState, 'development')
const teachingDoc = manifest.projection.files.find(row => row.path === 'skills/betterpptx/references/native-motion-transitions.md')
assert.ok(teachingDoc && teachingDoc.bytes > 2000)
const git = spawnSync('git', ['-C', path.join(root, 'release', 'betterpptx-public'), 'rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' })
assert.equal(git.status, 0)
const output = tests.stdout + tests.stderr

const report = {
  schemaVersion: 'betterpptx.motion-transitions-morph-family-proof.v1',
  status: 'PASS',
  family: {
    matrixRows: rows.length,
    capabilityMode: 'preset-plus-parameters for selectors; parameterized for direct operations',
    exactRows: exactRows.length,
    partialRows: partialRows.length,
    preserveRows: preserveRows.length,
    capabilityStatus: 'executable-exact-structured for concrete selectors, captured Transition Ribbon tiles, and direct aggregate operations',
    limitation: 'All 411 motion/transition/Morph rows are now covered by typed native selector or direct-operation contracts; formal Office/public certification remains independently tracked.',
    animationSelectors: animation.canonical.length,
    animationParameters: animation.parameters.length,
    transitionSelectors: transition.canonical.length,
    transitionParameters: transition.parameters.length,
    morphCovered: true,
    formalUniversalClosure: '76/2258 (unchanged; this family proof does not replace formal Office certification)'
  },
  native: {
    animationProof: 'outputs/authoring-principle-corpus/global-extended-option-five-point/animation-format-parameters-native/20260826T063121Z/animation-format-parameters-native-proof.json',
    animationProofSha256: await readSha(nativeAnimationPath),
    transitionProof: 'outputs/authoring-principle-corpus/global-extended-option-five-point/transition-format-parameters-native/20260826T063120Z/transition-format-parameters-native-proof.json',
    transitionProofSha256: await readSha(nativeTransitionPath),
    officeRoundtrip: 'PASS_repair_free_Open2007_SaveCopyAs_reopen_render'
  },
  public: {
    animationProof: 'outputs/authoring-principle-corpus/global-extended-option-five-point/animation-format-parameters-public/20260826T063424Z/animation-format-parameters-public-proof.json',
    animationProofSha256: await readSha(publicAnimationPath),
    transitionProof: 'outputs/authoring-principle-corpus/global-extended-option-five-point/transition-format-parameters-public/20260826T063219Z/transition-format-parameters-public-proof.json',
    transitionProofSha256: await readSha(publicTransitionPath),
    freshRoleA: true,
    previewSave: true,
    noPrivateLeakage: true
  },
  teachingRelease: { commit: git.stdout.trim(), manifestSha256: await readSha(manifestPath), projectionSha256: manifest.projection.sha256, motionTeachingReferenceSha256: teachingDoc.sha256 },
  focusedRegression: { command: 'node --test betterpptx-mcp/test/animation-format-parameters.test.mjs betterpptx-mcp/test/transition-format-parameters.test.mjs', exitCode: tests.status, outputSha256: sha256(output), outputTail: output.slice(-800) },
  interpretation: 'The concrete discoverable animation and transition selector unions, captured Transition Ribbon gallery tiles, direct aggregate animation/transition operations, typed timing/effect options, Morph transition option, null resets, native package/Office boundaries, and fresh public Role-A lifecycle are certified as one exact motion-selector family. Formal Office/public certification remains a separate counter.'
}
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const outDir = path.join(root, 'outputs', 'authoring-principle-corpus', 'finalized-jsonspec-archive', 'motion-transitions-morph-family', stamp)
await fs.mkdir(outDir, { recursive: true })
const outPath = path.join(outDir, 'motion-transitions-morph-family-proof.json')
await fs.writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
console.log(JSON.stringify({ status: report.status, report: path.relative(root, outPath), sha256: await readSha(outPath), matrixRows: rows.length, releaseCommit: git.stdout.trim() }, null, 2))
