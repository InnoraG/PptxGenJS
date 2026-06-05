/**
 * PptxGenJS: 3D Model Generation
 */

import { ISlideObject, Model3DProps } from './core-interfaces'
import { CRLF } from './core-enums'
import { encodeXmlEntities, createShadowElement, convertRotationDegrees } from './gen-utils'

const MODEL3D_RATIONAL_DENOMINATOR = 1000000
const MODEL3D_DEGREE_UNIT = 60000

const DEFAULT_CAMERA_POS = { x: 0, y: 0, z: 72274889 }
const DEFAULT_METER_PER_MODEL_UNIT = { n: 2785208, d: MODEL3D_RATIONAL_DENOMINATOR }
const DEFAULT_PRE_TRANS = { dx: 1284076, dy: -339872, dz: -26175400 }
const DEFAULT_SCALE = { sx: MODEL3D_RATIONAL_DENOMINATOR, sy: MODEL3D_RATIONAL_DENOMINATOR, sz: MODEL3D_RATIONAL_DENOMINATOR }
const DEFAULT_ROT = { ay: 10800000 }
const DEFAULT_POST_TRANS = { dx: 0, dy: 0, dz: 0 }
const DEFAULT_AMBIENT_COLOR = { r: 50000, g: 50000, b: 50000 }
const DEFAULT_PT_LIGHTS = [
	{ color: { r: 100000, g: 75000, b: 50000 }, intensity: 9.765625, pos: { x: 21959998, y: 70920001, z: 16344003 } },
	{ color: { r: 40000, g: 60000, b: 95000 }, intensity: 12.25, pos: { x: -37964106, y: 51130435, z: 57631972 } },
	{ color: { r: 86837, g: 72700, b: 100000 }, intensity: 3.125, pos: { x: -37739122, y: 58056624, z: -34769649 } },
]

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function finiteNumber(value: unknown, fallback: number): number {
	if (typeof value === 'number' && Number.isFinite(value)) return value
	if (typeof value === 'string' && value.trim() !== '') {
		const parsed = Number(value)
		if (Number.isFinite(parsed)) return parsed
	}
	return fallback
}

function roundedNumber(value: unknown, fallback: number): number {
	return Math.round(finiteNumber(value, fallback))
}

function finiteValue(record: Record<string, unknown>, primary: string, fallback: number, alias?: string): number {
	return roundedNumber(record[primary] !== undefined ? record[primary] : alias ? record[alias] : undefined, fallback)
}

function normalizePositive(value: unknown, fallback: number): number {
	const parsed = finiteNumber(value, fallback)
	return parsed > 0 ? parsed : fallback
}

function normalizeFov(value: unknown): number {
	const parsed = normalizePositive(value, 2700000)
	return Math.round(parsed <= 360 ? parsed * MODEL3D_DEGREE_UNIT : parsed)
}

function normalizeRational(value: unknown, defaults: { n: number; d: number }): { n: number; d: number } {
	if (typeof value === 'number' || typeof value === 'string') {
		const parsed = normalizePositive(value, defaults.n / defaults.d)
		return { n: Math.round(parsed * MODEL3D_RATIONAL_DENOMINATOR), d: MODEL3D_RATIONAL_DENOMINATOR }
	}

	const record = asRecord(value)
	const d = roundedNumber(record.d, defaults.d)
	return {
		n: roundedNumber(record.n, defaults.n),
		d: d === 0 ? defaults.d : d,
	}
}

function normalizeVector(value: unknown, defaults: { dx: number; dy: number; dz: number }): { dx: number; dy: number; dz: number } {
	const record = asRecord(value)
	return {
		dx: finiteValue(record, 'dx', defaults.dx, 'x'),
		dy: finiteValue(record, 'dy', defaults.dy, 'y'),
		dz: finiteValue(record, 'dz', defaults.dz, 'z'),
	}
}

function normalizePoint(value: unknown, defaults: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
	const record = asRecord(value)
	return {
		x: roundedNumber(record.x, defaults.x),
		y: roundedNumber(record.y, defaults.y),
		z: roundedNumber(record.z, defaults.z),
	}
}

