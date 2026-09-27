// Saved-package proof for the AI-authored selection manifest.
//
// Public results contain semantic IDs and pass/fail evidence only.  Native XML,
// package paths, reference hashes, and implementation details remain private.

import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { pathToFileURL } from 'node:url'
import JSZip from 'jszip'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'

import { applyNativeStylePreset, nativeStylePresetById } from '../native-style-presets.mjs'
import { applyShapeEffectPresets, applyTextEffectPresets } from '../native-effect-presets.mjs'
import { pictureStylePresetById } from '../picture-style-presets.mjs'
import { model3dViewPresetById } from '../model3d-view-presets.mjs'
import {
	applyConnectorStylePreset,
	applyEquationGalleryPreset,
	resolveTransitionPreset,
	sourceApiGalleryPresetById,
} from '../source-api-gallery-presets.mjs'

const serializer = new XMLSerializer()

function stable(value) {
	if (Array.isArray(value)) return value.map(stable)
	if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]))
	return value
}

const stableJson = value => JSON.stringify(stable(value))
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')

function parseXml(xml) {
	const document = new DOMParser().parseFromString(xml, 'application/xml')
	if (document.getElementsByTagName('parsererror').length) throw new Error('Saved package contains invalid XML in a selected object part.')
	return document
}

function directChildren(node) {
	const result = []
	for (let child = node?.firstChild; child; child = child.nextSibling) if (child.nodeType === 1) result.push(child)
	return result
}

function directChild(node, names) {
	const accepted = new Set(Array.isArray(names) ? names : [names])
	return directChildren(node).find(child => accepted.has(child.nodeName) || accepted.has(child.localName)) || null
}

function serialize(node) { return node ? serializer.serializeToString(node) : '' }

function normalizeXml(xml) {
	if (!xml) return ''
	return serializer.serializeToString(parseXml(xml).documentElement)
}

function parseFragmentChildren(xml) {
	if (!xml) return []
	const document = parseXml(`<root xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">${xml}</root>`)
	return directChildren(document.documentElement).map(node => ({ tag: node.nodeName, xml: serialize(node) }))
}

function findNamedOwner(document, objectName) {
	for (const node of Array.from(document.getElementsByTagName('p:cNvPr'))) {
		const name = node.getAttribute('name') || ''
		if (name !== objectName) continue
		let current = node
		while (current && !['p:sp', 'p:pic', 'p:cxnSp', 'p:graphicFrame'].includes(current.nodeName)) current = current.parentNode
		if (current) return current
	}
	return null
}

function descendantsByLocalName(node, localName) {
	const result = []
	for (const element of Array.from(node?.getElementsByTagName('*') || [])) if (element.localName === localName) result.push(element)
	return result
}

function expectedOwnerKind(capability) {
	return {
		chart: 'graphicFrame', table: 'graphicFrame', smartart: 'graphicFrame',
		wordart: 'sp', shape: 'sp', picture: 'pic', model3d: 'graphicFrame',
		connector: 'cxnSp', equation: 'sp',
	}[capability] || null
}

function ownerKind(owner) { return String(owner?.localName || owner?.nodeName || '').split(':').pop() }

const CHART_TYPE_LOCAL_NAMES = Object.freeze({
	bar: 'barChart',
	bar3D: 'bar3DChart',
	line: 'lineChart',
	line3D: 'line3DChart',
	pie: 'pieChart',
	pie3D: 'pie3DChart',
	doughnut: 'doughnutChart',
	area: 'areaChart',
	area3D: 'area3DChart',
	scatter: 'scatterChart',
	bubble: 'bubbleChart',
	bubble3D: 'bubbleChart',
	radar: 'radarChart',
	ofPie: 'ofPieChart',
	stock: 'stockChart',
	surface: 'surfaceChart',
})

function nativeStructurePresent(capability, owner) {
	if (!owner) return false
	if (ownerKind(owner) !== expectedOwnerKind(capability)) return false
	if (capability === 'chart') return descendantsByLocalName(owner, 'chart').length > 0
	if (capability === 'table') return descendantsByLocalName(owner, 'tbl').length > 0
	if (capability === 'smartart') return descendantsByLocalName(owner, 'relIds').length > 0
	if (capability === 'model3d') return descendantsByLocalName(owner, 'model3d').length > 0
	if (capability === 'equation') return descendantsByLocalName(owner, 'oMath').length > 0 || descendantsByLocalName(owner, 'oMathPara').length > 0
	return true
}

function attributeMap(node, excluded = []) {
	const out = {}
	const blocked = new Set(excluded)
	for (let index = 0; index < (node?.attributes?.length || 0); index += 1) {
		const attribute = node.attributes.item(index)
		if (!blocked.has(attribute.name)) out[attribute.name] = attribute.value
	}
	return out
}

function canonicalShape(shape) {
	const spPr = directChild(shape, 'p:spPr')
	if (!spPr) return null
	const fill = directChild(spPr, ['a:noFill', 'a:solidFill', 'a:gradFill', 'a:pattFill', 'a:grpFill', 'a:blipFill'])
	const line = directChild(spPr, 'a:ln')
	const effect = directChild(spPr, ['a:effectLst', 'a:effectDag'])
	const scene = directChildren(spPr).filter(node => ['a:scene3d', 'a:sp3d'].includes(node.nodeName)).map(serialize).join('')
	const extLst = directChild(spPr, 'a:extLst')
	const style = directChild(shape, 'p:style')
	return {
		fill: normalizeXml(serialize(fill)), line: normalizeXml(serialize(line)),
		effect: normalizeXml(serialize(effect)), scene3d: scene,
		extLst: normalizeXml(serialize(extLst)), style: normalizeXml(serialize(style)),
	}
}

