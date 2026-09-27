// Research execution readiness. This is deliberately distinct from the
// evidence gates: the owner may authorize continued private research while
// measured judge calibration and production promotion remain fail-closed.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, 'outputs')
const read = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8').replace(/^\uFEFF/, ''))

const signoff = read('owner-frozen-corpus-signoff.json')
const completion = read('image-authoring-completion-audit.json')
const gates = read('image-authoring-goal-gates.json')
const readiness = read('semantic-judge-pair-endpoint-readiness-report.json')
const canary = read('live-modal-semantic-judge-canary-report.json')
const direct = read('photorealistic-direct-pairwise-calibration-judge-report.json')

const override = signoff.judgeResearchOverride?.status === 'owner-directed-research-acceptance'
const technicalReady = readiness.status === 'ready' && readiness.accountCount >= 2 && readiness.allPairConfigured === true && canary.failures === 0 && direct.failures === 0
const rawOpenGates = Array.isArray(gates.open) ? gates.open : []
const report = {
  schemaVersion: 'betterpptx.image-authoring-execution-readiness.v1',
  status: override && technicalReady ? 'research-execution-ready-owner-override' : 'research-execution-blocked',
  researchOnly: true,
  launchPlanned: false,
  ownerOverrideAccepted: override,
  judgeExecutionPolicy: override ? 'accepted-baseline-owner-override' : 'blocked-until-owner-override',
  engineResearchOverride: {
    requestFlag: 'semanticJudgeResearchOverride',
    runtimeGuard: 'BETTERPPTX_LOCAL_MAINTAINER=1 plus BETTERPPTX_IMAGE_AUTHORING_RESEARCH_OVERRIDE=1',
    productionAutoAccept: false
  },
  acceptedBaseline: signoff.judgeResearchOverride?.acceptedBaseline || null,
  measuredCalibration: {
    status: signoff.judgeResearchOverride?.calibrationStatus || 'unknown',
    kappa: signoff.judgeResearchOverride?.measuredKappa ?? direct.evaluation?.kappa ?? null,
    semanticAutoAccept: signoff.judgeResearchOverride?.semanticAutoAccept === true,
    productionPromotion: signoff.judgeResearchOverride?.productionPromotion === true
  },
  technicalReadiness: {
    pairEndpoints: `${readiness.accounts?.filter(account => account.pairConfigured).length || 0}/${readiness.accountCount || 0}`,
    pairEndpointReadiness: readiness.status,
    semanticCanaryFailures: canary.failures,
    directBenchmarkFailures: direct.failures
  },
  rawEvidence: {
    completionStatus: completion.status,
    completionGreen: completion.checks.filter(item => item.status === true).length,
    completionTotal: completion.checks.length,
    openEvidenceGates: rawOpenGates,
    judgeCalibrationRemainsOpen: rawOpenGates.includes('judge-human-kappa') || completion.blockers.includes('semantic-judge-vs-human-calibration')
  },
  policy: {
    customerImages: false,
    externalAi: false,
    training: false,
    pptxOnly: true,
    rawGlbFbxExport: false,
    productionBilling: 'deferred'
  },
  note: 'Owner instruction passes the current judge for continued private research execution only. It does not claim human calibration, enable semantic auto-accept, or authorize production promotion.'
}

const outputPath = path.join(root, 'image-authoring-execution-readiness.json')
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
if (report.status !== 'research-execution-ready-owner-override') process.exit(1)
