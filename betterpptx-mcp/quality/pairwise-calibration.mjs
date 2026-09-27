// Categorical calibration for the simplified best-of-two review.
// Labels are never fabricated and no AI service is called here.
export const PAIRWISE_CHOICES = ['left', 'right', 'tie']

function choice(value) {
	return PAIRWISE_CHOICES.includes(value) ? value : null
}

export function categoricalKappa(left = [], right = []) {
	const pairs = left.map((value, index) => [choice(value), choice(right[index])]).filter(([a, b]) => a && b)
	if (!pairs.length) return null
	const observed = pairs.filter(([a, b]) => a === b).length / pairs.length
	const expected = PAIRWISE_CHOICES.reduce((sum, category) => {
		const pLeft = pairs.filter(([a]) => a === category).length / pairs.length
		const pRight = pairs.filter(([, b]) => b === category).length / pairs.length
		return sum + pLeft * pRight
	}, 0)
	if (expected >= 1) return observed >= 1 ? 1 : 0
	return Math.round(((observed - expected) / (1 - expected)) * 1000) / 1000
}

export function evaluatePairwiseCalibration(records = [], options = {}) {
	const minRecords = Math.max(1, Math.floor(Number(options.minRecords ?? 20)))
	const valid = (Array.isArray(records) ? records : []).filter(record => choice(record?.humanChoice) && choice(record?.judgeChoice))
	const kappa = categoricalKappa(valid.map(record => record.humanChoice), valid.map(record => record.judgeChoice))
	const overallMinimum = Number(options.overallMinimum ?? 0.75)
	const checks = {
		minimumRecords: valid.length >= minRecords,
		choicesPresent: valid.length === (Array.isArray(records) ? records.length : 0),
		overallKappa: kappa !== null && kappa >= overallMinimum,
	}
	return {
		status: Object.values(checks).every(Boolean) ? 'pass' : 'blocked',
		scope: 'pairwise-judge-human-calibration',
		checks,
		recordCount: valid.length,
		kappa,
		threshold: overallMinimum,
		choices: PAIRWISE_CHOICES,
		note: 'Pairwise judge calibration remains research-only until independently supplied human labels, minimum corpus size and owner/runtime gates all pass.',
	}
}

