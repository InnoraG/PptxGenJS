// Exact contract for the captured native Transition Ribbon gallery tiles.
// These are selector bases with typed transition options; the slide transition
// aggregate and animation timeline operations remain separate contracts.

const RIBBON_LABEL = /->\s*transition-ribbon-[a-z0-9-]+$/i

export const TRANSITION_GALLERY_CONTRACT = Object.freeze({
	id: 'transitionRibbonGallery',
	schemaVersion: 'betterpptx.transition-ribbon-gallery.v1',
	capabilityMode: 'preset-plus-parameters',
	capabilityStatus: 'executable-exact-structured',
	runtimeIntegrationComplete: true,
	componentOwnership: Object.freeze(['transitionEffect']),
	overrideFields: Object.freeze(['speed', 'duration', 'direction', 'pattern', 'spokes', 'clockwise', 'option', 'advanceOnClick', 'advanceAfterTime']),
	resetBehavior: Object.freeze({
		component: 'set one transition gallery option to null to restore the selected tile default',
		full: 'set transitionPresetId to null and remove explicit transition option overrides',
		nullBehavior: 'explicit null removes the named transition override while preserving the selected Ribbon tile',
	}),
	precedence: Object.freeze(['selected native Transition Ribbon tile', 'explicit typed transition option', 'PowerPoint native transition default']),
	legalCombinations: Object.freeze([
		'exact transition-ribbon tile with speed, duration, direction, or tile-specific options',
		'advanceOnClick and advanceAfterTime with one selected slide transition',
		'null reset followed by sparse transition re-edit without changing slide identity',
	]),
	applicability: Object.freeze(['native slide transition gallery', 'semantic deck-spec transition selector', 'captured Ribbon style/color/layout/treatment tile']),
	limitation: 'The Ribbon tile is a slide-transition selector; object animation timing and the direct add-transition aggregate are owned by their separate motion contracts.',
})

export function transitionGalleryCapabilityContractForEntry(entry = {}) {
	if (entry.sourceKind !== 'native-gallery-style' || entry.family !== 'motion-transitions-morph') return null
	return RIBBON_LABEL.test(String(entry.label || '')) ? TRANSITION_GALLERY_CONTRACT : null
}

