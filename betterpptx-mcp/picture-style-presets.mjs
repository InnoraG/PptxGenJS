// Exact native Picture Styles gallery vocabulary.
//
// Public AI clients select a stable opaque preset ID. Raw DrawingML remains a
// private execution detail and is never returned by the MCP catalog.

import { EXACT_PICTURE_STYLE_PRESETS } from './picture-style-presets.generated.mjs'

export const PICTURE_STYLE_PRESETS = EXACT_PICTURE_STYLE_PRESETS

// Exhaustive PowerPoint camera preset vocabulary measured through
// Shape.ThreeD.SetPresetCamera and retained as DrawingML a:camera/@prst.
// Public specs use these native XML names rather than Office COM integers.
export const POWERPOINT_CAMERA_PRESETS = Object.freeze([
	'legacyObliqueTopLeft', 'legacyObliqueTop', 'legacyObliqueTopRight', 'legacyObliqueLeft', 'legacyObliqueFront', 'legacyObliqueRight', 'legacyObliqueBottomLeft', 'legacyObliqueBottom', 'legacyObliqueBottomRight',
	'legacyPerspectiveTopLeft', 'legacyPerspectiveTop', 'legacyPerspectiveTopRight', 'legacyPerspectiveLeft', 'legacyPerspectiveFront', 'legacyPerspectiveRight', 'legacyPerspectiveBottomLeft', 'legacyPerspectiveBottom', 'legacyPerspectiveBottomRight',
	'orthographicFront',
	'isometricTopUp', 'isometricTopDown', 'isometricBottomUp', 'isometricBottomDown', 'isometricLeftUp', 'isometricLeftDown', 'isometricRightUp', 'isometricRightDown',
	'isometricOffAxis1Left', 'isometricOffAxis1Right', 'isometricOffAxis1Top', 'isometricOffAxis2Left', 'isometricOffAxis2Right', 'isometricOffAxis2Top', 'isometricOffAxis3Left', 'isometricOffAxis3Right', 'isometricOffAxis3Bottom', 'isometricOffAxis4Left', 'isometricOffAxis4Right', 'isometricOffAxis4Bottom',
	'obliqueTopLeft', 'obliqueTop', 'obliqueTopRight', 'obliqueLeft', 'obliqueRight', 'obliqueBottomLeft', 'obliqueBottom', 'obliqueBottomRight',
	'perspectiveFront', 'perspectiveLeft', 'perspectiveRight', 'perspectiveAbove', 'perspectiveBelow', 'perspectiveAboveLeftFacing', 'perspectiveAboveRightFacing', 'perspectiveContrastingLeftFacing', 'perspectiveContrastingRightFacing', 'perspectiveHeroicLeftFacing', 'perspectiveHeroicRightFacing', 'perspectiveHeroicExtremeLeftFacing', 'perspectiveHeroicExtremeRightFacing', 'perspectiveRelaxed', 'perspectiveRelaxedModerately',
])

// Exhaustive PowerPoint 3-D light-rig vocabulary measured through
// Shape.ThreeD.PresetLighting and retained as DrawingML a:lightRig/@rig.
export const POWERPOINT_LIGHT_RIG_PRESETS = Object.freeze([
	'legacyFlat1', 'legacyFlat2', 'legacyFlat3', 'legacyFlat4', 'legacyNormal1', 'legacyNormal2', 'legacyNormal3', 'legacyNormal4',
	'legacyHarsh1', 'legacyHarsh2', 'legacyHarsh3', 'legacyHarsh4', 'threePt', 'balanced', 'soft', 'harsh', 'flood', 'contrasting',
	'morning', 'sunrise', 'sunset', 'chilly', 'freezing', 'flat', 'twoPt', 'glow', 'brightRoom',
])

// Exhaustive PowerPoint 3-D light direction vocabulary. Values are the
// semantic names accepted by the public Picture Style model and map to the
// native DrawingML direction tokens.
export const POWERPOINT_LIGHT_RIG_DIRECTIONS = Object.freeze([
	'topLeft', 'top', 'topRight', 'left', 'none', 'right', 'bottomLeft', 'bottom', 'bottomRight',
])

// Exhaustive DrawingML preset-material vocabulary for picture 3-D formatting.
// The native serializer accepts all fifteen names. PowerPoint COM's
// PresetMaterial enum accepts the same fifteen ordinal values, but the eighth
// value (warmMatte) is saved without a prstMaterial attribute; that Office
// round-trip boundary is recorded in the requirement map rather than hidden.
export const POWERPOINT_MATERIAL_PRESETS = Object.freeze([
	'legacyMatte', 'legacyPlastic', 'legacyMetal', 'legacyWireframe', 'matte', 'plastic', 'metal', 'warmMatte',
	'translucentPowder', 'powder', 'dkEdge', 'softEdge', 'clear', 'flat', 'softmetal',
])

// Exhaustive native top/bottom bevel vocabulary. Office enum values 1..13
// include the no-bevel/default and circle/default cases; the public native
// model represents those semantics with an omitted bevelT or explicit circle,
// so the serializable preset vocabulary is the twelve DrawingML tokens.
export const POWERPOINT_BEVEL_PRESETS = Object.freeze([
	'angle', 'artDeco', 'circle', 'convex', 'coolSlant', 'cross', 'divot', 'hardEdge', 'relaxedInset', 'riblet', 'slope', 'softRound',
])