function canonicalWordArt(shape) {
	const runProps = Array.from(shape?.getElementsByTagName('a:rPr') || [])[0]
	if (!runProps) return null
	return {
		attributes: Object.fromEntries(Object.entries(attributeMap(runProps, ['lang', 'sz', 'dirty'])).sort(([left], [right]) => left.localeCompare(right))),
		children: directChildren(runProps).map(node => normalizeXml(serialize(node))),
	}
}

function canonicalWordArtRecipe(recipe, { excludeEffects = false } = {}) {
	const attributes = {}
	// A captured null means that PowerPoint omitted the attribute. Treating it as
	// the literal string "null" makes otherwise exact non-bold WordArt fail only
	// when an independent Text Effect is composed and the verifier compares the
	// non-effect portion of the style.
	if (recipe?._rPrB !== undefined && recipe._rPrB !== null) attributes.b = String(recipe._rPrB)
	if (recipe?._rPrSpc !== undefined && recipe._rPrSpc !== null) attributes.spc = String(recipe._rPrSpc)
	const children = parseFragmentChildren(recipe?._rawRprChildXmlExact)
		.filter(part => !excludeEffects || (part.tag !== 'a:effectLst' && part.tag !== 'a:effectDag'))
		.map(part => normalizeXml(part.xml))
	return { attributes: Object.fromEntries(Object.entries(attributes).sort(([left], [right]) => left.localeCompare(right))), children }
}

function canonicalPicture(picture) {
	const spPr = directChild(picture, 'p:spPr')
	if (!spPr) return null
	const xfrm = directChild(spPr, 'a:xfrm')
	const rawRotation = Number(xfrm?.getAttribute('rot'))
	return {
		geometry: serialize(directChild(spPr, ['a:prstGeom', 'a:custGeom'])),
		fill: serialize(directChild(spPr, ['a:noFill', 'a:solidFill', 'a:gradFill', 'a:pattFill', 'a:grpFill', 'a:blipFill'])),
		line: serialize(directChild(spPr, 'a:ln')),
		effect: serialize(directChild(spPr, ['a:effectLst', 'a:effectDag'])),
		scene3d: directChildren(spPr).filter(node => ['a:scene3d', 'a:sp3d'].includes(node.nodeName)).map(serialize).join(''),
		extLst: serialize(directChild(spPr, 'a:extLst')),
		rotate: Number.isFinite(rawRotation) && rawRotation !== 0 ? rawRotation / 60000 : null,
		flipH: xfrm?.getAttribute('flipH') === '1', flipV: xfrm?.getAttribute('flipV') === '1',
	}
}

function requiredChild(node, localName) {
	const result = directChildren(node).find(item => item.localName === localName)
	if (!result) throw new Error(`Native 3D selection is missing ${localName}.`)
	return result
}

function numberAttr(node, name) {
	const value = Number(node?.getAttribute(name))
	if (!Number.isFinite(value)) throw new Error(`Native 3D selection has an invalid ${name} value.`)
	return value
}

function point(node, names) { return Object.fromEntries(names.map(name => [name, numberAttr(node, name)])) }
function rational(node) { return { n: numberAttr(node, 'n'), d: numberAttr(node, 'd') } }

function canonicalModel3dView(model) {
	const camera = requiredChild(model, 'camera')
	const trans = requiredChild(model, 'trans')
	const scaleNode = requiredChild(trans, 'scale')
	const rotNode = requiredChild(trans, 'rot')
	const ambient = requiredChild(model, 'ambientLight')
	const ambientColor = requiredChild(requiredChild(ambient, 'clr'), 'scrgbClr')
	const ptLights = directChildren(model).filter(node => node.localName === 'ptLight').map(node => ({
		color: point(requiredChild(requiredChild(node, 'clr'), 'scrgbClr'), ['r', 'g', 'b']),
		intensity: (() => { const value = rational(requiredChild(node, 'intensity')); return value.n / value.d })(),
		pos: point(requiredChild(node, 'pos'), ['x', 'y', 'z']),
	}))
	const rot = {}
	for (const axis of ['ax', 'ay', 'az']) if (rotNode.hasAttribute(axis)) rot[axis] = numberAttr(rotNode, axis)
	const ambientIlluminance = rational(requiredChild(ambient, 'illuminance'))
	return {
		camera: { pos: point(requiredChild(camera, 'pos'), ['x', 'y', 'z']), fov: numberAttr(requiredChild(camera, 'perspective'), 'fov') },
		trans: {
			meterPerModelUnit: rational(requiredChild(trans, 'meterPerModelUnit')),
			preTrans: point(requiredChild(trans, 'preTrans'), ['dx', 'dy', 'dz']),
			scale: { sx: numberAttr(requiredChild(scaleNode, 'sx'), 'n'), sy: numberAttr(requiredChild(scaleNode, 'sy'), 'n'), sz: numberAttr(requiredChild(scaleNode, 'sz'), 'n') },
			rot,
			postTrans: point(requiredChild(trans, 'postTrans'), ['dx', 'dy', 'dz']),
		},
		objViewport: numberAttr(requiredChild(model, 'objViewport'), 'viewportSz'),
		ambientLight: { color: point(ambientColor, ['r', 'g', 'b']), illuminance: ambientIlluminance.n / ambientIlluminance.d },
		ptLights,
	}
}