function normalizeScaleValue(value: unknown, fallback: number): number {
	const parsed = finiteNumber(value, fallback)
	return Math.round(Math.abs(parsed) <= 100 ? parsed * MODEL3D_RATIONAL_DENOMINATOR : parsed)
}

function normalizeScale(value: unknown): { sx: number; sy: number; sz: number } {
	const record = asRecord(value)
	return {
		sx: normalizeScaleValue(record.sx !== undefined ? record.sx : record.x, DEFAULT_SCALE.sx),
		sy: normalizeScaleValue(record.sy !== undefined ? record.sy : record.y, DEFAULT_SCALE.sy),
		sz: normalizeScaleValue(record.sz !== undefined ? record.sz : record.z, DEFAULT_SCALE.sz),
	}
}

function normalizeAngleValue(value: unknown, fallback: number, isNative: boolean): number {
	const parsed = finiteNumber(value, fallback)
	return Math.round(isNative ? parsed : convertRotationDegrees(parsed))
}

function normalizeRot(value: unknown): { ax?: number; ay?: number; az?: number } {
	const record = asRecord(value)
	const hasRotation =
		record.ax !== undefined || record.ay !== undefined || record.az !== undefined ||
		record.x !== undefined || record.y !== undefined || record.z !== undefined

	if (!hasRotation) return { ...DEFAULT_ROT }

	const rot: { ax?: number; ay?: number; az?: number } = {}
	if (record.ax !== undefined || record.x !== undefined) rot.ax = normalizeAngleValue(record.ax !== undefined ? record.ax : record.x, 0, record.ax !== undefined)
	if (record.ay !== undefined || record.y !== undefined) rot.ay = normalizeAngleValue(record.ay !== undefined ? record.ay : record.y, 0, record.ay !== undefined)
	if (record.az !== undefined || record.z !== undefined) rot.az = normalizeAngleValue(record.az !== undefined ? record.az : record.z, 0, record.az !== undefined)
	return rot
}

function normalizeScrgbColor(value: unknown, defaults: { r: number; g: number; b: number }): { r: number; g: number; b: number } {
	const record = asRecord(value)
	const normalizeChannel = (channel: unknown, fallback: number): number => {
		const parsed = finiteNumber(channel, fallback)
		return Math.round(parsed >= 0 && parsed <= 255 ? (parsed / 255) * 100000 : parsed)
	}
	return {
		r: normalizeChannel(record.r, defaults.r),
		g: normalizeChannel(record.g, defaults.g),
		b: normalizeChannel(record.b, defaults.b),
	}
}

function normalizeIlluminance(value: unknown, fallback = 0.5): number {
	const parsed = finiteNumber(value, fallback)
	if (parsed >= 0 && parsed <= 1) return parsed
	if (parsed > 1 && parsed <= 100) return parsed / 100
	return fallback
}

function normalizePointLights(value: unknown): Array<{ color: { r: number; g: number; b: number }; intensity: number; pos: { x: number; y: number; z: number } }> {
	const source = Array.isArray(value) && value.length > 0 ? value : DEFAULT_PT_LIGHTS
	return source.map((light, idx) => {
		const defaults = DEFAULT_PT_LIGHTS[idx] || DEFAULT_PT_LIGHTS[0]
		const record = asRecord(light)
		return {
			color: normalizeScrgbColor(record.color, defaults.color),
			intensity: finiteNumber(record.intensity, defaults.intensity),
			pos: normalizePoint(record.pos, defaults.pos),
		}
	})
}

/**
 * Generate XML for 3D Model (model3d) element
 * Creates mc:AlternateContent with am3d:model3d and, when requested,
 * a raster fallback p:pic.
 * @param {ISlideObject} slideItemObj - slide object with model3d properties
 * @param {number} idx - object index for ID generation
 * @param {number} slideNum - slide number for unique IDs
 * @returns {string} XML string for model3d element
 */
