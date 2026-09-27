import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const root = process.cwd()
const archiveRoot = path.join(root, 'outputs', 'authoring-principle-corpus', 'finalized-jsonspec-archive')
const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14) + 'Z'
const outDir = path.join(archiveRoot, 'g5-canonical-motion-narration-transition')
fs.mkdirSync(outDir, { recursive: true })

const rel = p => path.join(root, p)
const evidence = [
  ['canonicalMotionTiming', 'canonical-25-motion-timing/20260826T103342Z/canonical-25-motion-timing-native-proof.json'],
  ['canonicalNarrationTransition', 'canonical-25-slide-narration-transition/20260826T103403Z/canonical-25-narration-transition-native-proof.json'],
  ['canonicalNarrationTransitionOfficeCom', 'canonical-25-slide-narration-transition/20260826T040917Z/office-com/canonical-25-office-com-proof.json'],
  ['canonicalNarrationTransitionPublic', 'canonical-25-slide-narration-transition-public/20260826T043509Z/public-canonical-narration-silent-proof.json'],
  ['motionTransitionsMorphFamily', 'motion-transitions-morph-family/20260826T121914Z/motion-transitions-morph-family-proof.json'],
  ['presenterMotionFamily', 'presenter-motion-family/20260826T104743Z/presenter-motion-family-proof.json']
]

const read = (name, relative) => {
  const file = path.join(archiveRoot, relative)
  if (!fs.existsSync(file)) throw new Error(`${name} evidence missing: ${file}`)
  const bytes = fs.readFileSync(file)
  return { name, path: path.relative(root, file), sha256: crypto.createHash('sha256').update(bytes).digest('hex'), value: JSON.parse(bytes) }
}
const rows = evidence.map(([name, file]) => read(name, file))
const byName = Object.fromEntries(rows.map(row => [row.name, row.value]))
const checks = {}
const check = (name, ok, detail = null) => { checks[name] = { ok: Boolean(ok), ...(detail === null ? {} : { detail }) }; if (!ok) throw new Error(`${name} failed${detail ? `: ${JSON.stringify(detail)}` : ''}`) }

const motion = byName.canonicalMotionTiming
const narration = byName.canonicalNarrationTransition
const office = byName.canonicalNarrationTransitionOfficeCom
const pub = byName.canonicalNarrationTransitionPublic
const family = byName.motionTransitionsMorphFamily
const presenter = byName.presenterMotionFamily

check('canonicalMotionTimingStatus', motion.status === 'PASS', motion.status)
check('canonicalMotionTimingCounts', motion.execution?.motionTimeline?.effectCount === 746 && motion.execution.motionTimeline.sourceAnimatedNodes === 746 && motion.execution.motionTimeline.unmapped === 0 && motion.execution.motionTimeline.silentlyLost === 0)
check('canonicalMotionTimingChecks', Object.values(motion.checks || {}).every(Boolean), motion.checks)
check('canonicalNarrationTransitionStatus', narration.status === 'PASS', narration.status)
check('canonicalNarrationCounts', narration.currentReadback?.slides === 25 && narration.currentReadback?.narrationCues === 156 && narration.currentReadback?.transitionIntents === 25 && narration.reopenedReadback?.narrationCues === 156 && narration.reopenedReadback?.transitionIntents === 25)
check('canonicalNarrationChecks', Object.values(narration.checks || {}).every(Boolean), narration.checks)
check('officeComRepairFree25', office.status === 'PASS' && office.slideCount === 25 && office.verifyCount === 25, office)
check('freshPublicRoleA', pub.status === 'PASS' && pub.clientProfile?.includes('fresh-role-a') && pub.checks?.freshRoleASession === true && pub.checks?.servedDiscovery === true && pub.checks?.noPrivateImplementationLeakage === true)
check('freshPublicCanonicalLifecycle', pub.checks?.canonical25Slides === true && pub.checks?.dryRunMutationFree === true && pub.checks?.committedDeck === true && pub.checks?.narrationCueReadback === true && pub.checks?.transitionReadback === true && pub.checks?.qualityReturned === true)
check('familyMotionTransitionMorph', family.status === 'PASS' && family.family?.matrixRows === 401 && family.family?.animationSelectors === 166 && family.family?.transitionSelectors === 49 && family.family?.morphCovered === true)
check('familyMotionRegression', family.focusedRegression?.exitCode === 0 && /fail 0/.test(family.focusedRegression?.outputTail || ''))
check('presenterMotionAccounting', presenter.status === 'PASS' && presenter.family?.matrixRows === 96 && presenter.family?.catalogRows === 96 && presenter.family?.missingRows === 47)
check('explicitBoundariesPreserved', /47 motion rows/.test((presenter.preservedBoundaries || []).join(' ')) && /narration is the master clock/i.test((presenter.preservedBoundaries || []).join(' ')) && /UND_ERR_BODY_TIMEOUT|TTS/i.test(narration.externalBoundary || ''))

const proof = {
  schemaVersion: 'betterpptx.g5-canonical-motion-narration-transition-proof.v1',
  status: 'PASS',
  generatedAt: new Date().toISOString(),
  gate: 'G5',
  family: { canonicalSlides: 25, canonicalObjects: 871, motionItems: 746, narrationCues: 156, transitionIntents: 25, motionTransitionMorphRows: 401, presenterMotionRows: 96 },
  checks: Object.fromEntries(Object.entries(checks).map(([key, value]) => [key, value.ok])),
  evidence: Object.fromEntries(rows.map(row => [row.name, { path: row.path, sha256: row.sha256, status: row.value.status }])),
  retainedBoundaries: [
    'Public narrated TTS remains external at UND_ERR_BODY_TIMEOUT / TypeError terminated; silent timed notes and cue timing are certified.',
    'Public preview/save remains AUTHORITATIVE_PREVIEW_INFRASTRUCTURE_REQUIRED and is not silently claimed.',
    '47 planned/interaction motion rows and one playback-held row remain explicit non-selectable boundaries; no substitution is claimed.',
    'Universal formal closure remains 0/2258; family proof is not promoted to row-level global closure.'
  ],
  interpretation: 'One consolidated G5 boundary certifies canonical motion mapping, narration-led timing, captions/notes separation, transitions including Morph, native/package/Office retention, fresh public Role-A lifecycle, and presenter-motion contract accounting without flattening or inventing unsupported capability.',
  universalFormalClosure: '0/2258'
}
const reportPath = path.join(outDir, stamp, 'g5-canonical-motion-narration-transition-proof.json')
fs.mkdirSync(path.dirname(reportPath), { recursive: true })
fs.writeFileSync(reportPath, JSON.stringify({ ...proof, reportPath: path.relative(root, reportPath) }, null, 2) + '\n')
const reportSha = crypto.createHash('sha256').update(fs.readFileSync(reportPath)).digest('hex')
console.log(JSON.stringify({ status: proof.status, reportPath: path.relative(root, reportPath), reportSha256: reportSha, checks: proof.checks, universalFormalClosure: proof.universalFormalClosure }, null, 2))
