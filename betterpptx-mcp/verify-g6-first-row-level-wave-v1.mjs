import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { NATIVE_VISUAL_SURFACES } from './ir/native-visual-primitives.mjs'

const root = process.cwd()
const archiveRoot = path.join(root, 'outputs', 'authoring-principle-corpus', 'finalized-jsonspec-archive')
const proofPath = path.join(archiveRoot, 'g2-shared-native-substrate', '20260826T152516Z', 'g2-shared-native-substrate-proof.json')
const reconciliationPath = path.join(archiveRoot, 'universal-catalog-reconciliation', '20260826T151149Z', 'universal-catalog-reconciliation-proof.json')
const matrixPath = path.join(root, 'betterpptx-mcp', 'preset-decomposition-matrix.json')
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const assert = (condition, message) => { if (!condition) throw new Error(message) }

assert(fs.existsSync(proofPath), 'G2 substrate proof is missing')
assert(fs.existsSync(reconciliationPath), 'universal reconciliation proof is missing')
assert(fs.existsSync(matrixPath), 'frozen universal catalog is missing')
const g2 = readJson(proofPath)
const reconciliation = readJson(reconciliationPath)
const matrix = readJson(matrixPath)
const requiredSurfaceIds = ['shadow', 'glow', 'reflection', 'softEdge', 'blur', 'fillOverlay', 'effects', 'fill', 'line', 'textFill', 'imageAdjustments', 'corrections', 'recolor', 'artisticEffect', 'shape3D', 'picture3D', 'themeColorScheme', 'layoutsThemesMasters']
const requiredSurfaces = NATIVE_VISUAL_SURFACES.filter(surface => requiredSurfaceIds.includes(surface.id))
const leaves = requiredSurfaces.flatMap(surface => {
  if (Array.isArray(surface.parameters)) return surface.parameters.map(parameter => ({ surface: surface.id, scope: '', ...parameter }))
  return Object.entries(surface.parameters || {}).flatMap(([scope, parameters]) => parameters.map(parameter => ({ surface: surface.id, scope, ...parameter })))
})
const ids = new Set(leaves.map(leaf => `${leaf.surface}:${leaf.scope}:${leaf.id}`))
const duplicateIds = leaves.filter((leaf, index) => leaves.findIndex(other => `${other.surface}:${other.scope}:${other.id}` === `${leaf.surface}:${leaf.scope}:${leaf.id}`) !== index).map(leaf => `${leaf.surface}:${leaf.scope}:${leaf.id}`)
const requiredFields = leaves.filter(leaf => !leaf.id || !leaf.type || !leaf.valueType || !(leaf.semanticPath || leaf.ooxmlAttribute) || !(leaf.reset || leaf.resetBehavior))
const focused = spawnSync(process.execPath, ['--test', 'betterpptx-mcp/test/native-visual-primitives.test.mjs'], { cwd: root, encoding: 'utf8' })
const matrixCounts = Object.fromEntries(Object.entries(matrix.catalogRows.reduce((out, row) => { out[row.capabilityStatus] = (out[row.capabilityStatus] || 0) + 1; return out }, {})))
const checks = {
  nativeSurfaceCount37: NATIVE_VISUAL_SURFACES.length === 37,
  typedResettableLeaves219: leaves.length === 219,
  uniqueLeafIdentity: duplicateIds.length === 0,
  everyLeafHasTypedContract: requiredFields.length === 0,
  everySurfaceHasResettableContract: requiredSurfaces.length === requiredSurfaceIds.length && requiredSurfaces.every(surface => surface.resetBehavior && surface.resetBehavior.component && surface.resetBehavior.full && surface.resetBehavior.nullBehavior),
  g2SubstratePass: g2.status === 'PASS' && g2.checks?.canonicalNativeReadback === true && g2.checks?.packageIntegrity === true && g2.checks?.repairFreeSaveCopyAs === true,
  focusedRegressionPass: focused.status === 0 && /pass 16/.test(focused.stdout + focused.stderr),
  universalReconciliationPass: reconciliation.status === 'PASS_RECONCILIATION_ONLY' && reconciliation.formalClosure?.value === '0/2258',
  matrixStill2258: matrix.catalogRows.length === 2258,
}
const proof = {
  schemaVersion: 'betterpptx.g6-first-row-level-wave-proof.v1',
  status: Object.values(checks).every(Boolean) ? 'PASS_WAVE_PROTOCOL' : 'FAIL',
  generatedAt: new Date().toISOString(),
  gate: 'G6',
  wave: {
    id: 'native-visual-resettable-contract-coverage',
    nativeSurfaces: NATIVE_VISUAL_SURFACES.length,
    typedResettableLeaves: leaves.length,
    formalClosedRowsAdded: 0,
    universalFormalClosure: '0/2258',
    reasonFormalRowsRemainZero: 'This wave proves a shared typed/resettable substrate and its regression protocol; it does not promote aggregate surface evidence to frozen catalog row closure.'
  },
  classification: { matrixRows: matrix.catalogRows.length, statusCounts: matrixCounts, nextPriority: ['missing', 'structured-partial', 'preset-only-incomplete', 'preserve-imported-only'] },
  checks,
  evidence: {
    g2Substrate: { path: path.relative(root, proofPath).replaceAll('\\', '/'), sha256: sha256(proofPath), status: g2.status },
    universalReconciliation: { path: path.relative(root, reconciliationPath).replaceAll('\\', '/'), sha256: sha256(reconciliationPath), status: reconciliation.status },
    focusedRegression: { command: 'node --test betterpptx-mcp/test/native-visual-primitives.test.mjs', exitCode: focused.status, outputSha256: crypto.createHash('sha256').update(focused.stdout + focused.stderr).digest('hex'), outputTail: (focused.stdout + focused.stderr).slice(-1000) }
  },
  checksSummary: { duplicateLeafIds: duplicateIds, missingTypedContractFields: requiredFields.map(leaf => `${leaf.surface}:${leaf.id || '<missing>'}`) },
  interpretation: 'The first G6 wave turns the shared native visual contract into a reusable row-level proof boundary: every currently served visual surface and typed leaf has explicit reset semantics and focused regression coverage. Frozen universal formal closure remains deliberately 0/2258 until each catalog row has its own immutable native/public/readback/reset/Office/visual witness.',
}
const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14) + 'Z'
const outDir = path.join(archiveRoot, 'g6-first-row-level-wave', stamp)
fs.mkdirSync(outDir, { recursive: true })
const out = path.join(outDir, 'g6-first-row-level-wave-proof.json')
const bytes = Buffer.from(JSON.stringify({ ...proof, reportPath: path.relative(root, out).replaceAll('\\', '/') }, null, 2) + '\n')
fs.writeFileSync(out, bytes)
console.log(JSON.stringify({ status: proof.status, reportPath: path.relative(root, out).replaceAll('\\', '/'), reportSha256: crypto.createHash('sha256').update(bytes).digest('hex'), nativeSurfaces: leaves.length ? NATIVE_VISUAL_SURFACES.length : 0, typedResettableLeaves: leaves.length, formalClosedRowsAdded: 0, universalFormalClosure: '0/2258', checks }, null, 2))
if (proof.status === 'FAIL') process.exitCode = 1
