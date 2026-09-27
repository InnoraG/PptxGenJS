// Controlled negative fixture for the same pure selection gate used by the
// compiler. Never alter real source assets, approval records, or playback proof.
export function unavailableMotionCatalogFixture(catalog, motionId, productState = 'PLANNED_NOT_SELECTABLE') {
	if (!['PLANNED_NOT_SELECTABLE', 'IMPLEMENTED_NOT_SELECTABLE'].includes(productState)) throw new Error('Unsupported unavailable-motion fixture state.')
	const fixture = structuredClone(catalog)
	const row = fixture.records.find(entry => entry.motionId === motionId)
	if (!row) throw new Error(`Unavailable-motion fixture needs a known motion: ${motionId}`)
	row.selectable = false
	row.lifecycle = {
		...row.lifecycle,
		productState,
		measurementState: productState === 'IMPLEMENTED_NOT_SELECTABLE' ? 'POWERPOINT_VISUAL_PROOF_FAILED' : 'UNMEASURED',
	}
	fixture.catalogFingerprint = `fixture-unavailable-${motionId}`
	fixture.inventory.selectable = fixture.records.filter(entry => entry.selectable).length
	fixture.inventory.notSelectable = fixture.records.length - fixture.inventory.selectable
	fixture.inventory.byProductState = fixture.records.reduce((counts, entry) => {
		counts[entry.lifecycle.productState] = (counts[entry.lifecycle.productState] || 0) + 1
		return counts
	}, {})
	return fixture
}
