// IMG5 independent semantic-judge contract.
// This module does not call a provider or claim VLM quality. It accepts a private,
// versioned judge result only after sanitizing its scorecard, and abstains otherwise.
const DIMENSIONS = ['messageFit', 'composition', 'worldFit', 'seriesCoherence']
const DEFAULT_WEIGHTS = { messageFit: 0.30, composition: 0.30, worldFit: 0.20, seriesCoherence: 0.20 }

const finiteScore = value => Number.isFinite(Number(value)) ? Math.max(0, Math.min(5, Number(value))) : null

export function sanitizeJudgeResult(input = {}) {
	if (!input || typeof input !== 'object' || input.status !== 'complete') return null
	const scores = {}
	for (const dimension of DIMENSIONS) {
		const score = finiteScore(input.scores?.[dimension])
		if (score === null) return null
		scores[dimension] = Math.round(score * 1000) / 1000
	}
	const confidence = finiteScore(input.confidence)
	if (confidence === null) return null
	const weights = { ...DEFAULT_WEIGHTS, ...(input.weights && typeof input.weights === 'object' ? input.weights : {}) }
	const weightTotal = DIMENSIONS.reduce((sum, dimension) => sum + Math.max(0, Number(weights[dimension]) || 0), 0)
	if (!Number.isFinite(weightTotal) || weightTotal <= 0) return null
	const weightedTotal = DIMENSIONS.reduce((sum, dimension) => sum + scores[dimension] * (Math.max(0, Number(weights[dimension]) || 0) / weightTotal), 0)
	return {
		status: 'complete',
		version: String(input.version || 'unversioned').slice(0, 80),
		calibrationId: input.calibrationId ? String(input.calibrationId).slice(0, 120) : null,
		calibrated: input.calibrated === true,
		confidence,
		scores,
		weightedTotal: Math.round(weightedTotal * 1000) / 1000,
		weights: Object.fromEntries(DIMENSIONS.map(dimension => [dimension, Math.round((Math.max(0, Number(weights[dimension]) || 0) / weightTotal) * 1000) / 1000])),
		issues: Array.isArray(input.issues) ? input.issues.map(value => String(value).slice(0, 160)).slice(0, 12) : [],
	}
}

export function evaluateSemanticJudge(input = {}, options = {}) {
	const deterministic = options.deterministicReport
	if (deterministic?.status !== 'pass') {
		return { status: 'abstain', scope: 'semantic-image-judge', reason: 'DETERMINISTIC_HARD_GATES_NOT_PASSED', deterministicStatus: deterministic?.status || 'not-run' }
	}
	const sanitized = sanitizeJudgeResult(input)
	if (!sanitized) return { status: 'abstain', scope: 'semantic-image-judge', reason: 'SEMANTIC_JUDGE_RESULT_UNAVAILABLE' }
	const minimum = Number(options.minimumScore ?? 3.5)
	const minimumConfidence = Number(options.minimumConfidence ?? 0.7)
	const hardMinimum = Number(options.hardMinimum ?? 2.8)
	const hardFailures = DIMENSIONS.filter(dimension => sanitized.scores[dimension] < hardMinimum)
	const calibrated = sanitized.calibrated === true && Boolean(sanitized.calibrationId)
	const checks = {
		calibrated,
		confidence: sanitized.confidence >= minimumConfidence,
		weightedScore: sanitized.weightedTotal >= minimum,
		noCriticalLowDimension: hardFailures.length === 0,
	}
	const blockingIssues = Object.entries(checks).filter(([, value]) => value !== true).map(([key]) => key.toUpperCase())
	const researchOverride = options.researchExecutionOverride === true
	const executionBlockingIssues = blockingIssues.filter(issue => issue !== 'CALIBRATED')
	const executionAccepted = researchOverride && executionBlockingIssues.length === 0
	return {
		status: blockingIssues.length ? (executionAccepted ? 'research-pass' : 'reject') : 'pass',
		scope: 'semantic-image-judge',
		checks,
		blockingIssues,
		executionAccepted,
		promotionEligible: blockingIssues.length === 0 && !researchOverride,
		autoAcceptEnabled: false,
		scores: sanitized.scores,
		weightedTotal: sanitized.weightedTotal,
		confidence: sanitized.confidence,
		calibrationId: sanitized.calibrationId,
		version: sanitized.version,
		issues: sanitized.issues,
		note: executionAccepted
			? 'Owner-directed research execution override: this scorecard may continue through private research only. Calibration remains open; semantic auto-accept and production promotion remain disabled.'
			: 'This scorecard is accepted only for a private calibrated judge result. No provider or model provenance is exposed through this report.',
	}
}

export { DIMENSIONS }
