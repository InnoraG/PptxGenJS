/**
 * PptxGenJS: Native PowerPoint SmartArt generation
 */

import { ISlideObject, NativePackagePart, NativeSmartArtInfo, SmartArtNode, SmartArtNodeSemanticRole, SmartArtProps } from './core-interfaces'
import { encodeXmlEntities, getUuid } from './gen-utils'
import { genXmlCNvPr } from './gen-accessibility'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import {
	SMARTART_COLOR_STYLE_DEFINITIONS,
	SMARTART_LAYOUT_DEFINITIONS as SMARTART_FROZEN_LAYOUT_DEFINITIONS,
	SMARTART_QUICK_STYLE_DEFINITIONS,
	SmartArtCatalogEntry,
} from './smartart-reference'
import { SMARTART_CURRENT_OFFICE_LAYOUT_DEFINITIONS } from './smartart-current-office-reference'

// Keep the historical frozen corpus immutable while extending the executable
// engine catalog with the additional layouts exposed by the current Office
// build.  Re-indexing is deliberate: callers receive one deterministic
// catalog, and duplicate IDs can never shadow an earlier reference-backed row.
export const SMARTART_LAYOUT_DEFINITIONS: SmartArtCatalogEntry[] = [
	...SMARTART_FROZEN_LAYOUT_DEFINITIONS,
	...SMARTART_CURRENT_OFFICE_LAYOUT_DEFINITIONS,
].filter((entry, index, rows) => rows.findIndex(candidate => candidate.id === entry.id) === index)
	.map((entry, index) => ({ ...entry, index: index + 1 }))

export const SMARTART_REL_TYPES = {
	data: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramData',
	layout: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramLayout',
	quickStyle: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramQuickStyle',
	colors: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramColors',
	drawing: 'http://schemas.microsoft.com/office/2007/relationships/diagramDrawing',
}

const SMARTART_CONTENT_TYPES = {
	data: 'application/vnd.openxmlformats-officedocument.drawingml.diagramData+xml',
	layout: 'application/vnd.openxmlformats-officedocument.drawingml.diagramLayout+xml',
	quickStyle: 'application/vnd.openxmlformats-officedocument.drawingml.diagramStyle+xml',
	colors: 'application/vnd.openxmlformats-officedocument.drawingml.diagramColors+xml',
	drawing: 'application/vnd.ms-office.drawingml.diagramDrawing+xml',
}

const IMAGE_REL_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image'

const BASIC_BLOCK_LIST_LAYOUT_ID = 'urn:microsoft.com/office/officeart/2005/8/layout/default'
const DEFAULT_NATIVE_QUICK_STYLE_ID = 'urn:microsoft.com/office/officeart/2005/8/quickstyle/3d1'
const DEFAULT_NATIVE_COLOR_STYLE_ID = 'urn:microsoft.com/office/officeart/2005/8/colors/colorful1'

const DEFAULT_LAYOUT_BY_CATEGORY: Record<string, string> = {
	list: 'Basic Block List',
	process: 'Basic Process',
	cycle: 'Basic Cycle',
	hierarchy: 'Organization Chart',
	relationship: 'Basic Radial',
	matrix: 'Basic Matrix',
	pyramid: 'Basic Pyramid',
	picture: 'Picture Caption List',
	timeline: 'Alternating Circle Process',
	team: 'Meet The Team',
	meettheteam: 'Meet The Team',
}

type NativeSmartArtIds = {
	dataRid: string
	layoutRid: string
	quickStyleRid: string
	colorStyleRid: string
	drawingRid: string
	partIndex: number
}

type EquationXmlContext = {
	shapeId: number | string
	creationId: number | string
	x: number
	y: number
	cx: number
	cy: number
	locationAttr: string
}

type NativeNode = {
	text: string
	role?: SmartArtNodeSemanticRole
	textColor?: string
	imageSource?: string
	image?: NativeSmartArtImage
	layoutPresIds?: Record<string, string>
	modelId: string
	parentId: string | null
	level: number
	siblingIndex: number
	parTransId: string
	sibTransId: string
	cxnId: string
	compPresId?: string
	presId: string
	imagePresId?: string
	presSibId: string
}

type NativeSmartArtImage = {
	relId: string
	mediaPath: string
	contentType: string
	base64: string
}

type ResolvedNativeSmartArt = {
	layout: SmartArtCatalogEntry
	quickStyle: SmartArtCatalogEntry
	colorStyle: SmartArtCatalogEntry
}

type PictureLayoutEntry = {
	key: string
	parentKey?: string
	name: string
	styleLbl?: string
	alg?: string
	isImage: boolean
	isText: boolean
}

type PictureLayoutModel = {
	rootName: string
	entries: PictureLayoutEntry[]
}

type SiblingTransitionNumbering = {
	enabled: boolean
	minDigits: number
}

const SIBLING_TRANSITION_NUMBERING_CACHE = new Map<string, SiblingTransitionNumbering>()

function guid(): string {
	return `{${getUuid('xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx').toUpperCase()}}`
}

function catalogKey(value: unknown): string {
	let out = ''
	for (const char of String(value || '').toLowerCase()) {
		if ((char >= 'a' && char <= 'z') || (char >= '0' && char <= '9')) out += char
	}
	return out
}

function findCatalogEntry(entries: SmartArtCatalogEntry[], requested: unknown, fallbackId: string, allowFallback = false): SmartArtCatalogEntry {
	const fallback = entries.find(entry => entry.id === fallbackId) || entries[0]
	if (!requested) return fallback
	const raw = String(requested)
	const key = catalogKey(raw)
	const match = entries.find(entry =>
		entry.id === raw ||
		catalogKey(entry.id) === key ||
		catalogKey(entry.name) === key ||
		catalogKey(entry.category) === key
	)
	if (match) return match
	if (allowFallback) return fallback
	throw new Error(`SMARTART_PRESET_NOT_FOUND: native SmartArt preset "${raw}" is not in the PowerPoint catalog. Use betterpptx.smartart.catalog or set presetFallback:"default" explicitly.`)
}

function resolveLayout(opt: SmartArtProps): SmartArtCatalogEntry {
	const requested = opt.layoutId || opt.layoutName || opt.layout || BASIC_BLOCK_LIST_LAYOUT_ID
	const key = catalogKey(requested)
	const defaultByCategory = DEFAULT_LAYOUT_BY_CATEGORY[key]
	const allowFallback = opt.presetFallback === 'default'
	if (defaultByCategory) return findCatalogEntry(SMARTART_LAYOUT_DEFINITIONS, defaultByCategory, BASIC_BLOCK_LIST_LAYOUT_ID, allowFallback)
	const direct = findCatalogEntry(SMARTART_LAYOUT_DEFINITIONS, requested, BASIC_BLOCK_LIST_LAYOUT_ID, allowFallback)
	if (direct.id === BASIC_BLOCK_LIST_LAYOUT_ID && requested && !['basicblocklist', 'basicblock', 'blocklist', 'list', 'default'].includes(key) && key !== catalogKey(BASIC_BLOCK_LIST_LAYOUT_ID)) {
		const categoryMatch = SMARTART_LAYOUT_DEFINITIONS.find(entry => catalogKey(entry.category) === key)
		if (categoryMatch) return categoryMatch
	}
	return direct
}

