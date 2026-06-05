/**
 * Native PowerPoint 3D-model animation builders.
 *
 * Reverse-engineered from tmp_autonomous_test/3Danimations_MANUALLYFROZENREFERENCE.pptx
 * Reference captures:
 *   - 2026-05-30 manual frozen 21-slide compact batch, covering 252 variants
 *     for Arrive, Turntable, Swing, Jump & Turn, and Leave
 *
 * The generated option data module stores exact PowerPoint behavior templates
 * for intensity-sensitive Swing and Jump & Turn variants. Direction/axis/space
 * are derived at build time by swapping attrName prefixes and rotation axes.
 *
 * Five animations: arrive (entr/60), turntable (emph/37), swing (emph/38),
 * jumpAndTurn (emph/39), leave (exit/60).
 *
 * Reference invariants (verified against the frozen deck):
 *   - the effect <p:cTn> carries NO grpId and the slide emits NO bldLst for it
 *   - cTn does not use accel/decel for view-space variants
 *   - Object Center directions are Right/Back/Clockwise/Left/Front/
 *     Counterclockwise; PowerPoint exposes no object-axis Up/Down entries
 *   - Jump & Turn view mode swaps rotation, translation, and scale to 3d.view.*
 */

import { getNextAnimationId } from '../gen-animations-ids'
import { AnimationBuildContext } from './types'
import { getNodeTypeFromTrigger } from './utils'
import { MODEL3D_ANIMATION_TEMPLATES, Model3DAnimationName } from './data3DAnimationTemplates'
import {
	MODEL3D_JUMP_AND_TURN_OPTION_BEHAVIORS,
	MODEL3D_SWING_OPTION_BEHAVIORS,
	Model3DOptionIntensity,
	Model3DOptionSign,
} from './data3DAnimationOptionTemplates'

const VIEW_SPACE_TOKENS = new Set(['view', 'camera', 'scene', 'viewport', 'viewcenter', 'cameracenter'])
const OBJECT_SPACE_TOKENS = new Set(['object', 'model', 'objectcenter', 'modelcenter'])
const VIEW_DIRECTION_TOKENS = new Set(['right', 'left', 'up', 'down', 'clockwise', 'counterclockwise'])
const OBJECT_DIRECTION_TOKENS = new Set(['right', 'left', 'front', 'back', 'clockwise', 'counterclockwise'])