// Exhaustive PowerPoint-retained preset-geometry vocabulary shared by the
// engine's shape catalog. `custGeom`, `freeform`, and `folderCorner` are
// intentionally excluded: the first two are custom-geometry carriers, while
// Office cannot reopen a picture package carrying folderCorner.
// Picture Style geometry uses the same DrawingML preset namespace as shapes.
export const POWERPOINT_PICTURE_GEOMETRY_PRESETS = Object.freeze(`
	accentBorderCallout1 accentBorderCallout2 accentBorderCallout3 accentCallout1 accentCallout2 accentCallout3
	actionButtonBackPrevious actionButtonBeginning actionButtonBlank actionButtonDocument actionButtonEnd actionButtonForwardNext actionButtonHelp actionButtonHome actionButtonInformation actionButtonMovie actionButtonReturn actionButtonSound
	arc bentArrow bentUpArrow bevel blockArc borderCallout1 borderCallout2 borderCallout3 bracePair bracketPair callout1 callout2 callout3 can chartPlus chartStar chartX chevron chord circularArrow cloud cloudCallout corner cornerTabs cube curvedDownArrow curvedLeftArrow curvedRightArrow curvedUpArrow
	decagon diagStripe diamond dodecagon donut doubleWave downArrow downArrowCallout ellipse ellipseRibbon ellipseRibbon2 flowChartAlternateProcess flowChartCollate flowChartConnector flowChartDecision flowChartDelay flowChartDisplay flowChartDocument flowChartExtract flowChartInputOutput flowChartInternalStorage flowChartMagneticDisk flowChartMagneticDrum flowChartMagneticTape flowChartManualInput flowChartManualOperation flowChartMerge flowChartMultidocument flowChartOfflineStorage flowChartOffpageConnector flowChartOnlineStorage flowChartOr flowChartPredefinedProcess flowChartPreparation flowChartProcess flowChartPunchedCard flowChartPunchedTape flowChartSort flowChartSummingJunction flowChartTerminator frame funnel gear6 gear9 halfFrame heart heptagon hexagon homePlate horizontalScroll irregularSeal1 irregularSeal2
	leftArrow leftArrowCallout leftBrace leftBracket leftCircularArrow leftRightArrow leftRightArrowCallout leftRightCircularArrow leftRightRibbon leftRightUpArrow leftUpArrow lightningBolt line lineInv mathDivide mathEqual mathMinus mathMultiply mathNotEqual mathPlus moon noSmoking nonIsoscelesTrapezoid notchedRightArrow octagon parallelogram pentagon pie pieWedge plaque plaqueTabs plus quadArrow quadArrowCallout rect ribbon ribbon2 rightArrow rightArrowCallout rightBrace rightBracket round1Rect round2DiagRect round2SameRect roundRect rtTriangle smileyFace snip1Rect snip2DiagRect snip2SameRect snipRoundRect squareTabs star10 star12 star16 star24 star32 star4 star5 star6 star7 star8 stripedRightArrow sun swooshArrow teardrop trapezoid triangle upArrow upArrowCallout upDownArrow upDownArrowCallout uturnArrow verticalScroll wave wedgeEllipseCallout wedgeRectCallout wedgeRoundRectCallout
`.trim().split(/\s+/))

export const PICTURE_STYLE_COMPONENT_OWNERSHIP = Object.freeze([
	'pictureGeometry',
	'pictureFill',
	'pictureLine',
	'pictureEffects',
	'picture3D',
])

export const PICTURE_STYLE_OVERRIDE_FIELDS = Object.freeze([
	'pictureStyle.geometry.preset',
	'pictureStyle.geometry.adjustments',
	'pictureStyle.fill.type',
	'pictureStyle.fill.color',
	'pictureStyle.line.type',
	'pictureStyle.line.widthPt',
	'pictureStyle.line.cap',
	'pictureStyle.line.compound',
	'pictureStyle.line.alignment',
	'pictureStyle.line.dash',
	'pictureStyle.line.join',
	'pictureStyle.line.miterLimit',
	'pictureStyle.line.color',
	'pictureStyle.line.color.saturation',
	'pictureStyle.line.color.luminance',
	'pictureStyle.line.color.luminanceOffset',
	'pictureStyle.line.color.opacity',
	'pictureStyle.effects',
	'pictureStyle.threeD.camera.preset',
	'pictureStyle.threeD.camera.perspectiveDeg',
	'pictureStyle.threeD.camera.fieldOfView',
	'pictureStyle.threeD.camera.rotation',
	'pictureStyle.threeD.lightRig.preset',
	'pictureStyle.threeD.lightRig.direction',
	'pictureStyle.threeD.lightRig.rotation',
	'pictureStyle.threeD.format.material',
	'pictureStyle.threeD.format.extrusionDepthPt',
	'pictureStyle.threeD.format.extrusionColor',
	'pictureStyle.threeD.format.contourWidthPt',
	'pictureStyle.threeD.format.contourColor',
	'pictureStyle.threeD.format.bevelTop',
	'pictureStyle.threeD.format.bevelBottom',
])