export function genXmlModel3D(slideItemObj: ISlideObject, idx: number, slideNum: number): string {
	const options = slideItemObj.options as Model3DProps
	const creationId = `{${generateGUID()}}`
	const shapeId = options.spid || idx + 2
	const objectName = encodeXmlEntities(options.objectName || `3D Model ${idx + 1}`)

	// Position and size (convert from inches to EMU)
	const x = Math.round((Number(options.x) || 0) * 914400)
	const y = Math.round((Number(options.y) || 0) * 914400)
	const cx = Math.round((Number(options.w) || 1) * 914400)
	const cy = Math.round((Number(options.h) || 1) * 914400)

	// Relationship IDs for GLB file and raster PNG fallback
	// slideItemObj.model3dRid/rasterRid are numeric (e.g., 1, 2), so we add the "rId" prefix.
	const glbRid = slideItemObj.model3dRid ? `rId${slideItemObj.model3dRid}` : 'rId2'
	const hasRasterFallback = options.nativeOnly !== true && !!slideItemObj.rasterRid
	const rasterRid = hasRasterFallback ? `rId${slideItemObj.rasterRid}` : undefined

	let xml = ''

	// Output mc:AlternateContent wrapper with Choice (model3d) and Fallback (pic).
	// PowerPoint uses this structure for model3d shapes - the Fallback pic provides
	// a raster image for viewers that don't support 3D models.
	xml += `<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">${CRLF}`
	xml += `  <mc:Choice xmlns:am3d="http://schemas.microsoft.com/office/drawing/2017/model3d" Requires="am3d">${CRLF}`
	xml += `<p:graphicFrame>${CRLF}`
	xml += `  <p:nvGraphicFramePr>${CRLF}`
	xml += `    <p:cNvPr id="${shapeId}" name="${objectName}">${CRLF}`
	xml += `      <a:extLst>${CRLF}`
	xml += `        <a:ext uri="{FF2B5EF4-FFF2-40B4-BE49-F238E27FC236}">${CRLF}`
	xml += `          <a16:creationId xmlns:a16="http://schemas.microsoft.com/office/drawing/2014/main" id="${creationId}"/>${CRLF}`
	xml += `        </a:ext>${CRLF}`
	xml += `      </a:extLst>${CRLF}`
	xml += `    </p:cNvPr>${CRLF}`
	xml += `    <p:cNvGraphicFramePr>${CRLF}`
	xml += `      <a:graphicFrameLocks noChangeAspect="1"/>${CRLF}`
	xml += `    </p:cNvGraphicFramePr>${CRLF}`
	xml += `    <p:nvPr>${CRLF}`
	xml += `      <p:extLst>${CRLF}`
	xml += `        <p:ext uri="{D42A27DB-BD31-4B8C-83A1-F6EECF244321}">${CRLF}`
	xml += `          <p14:modId xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" val="${Math.floor(Math.random() * 4294967295)}"/>${CRLF}`
	xml += `        </p:ext>${CRLF}`
	xml += `      </p:extLst>${CRLF}`
	xml += `    </p:nvPr>${CRLF}`
	xml += `  </p:nvGraphicFramePr>${CRLF}`

	// Transform (position and size)
	xml += `  <p:xfrm>${CRLF}`
	xml += `    <a:off x="${x}" y="${y}"/>${CRLF}`
	xml += `    <a:ext cx="${cx}" cy="${cy}"/>${CRLF}`
	xml += `  </p:xfrm>${CRLF}`

	// Graphic data with model3d
	xml += `  <a:graphic>${CRLF}`
	xml += `    <a:graphicData uri="http://schemas.microsoft.com/office/drawing/2017/model3d">${CRLF}`

	// Check if raw passthrough XML is provided
	if (options._model3dXml) {
		// Use raw passthrough XML but replace original rIds with generated rIds.
		// The _model3dXml was extracted from the original PPTX and contains original rId values
		// (like "rId2", "rId5") which need to be mapped to the new rIds in this generated PPTX.
		// IMPORTANT: Use placeholders to avoid cascading replacements where the GLB rId replacement
		// produces a string that then matches the raster rId pattern (e.g. rId2->rId3, then rId3->rId4
		// would incorrectly replace the already-substituted GLB rId a second time).
		let model3dXml = options._model3dXml
		const GLB_PLACEHOLDER = '__GLB_RID_PLACEHOLDER__'
		const RASTER_PLACEHOLDER = '__RASTER_RID_PLACEHOLDER__'
		// Step 1: Replace original rIds with placeholders
		if (options._originalGlbRid) {
			model3dXml = model3dXml.replace(new RegExp(`r:embed="${options._originalGlbRid}"`, 'g'), `r:embed="${GLB_PLACEHOLDER}"`)
		}
		if (options._originalRasterRid && rasterRid) {
			model3dXml = model3dXml.replace(new RegExp(`r:embed="${options._originalRasterRid}"`, 'g'), `r:embed="${RASTER_PLACEHOLDER}"`)
		}
		// Step 2: Replace placeholders with final rIds
		model3dXml = model3dXml.replace(new RegExp(`r:embed="${GLB_PLACEHOLDER}"`, 'g'), `r:embed="${glbRid}"`)
		if (rasterRid) model3dXml = model3dXml.replace(new RegExp(`r:embed="${RASTER_PLACEHOLDER}"`, 'g'), `r:embed="${rasterRid}"`)
		// Step 3: Only strip mc namespace which is declared at slide root level by the library.
		// IMPORTANT: Do NOT strip xmlns:a16, xmlns:a14, xmlns:p14, xmlns:p159 from model3d XML.
		// PowerPoint requires these namespace declarations LOCAL to the elements that use them
		// (e.g. a16:creationId, p14:modId) even if also declared at the slide root.
		// Stripping them causes 0x80070570 corruption errors.
		model3dXml = model3dXml.replace(/ xmlns:mc="[^"]*"/g, '')
		model3dXml = model3dXml.replace(/ xmlns:am3d="[^"]*"/g, '')
		xml += model3dXml
	} else {
		// Generate model3d element
		xml += genModel3DElement(glbRid, rasterRid, cx, cy, options)
	}

	xml += `    </a:graphicData>${CRLF}`
	xml += `  </a:graphic>${CRLF}`
	xml += `</p:graphicFrame>${CRLF}`
	xml += `  </mc:Choice>${CRLF}`

	if (hasRasterFallback && rasterRid) {
		xml += `  <mc:Fallback>${CRLF}`
		xml += genFallbackPic(shapeId, objectName, creationId, rasterRid, x, y, cx, cy, options)
		xml += `  </mc:Fallback>${CRLF}`
	}
	xml += `</mc:AlternateContent>${CRLF}`

	return xml
}

