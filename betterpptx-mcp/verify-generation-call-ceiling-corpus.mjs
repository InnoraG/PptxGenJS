// Freeze the currently accepted synthetic runtime outputs for the §11 call-ceiling metric.
// This is operational evidence only: it does not infer semantic or perceptual quality.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, 'outputs')
const read = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8').replace(/^\uFEFF/, ''))
const contextual = read('contextual-authoring-corpus-report.json')
const photorealistic = read('photorealistic-contextual-corpus-report.json')
const bakeoff = read('live-modal-image-generation-bakeoff-report.json')
const bakeoffSource = fs.readFileSync(path.join(here, 'verify-live-modal-image-generation-bakeoff.mjs'), 'utf8')

const accepted = []
for (const [source, report] of [['contextual', contextual], ['photorealistic', photorealistic]]) {
	for (const item of report.results || []) for (const lane of ['create', 'edit']) {
		const output = item[lane]
		if (output?.status === 'PASS' && Number(output.attempts) >= 1) accepted.push({ source, id: `${item.id}:${lane}`, lane, attempts: Number(output.attempts), premium: lane === 'edit' })
	}
}
// The bake-off invokes one direct fetch per lane/account/case and has no retry loop in invoke().
// Count its 12 accepted outputs as one accepted network attempt each, while recording that the
// attempt count is source-derived rather than silently invented by the providers.
const bakeoffSingleFetchContract = /response\s*=\s*await\s+fetch\(/.test(bakeoffSource) && /for\s*\(const\s*\[lane,\s*accounts\]/.test(bakeoffSource)
if (bakeoff.status === 'research-live-pass' && bakeoff.results?.length === 12 && bakeoff.results.every(item => item.status === 'PASS') && bakeoffSingleFetchContract) {
	for (const item of bakeoff.results) accepted.push({ source: 'live-bakeoff', id: `${item.lane}:${item.accountId}:${item.caseId}`, lane: item.lane, attempts: 1, premium: item.lane === 'klein', sourceDerived: true })
}
const attempts = accepted.map(item => item.attempts).sort((a, b) => a - b)
const median = attempts.length ? (attempts.length % 2 ? attempts[(attempts.length - 1) / 2] : (attempts[attempts.length / 2 - 1] + attempts[attempts.length / 2]) / 2) : null
const standard = accepted.filter(item => !item.premium).map(item => item.attempts).sort((a, b) => a - b)
const premium = accepted.filter(item => item.premium).map(item => item.attempts).sort((a, b) => a - b)
const med = values => values.length % 2 ? values[(values.length - 1) / 2] : values.length ? (values[values.length / 2 - 1] + values[values.length / 2]) / 2 : null
const report = {
	schemaVersion: 'betterpptx.image-generation-call-ceiling-corpus.v1',
	status: accepted.length >= 28 && median <= 2 && med(premium) <= 3 ? 'research-call-ceiling-pass' : 'research-call-ceiling-open',
	corpusScope: 'owned-synthetic accepted runtime outputs frozen from current contextual, photorealistic and Schnell/Klein bake-off reports',
	acceptedOutputCount: accepted.length,
	acceptedCallAttempts: attempts,
	medianAcceptedCalls: median,
	standardAcceptedOutputCount: standard.length,
	standardMedianAcceptedCalls: med(standard),
	premiumAcceptedOutputCount: premium.length,
	premiumMedianAcceptedCalls: med(premium),
	sourceReports: ['contextual-authoring-corpus-report.json', 'photorealistic-contextual-corpus-report.json', 'live-modal-image-generation-bakeoff-report.json'],
	bakeoffSingleFetchContract,
	ownedSyntheticOnly: true,
	customerImages: false,
	consentedHumanImages: false,
	training: false,
	externalAi: false,
	note: 'Operational call-ceiling evidence only; semantic, perceptual, owner and legal gates remain separate.',
}
const outputPath = path.join(root, 'image-generation-call-ceiling-corpus-report.json')
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n')
console.log(`  ${report.status.endsWith('pass') ? 'ok  ' : 'OPEN'} accepted runtime outputs: ${report.acceptedOutputCount}`)
console.log(`  ${report.status.endsWith('pass') ? 'ok  ' : 'OPEN'} median accepted calls: ${report.medianAcceptedCalls}`)
console.log(`\n${report.status}: ${outputPath}`)
process.exit(report.status.endsWith('pass') ? 0 : 1)