function resolveQuickStyle(opt: SmartArtProps): SmartArtCatalogEntry {
	const requested = opt.quickStyleId || opt.quickStyleName
	const key = catalogKey(requested || '')
	const allowFallback = opt.presetFallback === 'default'
	if (!requested || ['best', 'default', 'premium', 'polished', '3d'].includes(key)) {
		return findCatalogEntry(SMARTART_QUICK_STYLE_DEFINITIONS, DEFAULT_NATIVE_QUICK_STYLE_ID, DEFAULT_NATIVE_QUICK_STYLE_ID)
	}
	return findCatalogEntry(SMARTART_QUICK_STYLE_DEFINITIONS, requested, DEFAULT_NATIVE_QUICK_STYLE_ID, allowFallback)
}

function resolveColorStyle(opt: SmartArtProps): SmartArtCatalogEntry {
	const requested = opt.colorStyleId || opt.colorStyleName
	const key = catalogKey(requested || '')
	const allowFallback = opt.presetFallback === 'default'
	if (!requested || ['best', 'default', 'premium', 'colorful'].includes(key)) {
		return findCatalogEntry(SMARTART_COLOR_STYLE_DEFINITIONS, DEFAULT_NATIVE_COLOR_STYLE_ID, DEFAULT_NATIVE_COLOR_STYLE_ID)
	}
	return findCatalogEntry(SMARTART_COLOR_STYLE_DEFINITIONS, requested, DEFAULT_NATIVE_COLOR_STYLE_ID, allowFallback)
}

function resolveNativeSmartArt(opt: SmartArtProps): ResolvedNativeSmartArt {
	return {
		layout: resolveLayout(opt),
		quickStyle: resolveQuickStyle(opt),
		colorStyle: resolveColorStyle(opt),
	}
}

function nodeText(node: string | SmartArtNode, index: number): string {
	if (typeof node === 'string') return node || `Node ${index + 1}`
	return node.text || node.title || node.subtitle || `Node ${index + 1}`
}

function nodeImageSource(node: string | SmartArtNode): string | undefined {
	if (typeof node === 'string') return undefined
	const maybeImage = (node as unknown as { image?: unknown; imagePath?: unknown; imageData?: unknown; imageUrl?: unknown }).image ??
		(node as unknown as { imagePath?: unknown }).imagePath ??
		(node as unknown as { imageData?: unknown }).imageData ??
		(node as unknown as { imageUrl?: unknown }).imageUrl
	return typeof maybeImage === 'string' && maybeImage.trim().length > 0 ? maybeImage.trim() : undefined
}

function normalizeNodes(opt: SmartArtProps): string[] {
	const source = opt.nodes && opt.nodes.length > 0 ? opt.nodes : ['Node 1', 'Node 2', 'Node 3']
	return source.map(nodeText).filter(text => text.length > 0)
}

function normalizeNativeNodes(opt: SmartArtProps): NativeNode[] {
	const source = opt.nodes && opt.nodes.length > 0 ? opt.nodes : ['Node 1', 'Node 2', 'Node 3']
	const out: NativeNode[] = []
	const addNode = (node: string | SmartArtNode, parentId: string | null, level: number, siblingIndex: number): void => {
		const text = nodeText(node, out.length)
		if (!text) return
		const item: NativeNode = {
			text,
			role: typeof node !== 'string' && node.role ? node.role : undefined,
			textColor: typeof node !== 'string' && node.color ? String(node.color) : undefined,
			imageSource: nodeImageSource(node),
			modelId: guid(),
			parentId,
			level,
			siblingIndex,
			parTransId: guid(),
			sibTransId: guid(),
			cxnId: guid(),
			presId: guid(),
			presSibId: guid(),
		}
		out.push(item)
		// Office title/description layouts represent the description as the
		// first descendant of the title node. Preserve the public subtitle
		// field in that native data-model shape instead of silently discarding it.
		const subtitle = typeof node !== 'string' && typeof node.subtitle === 'string' ? node.subtitle.trim() : ''
		if (subtitle) addNode(subtitle, item.modelId, level + 1, 0)
		if (typeof node !== 'string' && node.children && node.children.length > 0) {
			const childOffset = subtitle ? 1 : 0
			node.children.forEach((child, index) => addNode(child, item.modelId, level + 1, index + childOffset))
		}
	}
	source.forEach((node, index) => addNode(node, null, 0, index))
	return out
}

function contentTypeExt(contentType: string): string | null {
	const lower = contentType.toLowerCase()
	if (lower === 'image/png') return 'png'
	if (lower === 'image/jpeg' || lower === 'image/jpg') return 'jpg'
	if (lower === 'image/gif') return 'gif'
	if (lower === 'image/webp') return 'webp'
	if (lower === 'image/svg+xml') return 'svg'
	if (lower === 'image/bmp') return 'bmp'
	if (lower === 'image/tiff') return 'tiff'
	return null
}

function parseImageDataUri(source: string | undefined, relId: string, imageIndex: number): NativeSmartArtImage | null {
	if (!source || !source.startsWith('data:image/')) return null
	const comma = source.indexOf(',')
	if (comma < 0) return null
	const header = source.slice('data:'.length, comma)
	const headerParts = header.split(';').map(part => part.trim().toLowerCase()).filter(Boolean)
	const contentType = headerParts[0] || ''
	if (!contentType.startsWith('image/') || !headerParts.includes('base64')) return null
	const ext = contentTypeExt(contentType)
	if (!ext) return null
	const base64 = source.slice(comma + 1).trim()
	if (!base64) return null
	return {
		relId,
		mediaPath: `ppt/media/smartart${imageIndex}.${ext}`,
		contentType,
		base64,
	}
}

function attachImageParts(nodes: NativeNode[], partIndex: number): NativePackagePart[] {
	const parts: NativePackagePart[] = []
	let imageIndex = 1
	nodes.forEach(node => {
		const relId = `rIdImg${imageIndex}`
		const parsed = parseImageDataUri(node.imageSource, relId, (partIndex * 1000) + imageIndex)
		if (!parsed) return
		node.image = parsed
		node.compPresId = guid()
		node.imagePresId = guid()
		parts.push({
			path: parsed.mediaPath,
			data: parsed.base64,
			encoding: 'base64',
			contentType: parsed.contentType,
			defaultContentType: parsed.contentType,
		})
		imageIndex++
	})
	return parts
}

function isPictureLayout(resolved: ResolvedNativeSmartArt): boolean {
	return catalogKey(`${resolved.layout.category} ${resolved.layout.name} ${resolved.layout.id}`).includes('picture')
}

function isHierarchyLayout(resolved: ResolvedNativeSmartArt): boolean {
	return catalogKey(`${resolved.layout.category} ${resolved.layout.name} ${resolved.layout.id}`).includes('hierarchy') ||
		catalogKey(`${resolved.layout.category} ${resolved.layout.name} ${resolved.layout.id}`).includes('orgchart')
}

