import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const root = process.cwd()
const matrix = JSON.parse(fs.readFileSync(path.join(root, 'betterpptx-mcp', 'preset-decomposition-matrix.json'), 'utf8'))
const officeRel = 'outputs/authoring-principle-corpus/finalized-jsonspec-archive/g6-office-text-controls-mutation/20260826163528Z/g6-office-text-controls-mutation-proof.json'
const office = JSON.parse(fs.readFileSync(path.join(root, officeRel), 'utf8'))
const configs = [
  { id: 'cap_5c94a4a3c8c6bee8dde5', label: 'character spacing', key: 'characterSpacing', familyPattern: /^textCharacterSpacing\./, native: 'outputs/authoring-principle-corpus/global-extended-option-five-point/text-character-spacing/20260824T142730Z/text-character-spacing-native-proof.json', public: 'outputs/authoring-principle-corpus/global-extended-option-five-point/text-character-spacing-public/20260824T142924Z/text-character-spacing-public-proof.json' },
  { id: 'cap_e195e5bfb5f77413d7bc', label: 'line spacing', key: 'lineSpacing', familyPattern: /^textLineSpacing\./, native: 'outputs/authoring-principle-corpus/global-extended-option-five-point/text-line-spacing/20260824T143623Z/text-line-spacing-native-proof.json', public: 'outputs/authoring-principle-corpus/global-extended-option-five-point/text-line-spacing-public/20260824T144211Z/text-line-spacing-public-proof.json' },
  { id: 'cap_90e80207835fc47aa779', label: 'paragraph spacing before', key: 'paragraphSpacingBefore', familyPattern: /^textParagraphSpacing\./, native: 'outputs/authoring-principle-corpus/global-extended-option-five-point/text-paragraph-spacing/20260824T145311Z/text-paragraph-spacing-native-proof.json', public: 'outputs/authoring-principle-corpus/global-extended-option-five-point/text-paragraph-spacing-public/20260824T145447Z/text-paragraph-spacing-public-proof.json' },
  { id: 'cap_87e2e792706583fd5056', label: 'paragraph spacing after', key: 'paragraphSpacingAfter', familyPattern: /^textParagraphSpacing\./, native: 'outputs/authoring-principle-corpus/global-extended-option-five-point/text-paragraph-spacing/20260824T145311Z/text-paragraph-spacing-native-proof.json', public: 'outputs/authoring-principle-corpus/global-extended-option-five-point/text-paragraph-spacing-public/20260824T145447Z/text-paragraph-spacing-public-proof.json' },
  { id: 'cap_905bff9036f8fafcc464', label: 'underline', key: 'underline', familyPattern: /^textRun\.underline|^underline\./, native: 'outputs/authoring-principle-corpus/global-extended-option-five-point/text-underline/20260824T191359Z/text-underline-native-proof.json', public: 'outputs/authoring-principle-corpus/global-extended-option-five-point/text-underline-public/20260824T191604Z/text-underline-public-proof-v1.json' }
]
const read = rel => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'))
const sha = rel => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, rel))).digest('hex')
const rows = configs.map(cfg => {
  const row = matrix.catalogRows.find(item => item.id === cfg.id)
  const native = read(cfg.native)
  const pub = read(cfg.public)
  const officeRow = office.controls.find(item => item.key === cfg.key)
  const nativeProof = native.proof || {}
  const publicChecks = pub.checks || {}
  const checks = {
    frozenRowIdentity: row?.family === 'foundation' && row?.label === cfg.label && row?.capabilityMode === 'parameterized' && row?.capabilityStatus === 'executable-exact-structured',
    typedNativeContract: native.status === 'PASS' && cfg.familyPattern.test(native.controlFamily || '') && Object.values(nativeProof).filter(value => typeof value === 'boolean').every(Boolean),
    nativeResetReadbackVisual: native.status === 'PASS' && native.roundtrip?.rows?.length >= 5 && (nativeProof.resetAndReedit === true || nativeProof.resetAndReeditBoundary === true) && Array.isArray(nativeProof.visualRenders) && nativeProof.visualRenders.length >= 5,
    nativePackageOfficeOpen: native.generated?.audit?.status === 'PASS' && native.generated.audit.errors?.length === 0 && native.office?.status === 'PASS',
    publicFreshLifecycle: pub.status === 'PASS' && pub.roleA?.freshSession === true && Object.values(publicChecks).filter(value => typeof value === 'boolean').every(Boolean) && (pub.privateLeakMatches || []).length === 0,
    officeAuthoredSetter: office.status === 'PASS' && officeRow?.status === 'PASS' && officeRow.checks?.officeAuthoredSetter === true && officeRow.checks?.saveCopyAsReopen === true && officeRow.checks?.retainedValue === true && officeRow.checks?.renderedNonEmpty === true,
  }
  return { ...cfg, formallyClosed: Object.values(checks).every(Boolean), checks, witnesses: { native: { path: cfg.native, sha256: sha(cfg.native), status: native.status, controlFamily: native.controlFamily }, public: { path: cfg.public, sha256: sha(cfg.public), status: pub.status, endpoint: pub.endpoint }, office: { path: officeRel, sha256: sha(officeRel), status: office.status, control: officeRow?.property } } }
})
const formallyClosedRows = rows.filter(row => row.formallyClosed)
const proof = { schemaVersion: 'betterpptx.g6-foundation-text-controls-row-batch-proof.v1', status: formallyClosedRows.length === rows.length ? 'PASS_FORMALLY_CLOSED' : 'FAIL', generatedAt: new Date().toISOString(), gate: 'G6', batch: 'foundation text controls', catalog: { requestedRows: rows.length, formallyClosedRows: formallyClosedRows.length, denominator: 2258 }, rows, officeMutationWitness: { path: officeRel, sha256: sha(officeRel), status: office.status, checks: office.checks }, interpretation: 'Five frozen foundation rows are promoted only because each has a typed native contract, reset/readback/visual proof, fresh public lifecycle, package/PowerPoint proof, and direct Office-authored mutation witness. No preset-only or unrelated row is promoted.', universalFormalClosure: `${formallyClosedRows.length}/2258` }
const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14) + 'Z'
const outDir = path.join(root, 'outputs', 'authoring-principle-corpus', 'finalized-jsonspec-archive', 'g6-frozen-catalog-row', stamp)
fs.mkdirSync(outDir, { recursive: true })
const out = path.join(outDir, 'g6-foundation-text-controls-row-batch-proof.json')
fs.writeFileSync(out, JSON.stringify({ ...proof, reportPath: path.relative(root, out).replaceAll('\\', '/') }, null, 2) + '\n')
const reportSha256 = sha(path.relative(root, out))
console.log(JSON.stringify({ status: proof.status, reportPath: path.relative(root, out).replaceAll('\\', '/'), reportSha256, formallyClosedRows: formallyClosedRows.map(row => ({ id: row.id, label: row.label })), universalFormalClosure: proof.universalFormalClosure }, null, 2))
if (proof.status !== 'PASS_FORMALLY_CLOSED') process.exitCode = 1