// Independent structured line controls exposed beneath Picture Style line.
// Miter limit is an OOXML ST_PositivePercentage value: it is non-negative and
// intentionally unbounded by the schema. PowerPoint COM exposes a getter but
// no writable setter, so the public contract keeps that host boundary visible.
export const PICTURE_STYLE_LINE_PARAMETER_CATALOG = Object.freeze([
	{
		id: 'lineMiterLimit',
		type: 'continuous',
		valueType: 'number',
		minimum: 0,
		default: 0,
		step: 0.00001,
		unit: 'multiplier',
		semanticPath: 'pictureStyle.line.miterLimit',
		serializer: 'a:ln/a:miter/@lim = round(miterLimit * 100000)',
		capabilityMode: 'parameterized',
		capabilityStatus: 'structured-partial',
		limitation: 'PowerPoint Shape.Line.MiterLimit reads 0 but exposes no writable setter; native ST_PositivePercentage serialization and retained roundtrip are supported, while Office-authored endpoint parity is a measured boundary.',
		reset: 'remove pictureStyle.line.miterLimit or reset pictureStyle.line to its neutral form',
	},
])

// Independent structured 3-D direction controls exposed beneath Picture
// Style three-dimensional lighting. Direction is a finite native DrawingML
// domain rather than an opaque gallery preset; Office's `none` member has a
// measured SaveAs canonicalization boundary that remains explicit below.
export const PICTURE_STYLE_3D_PARAMETER_CATALOG = Object.freeze([
	{
		id: 'lightRigDirection',
		type: 'discrete',
		valueType: 'string',
		values: [...POWERPOINT_LIGHT_RIG_DIRECTIONS],
		semanticPath: 'pictureStyle.threeD.lightRig.direction',
		capabilityMode: 'parameterized',
		capabilityStatus: 'structured-partial',
		limitation: 'PowerPoint Shape.ThreeD.PresetLightingDirection accepts the nine-value domain, but Office SaveAs/reopen canonicalizes the semantic none value to top; native serialization retains all nine DrawingML direction tokens.',
		reset: 'remove pictureStyle.threeD.lightRig.direction or reset pictureStyle.threeD.lightRig to its preset default',
	},
	...[
		['X', 'xDeg', 'lat'],
		['Y', 'yDeg', 'lon'],
		['Z', 'zDeg', 'rev'],
	].map(([axis, field, token]) => ({
		id: `lightRigRotation${axis}`,
		type: 'continuous',
		valueType: 'number',
		minimum: -180,
		maximum: 180,
		default: 0,
		step: 0.1,
		unit: 'degrees',
		semanticPath: `pictureStyle.threeD.lightRig.rotation.${field}`,
		serializer: `a:lightRig/a:rot/@${token} = round(degrees * 60000)`,
		capabilityMode: 'parameterized',
		capabilityStatus: 'structured-partial',
		limitation: `PowerPoint Shape.ThreeD exposes no writable light-rig ${axis}-rotation endpoint; native a:lightRig/a:rot ${token} serialization and retained package roundtrip are supported, while Office-authored UI parity is an explicit boundary.`,
		reset: `remove pictureStyle.threeD.lightRig.rotation.${field} or reset pictureStyle.threeD.lightRig to its neutral form`,
	})),
	{
		id: 'material',
		type: 'discrete',
		valueType: 'string',
		values: [...POWERPOINT_MATERIAL_PRESETS],
		semanticPath: 'pictureStyle.threeD.format.material',
		capabilityMode: 'parameterized',
		capabilityStatus: 'structured-partial',
		limitation: 'PowerPoint Shape.ThreeD.PresetMaterial accepts all fifteen values, but Office and SaveAs/reopen omit prstMaterial for warmMatte (ordinal 8); native serialization retains warmMatte exactly.',
		reset: 'remove pictureStyle.threeD.format.material or reset pictureStyle.threeD.format to its neutral form',
	},
	{
		id: 'positionZ',
		type: 'continuous',
		valueType: 'number',
		semanticPath: 'pictureStyle.threeD.position.z',
		capabilityMode: 'unsupported',
		capabilityStatus: 'unsupported',
		limitation: 'PowerPoint Shape.ThreeD exposes no writable independent position-Z or camera-Z endpoint, and DrawingML a:camera/a:sp3d contains no position-Z attribute. Use camera preset, perspective, rotation, extrusion depth, or model3D camera controls for their respective semantics; do not invent a position-Z value.',
		reset: 'omit pictureStyle.threeD.position; no native value exists to reset',
	},
])

