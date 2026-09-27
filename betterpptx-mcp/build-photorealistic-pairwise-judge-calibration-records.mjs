// Merge the completed 20-pair human exports with the already-run private Qwen
// benchmark. This performs no GPU/network call and never invents a label.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const outputs = path.join(here, 'outputs')
const packetPath = path.join(outputs, 'photorealistic-pairwise-calibration-packet.json')
const packetBytes = fs.readFileSync(packetPath)
const packetDigest = crypto.createHash('sha256').update(packetBytes).digest('hex')
const packet = JSON.parse(packetBytes.toString('utf8').replace(/^\uFEFF/, ''))
const benchmarkPath = process.env.BETTERPPTX_PAIRWISE_JUDGE_BENCHMARK
	? path.resolve(process.env.BETTERPPTX_PAIRWISE_JUDGE_BENCHMARK)
	: path.join(outputs, 'photorealistic-direct-pairwise-calibration-judge-report.json')
const fallbackBenchmarkPath = path.join(outputs, 'photorealistic-pairwise-calibration-judge-report.json')
const selectedBenchmarkPath = fs.existsSync(benchmarkPath) ? benchmarkPath : fallbackBenchmarkPath
const benchmark = JSON.parse(fs.readFileSync(selectedBenchmarkPath, 'utf8').replace(/^\uFEFF/, ''))
const reviewerPaths = [
	process.env.BETTERPPTX_PAIRWISE_CALIBRATION_REVIEWER_ONE,
	process.env.BETTERPPTX_PAIRWISE_CALIBRATION_REVIEWER_TWO,
].filter(Boolean)
const defaultDownloads = [
	'C:/Users/SafeUser/Downloads/photorealistic-pairwise-calibration-1.json',
	'C:/Users/SafeUser/Downloads/photorealistic-pairwise-calibration-2.json',
]
const paths = reviewerPaths.length === 2 ? reviewerPaths : defaultDownloads
const issue = []
const disagreements = []
const reviewerMaps = paths.map((file, index) => {
	if (!fs.existsSync(file)) { issue.push(`reviewer ${index + 1} export missing`); return new Map() }
	let value
	try { value = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) } catch { issue.push(`reviewer ${index + 1} export invalid JSON`); return new Map() }
	if (value.packetDigest !== packetDigest) issue.push(`reviewer ${index + 1} packet digest mismatch`)
	return new Map((value.labels || []).filter(label => label?.pairId && ['left', 'right', 'tie'].includes(label.choice)).map(label => [label.pairId, label.choice]))
})
const benchmarkById = new Map((benchmark.results || []).map(result => [result.pairId, result]))
const oldHuman = JSON.parse(fs.readFileSync(path.join(outputs, 'photorealistic-pairwise-review-report.json'), 'utf8').replace(/^\uFEFF/, ''))
const oldHumanById = new Map((oldHuman.pairResults || []).map(result => [result.pairId, result.consensusChoice]))
const records = []
for (const pair of packet.pairs) {
	const result = benchmarkById.get(pair.pairId)
	const reviewerChoices = reviewerMaps.map(map => map.get(pair.pairId)).filter(Boolean)
	const sameReviewerChoice = reviewerChoices.length === 2 && reviewerChoices[0] === reviewerChoices[1]
	if (reviewerChoices.length === 2 && reviewerChoices[0] !== reviewerChoices[1]) disagreements.push(pair.pairId)
	const humanChoice = sameReviewerChoice
		? reviewerChoices[0]
		: (result?.humanChoice || oldHumanById.get(pair.carryForwardPairId || pair.pairId) || null)
	const judgeChoice = result?.judgeChoice || null
	if ((!humanChoice && !(reviewerChoices.length === 2 && reviewerChoices[0] !== reviewerChoices[1])) || !judgeChoice) issue.push(`incomplete record ${pair.pairId}`)
	records.push({ id: pair.pairId, packetDigest, humanChoice, judgeChoice })
}
const outputPath = path.join(outputs, 'photorealistic-pairwise-judge-calibration-records.json')
const payload = {
	schemaVersion: 'betterpptx.photorealistic-pairwise-judge-calibration-records.v1',
	packetDigest,
	records,
	recordCount: records.length,
	humanLabelSource: 'two independent private exports plus four carried-forward validated labels',
	benchmarkSource: path.basename(selectedBenchmarkPath),
	customerImages: false,
	consentedHumanImages: false,
	training: false,
	externalAi: false,
	issues: issue,
	disagreementPairIds: disagreements,
	disagreementPairCount: disagreements.length,
	status: issue.length ? 'blocked-record-merge' : (disagreements.length ? 'records-ready-with-human-disagreements' : 'records-ready'),
}
fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2) + '\n')
console.log(JSON.stringify({ status: payload.status, packetDigest, recordCount: records.length, complete: records.every(record => record.humanChoice && record.judgeChoice), disagreementPairCount: disagreements.length, issues: issue, outputPath }, null, 2))
process.exit(issue.length ? 1 : 0)