function portableModel3dView(value) {
	const clone = structuredClone(value)
	if (clone?.trans) {
		delete clone.trans.meterPerModelUnit
		delete clone.trans.preTrans
	}
	// Viewport is asset framing, not part of the portable Ribbon viewpoint. The
	// saved model must be free to use its own geometry-aware viewport while the
	// requested camera/orientation/lighting still match exactly.
	delete clone.objViewport
	return clone
}

function relationshipTarget(relsDocument, id, sourcePart) {
	const relationship = Array.from(relsDocument.getElementsByTagName('Relationship')).find(item => item.getAttribute('Id') === id)
	if (!relationship) return null
	const target = relationship.getAttribute('Target')
	if (!target || relationship.getAttribute('TargetMode') === 'External') return null
	return path.posix.normalize(path.posix.join(path.posix.dirname(sourcePart), target))
}

function relationshipTargetByType(relsDocument, typeSuffix, sourcePart) {
	const relationship = Array.from(relsDocument?.getElementsByTagName('Relationship') || [])
		.find(item => String(item.getAttribute('Type') || '').endsWith(typeSuffix))
	if (!relationship || relationship.getAttribute('TargetMode') === 'External') return null
	const target = relationship.getAttribute('Target')
	return target ? path.posix.normalize(path.posix.join(path.posix.dirname(sourcePart), target)) : null
}

async function xmlFromZip(zip, partName) {
	const file = zip.file(partName)
	if (!file) return null
	return parseXml(await file.async('string'))
}

async function xmlTextFromZip(zip, partName) {
	const file = zip.file(partName)
	return file ? file.async('string') : null
}

function relationId(node) {
	if (!node) return null
	return node.getAttribute('r:id') || node.getAttribute('id') || null
}

function transitionMarker(recipe = {}) {
	const type = recipe.type
	if (type === 'none') return null
	if (type === 'morph') return '<p159:morph'
	if (['fallOver', 'drape', 'curtains', 'wind', 'prestige', 'fracture', 'crush', 'peelOff', 'pageCurl', 'airplane', 'origami', 'clock'].includes(type)) return `prst="${type}"`
	const p14 = {
		reveal: '<p14:reveal', flash: '<p14:flash', ripple: '<p14:ripple', honeycomb: '<p14:honeycomb', glitter: '<p14:glitter',
		vortex: '<p14:vortex', shred: '<p14:shred', switch: '<p14:switch', flip: '<p14:flip', gallery: '<p14:gallery', cube: '<p14:prism/>',
		doors: '<p14:doors', box: '<p14:prism isInverted="1"', zoom: '<p:zoom', pan: '<p14:pan', ferrisWheel: '<p14:ferris', conveyor: '<p14:conveyor',
		rotate: '<p14:prism isContent="1"', window: '<p14:window', orbit: '<p14:prism isContent="1" isInverted="1"', flyThrough: '<p14:flythrough',
	}
	if (p14[type]) return p14[type]
	const standard = { randomBar: '<p:randomBar', shape: '<p:circle', uncover: '<p:pull', checkerboard: '<p:checker' }
	return standard[type] || `<p:${type}`
}

async function verifySlideLayoutSelectors(zip, slidePart, selectors) {
	const relsPart = path.posix.join(path.posix.dirname(slidePart), '_rels', `${path.posix.basename(slidePart)}.rels`)
	const rels = await xmlFromZip(zip, relsPart)
	const layoutPart = relationshipTargetByType(rels, '/slideLayout', slidePart)
	const layoutDocument = layoutPart ? await xmlFromZip(zip, layoutPart) : null
	const actualName = Array.from(layoutDocument?.getElementsByTagName('p:cSld') || [])[0]?.getAttribute('name') || null
	const failed = []
	const verifiedSelectors = []
	if (selectors.layoutPresetId !== undefined) {
		const preset = sourceApiGalleryPresetById(selectors.layoutPresetId)
		const expectedName = preset?.recipe?.layoutName || null
		if (!expectedName || actualName !== expectedName) failed.push('layoutPresetId')
		else verifiedSelectors.push('layoutPresetId')
	}
	if (selectors.layoutName !== undefined) {
		if (actualName !== String(selectors.layoutName)) failed.push('layoutName')
		else verifiedSelectors.push('layoutName')
	}
	if (!layoutDocument) failed.push('native-slide-layout')
	return { ok: failed.length === 0, failed, verifiedSelectors, verification: 'exact-native-slide-layout' }
}

async function verifyTransitionSelectors(zip, slidePart, selectors) {
	const xml = await xmlTextFromZip(zip, slidePart)
	const key = selectors.transitionPresetId !== undefined ? 'transitionPresetId' : selectors.presetId !== undefined ? 'presetId' : null
	if (!xml || !key) return { ok: Boolean(xml), failed: xml ? [] : ['native-slide'], verifiedSelectors: [], verification: 'native-transition-structure' }
	let recipe = null
	try { recipe = resolveTransitionPreset({ transitionPresetId: selectors[key] }) } catch {}
	const marker = recipe ? transitionMarker(recipe) : undefined
	const matched = recipe && (marker ? xml.includes(marker) : !xml.includes('<p:transition'))
	return { ok: Boolean(matched), failed: matched ? [] : [key], verifiedSelectors: matched ? [key] : [], verification: 'exact-native-transition' }
}

