import { createHash } from 'node:crypto'

import { buildSeriesCapsules, planSeriesRevision, visualPlanFingerprint } from '../ir/series-director.mjs'

function clean(value, max = 180) {
	return String(value || '').trim().replace(/\s+/g, ' ').slice(0, max)
}

function planId(plan = {}) { return clean(plan.id || plan.slideId || '') }

function fingerprint(value) {
	return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 24)
}

function groupKey(plan = {}) {
	return clean(plan.consistencyGroup) || `standalone:${planId(plan) || 'visual'}`
}

function anchorSignature(plan = {}) {
	const world = plan.world?.key || plan.world?.label || ''
	const style = plan.request?.style || ''
	const palette = Array.isArray(plan.palette) ? plan.palette : []
	return JSON.stringify({ world: clean(world), style: clean(style), palette: palette.map(clean).slice(0, 5) })
}

function conceptSignature(plan = {}) {
	return clean(plan.concept || plan.purpose || plan.request?.prompt, 220).toLowerCase()
}

/** Pure deck-level coherence gate. It checks shared series anchors and prevents
 * accidental concept duplication without inspecting pixels or invoking a model. */
export function evaluateSeriesCoherence(plans = []) {
	const items = Array.isArray(plans) ? plans.filter(Boolean) : []
	const groups = new Map()
	for (const plan of items) {
		const key = groupKey(plan)
		if (!groups.has(key)) groups.set(key, [])
		groups.get(key).push(plan)
	}
	const reports = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([group, members]) => {
		const anchors = members.map(anchorSignature)
		const concepts = members.map(conceptSignature).filter(Boolean)
		const anchorConsistent = new Set(anchors).size <= 1
		const conceptDiversity = new Set(concepts).size === concepts.length
		const duplicateIds = members.map(planId).filter(Boolean).filter((id, index, all) => all.indexOf(id) !== index)
		const pass = anchorConsistent && conceptDiversity && duplicateIds.length === 0
		return {
			group,
			planIds: members.map(planId),
			status: pass ? 'pass' : 'fail',
			checks: { anchorConsistency: anchorConsistent, conceptDiversity, uniquePlanIds: duplicateIds.length === 0 },
			anchorFingerprint: fingerprint(anchors),
			conceptCount: new Set(concepts).size,
		}
	})
	const passed = reports.filter(item => item.status === 'pass').length
	const applicable = reports.length > 0
	return {
		schemaVersion: 'betterpptx.series-coherence.v1',
		scope: 'deck-series',
		status: applicable ? (reports.every(item => item.status === 'pass') ? 'pass' : 'fail') : 'not-applicable',
		score: applicable ? Number((passed / reports.length).toFixed(4)) : null,
		applicable,
		denominator: reports.length,
		checks: { groups: reports.length, passedGroups: passed, anchorConsistency: reports.every(item => item.checks.anchorConsistency), conceptDiversity: reports.every(item => item.checks.conceptDiversity) },
		groups: reports,
		deterministic: true,
		note: applicable ? 'Deterministic plan-anchor checks only; no perceptual coherence claim.' : 'No generated-visual series was present, so no coherence score is applicable.',
	}
}

export function visualRevisionDigest(plans = []) {
	const capsules = buildSeriesCapsules(Array.isArray(plans) ? plans : [])
	return `revision://${fingerprint(capsules)}`
}

export function planWholeDeckVisualRevision(plans = [], changedPlanId = '') {
	const items = Array.isArray(plans) ? plans.filter(Boolean) : []
	const capsules = buildSeriesCapsules(items)
	const seriesRevision = planSeriesRevision(capsules, changedPlanId)
	const invalidated = [...new Set(seriesRevision.affected.flatMap(item => item.invalidatedPlanIds))]
	const retained = items.map(planId).filter(Boolean).filter(id => !invalidated.includes(id))
	const changed = clean(changedPlanId)
	const known = items.some(item => planId(item) === changed)
	return {
		schemaVersion: 'betterpptx.visual-revision.v1',
		revisionDigest: visualRevisionDigest(items),
		changedPlanId: changed,
		changedPlanFingerprint: known ? visualPlanFingerprint(items.find(item => planId(item) === changed)) : null,
		assetInvalidatedPlanIds: known ? [changed] : [],
		dependentSeriesCheckPlanIds: invalidated,
		retainedAssetPlanIds: items.map(planId).filter(Boolean).filter(id => id !== changed),
		invalidatedPlanIds: invalidated,
		retainedPlanIds: retained,
		seriesRevision,
		deterministic: true,
	}
}