/**
 * Generate the am3d:model3d element
 */
function genModel3DElement(glbRid: string, rasterRid: string | undefined, cx: number, cy: number, options: Model3DProps): string {
	let xml = ''

	xml += `          <am3d:model3d r:embed="${glbRid}">${CRLF}`

	// Shape properties
	xml += `            <am3d:spPr>${CRLF}`
	xml += `              <a:xfrm>${CRLF}`
	xml += `                <a:off x="0" y="0"/>${CRLF}`
	xml += `                <a:ext cx="${cx}" cy="${cy}"/>${CRLF}`
	xml += `              </a:xfrm>${CRLF}`
	xml += `              <a:prstGeom prst="rect">${CRLF}`
	xml += `                <a:avLst/>${CRLF}`
	xml += `              </a:prstGeom>${CRLF}`

	// Effects: use raw passthrough if provided, otherwise fall back to shadow
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	if ((options as any)._rawModel3dEffectLstXml) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		xml += `              ${(options as any)._rawModel3dEffectLstXml}${CRLF}`
	} else if (options.shadow) {
		xml += `              <a:effectLst>${CRLF}`
		xml += `                ` + createShadowElement(options.shadow) + CRLF
		// Add reflection if specified
		xml += `                <a:reflection blurRad="6350" stA="50000" endA="300" endPos="55000" dir="5400000" sy="-100000" algn="bl" rotWithShape="0"/>${CRLF}`
		xml += `              </a:effectLst>${CRLF}`
	}

	xml += `            </am3d:spPr>${CRLF}`

	// Camera
	const camera = asRecord(options.camera)
	const cameraPos = normalizePoint(camera.pos, DEFAULT_CAMERA_POS)
	const fov = normalizeFov(camera.fov)
	xml += `            <am3d:camera>${CRLF}`
	xml += `              <am3d:pos x="${cameraPos.x}" y="${cameraPos.y}" z="${cameraPos.z}"/>${CRLF}`
	xml += `              <am3d:up dx="0" dy="36000000" dz="0"/>${CRLF}`
	xml += `              <am3d:lookAt x="0" y="0" z="0"/>${CRLF}`
	xml += `              <am3d:perspective fov="${fov}"/>${CRLF}`
	xml += `            </am3d:camera>${CRLF}`

	// Transform
	const trans = asRecord(options.trans)
	const meterPerModelUnit = normalizeRational(trans.meterPerModelUnit, DEFAULT_METER_PER_MODEL_UNIT)
	const preTrans = normalizeVector(trans.preTrans, DEFAULT_PRE_TRANS)
	const scale = normalizeScale(trans.scale)
	const rot = normalizeRot(trans.rot)
	const postTrans = normalizeVector(trans.postTrans, DEFAULT_POST_TRANS)

	xml += `            <am3d:trans>${CRLF}`
	xml += `              <am3d:meterPerModelUnit n="${meterPerModelUnit.n}" d="${meterPerModelUnit.d}"/>${CRLF}`
	xml += `              <am3d:preTrans dx="${preTrans.dx}" dy="${preTrans.dy}" dz="${preTrans.dz}"/>${CRLF}`
	xml += `              <am3d:scale>${CRLF}`
	xml += `                <am3d:sx n="${scale.sx}" d="1000000"/>${CRLF}`
	xml += `                <am3d:sy n="${scale.sy}" d="1000000"/>${CRLF}`
	xml += `                <am3d:sz n="${scale.sz}" d="1000000"/>${CRLF}`
	xml += `              </am3d:scale>${CRLF}`
	const rotAttrs = [
		rot.ax !== undefined ? `ax="${rot.ax}"` : '',
		rot.ay !== undefined ? `ay="${rot.ay}"` : '',
		rot.az !== undefined ? `az="${rot.az}"` : '',
	].filter(Boolean).join(' ')
	if (rotAttrs) xml += `              <am3d:rot ${rotAttrs}/>${CRLF}`
	xml += `              <am3d:postTrans dx="${postTrans.dx}" dy="${postTrans.dy}" dz="${postTrans.dz}"/>${CRLF}`
	xml += `            </am3d:trans>${CRLF}`

	if (rasterRid) {
		xml += `            <am3d:raster rName="Office3DRenderer" rVer="16.0.8326">${CRLF}`
		xml += `              <am3d:blip r:embed="${rasterRid}"/>${CRLF}`
		xml += `            </am3d:raster>${CRLF}`
	}

	// Viewport
	const objViewport = roundedNumber(options.objViewport, 2867650)
	xml += `            <am3d:objViewport viewportSz="${objViewport}"/>${CRLF}`

	// Ambient light
	const ambientLight = asRecord(options.ambientLight)
	const ambientColor = normalizeScrgbColor(ambientLight.color, DEFAULT_AMBIENT_COLOR)
	const illuminance = normalizeIlluminance(ambientLight.illuminance, 0.5)
	xml += `            <am3d:ambientLight>${CRLF}`
	xml += `              <am3d:clr>${CRLF}`
	xml += `                <a:scrgbClr r="${ambientColor.r}" g="${ambientColor.g}" b="${ambientColor.b}"/>${CRLF}`
	xml += `              </am3d:clr>${CRLF}`
	xml += `              <am3d:illuminance n="${Math.round(illuminance * 1000000)}" d="1000000"/>${CRLF}`
	xml += `            </am3d:ambientLight>${CRLF}`

	// Point lights
	const ptLights = normalizePointLights(options.ptLights)

	ptLights.forEach(light => {
		xml += `            <am3d:ptLight rad="0">${CRLF}`
		xml += `              <am3d:clr>${CRLF}`
		xml += `                <a:scrgbClr r="${light.color.r}" g="${light.color.g}" b="${light.color.b}"/>${CRLF}`
		xml += `              </am3d:clr>${CRLF}`
		xml += `              <am3d:intensity n="${Math.round(light.intensity * 1000000)}" d="1000000"/>${CRLF}`
		xml += `              <am3d:pos x="${light.pos.x}" y="${light.pos.y}" z="${light.pos.z}"/>${CRLF}`
		xml += `            </am3d:ptLight>${CRLF}`
	})

	xml += `          </am3d:model3d>${CRLF}`

	return xml
}