async function verifySmartArtSelectors(zip, slidePart, owner, selectors) {
	const relIds = descendantsByLocalName(owner, 'relIds')[0]
	if (!relIds) return { ok: false, failed: ['native-smartart-relations'], verifiedSelectors: [] }
	const relsPart = path.posix.join(path.posix.dirname(slidePart), '_rels', `${path.posix.basename(slidePart)}.rels`)
	const rels = await xmlFromZip(zip, relsPart)
	const checks = [
		['layoutId', 'r:lo'], ['quickStyleId', 'r:qs'], ['colorStyleId', 'r:cs'],
	].filter(([key]) => selectors[key] !== undefined)
	const failed = []
	const verifiedSelectors = []
	for (const [key, relationAttribute] of checks) {
		const target = relationshipTarget(rels, relIds.getAttribute(relationAttribute), slidePart)
		const document = target ? await xmlFromZip(zip, target) : null
		const actual = document?.documentElement?.getAttribute('uniqueId') || null
		if (String(actual) !== String(selectors[key])) failed.push(key)
		else verifiedSelectors.push(key)
	}
	return { ok: failed.length === 0, failed, verifiedSelectors, verification: checks.length ? 'exact-native-ids' : 'native-structure' }
}

async function verifyTableSelectors(owner, selectors, resolveTableStylePreset) {
	const requested = selectors.tableStylePresetId || selectors.tableStyleId
	if (!requested) return { ok: true, failed: [], verifiedSelectors: [], verification: 'native-structure' }
	const expected = selectors.tableStylePresetId ? resolveTableStylePreset?.(selectors.tableStylePresetId)?.nativeId : selectors.tableStyleId
	const actual = descendantsByLocalName(owner, 'tableStyleId')[0]?.textContent?.trim() || descendantsByLocalName(owner, 'tblStyleId')[0]?.textContent?.trim() || null
	const key = selectors.tableStylePresetId ? 'tableStylePresetId' : 'tableStyleId'
	const matched = Boolean(expected) && String(actual).toUpperCase() === String(expected).toUpperCase()
	return { ok: matched, failed: matched ? [] : [key], verifiedSelectors: matched ? [key] : [], verification: 'exact-native-id' }
}

