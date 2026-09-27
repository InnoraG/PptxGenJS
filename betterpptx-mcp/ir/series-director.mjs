import { createHash } from 'node:crypto'

// IMG3 deterministic series/anchor system. It carries no provider, model, path, or
// customer-image data; it is only a compact plan for cross-slide visual coherence.
function clean(value, max = 160) { return String(value || '').trim().replace(/\s+/g, ' ').slice(0, max) }

function anchorFor(plan = {}) {
	return {
		world: clean(plan.world?.key || plan.world?.label),
		style: clean(plan.request?.style),
		palette: Array.isArray(plan.palette) ? plan.palette.map(clean).slice(0, 5) : [],
		aspect: clean(plan.layout?.aspect),
		subjectPlacement: clean(plan.layout?.subjectPlacement),
		negativeSpace: clean(plan.layout?.negativeSpace),
		conceptFamily: clean(plan.consistencyGroup),
	}
}

function groupKey(plan = {}) {
	return clean(plan.consistencyGroup) || `standalone:${clean(plan.slideId || plan.id || 'visual')}`
}

export function buildSeriesCapsules(plans = []) {
	const groups = new Map()
	for (const plan of Array.isArray(plans) ? plans : []) {
		const key = groupKey(plan)
		if (!groups.has(key)) groups.set(key, [])
		groups.get(key).push(plan)
	}
	return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([group, members]) => {
		const anchors = members.map(anchorFor)
		const canonical = anchors[0] || {}
		const fingerprint = createHash('sha256').update(JSON.stringify(anchors)).digest('hex').slice(0, 24)
		return {
			schemaVersion: 'betterpptx.visual-series-capsule.v1',
			id: `series://${createHash('sha256').update(group).digest('hex').slice(0, 20)}`,
			group,
			planIds: members.map(plan => clean(plan.id || plan.slideId)),
			anchor: canonical,
			consistencyFingerprint: fingerprint,
			variationSlots: members.map((plan, index) => ({ planId: clean(plan.id || plan.slideId), slot: index + 1, concept: clean(plan.concept, 180) })),
			coherencePolicy: { preserve: ['world', 'style', 'palette', 'material-language', 'lighting-logic'], vary: ['concept', 'crop', 'subject-scale'], maxNearDuplicateDistance: 8 },
		}
	})
}

// Per-asset invalidation authority from the authoring goal. The fingerprint
// includes only semantic/layout/World/series/safety/version inputs; provider
// names and raw prompts never affect the public revision identity.
export function visualPlanFingerprint(plan = {}) {
	const visualIntent = plan.visualIntent && typeof plan.visualIntent === 'object' ? plan.visualIntent : {}
	const normalized = {
		semanticIntent: {
			concept: clean(plan.concept || visualIntent.concept, 240),
			purpose: clean(plan.purpose || visualIntent.purpose, 120),
			messageContribution: clean(plan.messageContribution || visualIntent.messageContribution, 240),
			mustInclude: Array.isArray(plan.mustInclude || visualIntent.mustInclude) ? (plan.mustInclude || visualIntent.mustInclude).map(value => clean(value, 120)) : [],
			avoid: Array.isArray(plan.avoid || visualIntent.avoid) ? (plan.avoid || visualIntent.avoid).map(value => clean(value, 120)) : [],
		},
		slide: { message: clean(plan.slideMessage || plan.context?.slideMessage || plan.message, 240), role: clean(plan.slideRole || plan.context?.slideRole || plan.role, 120) },
		world: { key: clean(plan.world?.key || plan.world?.label || plan.worldKey, 120), version: clean(plan.world?.version || plan.worldVersion || plan.world?.grammarVersion, 80) },
		series: { group: clean(plan.consistencyGroup || plan.series, 120), role: clean(plan.seriesRole, 80), capsule: clean(plan.seriesCapsuleDigest || plan.consistencyFingerprint, 80) },
		rectangle: plan.layout?.targetRect || plan.layout?.rect || plan.rect || plan.bbox || { aspect: clean(plan.layout?.aspect || plan.aspect, 40), subjectPlacement: clean(plan.layout?.subjectPlacement, 40), negativeSpace: clean(plan.layout?.negativeSpace, 40) },
		safety: { identity: clean(plan.identityPolicy || plan.safety?.identity || visualIntent.identityPolicy, 80), brand: clean(plan.brandPolicy || plan.safety?.brand || visualIntent.brandPolicy, 80), safety: clean(plan.safetyClass || plan.safety?.safety || visualIntent.safetyClass, 80) },
		versions: { generation: clean(plan.generationVersion || plan.generatorVersion || plan.request?.generationVersion || plan.schemaVersion, 80), evaluation: clean(plan.evaluationVersion || plan.evaluationPlan?.schemaVersion, 80) },
	}
	return `asset-revision://${createHash('sha256').update(JSON.stringify(normalized)).digest('hex').slice(0, 24)}`
}

export function planSeriesRevision(capsules = [], changedPlanId = '') {
	const changed = clean(changedPlanId)
	const affected = []
	for (const capsule of Array.isArray(capsules) ? capsules : []) {
		if (capsule.planIds?.includes(changed)) affected.push({ capsuleId: capsule.id, invalidatedPlanIds: capsule.planIds.filter(id => id !== changed), retainedPlanId: changed })
	}
	return { changedPlanId: changed, affected, invalidatedCount: affected.reduce((sum, item) => sum + item.invalidatedPlanIds.length, 0) }
}
