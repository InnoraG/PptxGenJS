// Exact native gallery style vocabulary for the public semantic authoring route.
//
// The AI selects a stable opaque preset ID. The engine executes the private,
// package-derived DrawingML payload compiled by
// tools/build-exact-native-style-presets.mjs. Raw payloads are never projected
// through the public MCP catalog.

import {
	EXACT_NATIVE_STYLE_PRESETS,
	EXACT_SHAPE_STYLE_PRESETS,
	EXACT_WORDART_STYLE_PRESETS,
} from './native-style-presets.generated.mjs'

export const SHAPE_STYLE_PRESETS = EXACT_SHAPE_STYLE_PRESETS
export const WORDART_STYLE_PRESETS = EXACT_WORDART_STYLE_PRESETS
export const NATIVE_STYLE_PRESETS = EXACT_NATIVE_STYLE_PRESETS

export function shapeStylePresetById(id) {
	return SHAPE_STYLE_PRESETS.find(item => item.id === String(id)) || null
}

export function wordArtStylePresetById(id) {
	return WORDART_STYLE_PRESETS.find(item => item.id === String(id)) || null
}

export function nativeStylePresetById(id) {
	return NATIVE_STYLE_PRESETS.find(item => item.id === String(id)) || null
}

export function applyNativeStylePreset(style = {}, presetId) {
	if (presetId == null || String(presetId).trim() === '') return { style: { ...style }, preset: null }
	const preset = nativeStylePresetById(presetId)
	if (!preset) throw new Error(`Unknown native style preset: ${presetId}`)
	return { style: { ...preset.recipe, ...style }, preset }
}