// Independent structured color controls exposed beneath Picture Style line
// color. The native serializer can retain satMod, while PowerPoint's COM
// ColorFormat has no writable saturation endpoint; keep that host boundary
// explicit instead of advertising a false Office-authored setter.
export const PICTURE_STYLE_COLOR_PARAMETER_CATALOG = Object.freeze([
	{
		id: 'lineColorSaturation',
		type: 'continuous',
		valueType: 'number',
		minimum: 0,
		maximum: 4,
		default: 1,
		step: 0.00001,
		unit: 'multiplier',
		semanticPath: 'pictureStyle.line.color.saturation',
		serializer: 'a:ln/a:solidFill/a:*Clr/a:satMod = round(saturation * 100000)',
		capabilityMode: 'parameterized',
		capabilityStatus: 'structured-partial',
		limitation: 'PowerPoint ColorFormat exposes no writable saturation or satMod setter; native serialization and retained roundtrip are supported, but Office-authored endpoint parity is a measured boundary.',
		reset: 'remove pictureStyle.line.color.saturation or reset pictureStyle.line.color to its neutral form',
	},
	{
		id: 'lineColorLuminance',
		type: 'continuous',
		valueType: 'number',
		minimum: 0,
		maximum: 1,
		default: 1,
		step: 0.00001,
		unit: 'normalized',
		semanticPath: 'pictureStyle.line.color.luminance',
		serializer: 'a:ln/a:solidFill/a:*Clr/a:lumMod = round(luminance * 100000)',
		capabilityMode: 'parameterized',
		capabilityStatus: 'structured-partial',
		limitation: 'PowerPoint ColorFormat exposes no writable luminance, luminosity, or lumMod setter; native serialization and retained roundtrip are supported, but Office-authored endpoint parity is a measured boundary.',
		reset: 'remove pictureStyle.line.color.luminance or reset pictureStyle.line.color to its neutral form',
	},
	{
		id: 'lineColorLuminanceOffset',
		type: 'continuous',
		valueType: 'number',
		minimum: 0,
		maximum: 1,
		default: 0,
		step: 0.00001,
		unit: 'normalized',
		semanticPath: 'pictureStyle.line.color.luminanceOffset',
		serializer: 'a:ln/a:solidFill/a:*Clr/a:lumOff = round(luminanceOffset * 100000)',
		capabilityMode: 'parameterized',
		capabilityStatus: 'structured-partial',
		limitation: 'PowerPoint ColorFormat exposes no writable luminance offset or lumOff setter; native serialization and retained roundtrip are supported, but Office-authored endpoint parity is a measured boundary.',
		reset: 'remove pictureStyle.line.color.luminanceOffset or reset pictureStyle.line.color to its neutral form',
	},
	{
		id: 'lineColorOpacity',
		type: 'continuous',
		valueType: 'number',
		minimum: 0,
		maximum: 1,
		default: 1,
		step: 0.00001,
		unit: 'normalized',
		semanticPath: 'pictureStyle.line.color.opacity',
		serializer: 'a:ln/a:solidFill/a:*Clr/a:alpha = round(opacity * 100000)',
		capabilityMode: 'parameterized',
		capabilityStatus: 'structured-partial',
		limitation: 'PowerPoint ColorFormat exposes no writable opacity, transparency, alpha, or alpha modulation setter; native serialization and retained roundtrip are supported, but Office-authored endpoint parity is a measured boundary.',
		reset: 'remove pictureStyle.line.color.opacity or reset pictureStyle.line.color to its neutral form',
	},
])

export const PICTURE_STYLE_RESET_BEHAVIOR = Object.freeze({
	component: 'Set pictureStyle.geometry, fill, line, effects, or threeD to null to reset only that component.',
	full: 'Set pictureStyle to null to remove the complete Picture Style treatment.',
	nullBehavior: 'Null is an explicit reset. Omitted fields inherit the selected preset; authored structured fields override it.',
})

const PICTURE_STYLE_COLOR_SCHEMA = Object.freeze({
	type: 'object', required: ['color'], additionalProperties: false,
	properties: {
		color: { type: 'string', minLength: 1 },
		colorType: { type: 'string', enum: ['rgb', 'scheme', 'preset'] },
		tint: { type: 'number', minimum: 0, maximum: 1 },
		shade: { type: 'number', minimum: 0, maximum: 1 },
		saturation: { type: 'number', minimum: 0, maximum: 4 },
		luminance: { type: 'number', minimum: 0, maximum: 1 },
		luminanceOffset: { type: 'number', minimum: 0, maximum: 1 },
		opacity: { type: 'number', minimum: 0, maximum: 1 },
	},
})

const PICTURE_STYLE_ROTATION_SCHEMA = Object.freeze({
	type: 'object', additionalProperties: false,
	properties: {
		xDeg: { type: 'number', minimum: -360, maximum: 360 },
		yDeg: { type: 'number', minimum: -360, maximum: 360 },
		zDeg: { type: 'number', minimum: -360, maximum: 360 },
	},
})

const PICTURE_STYLE_EFFECT_ALIGNMENT_SCHEMA = Object.freeze({
	type: 'string', enum: ['topLeft', 'top', 'topRight', 'left', 'center', 'right', 'bottomLeft', 'bottom', 'bottomRight'],
})

const PICTURE_STYLE_SHADOW_EFFECT_SCHEMA = Object.freeze({
	type: 'object', required: ['type', 'color'], additionalProperties: false,
	properties: {
		type: { type: 'string', enum: ['outerShadow', 'innerShadow'] },
		blurPt: { type: 'number', minimum: 0 }, distancePt: { type: 'number', minimum: 0 }, directionDeg: { type: 'number' },
		alignment: PICTURE_STYLE_EFFECT_ALIGNMENT_SCHEMA, rotateWithShape: { type: 'boolean' },
		scaleX: { type: 'number' }, scaleY: { type: 'number' }, skewXDeg: { type: 'number' }, skewYDeg: { type: 'number' },
		color: PICTURE_STYLE_COLOR_SCHEMA,
	},
})

const PICTURE_STYLE_REFLECTION_EFFECT_SCHEMA = Object.freeze({
	type: 'object', required: ['type'], additionalProperties: false,
	properties: {
		type: { const: 'reflection' },
		blurPt: { type: 'number', minimum: 0 }, distancePt: { type: 'number', minimum: 0 }, directionDeg: { type: 'number' },
		alignment: PICTURE_STYLE_EFFECT_ALIGNMENT_SCHEMA, rotateWithShape: { type: 'boolean' },
		scaleX: { type: 'number' }, scaleY: { type: 'number' }, skewXDeg: { type: 'number' }, skewYDeg: { type: 'number' },
		startOpacity: { type: 'number', minimum: 0, maximum: 1 }, endOpacity: { type: 'number', minimum: 0, maximum: 1 },
		startPosition: { type: 'number', minimum: 0, maximum: 1 }, endPosition: { type: 'number', minimum: 0, maximum: 1 },
	},
})

