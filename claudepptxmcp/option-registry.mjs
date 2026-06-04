const GRADIENT_DIRECTION_ALIASES = {
	radial: 'circle',
}

export const GRADIENT_DIRECTIONS = ['linear', 'circle', 'rect', 'shape']

const WORDART_TRANSFORM_ALIASES = {
	textDoubleWave2: 'textWave4',
	textChevronDown: 'textChevronInverted',
}

export const WORDART_TRANSFORMS = [
	'textNoShape',
	'textPlain',
	'textArchUp',
	'textArchDown',
	'textCircle',
	'textButton',
	'textArchUpPour',
	'textArchDownPour',
	'textCirclePour',
	'textButtonPour',
	'textCurveUp',
	'textCurveDown',
	'textCanUp',
	'textCanDown',
	'textWave1',
	'textWave2',
	'textWave4',
	'textDoubleWave1',
	'textInflate',
	'textDeflate',
	'textInflateBottom',
	'textDeflateBottom',
	'textInflateTop',
	'textDeflateTop',
	'textDeflateInflate',
	'textDeflateInflateDeflate',
	'textFadeRight',
	'textFadeLeft',
	'textFadeUp',
	'textFadeDown',
	'textSlantUp',
	'textSlantDown',
	'textCascadeUp',
	'textCascadeDown',
	'textChevron',
	'textChevronInverted',
	'textRingInside',
	'textRingOutside',
	'textTriangle',
	'textTriangleInverted',
	'textStop',
]

export const WORDART_TRANSFORM_SET = new Set(WORDART_TRANSFORMS)

function optionSurfaceCatalog() {
	return [
		{
			id: 'gradientDirection',
			field: 'fill.gradientDirection',
			description: 'DrawingML gradient direction. radial is accepted as an intent alias and serializes to circle.',
			canonical: GRADIENT_DIRECTIONS,
			aliases: GRADIENT_DIRECTION_ALIASES,
			examples: ['linear', 'circle'],
		},
		{
			id: 'wordArtTransform',
			field: 'options.wordArt.transform',
			description: 'DrawingML preset text warp used by WordArt. Invalid raw names can make PowerPoint reject the deck.',
			canonical: WORDART_TRANSFORMS,
			aliases: WORDART_TRANSFORM_ALIASES,
			examples: ['textArchUp', 'textWave1', 'textWave4', 'textChevronInverted'],
		},
		{
			id: 'text3DRotation',
			field: 'options.text3D.rotationX/Y/Z',
			description: 'Text3D camera rotations in degrees. The serializer emits non-negative PowerPoint fixed angles.',
			canonical: ['number: 0 <= degrees < 360'],
			aliases: { '-12': 348, '372': 12 },
			examples: [0, 12, 348],
		},
		{
			id: 'text3DShape',
			field: 'options.text3D / options.effect3D',
			description: 'Repair-safe 3D text/shape option forms. The MCP normalizes common shorthand and rejects forms that would serialize as NaN or [object Object].',
			canonical: [
				'bevel: { type, width, height }',
				'extrusion: number',
				'extrusionColor: hex string',
				'material: preset string',
				'lightRig: preset string',
			],
			aliases: {
				'bevel.w/h': 'bevel.width/height',
				'extrusion.depth': 'extrusion',
				'extrusion.color': 'extrusionColor',
				'lightRig.rig': 'lightRig',
			},
			examples: [
				{ bevel: { type: 'circle', width: 4, height: 4 }, extrusion: 8, extrusionColor: '6D28D9', material: 'warmMatte', lightRig: 'threePt' },
				{ bevel: { type: 'circle', w: 4, h: 4 }, extrusion: { depth: 8, color: '6D28D9' }, lightRig: { rig: 'threePt' } },
			],
		},
		{
			id: 'chartPreset',
			field: 'chartType / chartMulti',
			description: 'Native and composite chart presets are available through the specialized recommendation catalog.',
			canonical: ['bar', 'bar3D', 'line', 'area', 'pie', 'doughnut', 'scatter', 'bubble', 'radar'],
			specializedTool: 'betterpptx.chart.recommend',
		},
		{
			id: 'tablePreset',
			field: 'slide.add_table.options / per-cell options',
			description: 'Contextual table presets are available through the specialized recommendation catalog. Presets cover PowerPoint Table Design variants: Header Row, Total Row, First/Last Column, and Banded Rows/Columns.',
			canonical: ['headerRow', 'totalRow', 'bandedRows', 'firstColumn', 'lastColumn', 'bandedColumns', 'tableStyleId'],
			examples: ['executive-kpi-scorecard', 'financial-variance-total', 'feature-comparison-matrix'],
			specializedTool: 'betterpptx.table.recommend',
		},
		{
			id: 'smartArtLayout',
			field: 'slide.add_smartart.layout/layoutId',
			description: 'SmartArt layouts and support status are available through the specialized catalog.',
			canonical: ['list', 'process', 'cycle', 'hierarchy', 'relationship', 'matrix', 'pyramid', 'picture', 'timeline', 'team'],
			specializedTool: 'betterpptx.smartart.catalog',
		},
	]
}

export function listOptionCatalog({ surface, format = 'summary' } = {}) {
	const needle = String(surface || '').trim().toLowerCase()
	const surfaces = optionSurfaceCatalog().filter(item => !needle || item.id.toLowerCase().includes(needle) || item.field.toLowerCase().includes(needle))
	return {
		ok: true,
		principle: 'The MCP normalizes safe aliases, rejects unsafe unknown options, and returns token-friendly field/suggestion diagnostics.',
		count: surfaces.length,
		surfaces: format === 'full' ? surfaces : surfaces.map(item => ({
			id: item.id,
			field: item.field,
			description: item.description,
			examples: item.examples || item.canonical.slice(0, 6),
			aliases: item.aliases,
			specializedTool: item.specializedTool,
		})),
	}
}

export function normalizeWordArtTransform(transform) {
	const value = String(transform || '').trim()
	if (WORDART_TRANSFORM_ALIASES[value]) return WORDART_TRANSFORM_ALIASES[value]
	if (WORDART_TRANSFORM_SET.has(value)) return value
	return null
}

export function isValidWordArtTransform(transform) {
	return WORDART_TRANSFORM_SET.has(String(transform || '').trim())
}