async function verifyChartSelectors(zip, slidePart, owner, selectors, chartType, resolveChartPlan, chartGallery) {
	const chartNode = descendantsByLocalName(owner, 'chart')[0]
	const relsPart = path.posix.join(path.posix.dirname(slidePart), '_rels', `${path.posix.basename(slidePart)}.rels`)
	const rels = await xmlFromZip(zip, relsPart)
	const chartPart = relationshipTarget(rels, relationId(chartNode), slidePart)
	const chartXml = chartPart ? await xmlTextFromZip(zip, chartPart) : null
	const chartDocument = chartXml ? parseXml(chartXml) : null
	if (!chartDocument) return { ok: false, failed: ['native-chart-part'], verifiedSelectors: [], verification: 'native-structure' }
	let expected = { ...selectors }
	if (resolveChartPlan && Object.keys(selectors).some(key => /PresetId|GalleryVariant/.test(key))) {
		try { expected = { ...expected, ...(await resolveChartPlan({ ...(chartType ? { chartType } : {}), ...selectors })).plan } } catch { /* operation compilation already owns the public error */ }
	}
	const variant = expected.chartGalleryVariant != null ? chartGallery?.variants?.[Number(expected.chartGalleryVariant)] : null
	if (variant) expected = {
		...expected,
		chartStyleId: expected.chartStyleId ?? variant.chartStyleId,
		chartStyleModernId: expected.chartStyleModernId ?? variant.modernStyleId,
		_rawChartStyleXml: expected._rawChartStyleXml ?? variant._rawChartStyleXml,
		_rawChartColorsXml: expected._rawChartColorsXml ?? variant._rawChartColorsXml,
	}
	if (!expected._rawChartColorsXml && Number.isInteger(Number(expected.chartColorStyleId))) {
		expected._rawChartColorsXml = chartGallery?.nativeColorCatalog?.[Number(expected.chartColorStyleId)]
	}
	const legacyStyle = Array.from(chartDocument.getElementsByTagName('c:style'))[0]?.getAttribute('val')
	const modernStyle = Array.from(chartDocument.getElementsByTagName('c14:style'))[0]?.getAttribute('val')
	const failed = []
	const verifiedSelectors = []
	const styleProofAvailable = expected.chartStyleId !== undefined || expected.chartStyleModernId !== undefined
	const styleMatched = styleProofAvailable && (expected.chartStyleId === undefined || Number(legacyStyle) === Number(expected.chartStyleId))
		&& (expected.chartStyleModernId === undefined || Number(modernStyle) === Number(expected.chartStyleModernId))
	if (selectors.chartStyleId !== undefined) (Number(legacyStyle) === Number(expected.chartStyleId) ? verifiedSelectors : failed).push('chartStyleId')
	if (selectors.chartStyleModernId !== undefined) (Number(modernStyle) === Number(expected.chartStyleModernId) ? verifiedSelectors : failed).push('chartStyleModernId')
	if (selectors.chartGalleryVariant !== undefined) (styleMatched ? verifiedSelectors : failed).push('chartGalleryVariant')
	if (selectors.chartStylePresetId !== undefined) (styleMatched ? verifiedSelectors : failed).push('chartStylePresetId')

	const chartRelsPart = path.posix.join(path.posix.dirname(chartPart), '_rels', `${path.posix.basename(chartPart)}.rels`)
	const chartRels = await xmlFromZip(zip, chartRelsPart)
	const stylePart = relationshipTargetByType(chartRels, '/chartStyle', chartPart)
	const colorsPart = relationshipTargetByType(chartRels, '/chartColorStyle', chartPart)
	const actualStyleXml = stylePart ? await xmlTextFromZip(zip, stylePart) : null
	const actualColorsXml = colorsPart ? await xmlTextFromZip(zip, colorsPart) : null
	if (expected._rawChartStyleXml && (!actualStyleXml || normalizeXml(actualStyleXml) !== normalizeXml(expected._rawChartStyleXml))) {
		if (selectors.chartGalleryVariant !== undefined && !failed.includes('chartGalleryVariant')) failed.push('chartGalleryVariant')
		if (selectors.chartStylePresetId !== undefined && !failed.includes('chartStylePresetId')) failed.push('chartStylePresetId')
	}
	const colorsProofAvailable = Boolean(expected._rawChartColorsXml)
	const colorsMatched = colorsProofAvailable && Boolean(actualColorsXml) && normalizeXml(actualColorsXml) === normalizeXml(expected._rawChartColorsXml)
	if (selectors.chartColorStyleId !== undefined) (colorsMatched ? verifiedSelectors : failed).push('chartColorStyleId')
	if (selectors.chartGalleryVariant !== undefined && expected._rawChartColorsXml && !colorsMatched) failed.push('chartGalleryVariant')
	if (selectors.chartStylePresetId !== undefined && expected._rawChartColorsXml && !colorsMatched) failed.push('chartStylePresetId')

	if (selectors.chartGalleryTilePresetId !== undefined) {
		const proofAvailable = Boolean(expected._rawChartXml || expected._rawChartColorsXml || expected._rawChartStyleXml || styleProofAvailable)
		const rawChartMatched = expected._rawChartXml ? normalizeXml(chartXml) === normalizeXml(expected._rawChartXml) : true
		const tileMatched = proofAvailable && rawChartMatched && (!expected._rawChartColorsXml || colorsMatched) && (!expected._rawChartStyleXml || (actualStyleXml && normalizeXml(actualStyleXml) === normalizeXml(expected._rawChartStyleXml)))
		;(tileMatched ? verifiedSelectors : failed).push('chartGalleryTilePresetId')
	}
	if (selectors.chartPresetId !== undefined) {
		const expectedType = expected.chartType || chartType
		const localName = CHART_TYPE_LOCAL_NAMES[String(expectedType || '')]
		const typeMatched = localName
			? descendantsByLocalName(chartDocument, localName).length > 0
			: descendantsByLocalName(chartDocument, 'plotArea').length > 0
		const actualBarDir = descendantsByLocalName(chartDocument, 'barDir')[0]?.getAttribute('val') || null
		const actualGrouping = descendantsByLocalName(chartDocument, 'grouping')[0]?.getAttribute('val') || null
		const barDirMatched = expected.barDir == null || String(actualBarDir || '') === String(expected.barDir)
		const groupingMatched = expected.barGrouping == null || String(actualGrouping || '') === String(expected.barGrouping)
		;(typeMatched && barDirMatched && groupingMatched ? verifiedSelectors : failed).push('chartPresetId')
	}
	return {
		ok: failed.length === 0,
		failed: [...new Set(failed)],
		verifiedSelectors: [...new Set(verifiedSelectors)].filter(key => !failed.includes(key)),
		verification: expected._rawChartXml ? 'exact-native-chart-package-state' : (expected.chartStyleId !== undefined || expected.chartStyleModernId !== undefined || expected._rawChartColorsXml ? 'exact-native-chart-style-color' : 'native-chart-part'),
	}
}

function expectedEquationTags(template, result = new Set()) {
	if (template == null || typeof template === 'string') { result.add('r'); return result }
	if (Array.isArray(template)) { for (const item of template) expectedEquationTags(item, result); return result }
	const kind = String(template.kind || 'text')
	const tagByKind = {
		text: 'r', fraction: 'f', frac: 'f', superscript: 'sSup', sup: 'sSup', subscript: 'sSub', sub: 'sSub',
		subsup: 'sSubSup', presubsup: 'sPre', preSubSup: 'sPre', radical: 'rad', sqrt: 'rad', nary: 'nary',
		summation: 'nary', sum: 'nary', integral: 'nary', operator: 'nary', bracket: 'd', delimiter: 'd',
		cases: 'd', eqArr: 'eqArr', function: 'func', func: 'func', log: 'func', accent: 'acc', bar: 'bar',
		overbar: 'bar', underbar: 'bar', box: 'borderBox', boxed: 'borderBox', limit: 'limLow', limlow: 'limLow',
		limitUpper: 'limUpp', limupp: 'limUpp', groupChar: 'groupChr', groupchr: 'groupChr', matrix: 'm',
	}
	if (tagByKind[kind]) result.add(tagByKind[kind])
	if (kind === 'cases') result.add('eqArr')
	for (const key of ['items', 'children', 'base', 'expression', 'body', 'numerator', 'denominator', 'num', 'den', 'exponent', 'sup', 'subscript', 'sub', 'degree', 'radicand', 'lower', 'upper', 'functionName', 'rows', 'cells']) {
		if (template[key] !== undefined) expectedEquationTags(template[key], result)
	}
	return result
}