const PICTURE_STYLE_SOFT_EDGE_EFFECT_SCHEMA = Object.freeze({
	type: 'object', required: ['type', 'radiusPt'], additionalProperties: false,
	properties: { type: { const: 'softEdge' }, radiusPt: { type: 'number', minimum: 0 } },
})

const PICTURE_STYLE_BEVEL_SCHEMA = Object.freeze({
	type: 'object', additionalProperties: false,
	properties: {
		type: { type: 'string', enum: [...POWERPOINT_BEVEL_PRESETS] },
		widthPt: { type: 'number', minimum: 0 }, heightPt: { type: 'number', minimum: 0 },
	},
})

// Real JSON Schema, not display metadata.  The same vocabulary is enforced by
// normalizePictureStyle(), so tool discovery, execution, and readback describe
// one closed semantic surface.
export const PICTURE_STYLE_PUBLIC_SCHEMA = Object.freeze({
	oneOf: [
		{ type: 'null' },
		{
			type: 'object', additionalProperties: false,
			properties: {
				geometry: {
					oneOf: [{ type: 'null' }, {
						type: 'object', additionalProperties: false,
						properties: {
							preset: { type: 'string', enum: [...POWERPOINT_PICTURE_GEOMETRY_PRESETS] },
							adjustments: {
								type: 'object', propertyNames: { pattern: '^adj(?:[0-9]+)?$' },
								additionalProperties: { type: 'number', minimum: 0, maximum: 1 },
							},
						},
					}],
				},
				fill: {
					oneOf: [{ type: 'null' }, {
						type: 'object', additionalProperties: false,
						properties: { type: { type: 'string', enum: ['none', 'solid'] }, color: PICTURE_STYLE_COLOR_SCHEMA },
					}],
				},
				line: {
					oneOf: [{ type: 'null' }, {
						type: 'object', additionalProperties: false,
						properties: {
							type: { type: 'string', enum: ['none', 'solid'] }, widthPt: { type: 'number', minimum: 0 },
							cap: { type: 'string', enum: ['flat', 'round', 'square'] },
							compound: { type: 'string', enum: ['single', 'double', 'thickThin', 'thinThick', 'triple'] },
							alignment: { type: 'string', enum: ['center', 'inset'] }, dash: { type: 'string', minLength: 1 },
							join: { type: 'string', enum: ['miter', 'round', 'bevel'] }, miterLimit: { type: 'number', minimum: 0 },
							color: PICTURE_STYLE_COLOR_SCHEMA,
						},
					}],
				},
				effects: {
					oneOf: [{ type: 'null' }, { type: 'array', items: { oneOf: [PICTURE_STYLE_SHADOW_EFFECT_SCHEMA, PICTURE_STYLE_REFLECTION_EFFECT_SCHEMA, PICTURE_STYLE_SOFT_EDGE_EFFECT_SCHEMA] } }],
				},
				threeD: {
					oneOf: [{ type: 'null' }, {
						type: 'object', additionalProperties: false,
						properties: {
							camera: {
								type: 'object', additionalProperties: false,
								properties: {
									preset: { type: 'string', enum: [...POWERPOINT_CAMERA_PRESETS] },
									perspectiveDeg: { type: 'number', minimum: 0, maximum: 120 }, fieldOfView: { type: 'number', minimum: 0, maximum: 120 },
									rotation: PICTURE_STYLE_ROTATION_SCHEMA,
								},
							},
							lightRig: {
								type: 'object', additionalProperties: false,
								properties: {
									preset: { type: 'string', enum: [...POWERPOINT_LIGHT_RIG_PRESETS] }, direction: { type: 'string', enum: [...POWERPOINT_LIGHT_RIG_DIRECTIONS] },
									rotation: { ...PICTURE_STYLE_ROTATION_SCHEMA, properties: {
										xDeg: { type: 'number', minimum: -180, maximum: 180 }, yDeg: { type: 'number', minimum: -180, maximum: 180 }, zDeg: { type: 'number', minimum: -180, maximum: 180 },
									} },
								},
							},
							position: { type: 'object', maxProperties: 0, additionalProperties: false },
							format: {
								type: 'object', additionalProperties: false,
								properties: {
									material: { type: 'string', enum: [...POWERPOINT_MATERIAL_PRESETS] },
									extrusionDepthPt: { type: 'number', minimum: 0 }, extrusionColor: PICTURE_STYLE_COLOR_SCHEMA,
									contourWidthPt: { type: 'number', minimum: 0 }, contourColor: PICTURE_STYLE_COLOR_SCHEMA,
									bevelTop: PICTURE_STYLE_BEVEL_SCHEMA, bevelBottom: PICTURE_STYLE_BEVEL_SCHEMA,
								},
							},
						},
					}],
				},
			},
		},
	],
})

const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key)
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value))
const plainObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

function assertKnownKeys(value, allowed, path) {
	for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`${path}.${key} is not a supported Picture Style field.`)
}

function finite(value, path, { minimum, maximum } = {}) {
	const number = Number(value)
	if (!Number.isFinite(number)) throw new Error(`${path} must be a finite number.`)
	if (minimum !== undefined && number < minimum) throw new Error(`${path} must be >= ${minimum}.`)
	if (maximum !== undefined && number > maximum) throw new Error(`${path} must be <= ${maximum}.`)
	return number
}

