// IMG5 calibration evaluator. This module measures agreement only; it never invents
// reviewer labels and never calls an AI service. Missing or undersized blind labels block.
export const CALIBRATION_DIMENSIONS = ['messageFit', 'composition', 'worldFit', 'seriesCoherence']

function category(value) {
	const number = Number(value)
	return Number.isFinite(number) ? Math.max(1, Math.min(5, Math.round(number))) : null
}

export function cohenKappa(left = [], right = []) {
	const pairs = left.map((value, index) => [category(value), category(right[index])]).filter(([a, b]) => a !== null && b !== null)
	if (!pairs.length) return null
	const observed = pairs.filter(([a, b]) => a === b).length / pairs.length
	const categories = [1, 2, 3, 4, 5]
	const expected = categories.reduce((sum, value) => {
		const pLeft = pairs.filter(([a]) => a === value).length / pairs.length
		const pRight = pairs.filter(([, b]) => b === value).length / pairs.length
		return sum + pLeft * pRight
	}, 0)
	if (expected >= 1) return observed >= 1 ? 1 : 0
	return Math.round(((observed - expected) / (1 - expected)) * 1000) / 1000
}

export function evaluateCalibrationCorpus(records = [], options = {}) {
	const minRecords = Math.max(1, Math.floor(Number(options.minRecords ?? 20)))
	const valid = (Array.isArray(records) ? records : []).filter(record => record?.human && record?.judge && CALIBRATION_DIMENSIONS.every(dimension => category(record.human[dimension]) !== null && category(record.judge[dimension]) !== null))
	const dimensions = Object.fromEntries(CALIBRATION_DIMENSIONS.map(dimension => [dimension, cohenKappa(valid.map(record => record.human[dimension]), valid.map(record => record.judge[dimension]))]))
	const kappas = Object.values(dimensions).filter(value => value !== null)
	const overall = kappas.length ? Math.round(kappas.reduce((sum, value) => sum + value, 0) / kappas.length * 1000) / 1000 : null
	const criticalMinimum = Number(options.criticalMinimum ?? 0.65)
	const overallMinimum = Number(options.overallMinimum ?? 0.75)
	const accepted = valid.filter(record => CALIBRATION_DIMENSIONS.slice(0, 3).every(dimension => category(record.human[dimension]) >= 4))
	const acceptedRate = valid.length ? Math.round(accepted.length / valid.length * 1000) / 1000 : 0
	const checks = {
		minimumRecords: valid.length >= minRecords,
		dimensionsPresent: kappas.length === CALIBRATION_DIMENSIONS.length,
		overallKappa: overall !== null && overall >= overallMinimum,
		criticalKappa: kappas.length === CALIBRATION_DIMENSIONS.length && Math.min(...kappas) >= criticalMinimum,
		acceptedReviewerRate: acceptedRate >= Number(options.acceptedReviewerMinimum ?? 0.9),
	}
	return {
		status: Object.values(checks).every(Boolean) ? 'pass' : 'blocked',
		scope: 'blind-human-calibration',
		checks,
		recordCount: valid.length,
		kappa: { overall, dimensions },
		acceptedReviewerRate: acceptedRate,
		note: 'Synthetic fixtures are contract evidence only. Production acceptance requires independently collected blind human labels.',
	}
}