function verifyEquationSelectors(owner, selectors) {
	const key = selectors.equationGalleryPresetId !== undefined ? 'equationGalleryPresetId' : selectors.equationPresetId !== undefined ? 'equationPresetId' : null
	if (!key) return { ok: true, failed: [], verifiedSelectors: [], verification: 'native-equation-structure' }
	let source = null
	try { source = applyEquationGalleryPreset({}, selectors[key], {}).options?.source } catch {}
	const missingTags = source ? [...expectedEquationTags(source)].filter(tag => descendantsByLocalName(owner, tag).length === 0) : ['preset']
	const matched = Boolean(source) && missingTags.length === 0
	return { ok: matched, failed: matched ? [] : [key], verifiedSelectors: matched ? [key] : [], verification: 'exact-native-equation-structure' }
}

function verifyConnectorSelectors(owner, selectors) {
	const key = selectors.connectorStylePresetId !== undefined ? 'connectorStylePresetId' : null
	if (!key) return { ok: true, failed: [], verifiedSelectors: [], verification: 'native-connector-structure' }
	let expected = null
	try { expected = applyConnectorStylePreset({}, selectors[key]).options } catch {}
	const spPr = directChild(owner, 'p:spPr')
	const actualLine = normalizeXml(serialize(directChild(spPr, 'a:ln')))
	const actualStyle = normalizeXml(serialize(directChild(owner, 'p:style')))
	const lineMatched = expected?._rawConnectorLineXml === undefined || actualLine === normalizeXml(expected._rawConnectorLineXml)
	const styleMatched = expected?._rawConnectorStyleXml === undefined || actualStyle === normalizeXml(expected._rawConnectorStyleXml)
	const matched = Boolean(expected) && lineMatched && styleMatched
	return { ok: matched, failed: matched ? [] : [key], verifiedSelectors: matched ? [key] : [], verification: 'exact-native-connector-style' }
}

function verifyNativeFeatures(owner, features = []) {
	const all = descendantsByLocalName(owner, '*')
	const names = new Set(Array.from(owner?.getElementsByTagName('*') || []).map(node => node.localName))
	const failed = []
	for (const featureValue of features) {
		const feature = String(featureValue).toLowerCase().replace(/[\s_-]+/g, '')
		if (feature === 'gradient' && !names.has('gradFill')) failed.push(featureValue)
		else if (feature === 'shape3d' && !(names.has('scene3d') && names.has('sp3d'))) failed.push(featureValue)
		else if (feature === 'text3d' && !(names.has('scene3d') && names.has('sp3d'))) failed.push(featureValue)
		else if (feature === 'wordart' && !names.has('prstTxWarp')) failed.push(featureValue)
		else if (feature === 'shadow' && !(names.has('outerShdw') || names.has('innerShdw'))) failed.push(featureValue)
		else if (feature === 'glow' && !names.has('glow')) failed.push(featureValue)
		else if (feature === 'reflection' && !names.has('reflection')) failed.push(featureValue)
		else if (feature === 'softedges' && !names.has('softEdge')) failed.push(featureValue)
	}
	void all
	return failed
}