/**
 * Generate fallback p:pic element for non-model3d-capable viewers
 */
function genFallbackPic(
	shapeId: number,
	objectName: string,
	creationId: string,
	rasterRid: string,
	x: number,
	y: number,
	cx: number,
	cy: number,
	options: Model3DProps
): string {
	let xml = ''

	xml += `    <p:pic>${CRLF}`
	xml += `      <p:nvPicPr>${CRLF}`
	xml += `        <p:cNvPr id="${shapeId}" name="${objectName}">${CRLF}`
	xml += `          <a:extLst>${CRLF}`
	xml += `            <a:ext uri="{FF2B5EF4-FFF2-40B4-BE49-F238E27FC236}">${CRLF}`
	xml += `              <a16:creationId xmlns:a16="http://schemas.microsoft.com/office/drawing/2014/main" id="${creationId}"/>${CRLF}`
	xml += `            </a:ext>${CRLF}`
	xml += `          </a:extLst>${CRLF}`
	xml += `        </p:cNvPr>${CRLF}`
	xml += `        <p:cNvPicPr>${CRLF}`
	xml += `          <a:picLocks noGrp="1" noRot="1" noChangeAspect="1" noMove="1" noResize="1" noEditPoints="1" noAdjustHandles="1" noChangeArrowheads="1" noChangeShapeType="1" noCrop="1"/>${CRLF}`
	xml += `        </p:cNvPicPr>${CRLF}`

	xml += `        <p:nvPr/>${CRLF}`
	xml += `      </p:nvPicPr>${CRLF}`

	// Blip fill with raster image
	xml += `      <p:blipFill>${CRLF}`
	xml += `        <a:blip r:embed="${rasterRid}"/>${CRLF}`
	xml += `        <a:stretch>${CRLF}`
	xml += `          <a:fillRect/>${CRLF}`
	xml += `        </a:stretch>${CRLF}`
	xml += `      </p:blipFill>${CRLF}`

	// Shape properties
	const fallbackTransformAttrs = [
		options.flipH ? 'flipH="1"' : '',
		(options as any).flipV ? 'flipV="1"' : '',
		options.rotate ? `rot="${convertRotationDegrees(options.rotate)}"` : '',
	].filter(Boolean).join(' ')
	xml += `      <p:spPr>${CRLF}`
	xml += `        <a:xfrm${fallbackTransformAttrs ? ` ${fallbackTransformAttrs}` : ''}>${CRLF}`
	xml += `          <a:off x="${x}" y="${y}"/>${CRLF}`
	xml += `          <a:ext cx="${cx}" cy="${cy}"/>${CRLF}`
	xml += `        </a:xfrm>${CRLF}`
	xml += `        <a:prstGeom prst="rect">${CRLF}`
	xml += `          <a:avLst/>${CRLF}`
	xml += `        </a:prstGeom>${CRLF}`

	// Effects: use raw passthrough if provided, otherwise fall back to shadow
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	if ((options as any)._rawFallbackEffectLstXml) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		xml += `        ${(options as any)._rawFallbackEffectLstXml}${CRLF}`
	} else if (options.shadow) {
		xml += `        <a:effectLst>${CRLF}`
		xml += `          ` + createShadowElement(options.shadow) + CRLF
		xml += `          <a:reflection blurRad="6350" stA="50000" endA="300" endPos="55000" dir="5400000" sy="-100000" algn="bl" rotWithShape="0"/>${CRLF}`
		xml += `        </a:effectLst>${CRLF}`
	}
	// scene3d / sp3d from fallback pic spPr
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	if ((options as any)._rawFallbackSpPrScene3dXml) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		xml += `        ${(options as any)._rawFallbackSpPrScene3dXml}${CRLF}`
	}

	xml += `      </p:spPr>${CRLF}`
	xml += `    </p:pic>${CRLF}`

	return xml
}

/**
 * Generate a pseudo-random GUID for creationId
 */
function generateGUID(): string {
	const s4 = () =>
		Math.floor((1 + Math.random()) * 0x10000)
			.toString(16)
			.toUpperCase()
			.substring(1)
	return `${s4()}${s4()}-${s4()}-${s4()}-${s4()}-${s4()}${s4()}${s4()}`
}
