// Second-stage semantic auto-accept gate. The primary path now uses the
// simplified pairwise choice format; the former 1–5 score format is retained
// only as an explicit legacy compatibility path. This tool never invents
// reviewer or judge labels and never calls an AI service.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { evaluateCalibrationCorpus, CALIBRATION_DIMENSIONS } from './quality/semantic-calibration.mjs'
import { evaluatePairwiseCalibration, PAIRWISE_CHOICES } from './quality/pairwise-calibration.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const outputPath = path.join(here, 'outputs', 'photorealistic-judge-calibration-report.json')
const legacyPairwisePacketPath = path.join(here, 'outputs', 'photorealistic-pairwise-review-packet.json')
const expandedPairwisePacketPath = path.join(here, 'outputs', 'photorealistic-pairwise-calibration-packet.json')
const legacyPacketPath = path.join(here, 'outputs', 'photorealistic-blind-review-packet.json')
const pairwiseDefaultPath = path.join(here, 'outputs', 'photorealistic-pairwise-judge-calibration-records.json')
const legacyDefaultPath = path.join(here, 'outputs', 'photorealistic-judge-calibration-records.json')
const explicitPairwisePath = process.env.BETTERPPTX_PAIRWISE_JUDGE_CALIBRATION_RECORDS
const explicitLegacyPath = process.env.BETTERPPTX_JUDGE_CALIBRATION_RECORDS
const explicitPairwisePacket = process.env.BETTERPPTX_PAIRWISE_JUDGE_CALIBRATION_PACKET
const reviewMode = explicitPairwisePath || (!explicitLegacyPath && !fs.existsSync(legacyDefaultPath)) ? 'pairwise' : 'legacy-rubric'
const inputPath = reviewMode === 'pairwise' ? (explicitPairwisePath || pairwiseDefaultPath) : (explicitLegacyPath || legacyDefaultPath)
const packetPath = reviewMode === 'pairwise' ? (explicitPairwisePacket || expandedPairwisePacketPath) : legacyPacketPath
const packetDigest = crypto.createHash('sha256').update(fs.readFileSync(packetPath)).digest('hex')
let records = []
let inputStatus = 'missing'
if (fs.existsSync(inputPath)) {
	try {
		const parsed = JSON.parse(fs.readFileSync(inputPath, 'utf8').replace(/^\uFEFF/, ''))
		records = Array.isArray(parsed) ? parsed : parsed.records
		inputStatus = Array.isArray(records) ? 'loaded' : 'invalid'
	} catch { inputStatus = 'invalid' }
}

let normalized
let evaluation
let judgeFieldsComplete
if (reviewMode === 'pairwise') {
	normalized = (Array.isArray(records) ? records : []).filter(record => record?.packetDigest === packetDigest || !record?.packetDigest).map(record => ({
		id: record.id || record.pairId,
		humanChoice: record.humanChoice,
		judgeChoice: record.judgeChoice,
	}))
	evaluation = evaluatePairwiseCalibration(normalized, { minRecords: 20, overallMinimum: 0.75 })
	judgeFieldsComplete = normalized.length > 0 && normalized.every(record => PAIRWISE_CHOICES.includes(record.humanChoice) && PAIRWISE_CHOICES.includes(record.judgeChoice))
} else {
	normalized = (Array.isArray(records) ? records : []).filter(record => record?.packetDigest === packetDigest || !record?.packetDigest).map(record => ({
		id: record.id,
		human: record.human,
		judge: record.judge,
	}))
	evaluation = evaluateCalibrationCorpus(normalized, { minRecords: 20, criticalMinimum: 0.65, overallMinimum: 0.75, acceptedReviewerMinimum: 0.9 })
	judgeFieldsComplete = normalized.length > 0 && normalized.every(record => record?.human && record?.judge && CALIBRATION_DIMENSIONS.every(d => Number.isFinite(Number(record.human[d])) && Number.isFinite(Number(record.judge[d]))))
}

const report = {
	schemaVersion: 'betterpptx.photorealistic-judge-calibration.v1',
	reviewMode,
	status: evaluation.status === 'pass' && judgeFieldsComplete ? 'semantic-auto-accept-calibrated' : 'blocked-judge-vs-human-calibration',
	inputStatus,
	packetDigest,
	recordCount: normalized.length,
	judgeFieldsComplete,
	humanDisagreementPairCount: reviewMode === 'pairwise' && fs.existsSync(pairwiseDefaultPath) ? (JSON.parse(fs.readFileSync(pairwiseDefaultPath, 'utf8')).disagreementPairCount || 0) : 0,
	evaluation,
	customerImages: false,
	consentedHumanImages: false,
	training: false,
	externalAi: false,
	autoAcceptEnabled: false,
	note: reviewMode === 'pairwise'
		? 'Pairwise judge-vs-human calibration is primary. Auto-accept stays disabled until at least 20 complete best-of-two records pass categorical kappa and the owner/legal runtime gate remains satisfied.'
		: 'Legacy numeric judge-vs-human calibration is retained only for compatibility. Auto-accept stays disabled until a complete record set passes all thresholds and the owner/legal runtime gate remains satisfied.',
}
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n')
console.log(`  ${report.status === 'semantic-auto-accept-calibrated' ? 'ok  ' : 'OPEN'} ${reviewMode} judge-vs-human record set — ${report.recordCount} records`)
console.log(`  ${report.evaluation.status === 'pass' ? 'ok  ' : 'OPEN'} calibration thresholds`)
console.log(`\n${report.status}: ${outputPath}`)
process.exit(report.status === 'semantic-auto-accept-calibrated' ? 0 : 1)