function normalizedColor(value, path) {
	if (!plainObject(value)) throw new Error(`${path} must be a structured color object.`)
	assertKnownKeys(value, ['color', 'colorType', 'tint', 'shade', 'saturation', 'luminance', 'luminanceOffset', 'opacity'], path)
	if (typeof value.color !== 'string' || !value.color.trim()) throw new Error(`${path}.color must be a non-empty color value.`)
	const out = { color: value.color.replace(/^#/, '') }
	if (value.colorType !== undefined) {
		if (!['rgb', 'scheme', 'preset'].includes(value.colorType)) throw new Error(`${path}.colorType must be rgb, scheme, or preset.`)
		out.colorType = value.colorType
	}
	for (const key of ['tint', 'shade', 'saturation', 'luminance', 'luminanceOffset', 'opacity']) if (value[key] !== undefined) out[key] = finite(value[key], `${path}.${key}`, { minimum: 0, maximum: key === 'saturation' ? 4 : 1 })
	return out
}

function normalizedRotation(value, path, limits = {}) {
	if (!plainObject(value)) throw new Error(`${path} must be an object.`)
	assertKnownKeys(value, ['xDeg', 'yDeg', 'zDeg'], path)
	return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, finite(child, `${path}.${key}`, { minimum: limits.minimum ?? -360, maximum: limits.maximum ?? 360 })]))
}

function normalizedBevel(value, path) {
	if (!plainObject(value)) throw new Error(`${path} must be an object.`)
	assertKnownKeys(value, ['type', 'widthPt', 'heightPt'], path)
	const out = {}
	if (value.type !== undefined) {
		if (typeof value.type !== 'string' || !value.type || !POWERPOINT_BEVEL_PRESETS.includes(value.type)) throw new Error(`${path}.type must be one of: ${POWERPOINT_BEVEL_PRESETS.join(', ')}`)
		out.type = value.type
	}
	if (value.widthPt !== undefined) out.widthPt = finite(value.widthPt, `${path}.widthPt`, { minimum: 0 })
	if (value.heightPt !== undefined) out.heightPt = finite(value.heightPt, `${path}.heightPt`, { minimum: 0 })
	return out
}

function normalizedEffect(value, path) {
	if (!plainObject(value)) throw new Error(`${path} must be an object.`)
	const common = ['type', 'blurPt', 'distancePt', 'directionDeg', 'alignment', 'rotateWithShape', 'scaleX', 'scaleY', 'skewXDeg', 'skewYDeg']
	const allowed = value.type === 'softEdge' ? ['type', 'radiusPt'] : value.type === 'reflection' ? [...common, 'startOpacity', 'endOpacity', 'startPosition', 'endPosition'] : [...common, 'color']
	assertKnownKeys(value, allowed, path)
	if (!['outerShadow', 'innerShadow', 'reflection', 'softEdge'].includes(value.type)) throw new Error(`${path}.type must be outerShadow, innerShadow, reflection, or softEdge.`)
	const out = { type: value.type }
	if (value.type === 'softEdge') {
		out.radiusPt = finite(value.radiusPt, `${path}.radiusPt`, { minimum: 0 })
		return out
	}
	for (const key of ['blurPt', 'distancePt']) if (value[key] !== undefined) out[key] = finite(value[key], `${path}.${key}`, { minimum: 0 })
	for (const key of ['directionDeg', 'scaleX', 'scaleY', 'skewXDeg', 'skewYDeg']) if (value[key] !== undefined) out[key] = finite(value[key], `${path}.${key}`)
	if (value.alignment !== undefined) {
		if (!['topLeft', 'top', 'topRight', 'left', 'center', 'right', 'bottomLeft', 'bottom', 'bottomRight'].includes(value.alignment)) throw new Error(`${path}.alignment is not supported.`)
		out.alignment = value.alignment
	}
	if (value.rotateWithShape !== undefined) {
		if (typeof value.rotateWithShape !== 'boolean') throw new Error(`${path}.rotateWithShape must be boolean.`)
		out.rotateWithShape = value.rotateWithShape
	}
	if (value.type === 'reflection') {
		for (const key of ['startOpacity', 'endOpacity', 'startPosition', 'endPosition']) if (value[key] !== undefined) out[key] = finite(value[key], `${path}.${key}`, { minimum: 0, maximum: 1 })
	} else {
		out.color = normalizedColor(value.color, `${path}.color`)
	}
	return out
}