const ARRIVE_TIMES = ['0', '3330', '6660', '9990', '13320', '16650', '19970', '23290', '26620', '29950', '33280', '36610', '39940', '43270', '46600', '49930', '53250', '56580', '59900', '63220', '66540', '69870', '73190', '76510', '79830', '83160', '86480', '89800', '93120', '96450', '100000']
const ARRIVE_ROTATION_CURVES: Record<'10' | '20' | '40', string[]> = {
	'10': ['10', '9.9674', '9.8728', '9.7205', '9.5149', '9.2606', '8.9628', '8.6253', '8.2513', '7.8462', '7.4145', '6.9604', '6.4886', '6.0034', '5.5092', '5.0104', '4.5131', '4.0186', '3.5344', '3.0632', '2.6094', '2.1764', '1.7709', '1.3961', '1.0563', '0.7552', '0.4989', '0.2908', '0.1354', '0.0369', '0'],
	'20': ['20', '19.9349', '19.7456', '19.441', '19.0299', '18.5212', '17.9257', '17.2507', '16.5027', '15.6925', '14.829', '13.9209', '12.9772', '12.0068', '11.0184', '10.0209', '9.0263', '8.0373', '7.0688', '6.1264', '5.2189', '4.3528', '3.5418', '2.7922', '2.1127', '1.5104', '0.9978', '0.5817', '0.2709', '0.0738', '0'],
	'40': ['40', '39.8698', '39.4913', '38.8821', '38.0599', '37.0425', '35.8515', '34.5015', '33.0055', '31.3851', '29.658', '27.8419', '25.9545', '24.0136', '22.0368', '20.0419', '18.0527', '16.0747', '14.1376', '12.2528', '10.4379', '8.7056', '7.0836', '5.5844', '4.2254', '3.0209', '1.9957', '1.1635', '0.5419', '0.1476', '0'],
}
const ARRIVE_SCALE_CURVE = ['0.8', '0.8104', '0.8208', '0.8312', '0.8415', '0.8517', '0.8617', '0.8715', '0.8812', '0.8906', '0.8998', '0.9087', '0.9174', '0.9257', '0.9336', '0.9412', '0.9484', '0.9552', '0.9616', '0.9675', '0.973', '0.978', '0.9825', '0.9865', '0.99', '0.993', '0.9955', '0.9974', '0.9988', '0.9996', '1']
const LEAVE_ROTATION_CURVES: Record<'10' | '20' | '40', string[]> = {
	'10': ['0', '0.0325', '0.1271', '0.2794', '0.485', '0.7393', '1.0371', '1.3746', '1.7486', '2.1537', '2.5854', '3.0395', '3.5113', '3.9965', '4.4907', '4.9895', '5.4868', '5.9813', '6.4655', '6.9367', '7.3905', '7.8235', '8.229', '8.6038', '8.9436', '9.2447', '9.501', '9.7091', '9.8645', '9.963', '10'],
	'20': ['0', '0.065', '0.2543', '0.5589', '0.97', '1.4787', '2.0742', '2.7492', '3.4972', '4.3074', '5.1709', '6.079', '7.0227', '7.9931', '8.9815', '9.979', '10.9736', '11.9626', '12.9311', '13.8735', '14.781', '15.6471', '16.4581', '17.2077', '17.8872', '18.4895', '19.0021', '19.4182', '19.729', '19.9261', '20'],
	'40': ['0', '0.1301', '0.5086', '1.1178', '1.94', '2.9574', '4.1484', '5.4984', '6.9944', '8.6148', '10.3419', '12.158', '14.0454', '15.9863', '17.9631', '19.958', '21.9472', '23.9252', '25.8623', '27.7471', '29.562', '31.2943', '32.9163', '34.4155', '35.7745', '36.979', '38.0042', '38.8364', '39.458', '39.8523', '40'],
}
const LEAVE_SCALE_CURVE = ['1', '0.9895', '0.9791', '0.9687', '0.9584', '0.9482', '0.9382', '0.9284', '0.9187', '0.9093', '0.9001', '0.8912', '0.8825', '0.8742', '0.8663', '0.8587', '0.8515', '0.8447', '0.8383', '0.8324', '0.8269', '0.8219', '0.8174', '0.8134', '0.8099', '0.8069', '0.8044', '0.8025', '0.8011', '0.8003', '0.8']

type Model3DAxis = 'x' | 'y' | 'z'
type Model3DSpace = 'object' | 'view'
type Model3DDirection = 'right' | 'left' | 'up' | 'down' | 'front' | 'back' | 'clockwise' | 'counterclockwise'
type Model3DAmount = 'half' | 'full' | 'continuous' | 'once' | 'twice'

interface Model3DVariant {
	axis: 'x' | 'y' | 'z'
	motionSign: 1 | -1
	presetSubtype: number
	space: Model3DSpace
	direction: Model3DDirection
}

const MODEL3D_DIRECTION_VARIANTS = {
	view: {
		right: { axis: 'y', motionSign: 1, presetSubtype: 128 },
		left: { axis: 'y', motionSign: -1, presetSubtype: 256 },
		up: { axis: 'x', motionSign: -1, presetSubtype: 512 },
		down: { axis: 'x', motionSign: 1, presetSubtype: 1024 },
		clockwise: { axis: 'z', motionSign: -1, presetSubtype: 2048 },
		counterclockwise: { axis: 'z', motionSign: 1, presetSubtype: 4096 },
	},
	object: {
		left: { axis: 'y', motionSign: 1, presetSubtype: 2 },
		right: { axis: 'y', motionSign: -1, presetSubtype: 4 },
		back: { axis: 'x', motionSign: -1, presetSubtype: 8 },
		front: { axis: 'x', motionSign: 1, presetSubtype: 16 },
		counterclockwise: { axis: 'z', motionSign: -1, presetSubtype: 32 },
		clockwise: { axis: 'z', motionSign: 1, presetSubtype: 64 },
	},
} as const

