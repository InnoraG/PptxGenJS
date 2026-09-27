// Exact native PowerPoint Model 3D Views gallery vocabulary.
//
// Public AI clients select a stable opaque preset ID. Camera, transform,
// viewport, and lighting payloads remain private execution details.

import { EXACT_MODEL3D_VIEW_PRESETS } from './model3d-view-presets.generated.mjs'

export const MODEL3D_VIEW_PRESETS = EXACT_MODEL3D_VIEW_PRESETS

export function model3dViewPresetById(id) {
	return MODEL3D_VIEW_PRESETS.find(item => item.id === String(id)) || null
}

export function applyModel3dViewPreset(options = {}, presetId) {
	if (presetId == null || String(presetId).trim() === '') return { options: { ...options }, preset: null }
	const preset = model3dViewPresetById(presetId)
	if (!preset) throw new Error(`Unknown Model 3D view preset: ${presetId}`)
	const clone = value => value === undefined ? undefined : structuredClone(value)
	// PowerPoint keeps a chosen Model 3D View while fitting each newly inserted
	// model to its own geometry. The frozen gallery specimen's meter-per-unit,
	// pre-translation, and object viewport are therefore evidence about that
	// specimen, not portable framing for every GLB. Keep the exact view
	// orientation, camera, scale, and lighting, but let the shared model auto-fit
	// derive centering, units, and viewport from the selected asset unless the AI
	// explicitly supplied them.
	const presetTrans = preset.recipe.trans || {}
	const { meterPerModelUnit: _specimenMeterPerModelUnit, preTrans: _specimenPreTrans, ...portableViewTrans } = presetTrans
	const { objViewport: _specimenObjViewport, ...portableViewRecipe } = preset.recipe
	void _specimenMeterPerModelUnit
	void _specimenPreTrans
	void _specimenObjViewport
	const merged = { ...clone(portableViewRecipe), ...clone(options) }
	// A null component is a reset request, not an instruction to fall back to
	// the generic serializer defaults. Restore the selected tile's portable
	// component so the reset remains stable across create, update, and replay.
	for (const key of ['camera', 'ambientLight', 'ptLights', 'objViewport']) {
		if (options[key] !== null) continue
		if (Object.prototype.hasOwnProperty.call(portableViewRecipe, key)) merged[key] = clone(portableViewRecipe[key])
		else delete merged[key]
	}
	for (const key of ['camera', 'ambientLight']) {
		if (!options[key] || typeof options[key] !== 'object' || !merged[key] || typeof merged[key] !== 'object') continue
		merged[key] = { ...clone(portableViewRecipe[key]), ...clone(options[key]) }
		for (const nested of ['pos', 'color']) {
			if (options[key][nested] && typeof options[key][nested] === 'object' && portableViewRecipe[key]?.[nested] && typeof portableViewRecipe[key][nested] === 'object') {
				merged[key][nested] = { ...clone(portableViewRecipe[key][nested]), ...clone(options[key][nested]) }
			}
		}
	}
	const transOverrides = options.trans && typeof options.trans === 'object' ? { ...options.trans } : {}
	for (const key of ['meterPerModelUnit', 'preTrans', 'postTrans', 'scale', 'rot']) {
		if (transOverrides[key] !== null) continue
		if (Object.prototype.hasOwnProperty.call(portableViewTrans, key)) transOverrides[key] = clone(portableViewTrans[key])
		else delete transOverrides[key]
	}
	const trans = { ...clone(portableViewTrans), ...transOverrides }
	for (const key of ['scale', 'rot']) {
		if (!trans[key] || typeof trans[key] !== 'object') continue
		const presetValue = portableViewTrans[key] && typeof portableViewTrans[key] === 'object' ? portableViewTrans[key] : {}
		const overrideValue = options.trans && options.trans[key] !== null && typeof options.trans[key] === 'object' ? options.trans[key] : {}
		const resetValue = Object.fromEntries(Object.entries(presetValue).map(([name, value]) => [name, clone(value)]))
		for (const [name, value] of Object.entries(overrideValue)) resetValue[name] = value === null ? clone(presetValue[name]) : clone(value)
		trans[key] = resetValue
	}
	merged.trans = trans
	return { options: merged, preset }
}

export function publicModel3dViewPresets() {
	return MODEL3D_VIEW_PRESETS.map(({ id, index, label, family, kind }) => ({ id, index, label, family, kind, editable: true }))
}