function nodeSemanticRole(node: string | SmartArtNode): string | undefined {
	if (typeof node === 'string') return undefined
	const role = typeof node.role === 'string' ? node.role.trim().toLowerCase() : ''
	return role || undefined
}

function validateNativeNodeRoles(opt: SmartArtProps, resolved: ResolvedNativeSmartArt): void {
	const nodes = opt.nodes || []
	if (nodes.length === 0) return
	const hierarchy = isHierarchyLayout(resolved)
	const picture = isPictureLayout(resolved)
	const allowedHierarchyRoles = new Set(['root', 'manager', 'member', 'peer', 'node', 'assistant'])
	const hierarchyRoles = new Set(['root', 'manager', 'member', 'peer', 'assistant'])
	const walk = (node: string | SmartArtNode, path: string): void => {
		const role = nodeSemanticRole(node)
		if (role && hierarchy && !allowedHierarchyRoles.has(role)) {
			throw new Error(`SMARTART_ROLE_NOT_APPLICABLE: role "${role}" is not supported by native hierarchy layout "${resolved.layout.name}" at ${path}. Use root, manager, member, peer, node, or assistant.`)
		}
		if (role && !hierarchy && hierarchyRoles.has(role)) {
			throw new Error(`SMARTART_ROLE_NOT_APPLICABLE: hierarchy role "${role}" requires a native hierarchy/org-chart layout, not "${resolved.layout.name}".`)
		}
		if (role === 'image' && !picture) {
			throw new Error(`SMARTART_ROLE_NOT_APPLICABLE: image role requires a picture SmartArt layout, not "${resolved.layout.name}".`)
		}
		if (typeof node !== 'string' && Array.isArray(node.children)) node.children.forEach((child, index) => walk(child, `${path}.children[${index}]`))
	}
	nodes.forEach((node, index) => walk(node, `nodes[${index}]`))
}

function isPictureCaptionListLayout(resolved: ResolvedNativeSmartArt): boolean {
	return catalogKey(resolved.layout.id).includes('layoutplist1') || catalogKey(resolved.layout.name) === 'picturecaptionlist'
}

function elementChildren(el: Element | Document): Element[] {
	const out: Element[] = []
	for (let i = 0; i < el.childNodes.length; i++) {
		const child = el.childNodes.item(i)
		if (child && child.nodeType === 1) out.push(child as Element)
	}
	return out
}

function localName(el: Element): string {
	return el.localName || el.nodeName.split(':').pop() || el.nodeName
}

function directChild(el: Element, name: string): Element | null {
	return elementChildren(el).find(child => localName(child) === name) || null
}

function directChildren(el: Element, name: string): Element[] {
	return elementChildren(el).filter(child => localName(child) === name)
}

function positiveIntegerText(value: unknown): string | null {
	const text = typeof value === 'string' ? value.trim() : ''
	if (!text) return null
	for (const char of text) {
		if (char < '0' || char > '9') return null
	}
	const numeric = Number(text)
	return Number.isInteger(numeric) && numeric > 0 ? text : null
}

/**
 * Read the numbering contract from the native Office layout sample. Some
 * layouts render their visible number from a sibling-transition data point
 * rather than from the content node. The sample also tells us whether the
 * gallery uses 1 or 01.
 */
function siblingTransitionNumbering(layout: SmartArtCatalogEntry): SiblingTransitionNumbering {
	const cached = SIBLING_TRANSITION_NUMBERING_CACHE.get(layout.id)
	if (cached) return cached
	let result: SiblingTransitionNumbering = { enabled: false, minDigits: 1 }
	try {
		const doc = new DOMParser().parseFromString(layout.xml, 'application/xml')
		const all = doc.getElementsByTagName('*')
		const labels: string[] = []
		for (let index = 0; index < all.length; index++) {
			const point = all.item(index) as Element | null
			if (!point || localName(point) !== 'pt' || point.getAttribute('type') !== 'sibTrans') continue
			const placeholder = positiveIntegerText(directChild(point, 'prSet')?.getAttribute('phldrT'))
			const text = positiveIntegerText(directChild(point, 't')?.textContent)
			const label = placeholder || text
			if (label) labels.push(label)
		}
		if (labels.length > 0) result = { enabled: true, minDigits: labels[0].length }
	} catch {
		// Invalid catalog XML is handled by the existing preset/package checks;
		// a non-numbered fallback keeps ordinary SmartArt serialization safe.
	}
	SIBLING_TRANSITION_NUMBERING_CACHE.set(layout.id, result)
	return result
}

function hasDirectChild(el: Element, name: string): boolean {
	return directChild(el, name) !== null
}

function containsAny(value: string, needles: string[]): boolean {
	return needles.some(needle => value.includes(needle))
}

function layoutNodeAlg(el: Element): string | undefined {
	const alg = directChild(el, 'alg')
	return alg?.getAttribute('type') || undefined
}

function isImageLayoutEntry(name: string, styleLbl: string | undefined, alg: string | undefined): boolean {
	const key = catalogKey(`${name} ${styleLbl || ''}`)
	if (containsAny(key, ['image', 'img', 'pict', 'picture', 'photo', 'fgimgplace', 'bgimgplace', 'alignimgplace'])) return true
	if (alg !== 'sp') return false
	if (containsAny(key, ['sibtrans', 'spacing', 'spacer', 'space', 'conn', 'adorn', 'accent', 'text', 'tx'])) return false
	return true
}

function isTextLayoutEntry(name: string, styleLbl: string | undefined, alg: string | undefined): boolean {
	if (alg === 'tx') return true
	const key = catalogKey(`${name} ${styleLbl || ''}`)
	return containsAny(key, ['text', 'tx', 'caption', 'title', 'parent', 'child', 'node', 'revtx'])
}

function findFirstLayoutNode(el: Element | Document): Element | null {
	const children = elementChildren(el)
	for (const child of children) {
		if (localName(child) === 'layoutNode') return child
		const nested = findFirstLayoutNode(child)
		if (nested) return nested
	}
	return null
}

function findNodeTemplate(el: Element, allowEmptyPtType = false): Element | null {
	const children = elementChildren(el)
	for (const child of children) {
		const childName = localName(child)
		if (childName === 'forEach') {
			const axis = catalogKey(child.getAttribute('axis') || '')
			const ptType = catalogKey(child.getAttribute('ptType') || '')
			if ((axis.includes('ch') || axis.includes('self')) && (ptType.includes('node') || (allowEmptyPtType && ptType.length === 0))) {
				const template = findFirstLayoutNode(child)
				if (template) return template
			}
		}
		const nested = findNodeTemplate(child, allowEmptyPtType)
		if (nested) return nested
	}
	return null
}