function cleanToken(value?: unknown): string {
	return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function normalizeSpace(value?: unknown): Model3DSpace | undefined {
	const token = cleanToken(value)
	if (VIEW_SPACE_TOKENS.has(token)) return 'view'
	if (OBJECT_SPACE_TOKENS.has(token)) return 'object'
	return undefined
}

function normalizeDirection(value: unknown, space: Model3DSpace): Model3DDirection | undefined {
	const token = cleanToken(value)
	const normalized = token === 'cw' ? 'clockwise'
		: token === 'ccw' ? 'counterclockwise'
			: token
	if (space === 'view' && VIEW_DIRECTION_TOKENS.has(normalized)) return normalized as Model3DDirection
	if (space === 'object') {
		if (normalized === 'up') return 'back'
		if (normalized === 'down') return 'front'
		if (OBJECT_DIRECTION_TOKENS.has(normalized)) return normalized as Model3DDirection
	}
	return undefined
}

function normalizeIntensity(value?: unknown): Model3DOptionIntensity | undefined {
	const token = cleanToken(value)
	if (token === 'subtle' || token === 'moderate' || token === 'strong') return token
	return undefined
}

function normalizeAmount(value?: unknown): Model3DAmount | undefined {
	const token = cleanToken(value)
	if (token === 'half' || token === 'halfspin') return 'half'
	if (token === 'full' || token === 'fullspin') return 'full'
	if (token === 'continuous' || token === 'indefinite') return 'continuous'
	if (token === 'once' || token === 'one' || token === '1') return 'once'
	if (token === 'twice' || token === 'two' || token === '2') return 'twice'
	return undefined
}

function readOption(animation: Record<string, unknown>, key: string): unknown {
	const effectOptions = animation.effectOptions as Record<string, unknown> | undefined
	return animation[key] ?? effectOptions?.[key]
}

function selectModel3DVariant(animation: Record<string, unknown>): Model3DVariant {
	const directionValue = readOption(animation, 'modelDirection')
		?? readOption(animation, 'effectDirection')
		?? readOption(animation, 'direction')
	const axisValue = readOption(animation, 'rotationAxis')
		?? readOption(animation, 'axis')
		?? readOption(animation, 'space')
		?? readOption(animation, 'direction')
	const space = normalizeSpace(axisValue) || normalizeSpace(directionValue) || 'object'
	const defaultDirection = space === 'view' ? 'right' : 'left'
	const direction = normalizeDirection(directionValue, space) || defaultDirection
	const base = MODEL3D_DIRECTION_VARIANTS[space][direction as keyof typeof MODEL3D_DIRECTION_VARIANTS[typeof space]]

	return { ...base, space, direction } as Model3DVariant
}

function signedValue(value: string, sign: 1 | -1): string {
	if (value === '0') return '0'
	return sign === -1 ? `-${value}` : value
}

function buildTavList(times: string[], values: string[], sign: 1 | -1 = 1): string {
	let xml = '<p:tavLst>'
	for (let i = 0; i < times.length; i++) {
		xml += `<p:tav tm="${times[i]}"><p:val><p:fltVal val="${signedValue(values[i], sign)}"/></p:val></p:tav>`
	}
	xml += '</p:tavLst>'
	return xml
}

function buildNumericAnim(
	id: number,
	shapeId: number,
	attrName: string,
	values: string[],
	additive: 'sum' | 'mult',
	sign: 1 | -1 = 1,
	options: { fillHold?: boolean; times?: string[] } = {}
): string {
	const fill = options.fillHold === false ? '' : ' fill="hold"'
	const times = options.times || ARRIVE_TIMES
	return `<p:anim calcmode="lin" valueType="num"><p:cBhvr additive="${additive}"><p:cTn id="${id}" dur="1000"${fill}/><p:tgtEl><p:spTgt spid="${shapeId}"/></p:tgtEl><p:attrNameLst><p:attrName>${attrName}</p:attrName></p:attrNameLst></p:cBhvr>${buildTavList(times, values, sign)}</p:anim>`
}

function buildArriveBehaviors(ctx: AnimationBuildContext): { presetSubtype: number; behaviors: string } {
	const { shapeId, ids } = ctx
	const animation = ctx.animation as unknown as Record<string, unknown>
	const variant = selectModel3DVariant(animation)
	const intensity = normalizeIntensity(readOption(animation, 'intensity')) || 'moderate'
	const magnitude: '10' | '20' | '40' = intensity === 'subtle' ? '10' : intensity === 'strong' ? '40' : '20'
	const rotationAttr = `3d.${variant.space}.rotation.${variant.axis}`
	const rotationValues = ARRIVE_ROTATION_CURVES[magnitude]
	const arriveSign = variant.motionSign === 1 ? -1 : 1
	const pool = [ids.set, ids.animX, ids.animY, ids.effect].filter(v => typeof v === 'number') as number[]
	while (pool.length < 6) pool.push(getNextAnimationId())

	let behaviors = `<p:set><p:cBhvr><p:cTn id="${pool[0]}" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn><p:tgtEl><p:spTgt spid="${shapeId}"/></p:tgtEl><p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="visible"/></p:to></p:set>`
	behaviors += `<p:animEffect transition="in" filter="fade"><p:cBhvr><p:cTn id="${pool[1]}" dur="1000"/><p:tgtEl><p:spTgt spid="${shapeId}"/></p:tgtEl></p:cBhvr></p:animEffect>`
	behaviors += buildNumericAnim(pool[2], shapeId, rotationAttr, rotationValues, 'sum', arriveSign)
	behaviors += buildNumericAnim(pool[3], shapeId, '3d.object.scale.x', ARRIVE_SCALE_CURVE, 'mult')
	behaviors += buildNumericAnim(pool[4], shapeId, '3d.object.scale.y', ARRIVE_SCALE_CURVE, 'mult')
	behaviors += buildNumericAnim(pool[5], shapeId, '3d.object.scale.z', ARRIVE_SCALE_CURVE, 'mult')
	return { presetSubtype: variant.presetSubtype, behaviors }
}

function buildLeaveBehaviors(ctx: AnimationBuildContext): { presetSubtype: number; behaviors: string } {
	const { shapeId, ids } = ctx
	const animation = ctx.animation as unknown as Record<string, unknown>
	const variant = selectModel3DVariant(animation)
	const intensity = normalizeIntensity(readOption(animation, 'intensity')) || 'moderate'
	const magnitude: '10' | '20' | '40' = intensity === 'subtle' ? '10' : intensity === 'strong' ? '40' : '20'
	const rotationAttr = `3d.${variant.space}.rotation.${variant.axis}`
	const pool = [ids.set, ids.animX, ids.animY, ids.effect].filter(v => typeof v === 'number') as number[]
	while (pool.length < 6) pool.push(getNextAnimationId())

	let behaviors = `<p:animEffect transition="out" filter="fade"><p:cBhvr><p:cTn id="${pool[0]}" dur="1000"/><p:tgtEl><p:spTgt spid="${shapeId}"/></p:tgtEl></p:cBhvr></p:animEffect>`
	behaviors += buildNumericAnim(pool[1], shapeId, rotationAttr, LEAVE_ROTATION_CURVES[magnitude], 'sum', variant.motionSign, { fillHold: false })
	behaviors += buildNumericAnim(pool[2], shapeId, '3d.object.scale.x', LEAVE_SCALE_CURVE, 'mult', 1, { fillHold: false })
	behaviors += buildNumericAnim(pool[3], shapeId, '3d.object.scale.y', LEAVE_SCALE_CURVE, 'mult', 1, { fillHold: false })
	behaviors += buildNumericAnim(pool[4], shapeId, '3d.object.scale.z', LEAVE_SCALE_CURVE, 'mult', 1, { fillHold: false })
	behaviors += `<p:set><p:cBhvr><p:cTn id="${pool[5]}" dur="1" fill="hold"><p:stCondLst><p:cond delay="999"/></p:stCondLst></p:cTn><p:tgtEl><p:spTgt spid="${shapeId}"/></p:tgtEl><p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="hidden"/></p:to></p:set>`
	return { presetSubtype: variant.presetSubtype, behaviors }
}

function fillTemplatePlaceholders(template: string, ctx: AnimationBuildContext, idCount: number): string {
	const { ids, shapeId } = ctx
	const pool = [ids.set, ids.animX, ids.animY, ids.effect].filter(v => typeof v === 'number') as number[]
	while (pool.length < idCount) pool.push(getNextAnimationId())

	let out = template
	for (let k = 0; k < idCount; k++) out = out.split(`{{ID${k}}}`).join(String(pool[k]))
	return out.split('{{SPID}}').join(String(shapeId))
}

function applyVariantSpaceAndAxis(behaviors: string, variant: Model3DVariant, scaleFollowsView: boolean): string {
	let out = behaviors
	if (variant.axis !== 'y') out = out.split('rotation.y').join(`rotation.${variant.axis}`)
	if (variant.space === 'view') {
		out = out
			.split('3d.object.rotation').join('3d.view.rotation')
			.split('3d.object.translation').join('3d.view.translation')
		if (scaleFollowsView) out = out.split('3d.object.scale').join('3d.view.scale')
	}
	return out
}

function buildTemplateVariantBehaviors(
	ctx: AnimationBuildContext,
	variant: Model3DVariant,
	behaviorsByIntensity: Record<Model3DOptionIntensity, Record<Model3DOptionSign, string>>,
	idCount: number,
	scaleFollowsView = false
): string {
	const animation = ctx.animation as unknown as Record<string, unknown>
	const intensity = normalizeIntensity(readOption(animation, 'intensity')) || 'moderate'
	const sign: Model3DOptionSign = variant.motionSign === 1 ? 'positive' : 'negative'
	const template = behaviorsByIntensity[intensity][sign]
	return applyVariantSpaceAndAxis(fillTemplatePlaceholders(template, ctx, idCount), variant, scaleFollowsView)
}

function buildTurntableBehaviors(ctx: AnimationBuildContext, variant: Model3DVariant): string {
	const animation = ctx.animation as unknown as Record<string, unknown>
	const amount = normalizeAmount(readOption(animation, 'amount')) || 'full'
	const by = amount === 'half' ? '10800000' : '21600000'
	const rotationAttr = `3d.${variant.space}.rotation.${variant.axis}`
	const id = typeof ctx.ids.set === 'number' ? ctx.ids.set : getNextAnimationId()
	return `<p:animRot by="${signedValue(by, variant.motionSign)}"><p:cBhvr><p:cTn id="${id}" dur="2000" fill="hold"/><p:tgtEl><p:spTgt spid="${ctx.shapeId}"/></p:tgtEl><p:attrNameLst><p:attrName>${rotationAttr}</p:attrName></p:attrNameLst></p:cBhvr></p:animRot>`
}

function explicitRepeatCount(value: unknown): string | undefined {
	if (value === undefined || value === null) return undefined
	if (value === 'indefinite') return 'indefinite'
	if (typeof value === 'number' && Number.isFinite(value)) return String(Math.round(value * 1000))
	const token = cleanToken(value)
	if (token === 'indefinite' || token === 'continuous') return 'indefinite'
	const numeric = Number(token)
	if (Number.isFinite(numeric) && numeric > 0) return String(Math.round(numeric * 1000))
	return undefined
}

function repeatCountAttribute(animation: Record<string, unknown>, name: Model3DAnimationName): string {
	const explicit = explicitRepeatCount(readOption(animation, 'repeatCount'))
	if (explicit) return ` repeatCount="${explicit}"`

	const amount = normalizeAmount(readOption(animation, 'amount'))
	if ((name === 'turntable' || name === 'swing') && amount === 'continuous') return ' repeatCount="indefinite"'
	if (name === 'swing' && amount === 'twice') return ' repeatCount="2000"'
	return ''
}

/**
 * Shared builder for the five native 3D model animations. Emits the innermost
 * effect <p:par><p:cTn>; the timing orchestrator adds the click-group and delay
 * wrappers. Deliberately omits grpId — the reference deck has none for 3D.
 */
function build3DModelAnimation(ctx: AnimationBuildContext, name: Model3DAnimationName): string {
	const tpl = MODEL3D_ANIMATION_TEMPLATES[name]
	if (!tpl) throw new Error(`Unknown 3D model animation template: "${name}"`)

	const { animation, ids } = ctx
	const nodeType = ctx.nodeType || getNodeTypeFromTrigger(animation.trigger)
	const delay = animation.delay ?? 0
	const animationOptions = animation as unknown as Record<string, unknown>
	const repeat = repeatCountAttribute(animationOptions, name)

	if (name === 'arrive') {
		const variant = buildArriveBehaviors(ctx)
		return `<p:par><p:cTn id="${ids.main}" presetID="${tpl.presetId}" presetClass="${tpl.presetClass}" presetSubtype="${variant.presetSubtype}"${repeat} fill="hold" nodeType="${nodeType}"><p:stCondLst><p:cond delay="${delay}"/></p:stCondLst><p:childTnLst>${variant.behaviors}</p:childTnLst></p:cTn></p:par>`
	}

	if (name === 'leave') {
		const variant = buildLeaveBehaviors(ctx)
		return `<p:par><p:cTn id="${ids.main}" presetID="${tpl.presetId}" presetClass="${tpl.presetClass}" presetSubtype="${variant.presetSubtype}"${repeat} fill="hold" nodeType="${nodeType}"><p:stCondLst><p:cond delay="${delay}"/></p:stCondLst><p:childTnLst>${variant.behaviors}</p:childTnLst></p:cTn></p:par>`
	}

	const variant = selectModel3DVariant(animationOptions)
	let behaviors: string
	if (name === 'turntable') {
		behaviors = buildTurntableBehaviors(ctx, variant)
	} else if (name === 'swing') {
		behaviors = buildTemplateVariantBehaviors(ctx, variant, MODEL3D_SWING_OPTION_BEHAVIORS, tpl.idCount)
	} else {
		behaviors = buildTemplateVariantBehaviors(ctx, variant, MODEL3D_JUMP_AND_TURN_OPTION_BEHAVIORS, tpl.idCount, true)
	}

	return `<p:par><p:cTn id="${ids.main}" presetID="${tpl.presetId}" presetClass="${tpl.presetClass}" presetSubtype="${variant.presetSubtype}"${repeat} fill="hold" nodeType="${nodeType}"><p:stCondLst><p:cond delay="${delay}"/></p:stCondLst><p:childTnLst>${behaviors}</p:childTnLst></p:cTn></p:par>`
}

export function buildArriveAnimation(ctx: AnimationBuildContext): string {
	return build3DModelAnimation(ctx, 'arrive')
}

export function buildTurntableAnimation(ctx: AnimationBuildContext): string {
	return build3DModelAnimation(ctx, 'turntable')
}

export function buildSwingAnimation(ctx: AnimationBuildContext): string {
	return build3DModelAnimation(ctx, 'swing')
}

export function buildJumpAndTurnAnimation(ctx: AnimationBuildContext): string {
	return build3DModelAnimation(ctx, 'jumpAndTurn')
}

export function buildLeaveAnimation(ctx: AnimationBuildContext): string {
	return build3DModelAnimation(ctx, 'leave')
}
