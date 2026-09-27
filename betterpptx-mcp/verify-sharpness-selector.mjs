// Offline proof for the reusable owner sharpness selector. This is a
// deterministic image-quality rule, not a semantic or production judge.
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { evaluateImageQuality, selectSharpestCandidate } from './quality/image-quality-gates.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const outputRoot = path.join(here, 'outputs')
const checks = []
let passed = 0
const ok = (name, condition, detail = '') => {
	checks.push({ name, status: condition ? 'PASS' : 'FAIL', detail })
	if (condition) passed += 1
	console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const candidate = (lane, sharpness, status = 'pass') => ({ lane, quality: { status, measurements: { sharpness } } })
const higher = selectSharpestCandidate([candidate('blurred', 12), candidate('sharp', 24), candidate('failed-but-high', 999, 'fail')])
ok('higher sharpness wins only among hard-gate passes', higher.status === 'selected' && higher.selected?.lane === 'sharp' && higher.reason === 'SHARPEST_ELIGIBLE_CANDIDATE')
const noPass = selectSharpestCandidate([candidate('failed-a', 100, 'fail'), candidate('failed-b', 200, 'fail')])
ok('no hard-gate pass abstains', noPass.status === 'abstain' && noPass.reason === 'NO_HARD_GATE_PASS' && noPass.selected === null)
const tie = selectSharpestCandidate([candidate('tie-a', 50), candidate('tie-b', 50)])
ok('top sharpness tie abstains', tie.status === 'abstain' && tie.reason === 'TOP_SHARPNESS_TIE' && tie.selected === null)
const invalid = selectSharpestCandidate([candidate('missing', Number.NaN), candidate('valid', 8)])
ok('invalid sharpness measurement is excluded', invalid.status === 'selected' && invalid.selected?.lane === 'valid' && invalid.eligible.length === 1)
const empty = selectSharpestCandidate([])
ok('empty candidate set abstains', empty.status === 'abstain' && empty.reason === 'NO_HARD_GATE_PASS')

const actual = []
for (const [lane, file] of [['create', 'premium-ensemble-schnell.png'], ['reference', 'premium-ensemble-klein.png']]) {
	const filePath = path.join(outputRoot, file)
	const buffer = await fs.readFile(filePath)
	const quality = await evaluateImageQuality(buffer, { aspect: 'landscape', aspectTolerance: 0.07, minWidth: 1024, minHeight: 600, minEntropy: 1.0, minStdev: 3, noText: true, ocr: { status: 'complete', text: '' } })
	actual.push({ lane, quality })
}
const actualSelection = selectSharpestCandidate(actual)
ok('maintained premium artifacts can be selected through the reusable helper', actual.every(item => item.quality.status === 'pass') && actualSelection.status === 'selected' && actualSelection.selected?.lane, actualSelection.reason)

const report = {
	schemaVersion: 'betterpptx.sharpness-selector.v1',
	status: passed === checks.length ? 'research-sharpness-selector-pass' : 'research-sharpness-selector-fail',
	checks: checks.length,
	failures: checks.length - passed,
	passed,
	policy: 'hard-gates-then-owner-sharpness-proxy; ties and missing passes abstain; semantic judge not invoked; no promotion',
	actualArtifacts: actual.map(item => ({ lane: item.lane, quality: item.quality.measurements })),
	actualSelection: { status: actualSelection.status, selectedLane: actualSelection.selected?.lane || null, reason: actualSelection.reason, ranked: actualSelection.ranked },
	customerImages: false,
	consentedHumanImages: false,
	training: false,
	externalAi: false,
	productionPromotion: false,
	checksDetail: checks,
}
await fs.writeFile(path.join(outputRoot, 'sharpness-selector-report.json'), JSON.stringify(report, null, 2) + '\n')
console.log(`\nSHARPNESS SELECTOR: ${passed}/${checks.length} checks passed`)
process.exit(passed === checks.length ? 0 : 1)