function verifyExactStyleAndEffects(capability, owner, selectors) {
	const failed = []
	const verifiedSelectors = []
	if (capability === 'shape' && selectors.shapeStylePresetId) {
		const preset = nativeStylePresetById(selectors.shapeStylePresetId)
		const actual = canonicalShape(owner)
		if (!preset || !actual) failed.push('shapeStylePresetId')
		else {
			const recipe = preset.recipe || {}
			if (recipe._rawShapeStyleXml !== undefined && actual.style !== normalizeXml(recipe._rawShapeStyleXml)) failed.push('shapeStylePresetId')
			if (recipe._rawFillXml && actual.fill !== normalizeXml(recipe._rawFillXml)) failed.push('shapeStylePresetId')
			if (recipe._rawLineXml && actual.line !== normalizeXml(recipe._rawLineXml)) failed.push('shapeStylePresetId')
			if (!failed.includes('shapeStylePresetId')) verifiedSelectors.push('shapeStylePresetId')
		}
	}
	if (capability === 'wordart' && selectors.wordArtStylePresetId) {
		const preset = nativeStylePresetById(selectors.wordArtStylePresetId)
		const actual = canonicalWordArt(owner)
		const hasEffectOverride = Boolean(selectors.textEffectPresetId || selectors.textEffectPresetIds)
		const matched = !hasEffectOverride
			? Boolean(preset && actual && sha256(stableJson(actual)) === preset.canonicalPayloadHash)
			: Boolean(preset && actual && stableJson({ ...actual, children: actual.children.filter(xml => !xml.includes('<a:effectLst') && !xml.includes('<a:effectDag')) }) === stableJson(canonicalWordArtRecipe(preset.recipe, { excludeEffects: true })))
		if (!matched) failed.push('wordArtStylePresetId')
		else verifiedSelectors.push('wordArtStylePresetId')
	}
	const shapeEffects = selectors.shapeEffectPresetIds || selectors.shapeEffectPresetId
	if (capability === 'shape' && shapeEffects) {
		const key = selectors.shapeEffectPresetIds ? 'shapeEffectPresetIds' : 'shapeEffectPresetId'
		const expected = applyShapeEffectPresets(applyNativeStylePreset({}, selectors.shapeStylePresetId).style, shapeEffects).style
		const actual = canonicalShape(owner)
		if (expected._rawEffectLstXml !== undefined && actual?.effect !== normalizeXml(expected._rawEffectLstXml)) failed.push(key)
		if (expected._rawSpPrScene3dXml !== undefined && normalizeXml(`<root xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">${actual?.scene3d || ''}</root>`) !== normalizeXml(`<root xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">${expected._rawSpPrScene3dXml || ''}</root>`)) failed.push(key)
		if (!failed.includes(key)) verifiedSelectors.push(key)
	}
	const textEffects = selectors.textEffectPresetIds || selectors.textEffectPresetId
	if (capability === 'wordart' && textEffects) {
		const key = selectors.textEffectPresetIds ? 'textEffectPresetIds' : 'textEffectPresetId'
		const expected = applyTextEffectPresets(applyNativeStylePreset({}, selectors.wordArtStylePresetId).style, textEffects).style
		const runProps = Array.from(owner?.getElementsByTagName('a:rPr') || [])[0]
		const actualEffect = normalizeXml(serialize(directChild(runProps, ['a:effectLst', 'a:effectDag'])))
		if (expected._rawRprEffectXmlExact !== undefined && actualEffect !== normalizeXml(expected._rawRprEffectXmlExact)) failed.push(key)
		if (!failed.includes(key)) verifiedSelectors.push(key)
	}
	if (capability === 'wordart' && selectors.transform !== undefined) {
		const actual = descendantsByLocalName(owner, 'prstTxWarp')[0]?.getAttribute('prst') || null
		if (String(actual) === String(selectors.transform)) verifiedSelectors.push('transform')
		else failed.push('transform')
	}
	for (const key of ['text3D', 'effect3D']) {
		if (selectors[key] === undefined) continue
		const names = new Set(Array.from(owner?.getElementsByTagName('*') || []).map(node => node.localName))
		if (names.has('scene3d') && names.has('sp3d')) verifiedSelectors.push(key)
		else failed.push(key)
	}
	return { failed: [...new Set(failed)], verifiedSelectors: [...new Set(verifiedSelectors)].filter(key => !failed.includes(key)) }
}

async function optionalRuntimeModules(rootDir) {
	const chartFile = path.resolve(rootDir, 'dist/node/pptx-mcp/chart-plan.js')
	const chartGalleryFile = path.resolve(rootDir, 'dist/node/chart-gallery.js')
	const tableFile = path.resolve(rootDir, 'dist/node/pptx-mcp/table-presets.js')
	let resolveChartPlan = null
	let chartGallery = null
	let resolveTableStylePreset = null
	try {
		const module = await import(pathToFileURL(chartFile).href)
		resolveChartPlan = request => module.resolveChartPlan(request, rootDir)
	} catch {}
	try { chartGallery = (await import(pathToFileURL(chartGalleryFile).href)).CHART_GALLERY || null } catch {}
	try { resolveTableStylePreset = (await import(pathToFileURL(tableFile).href)).resolveTableStylePreset } catch {}
	return { resolveChartPlan, chartGallery, resolveTableStylePreset }
}

/**
 * Verify every compiled native selection against the saved PPTX package.
 * Required manifests fail closed; advisory manifests report without blocking.
 */