export function normalizePictureStyle(value, path = 'pictureStyle') {
	if (value === null) return null
	if (!plainObject(value)) throw new Error(`${path} must be an object or null.`)
	assertKnownKeys(value, ['geometry', 'fill', 'line', 'effects', 'threeD'], path)
	const out = {}
	if (own(value, 'geometry')) {
		if (value.geometry === null) out.geometry = null
		else {
			if (!plainObject(value.geometry)) throw new Error(`${path}.geometry must be an object or null.`)
			assertKnownKeys(value.geometry, ['preset', 'adjustments'], `${path}.geometry`)
			const geometry = {}
			if (value.geometry.preset !== undefined) {
				if (!POWERPOINT_PICTURE_GEOMETRY_PRESETS.includes(value.geometry.preset)) throw new Error(`${path}.geometry.preset must be one of the measured native PowerPoint preset geometries.`)
				geometry.preset = value.geometry.preset
			}
			if (value.geometry.adjustments !== undefined) {
				if (!plainObject(value.geometry.adjustments)) throw new Error(`${path}.geometry.adjustments must be an object.`)
				geometry.adjustments = Object.fromEntries(Object.entries(value.geometry.adjustments).map(([key, child]) => {
					if (key !== 'adj' && !/^adj\d+$/.test(key)) throw new Error(`${path}.geometry.adjustments.${key} must use an adj or adjN PowerPoint handle name.`)
					return [key, finite(child, `${path}.geometry.adjustments.${key}`, { minimum: 0, maximum: 1 })]
				}))
			}
			out.geometry = geometry
		}
	}
	if (own(value, 'fill')) {
		if (value.fill === null) out.fill = null
		else {
			if (!plainObject(value.fill)) throw new Error(`${path}.fill must be an object or null.`)
			assertKnownKeys(value.fill, ['type', 'color'], `${path}.fill`)
			if (value.fill.type !== undefined && !['none', 'solid'].includes(value.fill.type)) throw new Error(`${path}.fill.type must be none or solid.`)
			out.fill = {
				...(value.fill.type !== undefined ? { type: value.fill.type } : {}),
				...(value.fill.color !== undefined ? { color: normalizedColor(value.fill.color, `${path}.fill.color`) } : {}),
			}
		}
	}
	if (own(value, 'line')) {
		if (value.line === null) out.line = null
		else {
			if (!plainObject(value.line)) throw new Error(`${path}.line must be an object or null.`)
			assertKnownKeys(value.line, ['type', 'widthPt', 'cap', 'compound', 'alignment', 'dash', 'join', 'miterLimit', 'color'], `${path}.line`)
			if (value.line.type !== undefined && !['none', 'solid'].includes(value.line.type)) throw new Error(`${path}.line.type must be none or solid.`)
			const line = { ...(value.line.type !== undefined ? { type: value.line.type } : {}) }
			if (value.line.widthPt !== undefined) line.widthPt = finite(value.line.widthPt, `${path}.line.widthPt`, { minimum: 0 })
			const enums = { cap: ['flat', 'round', 'square'], compound: ['single', 'double', 'thickThin', 'thinThick', 'triple'], alignment: ['center', 'inset'], join: ['miter', 'round', 'bevel'] }
			for (const [key, allowed] of Object.entries(enums)) if (value.line[key] !== undefined) {
				if (!allowed.includes(value.line[key])) throw new Error(`${path}.line.${key} is not supported.`)
				line[key] = value.line[key]
			}
			if (value.line.dash !== undefined) {
				if (typeof value.line.dash !== 'string' || !value.line.dash) throw new Error(`${path}.line.dash must be a PowerPoint dash preset.`)
				line.dash = value.line.dash
			}
			if (value.line.miterLimit !== undefined) line.miterLimit = finite(value.line.miterLimit, `${path}.line.miterLimit`, { minimum: 0 })
			if (value.line.color !== undefined) line.color = normalizedColor(value.line.color, `${path}.line.color`)
			out.line = line
		}
	}
	if (own(value, 'effects')) {
		if (value.effects === null) out.effects = null
		else {
			if (!Array.isArray(value.effects)) throw new Error(`${path}.effects must be an array or null.`)
			out.effects = value.effects.map((effect, index) => normalizedEffect(effect, `${path}.effects[${index}]`))
		}
	}
	if (own(value, 'threeD')) {
		if (value.threeD === null) out.threeD = null
		else {
			if (!plainObject(value.threeD)) throw new Error(`${path}.threeD must be an object or null.`)
			assertKnownKeys(value.threeD, ['camera', 'lightRig', 'position', 'format'], `${path}.threeD`)
			const threeD = {}
			if (value.threeD.camera !== undefined) {
				if (!plainObject(value.threeD.camera)) throw new Error(`${path}.threeD.camera must be an object.`)
				assertKnownKeys(value.threeD.camera, ['preset', 'perspectiveDeg', 'fieldOfView', 'rotation'], `${path}.threeD.camera`)
				threeD.camera = {}
				if (value.threeD.camera.preset !== undefined) {
					if (!POWERPOINT_CAMERA_PRESETS.includes(value.threeD.camera.preset)) throw new Error(`${path}.threeD.camera.preset must be one of the measured PowerPoint camera presets.`)
					threeD.camera.preset = value.threeD.camera.preset
				}
				const perspectiveDeg = value.threeD.camera.perspectiveDeg === undefined ? undefined : finite(value.threeD.camera.perspectiveDeg, `${path}.threeD.camera.perspectiveDeg`, { minimum: 0, maximum: 120 })
				const fieldOfView = value.threeD.camera.fieldOfView === undefined ? undefined : finite(value.threeD.camera.fieldOfView, `${path}.threeD.camera.fieldOfView`, { minimum: 0, maximum: 120 })
				if (perspectiveDeg !== undefined && fieldOfView !== undefined && perspectiveDeg !== fieldOfView) throw new Error(`${path}.threeD.camera.perspectiveDeg and fieldOfView must match when both are provided.`)
				if (perspectiveDeg !== undefined || fieldOfView !== undefined) threeD.camera.perspectiveDeg = perspectiveDeg ?? fieldOfView
				if (value.threeD.camera.rotation !== undefined) threeD.camera.rotation = normalizedRotation(value.threeD.camera.rotation, `${path}.threeD.camera.rotation`)
			}
			if (value.threeD.lightRig !== undefined) {
				if (!plainObject(value.threeD.lightRig)) throw new Error(`${path}.threeD.lightRig must be an object.`)
				assertKnownKeys(value.threeD.lightRig, ['preset', 'direction', 'rotation'], `${path}.threeD.lightRig`)
				threeD.lightRig = {}
				if (value.threeD.lightRig.preset !== undefined) {
					if (typeof value.threeD.lightRig.preset !== 'string' || !value.threeD.lightRig.preset) throw new Error(`${path}.threeD.lightRig.preset must be a non-empty PowerPoint light-rig preset.`)
					threeD.lightRig.preset = value.threeD.lightRig.preset
				}
				if (value.threeD.lightRig.direction !== undefined) {
					if (typeof value.threeD.lightRig.direction !== 'string' || !POWERPOINT_LIGHT_RIG_DIRECTIONS.includes(value.threeD.lightRig.direction)) throw new Error(`${path}.threeD.lightRig.direction must be one of: ${POWERPOINT_LIGHT_RIG_DIRECTIONS.join(', ')}`)
					threeD.lightRig.direction = value.threeD.lightRig.direction
				}
				if (value.threeD.lightRig.rotation !== undefined) threeD.lightRig.rotation = normalizedRotation(value.threeD.lightRig.rotation, `${path}.threeD.lightRig.rotation`, { minimum: -180, maximum: 180 })
			}
			if (value.threeD.position !== undefined) {
				if (!plainObject(value.threeD.position)) throw new Error(`${path}.threeD.position must be an object.`)
				assertKnownKeys(value.threeD.position, ['z'], `${path}.threeD.position`)
				if (value.threeD.position.z !== undefined) throw new Error(`${path}.threeD.position.z is unsupported: PowerPoint exposes no independent position-Z endpoint and native DrawingML has no position-Z attribute.`)
			}
			if (value.threeD.format !== undefined) {
				if (!plainObject(value.threeD.format)) throw new Error(`${path}.threeD.format must be an object.`)
				assertKnownKeys(value.threeD.format, ['material', 'extrusionDepthPt', 'extrusionColor', 'contourWidthPt', 'contourColor', 'bevelTop', 'bevelBottom'], `${path}.threeD.format`)
				const format = {}
				if (value.threeD.format.material !== undefined) {
					if (typeof value.threeD.format.material !== 'string' || !POWERPOINT_MATERIAL_PRESETS.includes(value.threeD.format.material)) throw new Error(`${path}.threeD.format.material must be one of the measured PowerPoint preset materials.`)
					format.material = value.threeD.format.material
				}
				if (value.threeD.format.extrusionDepthPt !== undefined) format.extrusionDepthPt = finite(value.threeD.format.extrusionDepthPt, `${path}.threeD.format.extrusionDepthPt`, { minimum: 0 })
				if (value.threeD.format.extrusionColor !== undefined) format.extrusionColor = normalizedColor(value.threeD.format.extrusionColor, `${path}.threeD.format.extrusionColor`)
				if (value.threeD.format.contourWidthPt !== undefined) format.contourWidthPt = finite(value.threeD.format.contourWidthPt, `${path}.threeD.format.contourWidthPt`, { minimum: 0 })
				if (value.threeD.format.contourColor !== undefined) format.contourColor = normalizedColor(value.threeD.format.contourColor, `${path}.threeD.format.contourColor`)
				if (value.threeD.format.bevelTop !== undefined) format.bevelTop = normalizedBevel(value.threeD.format.bevelTop, `${path}.threeD.format.bevelTop`)
				if (value.threeD.format.bevelBottom !== undefined) format.bevelBottom = normalizedBevel(value.threeD.format.bevelBottom, `${path}.threeD.format.bevelBottom`)
				threeD.format = format
			}
			out.threeD = threeD
		}
	}
	return out
}

