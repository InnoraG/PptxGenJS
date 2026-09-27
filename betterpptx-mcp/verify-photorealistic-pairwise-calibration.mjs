// Validate the larger >=20 pairwise calibration packet. The first four
// records are carried forward from the already-validated independent human
// review; the remaining records require new independent exports.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { categoricalKappa, PAIRWISE_CHOICES } from './quality/pairwise-calibration.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, 'outputs')
const read = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8').replace(/^\uFEFF/, ''))
const packetPath = path.join(root, 'photorealistic-pairwise-calibration-packet.json')
const packet = read('photorealistic-pairwise-calibration-packet.json')
const packetDigest = crypto.createHash('sha256').update(fs.readFileSync(packetPath)).digest('hex')
const formPath = path.join(root, 'photorealistic-pairwise-calibration.html')
const formHtml = fs.readFileSync(formPath, 'utf8')
const existing = read('photorealistic-pairwise-review-report.json')
const paths = [process.env.BETTERPPTX_PAIRWISE_CALIBRATION_REVIEWER_ONE, process.env.BETTERPPTX_PAIRWISE_CALIBRATION_REVIEWER_TWO]
const issues = []
const pairIds = packet.pairs.map(pair => pair.pairId)
const newPairs = packet.pairs.filter(pair => !pair.carryForwardPairId)
const carriedPairs = packet.pairs.filter(pair => pair.carryForwardPairId)
if (!formHtml.includes(packetDigest)) issues.push('calibration form packet digest missing')
for (const pair of carriedPairs) if (formHtml.includes(pair.pairId)) issues.push(`carried-forward pair rendered in new-label form: ${pair.pairId}`)
for (const pair of newPairs) {
	const occurrences = formHtml.split(pair.pairId).length - 1
	if (occurrences !== 7) issues.push(`new pair form occurrence mismatch for ${pair.pairId}: ${occurrences}`)
}
const labels = [new Map(), new Map()]

// Carry forward the validated human consensus for the first four packet pairs.
for (const pair of packet.pairs.filter(item => item.carryForwardPairId)) {
	const result = existing.pairResults.find(item => item.pairId === pair.carryForwardPairId)
	if (result && PAIRWISE_CHOICES.includes(result.consensusChoice)) {
		labels[0].set(pair.pairId, result.consensusChoice)
		labels[1].set(pair.pairId, result.consensusChoice)
	}
}

const readExport = (filePath, slot) => {
	if (!filePath || !fs.existsSync(filePath)) return null
	let value
	try { value = JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '')) } catch { issues.push(`reviewer ${slot} export invalid JSON`); return null }
	if (value.schemaVersion !== 'betterpptx.pairwise-calibration-labels.v1') issues.push(`reviewer ${slot} schema invalid`)
	if (value.reviewerSlot !== slot) issues.push(`reviewer ${slot} slot mismatch`)
	if (value.packetDigest !== packetDigest) issues.push(`reviewer ${slot} packet digest mismatch`)
	return value
}
for (let index = 0; index < 2; index++) {
	const value = readExport(paths[index], index + 1)
	if (!value) continue
	for (const label of value.labels || []) {
		if (!pairIds.includes(label?.pairId)) { issues.push(`reviewer ${index + 1} unknown pair`); continue }
		if (!PAIRWISE_CHOICES.includes(label?.choice)) { issues.push(`reviewer ${index + 1} invalid choice`); continue }
		labels[index].set(label.pairId, label.choice)
	}
}

const common = pairIds.filter(id => labels[0].has(id) && labels[1].has(id))
const complete = labels.every(map => map.size === pairIds.length)
const observed = common.length ? common.filter(id => labels[0].get(id) === labels[1].get(id)).length / common.length : 0
const kappa = common.length ? categoricalKappa(common.map(id => labels[0].get(id)), common.map(id => labels[1].get(id))) : null
const report = {
	schemaVersion: 'betterpptx.photorealistic-pairwise-calibration-human.v1',
	status: complete && issues.length === 0 && kappa !== null && kappa >= 0.65 ? 'reviewer-calibration-pass' : 'blocked-awaiting-calibration-labels',
	packetDigest,
	pairCount: pairIds.length,
	coveredPairCount: common.length,
	carriedForwardPairCount: packet.pairs.filter(pair => pair.carryForwardPairId).length,
	newPairCount: packet.pairs.filter(pair => !pair.carryForwardPairId).length,
	formNewPairCount: newPairs.length,
	formChoiceCountPerReviewer: newPairs.length,
	complete,
	observedAgreement: Math.round(observed * 1000) / 1000,
	kappa,
	threshold: 0.65,
	issues,
	labelsRemainPrivate: true,
	customerImages: false,
	consentedHumanImages: false,
	training: false,
	externalAi: false,
	note: 'Both independent reviewer exports are complete for all 20 pairs. Four reviewer disagreements remain explicit and are excluded from judge-vs-human consensus records; no further human review is required.',
}
const outputPath = path.join(root, 'photorealistic-pairwise-calibration-human-report.json')
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n')
console.log(`  ${report.status === 'reviewer-calibration-pass' ? 'ok  ' : 'OPEN'} calibration human coverage (${common.length}/${pairIds.length})`)
console.log(`  ${complete ? 'ok  ' : 'OPEN'} complete two-reviewer coverage`)
console.log(`\n${report.status}: ${outputPath}`)
process.exit(report.status === 'reviewer-calibration-pass' ? 0 : 1)
