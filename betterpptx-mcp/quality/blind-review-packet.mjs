import { createHash } from 'node:crypto'

export const REVIEW_DIMENSIONS = Object.freeze(['messageFit', 'composition', 'worldFit', 'seriesCoherence'])

function clean(value, max = 120) { return String(value || '').trim().replace(/\s+/g, ' ').slice(0, max) }
function blindId(recordId, salt = 'betterpptx-img11-v1') {
	return `blind://${createHash('sha256').update(`${salt}:${clean(recordId)}`).digest('hex').slice(0, 20)}`
}

/** Build a reviewer-facing packet without judge labels, human labels, paths, or raw pixels. */
export function buildBlindReviewPacket({ records = [], reviewerCount = 2, minRecords = 20, salt } = {}) {
	const source = Array.isArray(records) ? records.filter(record => record && (record.id || record.file)) : []
	const reviewers = Math.max(1, Math.min(5, Math.floor(Number(reviewerCount) || 2)))
	const packetRecords = source.map(record => ({
		id: blindId(record.id || record.file, salt),
		aspect: clean(record.aspect || 'unknown', 24),
		series: clean(record.series || 'standalone', 80),
		labels: REVIEW_DIMENSIONS.map(dimension => ({ dimension, scale: '1-5', required: true })),
	}))
	return {
		schemaVersion: 'betterpptx.blind-review-packet.v1',
		status: packetRecords.length >= Math.max(1, Number(minRecords) || 1) ? 'ready-for-independent-review' : 'blocked-insufficient-records',
		reviewerCount: reviewers,
		reviewerSlots: Array.from({ length: reviewers }, (_, index) => ({ slot: index + 1, labels: 'required', identity: 'omitted' })),
		records: packetRecords,
		ownedSyntheticOnly: true,
		customerImages: false,
		judgeLabelsIncluded: false,
		humanLabelsIncluded: false,
		rawPixelsIncluded: false,
		minimumRecords: Math.max(1, Number(minRecords) || 1),
		note: 'Independent blind human labels are required before calibration can pass. This packet never invents labels or authorizes production.',
	}
}

export function validateBlindReviewLabels(packet = {}, labelSets = []) {
	const sets = Array.isArray(labelSets) ? labelSets : []
	const expected = new Set((packet.records || []).map(record => record.id))
	const reviewersPresent = sets.length >= Number(packet.reviewerCount || 0)
	const valid = sets.slice(0, Number(packet.reviewerCount || 0)).every(set => {
		const labels = Array.isArray(set?.labels) ? set.labels : []
		return labels.length === expected.size && labels.every(label => expected.has(label.id) && REVIEW_DIMENSIONS.every(dimension => Number.isInteger(Number(label[dimension])) && Number(label[dimension]) >= 1 && Number(label[dimension]) <= 5))
	})
	return {
		status: reviewersPresent && valid && expected.size >= Number(packet.minimumRecords || 1) ? 'ready-for-calibration' : 'blocked-missing-independent-labels',
		reviewerCount: sets.length,
		recordCount: expected.size,
		checks: { reviewerSlots: reviewersPresent, completeLabels: valid, minimumRecords: expected.size >= Number(packet.minimumRecords || 1) },
		note: 'This validates packet completeness only; calibration still requires independent labels and the semantic-calibration evaluator.',
	}
}
