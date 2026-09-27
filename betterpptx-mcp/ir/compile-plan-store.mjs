const LOCKED_COMPILE_PLANS = new Map()
const LOCKED_COMPILE_PLAN_TTL_MS = 30 * 60 * 1000

export function pruneLockedCompilePlans(now = Date.now(), ttlMs = LOCKED_COMPILE_PLAN_TTL_MS) {
	for (const [id, row] of LOCKED_COMPILE_PLANS.entries()) {
		if (now - (row.rememberedAt || 0) > ttlMs) LOCKED_COMPILE_PLANS.delete(id)
	}
}

export function rememberLockedCompilePlan(compiled) {
	pruneLockedCompilePlans()
	const planId = compiled?.lockedPlanDigest || compiled?.planDigest || compiled?.estimatedPlanDigest
	if (!planId) return null
	LOCKED_COMPILE_PLANS.set(planId, { specDigest: compiled.specDigest, compiled, rememberedAt: Date.now() })
	return planId
}

export function lockedPlanIdFromArgs(args = {}) {
	return String(args?.planId || args?.lockedPlanId || args?.planDigest || '').trim()
}

export function consumeLockedCompilePlan(planId, compiled) {
	const id = typeof planId === 'string' ? planId.trim() : ''
	if (!id) {
		rememberLockedCompilePlan(compiled)
		return {
			compiled,
			usedLockedPlan: false,
			warning: {
				code: 'COMMIT_WITHOUT_LOCKED_PLAN',
				severity: 'warning',
				message: 'Commit did not consume a dry-run planId; the spec was recompiled. Pass planId from dry-run for compile-once parity.',
			},
		}
	}
	const row = LOCKED_COMPILE_PLANS.get(id)
	if (!row) {
		const error = new Error('planId is unknown or expired. Dry-run again and commit with the returned planId.')
		error.code = 'PLAN_ID_UNKNOWN'
		throw error
	}
	if (row.specDigest && compiled?.specDigest && row.specDigest !== compiled.specDigest) {
		const error = new Error('planId does not match the current spec digest. Dry-run the revised spec.')
		error.code = 'PLAN_ID_MISMATCH'
		throw error
	}
	return { compiled: row.compiled, usedLockedPlan: true, warning: null }
}

export function applyLockedCompilePlan(args, compiled, phase) {
	if (phase !== 'commit') {
		rememberLockedCompilePlan(compiled)
		return compiled
	}
	const result = consumeLockedCompilePlan(lockedPlanIdFromArgs(args), compiled)
	if (result.warning) compiled.warnings = [...(compiled.warnings || []), result.warning]
	return result.compiled
}

export function resetLockedCompilePlansForTests() {
	LOCKED_COMPILE_PLANS.clear()
}
