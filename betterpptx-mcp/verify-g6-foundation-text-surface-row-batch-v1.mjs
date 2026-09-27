import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const root = process.cwd()
const read = rel => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'))
const sha = rel => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, rel))).digest('hex')
const matrix = read('betterpptx-mcp/preset-decomposition-matrix.json')
const proofRoots = {
  fit: ['outputs/authoring-principle-corpus/global-extended-option-five-point/text-box-fit-wrap-direction/20260824T173111Z/text-box-fit-wrap-direction-native-proof.json', 'outputs/authoring-principle-corpus/global-extended-option-five-point/text-box-fit-wrap-direction-public/20260824T175059Z/text-box-fit-wrap-direction-public-proof-v1.json'],
  margins: ['outputs/authoring-principle-corpus/global-extended-option-five-point/text-box-margins/20260824T160938Z/text-box-margins-native-proof.json', 'outputs/authoring-principle-corpus/global-extended-option-five-point/text-box-margins-public/20260824T164717Z/text-box-margins-public-proof-v2.json'],
  align: ['outputs/authoring-principle-corpus/global-extended-option-five-point/text-paragraph-alignment-direction-language/20260824T181833Z/text-paragraph-alignment-direction-language-native-proof.json', 'outputs/authoring-principle-corpus/global-extended-option-five-point/text-paragraph-alignment-direction-language-public/20260824T182123Z/text-paragraph-alignment-direction-language-public-proof-v1.json'],
  indent: ['outputs/authoring-principle-corpus/global-extended-option-five-point/text-paragraph-indent-bullet/20260824T150654Z/text-paragraph-indent-bullet-native-proof.json', 'outputs/authoring-principle-corpus/global-extended-option-five-point/text-paragraph-indent-bullet-public/20260824T151025Z/text-paragraph-indent-bullet-public-proof.json'],
  tabs: ['outputs/authoring-principle-corpus/global-extended-option-five-point/text-tabs-rich-runs/20260824T155026Z/text-tabs-rich-runs-native-proof.json', 'outputs/authoring-principle-corpus/global-extended-option-five-point/text-tabs-rich-runs-public/20260824T154958Z/text-tabs-rich-runs-public-proof.json']
}
const configs = [
  ['cap_c05f5aeba99417b066dc', 'auto-fit', 'fit', 'fit'],
  ['cap_c90f75400db77aa6983b', 'wrapping', 'fit', 'wrap'],
  ['cap_e5248705fc6a9f3f71e1', 'margins', 'margins', 'margin'],
  ['cap_439f3e8f13450a33a56a', 'vertical align top', 'margins', 'valign'],
  ['cap_2763d4e6aa48e44db0c4', 'vertical align middle', 'margins', 'valign'],
  ['cap_eb42d2d2f31fea1b2d64', 'vertical align bottom', 'margins', 'valign'],
  ['cap_4e5312e3ef0e6d3e7efa', 'horizontal align left', 'align', 'align'],
  ['cap_a047d7b84bf5f6cc06cd', 'horizontal align center', 'align', 'align'],
  ['cap_d8deb00beac846040989', 'horizontal align right', 'align', 'align'],
  ['cap_2d288805ece2be28edae', 'horizontal align justify', 'align', 'align'],
  ['cap_f3afe12d1ed14afdc3fb', 'RTL mode', 'align', 'rtlMode'],
  ['cap_e36292b39664d30dd35d', 'indentation', 'indent', 'indent'],
  ['cap_9c5ff02e6246382bf30f', 'bullet levels', 'indent', 'indentLevel'],
  ['cap_2f6a86d84b861b139262', 'strike', 'tabs', 'strike'],
  ['cap_cd99143a9b633e1fc41a', 'superscript', 'tabs', 'superscript'],
  ['cap_2e725a73ed30f68c8b34', 'subscript', 'tabs', 'subscript']
]
const loaded = new Map(Object.entries(proofRoots).map(([key, [nativeRel, publicRel]]) => [key, { nativeRel, publicRel, native: read(nativeRel), public: read(publicRel) }]))
const boolsPass = value => Object.entries(value || {}).filter(([, v]) => typeof v === 'boolean').every(([, v]) => v)
const rows = configs.map(([rowId, label, proofKey, publicParam]) => {
  const row = matrix.catalogRows.find(item => item.id === rowId)
  const { nativeRel, publicRel, native, public: pub } = loaded.get(proofKey)
  const nativeControls = native.controls || []
  const parameter = pub.roleA?.parameters?.[publicParam]
  const checks = {
    frozenRowIdentity: row?.family === 'foundation' && row.label === label && row.capabilityStatus === 'executable-exact-structured',
    nativeControlPresent: native.status === 'PASS' && (nativeControls.includes(publicParam) || native.controlFamily?.includes(publicParam) || native.controlFamily?.includes(proofKey === 'tabs' ? 'textTabsRichRuns' : '')),
    nativeResetAndReadback: native.status === 'PASS' && Array.isArray(native.checkpoints) && native.checkpoints.length >= 5 && boolsPass(native.proof) && Object.values(native.proof || {}).filter(value => typeof value === 'boolean').length >= 4,
    nativeOfficeVisual: native.office?.status === 'PASS' && native.office.slideCount >= 5 && native.proof?.packageIntegrity === true && native.proof?.repairFreePowerPointOpen === true && native.proof?.saveCopyAsReopen === true && native.proof?.visualRenders?.length >= 5,
    publicParameterAndLifecycle: pub.status === 'PASS' && parameter && boolsPass(pub.checks) && typeof parameter.reset === 'string' && (pub.privateLeakMatches || []).length === 0,
    publicReset: typeof parameter?.reset === 'string' && /null|omit|reset/i.test(parameter.reset),
    noPrivateLeakage: (pub.privateLeakMatches || []).length === 0
  }
  const formal = Object.values(checks).every(Boolean)
  return { catalogRowId: rowId, family: row?.family, label, proofKey, publicParam, status: formal ? 'PASS_FORMALLY_CLOSED' : 'FAIL', formallyClosed: formal, checks, witness: { native: { path: nativeRel, sha256: sha(nativeRel), status: native.status }, public: { path: publicRel, sha256: sha(publicRel), status: pub.status } } }
})
const formal = rows.every(row => row.formallyClosed)
const proof = { schemaVersion: 'betterpptx.g6-frozen-catalog-row-batch-proof.v1', status: formal ? 'PASS_FORMALLY_CLOSED' : 'FAIL', generatedAt: new Date().toISOString(), gate: 'G6', batch: { family: 'foundation', theme: 'text layout, paragraph direction, indentation, and rich-run controls', rowCount: rows.length, contribution: formal ? `${rows.length}/2258` : '0/2258' }, checks: { allRowsFormal: formal, rowCount: rows.length, allNativeResetReadback: rows.every(row => row.checks.nativeResetAndReadback), allOfficeVisual: rows.every(row => row.checks.nativeOfficeVisual), allPublicLifecycle: rows.every(row => row.checks.publicParameterAndLifecycle), allPublicReset: rows.every(row => row.checks.publicReset) }, rows, policy: 'Rows are promoted individually only when their mapped native/public parameter, reset, retained Office/readback, and visual evidence all pass. Bullet tile rows and bidirectional-text aliases are not promoted by this batch because their public selector boundaries are not equivalent to the mapped parameters.', universalFormalClosure: formal ? '35/2258' : '19/2258' }
const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14) + 'Z'
const outDir = path.join(root, 'outputs', 'authoring-principle-corpus', 'finalized-jsonspec-archive', 'g6-frozen-catalog-row', stamp)
fs.mkdirSync(outDir, { recursive: true })
const out = path.join(outDir, 'g6-foundation-text-surface-row-batch-proof.json')
fs.writeFileSync(out, JSON.stringify({ ...proof, reportPath: path.relative(root, out).replaceAll('\\', '/') }, null, 2) + '\n')
const reportSha256 = sha(path.relative(root, out))
console.log(JSON.stringify({ status: proof.status, reportPath: path.relative(root, out).replaceAll('\\', '/'), reportSha256, rowCount: rows.length, universalFormalClosure: proof.universalFormalClosure, checks: proof.checks }, null, 2))
if (!formal) process.exitCode = 1
