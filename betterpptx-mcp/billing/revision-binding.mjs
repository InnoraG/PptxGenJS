// Pure checks for binding a redacted provider billing window to the exact
// serving revision under review.  This module never contacts a provider and
// never treats a missing revision as a match.

export function snapshotMatchesServingRevision(snapshot = {}, servingRevision = '') {
	const expected = String(servingRevision || '').trim()
	if (!expected) return false
	return snapshot?.servingRevision === expected || snapshot?.revision === expected
}

export function snapshotsMatchServingRevision(snapshots = [], servingRevision = '', expectedCount = snapshots.length) {
	return snapshots.length === expectedCount && expectedCount > 0 && snapshots.every(snapshot => snapshotMatchesServingRevision(snapshot, servingRevision))
}
