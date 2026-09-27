// IMG6 bounded diagnosis-driven repair contract.
// This module orchestrates private candidate/evaluator callbacks; it does not call
// a provider by itself. Every repair must improve the declared score and preserve
// deterministic hard gates before it can replace the best candidate.
const ISSUE_ACTIONS = new Map([
	['REQUESTEDASPECTHONORED', 'reframe'],
	['FOCALREGIONPRESENT', 'reframe'],
	['QUIETSPACE', 'reframe'],
	['PALETTECOMPATIBLE', 'edit'],
	['ALPHAINTEGRITY', 'mask-cleanup'],
	['MINIMUMVISUALINFORMATION', 'regenerate'],
	['NOREADABLETEXT', 'regenerate'],
	['OCRCOMPLETED', 'regenerate'],
	['SEMANTIC', 'regenerate'],
	['WORLD', 'edit'],
	['MESSAGEFIT', 'regenerate'],
])

export function diagnoseRepair(quality = {}) {
	const issues = [
		...(Array.isArray(quality.deterministic?.blockingIssues) ? quality.deterministic.blockingIssues : []),
		...(Array.isArray(quality.semantic?.blockingIssues) ? quality.semantic.blockingIssues : []),
	].map(value => String(value).toUpperCase())
	const unique = [...new Set(issues)]
	// Safety gates outrank composition polish. If a candidate contains possible
	// readable text or OCR did not complete, regenerate from the clean brief
	// before attempting a reference reframe that could preserve the defect.
	const safetyPriority = new Map([
		['NOREADABLETEXT', 0],
		['OCRCOMPLETED', 1],
	])
	if (unique.some(issue => safetyPriority.has(issue))) {
		unique.sort((a, b) => (safetyPriority.get(a) ?? 10) - (safetyPriority.get(b) ?? 10))
	}
	const actions = unique.map(issue => ({ issue, action: ISSUE_ACTIONS.get(issue) || 'regenerate' }))
	return { issues: unique, actions, primaryAction: actions[0]?.action || 'none' }
}

function scoreOf(candidate) {
	const value = Number(candidate?.score)
	return Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY
}

export async function runBoundedRepairLoop(options = {}) {
	const maxAttempts = Math.max(0, Math.min(Math.floor(Number(options.maxAttempts ?? 2)), 5))
	const costCeilingUsd = Number(options.costCeilingUsd)
	const evaluate = typeof options.evaluate === 'function' ? options.evaluate : async candidate => candidate?.quality
	const repair = typeof options.repair === 'function' ? options.repair : async () => null
	let best = options.initialCandidate ?? null
	// Callers that already evaluated the initial candidate may supply that
	// report, avoiding a second expensive OCR/semantic pass before the first
	// bounded repair attempt.
	let bestQuality = options.initialQuality || await evaluate(best, 0)
	let bestScore = scoreOf(bestQuality)
	let totalCost = Number(options.initialCostUsd || 0)
	const attempts = []
	for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
		const diagnosis = diagnoseRepair(bestQuality || {})
		if (bestQuality?.status === 'pass' && diagnosis.issues.length === 0) break
		if (Number.isFinite(costCeilingUsd) && totalCost >= costCeilingUsd) break
		const action = diagnosis.primaryAction
		const candidate = await repair({ candidate: best, action, diagnosis, attempt, remainingBudgetUsd: Number.isFinite(costCeilingUsd) ? Math.max(0, costCeilingUsd - totalCost) : null })
		if (!candidate) {
			attempts.push({ attempt, action, status: 'no-candidate' })
			continue
		}
		const cost = Math.max(0, Number(candidate.costUsd || 0))
		if (Number.isFinite(costCeilingUsd) && totalCost + cost > costCeilingUsd) {
			attempts.push({ attempt, action, status: 'cost-ceiling', costUsd: cost })
			break
		}
		const quality = await evaluate(candidate, attempt)
		const score = scoreOf(quality)
		const hardPass = quality?.deterministic?.status === 'pass' && (quality?.semantic === undefined || quality.semantic.status === 'pass' || quality.semantic.status === 'abstain')
		const improves = score > bestScore
		const accepted = hardPass && improves
		totalCost += cost
		attempts.push({ attempt, action, status: accepted ? 'accepted' : 'rejected', score, costUsd: cost, issues: diagnoseRepair(quality).issues })
		if (accepted) {
			best = candidate
			bestQuality = quality
			bestScore = score
		}
	}
	const deterministicComplete = bestQuality?.deterministic === undefined || bestQuality.deterministic.status === 'pass'
	return {
		status: bestQuality?.status === 'pass' && deterministicComplete && (bestQuality?.semantic === undefined || bestQuality.semantic.status !== 'reject') ? 'complete' : 'best-effort',
		bestCandidate: best,
		bestQuality,
		attempts,
		totalCostUsd: Math.round(totalCost * 1e8) / 1e8,
		maxAttempts,
		costCeilingUsd: Number.isFinite(costCeilingUsd) ? costCeilingUsd : null,
		bounded: attempts.length <= maxAttempts,
	}
}

export { ISSUE_ACTIONS }