function deepMerge(base, override) {
	if (!plainObject(base) || !plainObject(override)) return clone(override)
	const out = clone(base)
	for (const [key, value] of Object.entries(override)) out[key] = plainObject(value) && plainObject(out[key]) ? deepMerge(out[key], value) : clone(value)
	return out
}

export function pictureStylePresetById(id) {
	return PICTURE_STYLE_PRESETS.find(item => item.id === String(id)) || null
}

export function applyPictureStylePreset(options = {}, presetId) {
	if (presetId == null || String(presetId).trim() === '') return { options: { ...options }, preset: null }
	const preset = pictureStylePresetById(presetId)
	if (!preset) throw new Error(`Unknown picture style preset: ${presetId}`)
	const authored = own(options, 'pictureStyle') ? normalizePictureStyle(options.pictureStyle) : undefined
	const pictureStyle = authored === undefined ? clone(preset.recipe.pictureStyle) : authored === null ? null : deepMerge(preset.recipe.pictureStyle, authored)
	// Raw captures remain private reference evidence on the preset records, but
	// new authoring executes only the proven typed vector.
	return { options: { _nativeMinimal: true, ...options, pictureStyle }, preset }
}

export function publicPictureStylePresets() {
	return PICTURE_STYLE_PRESETS.map(({ id, index, label, family, kind, recipe }) => ({
		id,
		index,
		label,
		family,
		kind,
		editable: true,
		capabilityMode: 'preset-plus-parameters',
		capabilityStatus: 'executable-exact-structured',
		componentOwnership: [...PICTURE_STYLE_COMPONENT_OWNERSHIP],
		overrideFields: [...PICTURE_STYLE_OVERRIDE_FIELDS],
		resetBehavior: { ...PICTURE_STYLE_RESET_BEHAVIOR },
		expandedOptions: { pictureStyle: clone(recipe.pictureStyle) },
	}))
}