function collectPictureLayoutEntries(root: Element, parentKey?: string, entries: PictureLayoutEntry[] = [], path = 'n'): PictureLayoutEntry[] {
	if (localName(root) !== 'layoutNode') return entries
	const name = root.getAttribute('name') || `node${entries.length + 1}`
	const styleLbl = root.getAttribute('styleLbl') || undefined
	const alg = layoutNodeAlg(root)
	const key = `${path}:${catalogKey(name) || entries.length}`
	const isImage = isImageLayoutEntry(name, styleLbl, alg)
	const isText = !isImage && isTextLayoutEntry(name, styleLbl, alg)
	if (hasDirectChild(root, 'presOf') || isImage || isText || directChildren(root, 'layoutNode').length > 0) {
		entries.push({ key, parentKey, name, styleLbl, alg, isImage, isText })
		parentKey = key
	}
	let childIndex = 0
	for (const child of elementChildren(root)) {
		if (localName(child) === 'forEach' && catalogKey(child.getAttribute('ptType') || '').includes('sibtrans')) continue
		if (localName(child) === 'layoutNode') collectPictureLayoutEntries(child, parentKey, entries, `${path}.${childIndex++}`)
		else {
			for (const nested of directChildren(child, 'layoutNode')) collectPictureLayoutEntries(nested, parentKey, entries, `${path}.${childIndex++}`)
		}
	}
	return entries
}

function collectGlobalPictureEntries(root: Element): PictureLayoutEntry[] {
	const out: PictureLayoutEntry[] = []
	const seen = new Set<string>()
	const visit = (el: Element): void => {
		if (localName(el) === 'layoutNode') {
			const name = el.getAttribute('name') || ''
			const styleLbl = el.getAttribute('styleLbl') || undefined
			const alg = layoutNodeAlg(el)
			if (name && isImageLayoutEntry(name, styleLbl, alg)) {
				const seenKey = `${catalogKey(name)}:${catalogKey(styleLbl || '')}:${catalogKey(alg || '')}`
				if (!seen.has(seenKey)) {
					seen.add(seenKey)
					out.push({
						key: `g.${out.length}:${catalogKey(name) || 'image'}`,
						name,
						styleLbl,
						alg,
						isImage: true,
						isText: false,
					})
				}
			}
		}
		elementChildren(el).forEach(visit)
	}
	visit(root)
	return out
}

function createPictureLayoutModel(resolved: ResolvedNativeSmartArt): PictureLayoutModel | null {
	if (!isPictureLayout(resolved) || isPictureCaptionListLayout(resolved)) return null
	try {
		const doc = new DOMParser().parseFromString(resolved.layout.xml, 'text/xml')
		const root = findFirstLayoutNode(doc)
		if (!root) return null
		const template = findNodeTemplate(root, false) || findNodeTemplate(root, true)
		if (!template) return null
		const entries = collectPictureLayoutEntries(template)
			.filter(entry => entry.name && entry.name !== (root.getAttribute('name') || ''))
		const existingPictureKeys = new Set(entries.map(entry => `${catalogKey(entry.name)}:${catalogKey(entry.styleLbl || '')}:${catalogKey(entry.alg || '')}`))
		const globalImageEntries = collectGlobalPictureEntries(root).filter(entry => {
			const key = `${catalogKey(entry.name)}:${catalogKey(entry.styleLbl || '')}:${catalogKey(entry.alg || '')}`
			return !existingPictureKeys.has(key)
		})
		const finalEntries = [...entries, ...globalImageEntries]
		const imageCount = finalEntries.filter(entry => entry.isImage).length
		if (imageCount === 0) return null
		return {
			rootName: root.getAttribute('name') || 'diagram',
			entries: finalEntries,
		}
	} catch {
		return null
	}
}

function ensurePictureLayoutIds(nodes: NativeNode[], model: PictureLayoutModel | null): void {
	if (!model) return
	nodes.forEach(node => {
		if (!node.layoutPresIds) node.layoutPresIds = {}
		model.entries.forEach(entry => {
			if (!node.layoutPresIds?.[entry.key]) node.layoutPresIds![entry.key] = guid()
		})
	})
}

function firstPictureEntry(model: PictureLayoutModel | null, image: boolean): PictureLayoutEntry | null {
	if (!model) return null
	return model.entries.find(entry => image ? entry.isImage : entry.isText) || null
}

function buildImageRelsXml(nodes: NativeNode[]): string | null {
	const imageNodes = nodes.filter(node => node.image)
	if (imageNodes.length === 0) return null
	let rels = ''
	imageNodes.forEach(node => {
		const image = node.image
		if (!image) return
		const target = `../media/${image.mediaPath.split('/').pop()}`
		rels += `<Relationship Id="${image.relId}" Type="${IMAGE_REL_TYPE}" Target="${encodeXmlEntities(target)}"/>`
	})
	return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
		`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`
}

function emptyTextBody(): string {
	return '<dgm:spPr/><dgm:t><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></dgm:t>'
}

function fontFaceRunXml(fontFace?: string): string {
	const face = typeof fontFace === 'string' ? fontFace.trim() : ''
	return face ? `<a:latin typeface="${encodeXmlEntities(face)}"/>` : ''
}