export async function verifySelectionManifestInPackage(filePath, manifestReadback, options = {}) {
	if (!manifestReadback || !Array.isArray(manifestReadback.selections) || !manifestReadback.selections.length) {
		return { schemaVersion: 'betterpptx.selection-package-verification.v1', ok: true, status: 'NOT_REQUESTED', selectionCount: 0, verifiedCount: 0, results: [] }
	}
	const zip = await JSZip.loadAsync(await fs.readFile(filePath))
	const rootDir = options.rootDir || path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..')
	const runtimes = await optionalRuntimeModules(rootDir)
	const results = []
	for (const selection of manifestReadback.selections) {
		const slideIndex = Number(selection.slideIndex)
		const slidePart = `ppt/slides/slide${slideIndex + 1}.xml`
		const document = Number.isInteger(slideIndex) ? await xmlFromZip(zip, slidePart) : null
		if (selection.representation === 'custom') {
			const baseName = String(selection.resolvedObjectName || '').trim()
			const packageNames = Array.from(document?.getElementsByTagName('p:cNvPr') || []).map(node => String(node.getAttribute('name') || ''))
			const objectPresent = Boolean(baseName) && packageNames.some(name => name === baseName || name.startsWith(`${baseName}-`))
			const customReasonRecorded = String(selection.customReason || '').trim().length >= 16
			const failed = [
				...(!objectPresent ? ['custom-object'] : []),
				...(!customReasonRecorded ? ['custom-reason'] : []),
			]
			results.push({
				slideId: selection.slideId,
				target: selection.target,
				capability: selection.capability,
				representation: 'custom',
				status: failed.length ? 'failed' : 'verified-explicit-custom-exception',
				customReasonRecorded,
				customObjectPresent: objectPresent,
				...(failed.length ? { failedChecks: failed } : {}),
			})
			continue
		}
		const requestedSelectors = selection.requestedSelectors || {}
		if (selection.capability === 'layout' || selection.capability === 'transition') {
			const selectorProof = selection.capability === 'layout'
				? await verifySlideLayoutSelectors(zip, slidePart, requestedSelectors)
				: await verifyTransitionSelectors(zip, slidePart, requestedSelectors)
			const verifiedSelectors = new Set(selectorProof.verifiedSelectors || [])
			const failed = [...(selectorProof.failed || [])]
			for (const key of Object.keys(requestedSelectors)) if (!verifiedSelectors.has(key) && !failed.includes(key)) failed.push(`selector-not-package-verified:${key}`)
			results.push({
				slideId: selection.slideId,
				target: null,
				capability: selection.capability,
				representation: 'native',
				requestedSelectorIds: Object.values(requestedSelectors).flat().filter(value => ['string', 'number'].includes(typeof value)).map(String),
				verification: selectorProof.verification,
				status: failed.length ? 'failed' : 'verified-in-package',
				...(failed.length ? { failedChecks: [...new Set(failed)] } : {}),
			})
			continue
		}
		const owner = document ? findNamedOwner(document, selection.resolvedObjectName) : null
		const failed = []
		const verifiedSelectors = new Set()
		if (!nativeStructurePresent(selection.capability, owner)) failed.push('native-object')
		let selectorProof = { ok: true, failed: [], verifiedSelectors: [], verification: 'native-structure' }
		if (owner && selection.capability === 'smartart') selectorProof = await verifySmartArtSelectors(zip, slidePart, owner, requestedSelectors)
		if (owner && selection.capability === 'table') selectorProof = await verifyTableSelectors(owner, requestedSelectors, runtimes.resolveTableStylePreset)
		if (owner && selection.capability === 'chart') selectorProof = await verifyChartSelectors(zip, slidePart, owner, requestedSelectors, selection.chartType, runtimes.resolveChartPlan, runtimes.chartGallery)
		if (owner && selection.capability === 'connector') selectorProof = verifyConnectorSelectors(owner, requestedSelectors)
		if (owner && selection.capability === 'equation') selectorProof = verifyEquationSelectors(owner, requestedSelectors)
		failed.push(...(selectorProof.failed || []))
		for (const key of selectorProof.verifiedSelectors || []) verifiedSelectors.add(key)
		if (owner && ['shape', 'wordart'].includes(selection.capability)) {
			const exact = verifyExactStyleAndEffects(selection.capability, owner, requestedSelectors)
			failed.push(...exact.failed)
			for (const key of exact.verifiedSelectors) verifiedSelectors.add(key)
		}
		if (owner && selection.capability === 'picture' && requestedSelectors.pictureStylePresetId) {
			const preset = pictureStylePresetById(requestedSelectors.pictureStylePresetId)
			const actual = canonicalPicture(owner)
			if (!preset || !actual || sha256(stableJson(actual)) !== preset.canonicalPayloadHash) failed.push('pictureStylePresetId')
			else verifiedSelectors.add('pictureStylePresetId')
		}
		if (owner && selection.capability === 'model3d' && requestedSelectors.model3dViewPresetId) {
			const preset = model3dViewPresetById(requestedSelectors.model3dViewPresetId)
			const model = descendantsByLocalName(owner, 'model3d')[0]
			let matched = false
			try {
				matched = Boolean(preset && model)
					&& stableJson(portableModel3dView(canonicalModel3dView(model))) === stableJson(portableModel3dView(preset.recipe))
			} catch {}
			if (!matched) failed.push('model3dViewPresetId')
			else verifiedSelectors.add('model3dViewPresetId')
		}
		if (owner) failed.push(...verifyNativeFeatures(owner, selection.nativeFeatures || []))
		for (const key of Object.keys(requestedSelectors)) if (!verifiedSelectors.has(key) && !failed.includes(key)) failed.push(`selector-not-package-verified:${key}`)
		const uniqueFailed = [...new Set(failed)]
		results.push({
			slideId: selection.slideId,
			target: selection.target,
			capability: selection.capability,
			representation: 'native',
			requestedSelectorIds: Object.values(requestedSelectors).flat().filter(value => ['string', 'number'].includes(typeof value)).map(String),
			verification: selectorProof.verification,
			status: uniqueFailed.length ? 'failed' : 'verified-in-package',
			...(uniqueFailed.length ? { failedChecks: uniqueFailed } : {}),
		})
	}
	const failed = results.filter(result => result.status === 'failed')
	const required = String(manifestReadback.enforcement || 'advisory') === 'required'
	return {
		schemaVersion: 'betterpptx.selection-package-verification.v1',
		ok: failed.length === 0 || !required,
		status: failed.length ? (required ? 'SELECTION_PACKAGE_VERIFICATION_FAILED' : 'SELECTION_PACKAGE_WARNINGS') : 'SELECTIONS_VERIFIED_IN_PACKAGE',
		enforcement: required ? 'required' : 'advisory',
		selectionCount: results.length,
		verifiedCount: results.length - failed.length,
		failedCount: failed.length,
		results,
	}
}