function dataTextBody(text: string, imageRelId?: string, color?: string, fontFace?: string): string {
	const spPr = imageRelId
		? `<dgm:spPr><a:blipFill><a:blip r:embed="${imageRelId}"/><a:stretch><a:fillRect/></a:stretch></a:blipFill></dgm:spPr>`
		: '<dgm:spPr/>'
	const normalizedColor = color ? String(color).replace(/^#/, '') : ''
	const colorXml = /^[0-9A-Fa-f]{6}$/.test(normalizedColor)
		? `<a:solidFill><a:srgbClr val="${normalizedColor.toUpperCase()}"/></a:solidFill>`
		: ''
	return `${spPr}<dgm:t><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US">${fontFaceRunXml(fontFace)}${colorXml}</a:rPr><a:t>${encodeXmlEntities(text)}</a:t></a:r></a:p></dgm:t>`
}

function nativeNodeTextColor(opt: SmartArtProps, node: NativeNode, index: number): string | undefined {
	const indexedColor = Array.isArray(opt.textColors) && opt.textColors.length > 0
		? opt.textColors[index % opt.textColors.length]
		: undefined
	return node.textColor || indexedColor || opt.color
}

function dataPictureBody(imageRelId: string): string {
	return `<dgm:spPr><a:blipFill><a:blip r:embed="${imageRelId}"/><a:stretch><a:fillRect/></a:stretch></a:blipFill></dgm:spPr>` +
		'<dgm:t><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></dgm:t>'
}

function drawingTextBody(text: string, fontSize?: number, color?: string, fontFace?: string): string {
	const sz = Math.round((fontSize || 24) * 100)
	const normalizedColor = color ? String(color).replace(/^#/, '') : ''
	const colorXml = /^[0-9A-Fa-f]{6}$/.test(normalizedColor)
		? `<a:solidFill><a:srgbClr val="${normalizedColor.toUpperCase()}"/></a:solidFill>`
		: ''
	return '<dsp:txBody>' +
		'<a:bodyPr spcFirstLastPara="0" vert="horz" wrap="square" lIns="152400" tIns="152400" rIns="152400" bIns="152400" numCol="1" spcCol="1270" anchor="ctr" anchorCtr="0"><a:noAutofit/></a:bodyPr>' +
		'<a:lstStyle/><a:p><a:pPr marL="0" lvl="0" indent="0" algn="ctr" defTabSz="1778000"><a:lnSpc><a:spcPct val="90000"/></a:lnSpc><a:spcBef><a:spcPct val="0"/></a:spcBef><a:spcAft><a:spcPct val="35000"/></a:spcAft><a:buNone/></a:pPr>' +
		`<a:r><a:rPr lang="en-US" sz="${sz}" kern="1200">${fontFaceRunXml(fontFace)}${colorXml}</a:rPr><a:t>${encodeXmlEntities(text)}</a:t></a:r></a:p>` +
		'</dsp:txBody>'
}

function emptyDrawingTextBody(): string {
	return '<dsp:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></dsp:txBody>'
}

function buildDataModelXml(opt: SmartArtProps, resolved: ResolvedNativeSmartArt, nodes: NativeNode[], drawingRid: string, pictureModel?: PictureLayoutModel | null): string {
	const docId = guid()
	const presRootId = guid()
	const pictureLayout = isPictureLayout(resolved)
	const pictureCaptionList = isPictureCaptionListLayout(resolved)
	const numbering = siblingTransitionNumbering(resolved.layout)
	ensurePictureLayoutIds(nodes, pictureModel || null)
	let ptXml = `<dgm:pt modelId="${docId}" type="doc"><dgm:prSet loTypeId="${encodeXmlEntities(resolved.layout.id)}" loCatId="${encodeXmlEntities(resolved.layout.category)}" qsTypeId="${encodeXmlEntities(resolved.quickStyle.id)}" qsCatId="${encodeXmlEntities(resolved.quickStyle.category)}" csTypeId="${encodeXmlEntities(resolved.colorStyle.id)}" csCatId="${encodeXmlEntities(resolved.colorStyle.category)}" phldr="1"/>${emptyTextBody()}</dgm:pt>`
	nodes.forEach((node, index) => {
		// Keep the semantic text node independent from the image node. Passing
		// the image relationship here makes PowerPoint paint the same picture
		// into the caption shape as well as the picture shape.
		const textColor = nativeNodeTextColor(opt, node, index)
		const semanticText = dataTextBody(node.text, undefined, textColor, opt.fontFace)
		const semanticType = node.role === 'assistant' ? ' type="asst"' : ''
		const siblingLabel = numbering.enabled && node.level === 0
			? String(node.siblingIndex + 1).padStart(numbering.minDigits, '0')
			: null
		const siblingProperties = siblingLabel ? `<dgm:prSet phldrT="${encodeXmlEntities(siblingLabel)}"/>` : '<dgm:prSet/>'
		// Numbered SmartArt layouts render the sibling-transition point as the
		// visible number. Give it the same authored/World ink as its semantic node.
		const siblingText = siblingLabel ? dataTextBody(siblingLabel, undefined, textColor, opt.fontFace) : emptyTextBody()
		ptXml += `<dgm:pt modelId="${node.modelId}"${semanticType}><dgm:prSet phldrT="[Text]"/>${semanticText}</dgm:pt>`
		ptXml += `<dgm:pt modelId="${node.parTransId}" type="parTrans" cxnId="${node.cxnId}"><dgm:prSet/>${emptyTextBody()}</dgm:pt>`
		ptXml += `<dgm:pt modelId="${node.sibTransId}" type="sibTrans" cxnId="${node.cxnId}">${siblingProperties}${siblingText}</dgm:pt>`
	})
	const rootPresName = pictureCaptionList ? 'Name0' : (pictureModel?.rootName || 'diagram')
	ptXml += `<dgm:pt modelId="${presRootId}" type="pres"><dgm:prSet presAssocID="${docId}" presName="${encodeXmlEntities(rootPresName)}" presStyleCnt="0"><dgm:presLayoutVars><dgm:dir${opt.rightToLeft ? ' val="rev"' : ''}/><dgm:resizeHandles val="exact"/></dgm:presLayoutVars></dgm:prSet><dgm:spPr/></dgm:pt>`
	nodes.forEach((node, index) => {
		if (pictureCaptionList && node.image && node.compPresId && node.imagePresId) {
			ptXml += `<dgm:pt modelId="${node.compPresId}" type="pres"><dgm:prSet presAssocID="${node.modelId}" presName="compNode" presStyleCnt="0"/><dgm:spPr/></dgm:pt>`
			ptXml += `<dgm:pt modelId="${node.imagePresId}" type="pres"><dgm:prSet presAssocID="${node.modelId}" presName="pictRect" presStyleLbl="node1" presStyleIdx="${index}" presStyleCnt="${nodes.length}"/>${dataPictureBody(node.image.relId)}</dgm:pt>`
			ptXml += `<dgm:pt modelId="${node.presId}" type="pres"><dgm:prSet presAssocID="${node.modelId}" presName="textRect" presStyleLbl="revTx" presStyleIdx="${index}" presStyleCnt="${nodes.length}"><dgm:presLayoutVars><dgm:bulletEnabled val="1"/></dgm:presLayoutVars></dgm:prSet><dgm:spPr/></dgm:pt>`
			ptXml += `<dgm:pt modelId="${node.presSibId}" type="pres"><dgm:prSet presAssocID="${node.sibTransId}" presName="sibTrans" presStyleLbl="sibTrans2D1" presStyleIdx="0" presStyleCnt="0"/><dgm:spPr/></dgm:pt>`
			return
		}
		if (pictureModel && node.image && node.layoutPresIds) {
			pictureModel.entries.forEach(entry => {
				const id = node.layoutPresIds?.[entry.key]
				if (!id) return
				const styleAttr = entry.styleLbl ? ` presStyleLbl="${encodeXmlEntities(entry.styleLbl)}"` : ''
				const vars = entry.isText ? '<dgm:presLayoutVars><dgm:bulletEnabled val="1"/></dgm:presLayoutVars>' : ''
				const body = entry.isImage ? dataPictureBody(node.image!.relId) : '<dgm:spPr/>'
				ptXml += `<dgm:pt modelId="${id}" type="pres"><dgm:prSet presAssocID="${node.modelId}" presName="${encodeXmlEntities(entry.name)}"${styleAttr} presStyleIdx="${index}" presStyleCnt="${nodes.length}">${vars}</dgm:prSet>${body}</dgm:pt>`
			})
			ptXml += `<dgm:pt modelId="${node.presSibId}" type="pres"><dgm:prSet presAssocID="${node.sibTransId}" presName="sibTrans" presStyleCnt="0"/><dgm:spPr/></dgm:pt>`
			return
		}
		const textPresName = pictureLayout && node.image ? 'ParentText' : 'node'
		const textStyleLbl = pictureLayout && node.image ? 'node1' : 'node1'
		ptXml += `<dgm:pt modelId="${node.presId}" type="pres"><dgm:prSet presAssocID="${node.modelId}" presName="${textPresName}" presStyleLbl="${textStyleLbl}" presStyleIdx="${index}" presStyleCnt="${nodes.length}"><dgm:presLayoutVars><dgm:bulletEnabled val="1"/></dgm:presLayoutVars></dgm:prSet><dgm:spPr/></dgm:pt>`
		if (pictureLayout && node.image && node.imagePresId) {
			ptXml += `<dgm:pt modelId="${node.imagePresId}" type="pres"><dgm:prSet presAssocID="${node.modelId}" presName="Image" presStyleLbl="alignImgPlace1" presStyleIdx="${index}" presStyleCnt="${nodes.length}"/>${dataPictureBody(node.image.relId)}</dgm:pt>`
		}
		ptXml += `<dgm:pt modelId="${node.presSibId}" type="pres"><dgm:prSet presAssocID="${node.sibTransId}" presName="sibTrans" presStyleCnt="0"/><dgm:spPr/></dgm:pt>`
	})

	let cxnXml = ''
	cxnXml += `<dgm:cxn modelId="${guid()}" type="presOf" srcId="${docId}" destId="${presRootId}" srcOrd="0" destOrd="0" presId="${encodeXmlEntities(resolved.layout.id)}"/>`
	nodes.forEach((node, index) => {
		cxnXml += `<dgm:cxn modelId="${node.cxnId}" srcId="${node.parentId || docId}" destId="${node.modelId}" srcOrd="${node.siblingIndex}" destOrd="0" parTransId="${node.parTransId}" sibTransId="${node.sibTransId}"/>`
		if (pictureCaptionList && node.image && node.compPresId && node.imagePresId) {
			const ordBase = index * 2
			// Match Office's native Picture Caption List presentation graph:
			// the semantic node owns the text rectangle, while the image rectangle
			// is reached through the composite presentation node. Direct semantic
			// links to the composite/image nodes cause Office to paint a duplicate
			// native caption or image during SmartArt recalculation.
			cxnXml += `<dgm:cxn modelId="${guid()}" type="presOf" srcId="${node.modelId}" destId="${node.presId}" srcOrd="0" destOrd="0" presId="${encodeXmlEntities(resolved.layout.id)}"/>`
			cxnXml += `<dgm:cxn modelId="${guid()}" type="presOf" srcId="${node.sibTransId}" destId="${node.presSibId}" srcOrd="0" destOrd="0" presId="${encodeXmlEntities(resolved.layout.id)}"/>`
			cxnXml += `<dgm:cxn modelId="${guid()}" type="presParOf" srcId="${presRootId}" destId="${node.compPresId}" srcOrd="${ordBase}" destOrd="0" presId="${encodeXmlEntities(resolved.layout.id)}"/>`
			cxnXml += `<dgm:cxn modelId="${guid()}" type="presParOf" srcId="${node.compPresId}" destId="${node.imagePresId}" srcOrd="0" destOrd="0" presId="${encodeXmlEntities(resolved.layout.id)}"/>`
			cxnXml += `<dgm:cxn modelId="${guid()}" type="presParOf" srcId="${node.compPresId}" destId="${node.presId}" srcOrd="1" destOrd="0" presId="${encodeXmlEntities(resolved.layout.id)}"/>`
			cxnXml += `<dgm:cxn modelId="${guid()}" type="presParOf" srcId="${presRootId}" destId="${node.presSibId}" srcOrd="${ordBase + 1}" destOrd="0" presId="${encodeXmlEntities(resolved.layout.id)}"/>`
			return
		}
		if (pictureModel && node.image && node.layoutPresIds) {
			pictureModel.entries.forEach(entry => {
				const id = node.layoutPresIds?.[entry.key]
				if (!id) return
				cxnXml += `<dgm:cxn modelId="${guid()}" type="presOf" srcId="${node.modelId}" destId="${id}" srcOrd="0" destOrd="0" presId="${encodeXmlEntities(resolved.layout.id)}"/>`
			})
			const rootOrdBase = index * (pictureModel.entries.length + 1)
			const childOrd = new Map<string, number>()
			pictureModel.entries.forEach((entry, entryIndex) => {
				const id = node.layoutPresIds?.[entry.key]
				if (!id) return
				const parentId = entry.parentKey ? node.layoutPresIds?.[entry.parentKey] : presRootId
				if (!parentId) return
				const currentOrd = childOrd.get(parentId) || 0
				childOrd.set(parentId, currentOrd + 1)
				const srcOrd = parentId === presRootId ? rootOrdBase + entryIndex : currentOrd
				cxnXml += `<dgm:cxn modelId="${guid()}" type="presParOf" srcId="${parentId}" destId="${id}" srcOrd="${srcOrd}" destOrd="0" presId="${encodeXmlEntities(resolved.layout.id)}"/>`
			})
			cxnXml += `<dgm:cxn modelId="${guid()}" type="presOf" srcId="${node.sibTransId}" destId="${node.presSibId}" srcOrd="0" destOrd="0" presId="${encodeXmlEntities(resolved.layout.id)}"/>`
			cxnXml += `<dgm:cxn modelId="${guid()}" type="presParOf" srcId="${presRootId}" destId="${node.presSibId}" srcOrd="${rootOrdBase + pictureModel.entries.length}" destOrd="0" presId="${encodeXmlEntities(resolved.layout.id)}"/>`
			return
		}
		cxnXml += `<dgm:cxn modelId="${guid()}" type="presOf" srcId="${node.modelId}" destId="${node.presId}" srcOrd="0" destOrd="0" presId="${encodeXmlEntities(resolved.layout.id)}"/>`
		const ordBase = index * (pictureLayout && node.image && node.imagePresId ? 3 : 2)
		if (pictureLayout && node.image && node.imagePresId) {
			cxnXml += `<dgm:cxn modelId="${guid()}" type="presOf" srcId="${node.modelId}" destId="${node.imagePresId}" srcOrd="0" destOrd="0" presId="${encodeXmlEntities(resolved.layout.id)}"/>`
			cxnXml += `<dgm:cxn modelId="${guid()}" type="presParOf" srcId="${presRootId}" destId="${node.imagePresId}" srcOrd="${ordBase}" destOrd="0" presId="${encodeXmlEntities(resolved.layout.id)}"/>`
			cxnXml += `<dgm:cxn modelId="${guid()}" type="presParOf" srcId="${presRootId}" destId="${node.presId}" srcOrd="${ordBase + 1}" destOrd="0" presId="${encodeXmlEntities(resolved.layout.id)}"/>`
			cxnXml += `<dgm:cxn modelId="${guid()}" type="presParOf" srcId="${presRootId}" destId="${node.presSibId}" srcOrd="${ordBase + 2}" destOrd="0" presId="${encodeXmlEntities(resolved.layout.id)}"/>`
		} else {
			cxnXml += `<dgm:cxn modelId="${guid()}" type="presParOf" srcId="${presRootId}" destId="${node.presId}" srcOrd="${ordBase}" destOrd="0" presId="${encodeXmlEntities(resolved.layout.id)}"/>`
			cxnXml += `<dgm:cxn modelId="${guid()}" type="presParOf" srcId="${presRootId}" destId="${node.presSibId}" srcOrd="${ordBase + 1}" destOrd="0" presId="${encodeXmlEntities(resolved.layout.id)}"/>`
		}
	})

	return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
		'<dgm:dataModel xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
		`<dgm:ptLst>${ptXml}</dgm:ptLst><dgm:cxnLst>${cxnXml}</dgm:cxnLst><dgm:bg/><dgm:whole/>` +
		`<dgm:extLst><a:ext uri="http://schemas.microsoft.com/office/drawing/2008/diagram"><dsp:dataModelExt xmlns:dsp="http://schemas.microsoft.com/office/drawing/2008/diagram" relId="${drawingRid}" minVer="http://schemas.openxmlformats.org/drawingml/2006/diagram"/></a:ext></dgm:extLst>` +
		'</dgm:dataModel>'
}

function buildDrawingXml(opt: SmartArtProps, resolved: ResolvedNativeSmartArt, nodes: NativeNode[], pictureModel?: PictureLayoutModel | null): string {
	const pictureLayout = isPictureLayout(resolved)
	const pictureCaptionList = isPictureCaptionListLayout(resolved)
	ensurePictureLayoutIds(nodes, pictureModel || null)
	const cols = Math.max(1, Math.min(3, Math.ceil(Math.sqrt(nodes.length))))
	const rows = Math.max(1, Math.ceil(nodes.length / cols))
	const canvasW = 6350000
	const canvasH = 3810000
	const gapX = 198000
	const gapY = 235000
	const boxW = Math.floor((canvasW - (gapX * (cols - 1))) / cols)
	const boxH = Math.floor(Math.min(boxW * 0.6, (canvasH - (gapY * (rows - 1))) / rows))
	const totalH = (boxH * rows) + (gapY * (rows - 1))
	const startY = Math.max(0, Math.floor((canvasH - totalH) / 2))
	const fill = '<a:solidFill><a:schemeClr val="accent1"><a:hueOff val="0"/><a:satOff val="0"/><a:lumOff val="0"/><a:alphaOff val="0"/></a:schemeClr></a:solidFill>'
	const line = '<a:ln w="12700" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="lt1"><a:hueOff val="0"/><a:satOff val="0"/><a:lumOff val="0"/><a:alphaOff val="0"/></a:schemeClr></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln>'
	const style = '<dsp:style><a:lnRef idx="2"><a:scrgbClr r="0" g="0" b="0"/></a:lnRef><a:fillRef idx="1"><a:scrgbClr r="0" g="0" b="0"/></a:fillRef><a:effectRef idx="0"><a:scrgbClr r="0" g="0" b="0"/></a:effectRef><a:fontRef idx="minor"><a:schemeClr val="lt1"/></a:fontRef></dsp:style>'
	let shapeXml = ''
	nodes.forEach((node, index) => {
		const textColor = nativeNodeTextColor(opt, node, index)
		const col = opt.rightToLeft ? (cols - 1) - (index % cols) : index % cols
		const row = Math.floor(index / cols)
		const x = Math.floor(col * (boxW + gapX))
		const y = Math.floor(startY + (row * (boxH + gapY)))
		const fillXml = node.image
			? `<a:blipFill><a:blip r:embed="${node.image.relId}"/><a:stretch><a:fillRect/></a:stretch></a:blipFill>`
			: fill
		if (pictureCaptionList && node.image && node.imagePresId) {
			const imageH = Math.max(1, Math.floor(boxH * 0.72))
			const textY = y + imageH
			const textH = Math.max(1, boxH - imageH)
			shapeXml += `<dsp:sp modelId="${node.imagePresId}">` +
				'<dsp:nvSpPr><dsp:cNvPr id="0" name=""/><dsp:cNvSpPr/></dsp:nvSpPr>' +
				`<dsp:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${boxW}" cy="${imageH}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${fillXml}${line}<a:effectLst/></dsp:spPr>` +
				style +
				emptyDrawingTextBody() +
				`<dsp:txXfrm><a:off x="${x}" y="${y}"/><a:ext cx="${boxW}" cy="${imageH}"/></dsp:txXfrm>` +
				'</dsp:sp>'
			shapeXml += `<dsp:sp modelId="${node.presId}">` +
				'<dsp:nvSpPr><dsp:cNvPr id="0" name=""/><dsp:cNvSpPr/></dsp:nvSpPr>' +
				`<dsp:spPr><a:xfrm><a:off x="${x}" y="${textY}"/><a:ext cx="${boxW}" cy="${textH}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${fill}${line}<a:effectLst/></dsp:spPr>` +
				style +
				drawingTextBody(node.text, opt.fontSize, textColor, opt.fontFace) +
				`<dsp:txXfrm><a:off x="${x}" y="${textY}"/><a:ext cx="${boxW}" cy="${textH}"/></dsp:txXfrm>` +
				'</dsp:sp>'
			return
		}
		const modelImageEntry = firstPictureEntry(pictureModel || null, true)
		const modelTextEntry = firstPictureEntry(pictureModel || null, false)
		const modelImageId = modelImageEntry && node.layoutPresIds ? node.layoutPresIds[modelImageEntry.key] : undefined
		const modelTextId = modelTextEntry && node.layoutPresIds ? node.layoutPresIds[modelTextEntry.key] : undefined
		if (pictureModel && node.image && modelImageId) {
			const imageH = Math.max(1, Math.floor(boxH * 0.72))
			const textY = y + imageH
			const textH = Math.max(1, boxH - imageH)
			shapeXml += `<dsp:sp modelId="${modelImageId}">` +
				'<dsp:nvSpPr><dsp:cNvPr id="0" name=""/><dsp:cNvSpPr/></dsp:nvSpPr>' +
				`<dsp:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${boxW}" cy="${imageH}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${fillXml}${line}<a:effectLst/></dsp:spPr>` +
				style +
				emptyDrawingTextBody() +
				`<dsp:txXfrm><a:off x="${x}" y="${y}"/><a:ext cx="${boxW}" cy="${imageH}"/></dsp:txXfrm>` +
				'</dsp:sp>'
			if (modelTextId) {
				shapeXml += `<dsp:sp modelId="${modelTextId}">` +
					'<dsp:nvSpPr><dsp:cNvPr id="0" name=""/><dsp:cNvSpPr/></dsp:nvSpPr>' +
					`<dsp:spPr><a:xfrm><a:off x="${x}" y="${textY}"/><a:ext cx="${boxW}" cy="${textH}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${fill}${line}<a:effectLst/></dsp:spPr>` +
					style +
					drawingTextBody(node.text, opt.fontSize, textColor, opt.fontFace) +
					`<dsp:txXfrm><a:off x="${x}" y="${textY}"/><a:ext cx="${boxW}" cy="${textH}"/></dsp:txXfrm>` +
					'</dsp:sp>'
			}
			return
		}
		shapeXml += `<dsp:sp modelId="${node.presId}">` +
			'<dsp:nvSpPr><dsp:cNvPr id="0" name=""/><dsp:cNvSpPr/></dsp:nvSpPr>' +
			`<dsp:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${boxW}" cy="${boxH}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${fillXml}${line}<a:effectLst/></dsp:spPr>` +
			style +
			drawingTextBody(node.text, opt.fontSize, textColor, opt.fontFace) +
			`<dsp:txXfrm><a:off x="${x}" y="${y}"/><a:ext cx="${boxW}" cy="${boxH}"/></dsp:txXfrm>` +
			'</dsp:sp>'
	})

	return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
		'<dsp:drawing xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram" xmlns:dsp="http://schemas.microsoft.com/office/drawing/2008/diagram" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
		'<dsp:spTree><dsp:nvGrpSpPr><dsp:cNvPr id="0" name=""/><dsp:cNvGrpSpPr/></dsp:nvGrpSpPr><dsp:grpSpPr/>' +
		shapeXml +
		'</dsp:spTree></dsp:drawing>'
}

function rawSmartArtXml(opt: SmartArtProps, key: string): string | null {
	const value = (opt as unknown as Record<string, unknown>)[key]
	return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function retargetSmartArtDataDrawingRelId(rawDataXml: string, drawingRid: string): string {
	try {
		const doc = new DOMParser().parseFromString(rawDataXml, 'text/xml')
		const all = doc.getElementsByTagName('*')
		for (let i = 0; i < all.length; i++) {
			const el = all.item(i)
			if (el && el.localName === 'dataModelExt') el.setAttribute('relId', drawingRid)
		}
		return new XMLSerializer().serializeToString(doc)
	} catch {
		return rawDataXml
	}
}

export function createNativeSmartArt(opt: SmartArtProps, ids: NativeSmartArtIds): { info: NativeSmartArtInfo; parts: NativePackagePart[] } {
	const resolved = resolveNativeSmartArt(opt)
	validateNativeNodeRoles(opt, resolved)
	const nodes = normalizeNativeNodes(opt)
	const labels = nodes.map(node => node.text)
	if (nodes.length === 0) throw new Error('Native SmartArt requires at least one node.')
	const imageParts = attachImageParts(nodes, ids.partIndex)
	const pictureModel = createPictureLayoutModel(resolved)
	ensurePictureLayoutIds(nodes, pictureModel)
	const generatedImageRelsXml = buildImageRelsXml(nodes)
	const partPaths = {
		data: `ppt/diagrams/data${ids.partIndex}.xml`,
		layout: `ppt/diagrams/layout${ids.partIndex}.xml`,
		quickStyle: `ppt/diagrams/quickStyle${ids.partIndex}.xml`,
		colors: `ppt/diagrams/colors${ids.partIndex}.xml`,
		drawing: `ppt/diagrams/drawing${ids.partIndex}.xml`,
	}
	const info: NativeSmartArtInfo = {
		dataRid: ids.dataRid,
		layoutRid: ids.layoutRid,
		quickStyleRid: ids.quickStyleRid,
		colorStyleRid: ids.colorStyleRid,
		drawingRid: ids.drawingRid,
		layoutId: resolved.layout.id,
		layoutName: resolved.layout.name,
		quickStyleId: resolved.quickStyle.id,
		colorStyleId: resolved.colorStyle.id,
		nodes: labels,
		authoredNodes: opt.nodes ? JSON.parse(JSON.stringify(opt.nodes)) : undefined,
		authoredOptions: JSON.parse(JSON.stringify({
			layout: opt.layout,
			layoutId: opt.layoutId,
			layoutName: opt.layoutName,
			quickStyleId: opt.quickStyleId,
			quickStyleName: opt.quickStyleName,
			colorStyleId: opt.colorStyleId,
			colorStyleName: opt.colorStyleName,
			presetFallback: opt.presetFallback,
			rightToLeft: opt.rightToLeft,
			fontFace: opt.fontFace,
			fontSize: opt.fontSize,
			color: opt.color,
			textColors: opt.textColors,
			palette: opt.palette,
			title: opt.title,
			altText: opt.altText,
			fill: opt.fill,
			line: opt.line,
			shadow: opt.shadow,
		})),
		rightToLeft: opt.rightToLeft,
		fontFace: opt.fontFace,
		fontSize: opt.fontSize,
		color: opt.color,
		textColors: opt.textColors ? [...opt.textColors] : undefined,
		palette: opt.palette ? [...opt.palette] : undefined,
		title: opt.title,
		altText: opt.altText,
		partPaths,
	}
	const rawDataXml = rawSmartArtXml(opt, '_rawDataXml')
	const rawLayoutXml = rawSmartArtXml(opt, '_rawLayoutXml')
	const rawQuickStyleXml = rawSmartArtXml(opt, '_rawQuickStyleXml')
	const rawColorsXml = rawSmartArtXml(opt, '_rawColorsXml')
	const rawDrawingXml = rawSmartArtXml(opt, '_rawDrawingXml')
	const rawDataRelsXml = rawSmartArtXml(opt, '_rawDataRelsXml')
	const rawDrawingRelsXml = rawSmartArtXml(opt, '_rawDrawingRelsXml')
	const parts: NativePackagePart[] = [
		{ path: partPaths.data, data: rawDataXml ? retargetSmartArtDataDrawingRelId(rawDataXml, ids.drawingRid) : buildDataModelXml(opt, resolved, nodes, ids.drawingRid, pictureModel), contentType: SMARTART_CONTENT_TYPES.data },
		{ path: partPaths.layout, data: rawLayoutXml || resolved.layout.xml, contentType: SMARTART_CONTENT_TYPES.layout },
		{ path: partPaths.quickStyle, data: rawQuickStyleXml || resolved.quickStyle.xml, contentType: SMARTART_CONTENT_TYPES.quickStyle },
		{ path: partPaths.colors, data: rawColorsXml || resolved.colorStyle.xml, contentType: SMARTART_CONTENT_TYPES.colors },
		{ path: partPaths.drawing, data: rawDrawingXml || buildDrawingXml(opt, resolved, nodes, pictureModel), contentType: SMARTART_CONTENT_TYPES.drawing },
		...imageParts,
	]
	if (rawDataRelsXml) parts.push({ path: `ppt/diagrams/_rels/data${ids.partIndex}.xml.rels`, data: rawDataRelsXml })
	else if (generatedImageRelsXml) parts.push({ path: `ppt/diagrams/_rels/data${ids.partIndex}.xml.rels`, data: generatedImageRelsXml })
	if (rawDrawingRelsXml) parts.push({ path: `ppt/diagrams/_rels/drawing${ids.partIndex}.xml.rels`, data: rawDrawingRelsXml })
	else if (generatedImageRelsXml) parts.push({ path: `ppt/diagrams/_rels/drawing${ids.partIndex}.xml.rels`, data: generatedImageRelsXml })
	return { info, parts }
}

export function genXmlNativeSmartArt(slideItemObj: ISlideObject, ctx: EquationXmlContext): string {
	const info = slideItemObj.smartArt
	if (!info) throw new Error('Native SmartArt object is missing diagram part metadata.')
	const name = slideItemObj.options?.objectName || 'Native SmartArt'
	return '<p:graphicFrame>' +
		'<p:nvGraphicFramePr>' +
		genXmlCNvPr({ id: ctx.shapeId, name, options: slideItemObj.options }) +
		'<p:cNvGraphicFramePr/><p:nvPr/>' +
		'</p:nvGraphicFramePr>' +
		`<p:xfrm${ctx.locationAttr}><a:off x="${ctx.x}" y="${ctx.y}"/><a:ext cx="${ctx.cx}" cy="${ctx.cy}"/></p:xfrm>` +
		'<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/diagram">' +
		`<dgm:relIds xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:dm="${info.dataRid}" r:lo="${info.layoutRid}" r:qs="${info.quickStyleRid}" r:cs="${info.colorStyleRid}"/>` +
		'</a:graphicData></a:graphic>' +
		'</p:graphicFrame>'
}
