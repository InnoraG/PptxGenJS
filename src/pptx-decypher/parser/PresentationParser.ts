/**
 * PresentationParser - Parse extracted PPTX data into presentation model
 */

import * as path from 'path'
import { DOMParser } from '@xmldom/xmldom'
import { 
	PresentationModel, 
	PresentationMetadata,
	SlideModel,
	MediaAsset,
	DecypherWarning,
	HeaderFooterPolicyModel,
	InheritanceColorMap,
	InheritanceFillModel,
	InheritanceLineModel,
	InheritanceShadowModel,
	InheritanceTextStyleModel,
	LayoutOwnedObjectModel,
	PlaceholderDefinitionModel,
	PlaceholderVisualStyleModel,
	SlideLayoutModel,
	SlideMasterModel,
	ThemeModel
} from '../types.js'
import { ExtractedData, MediaFileEntry, PackageXmlPart } from '../extractor/PptxExtractor.js'
import { SlideParser } from './SlideParser.js'
import type { SectionNavigationTarget, SlideNavigationContext, SlideNavigationTarget } from './ShapeParser.js'

const COLOR_MAP_KEYS = [
	'bg1', 'tx1', 'bg2', 'tx2',
	'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6',
	'hlink', 'folHlink'
] as const
const THEME_SLOTS = [
	'dk1', 'lt1', 'dk2', 'lt2',
	'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6',
	'hlink', 'folHlink'
] as const
const OFFICE_THEME_FAMILY_ID = '{62F939B6-93AF-4DB8-9C6B-D6C7DFDC589F}'
const OFFICE_THEME_PRESET_ID = 'theme-office-001'
const PLACEHOLDER_TYPE_FROM_NATIVE: Record<string, string> = {
	sldNum: 'slideNum',
	dt: 'date',
	ftr: 'footer',
	subTitle: 'subtitle',
	tbl: 'table'
}

interface MasterRecord {
	part: PackageXmlPart
	name: string
	themePartName?: string
	inheritedLang?: string
	definition: SlideMasterModel
}

interface LayoutRecord {
	part: PackageXmlPart
	name: string
	masterPartName?: string
	masterName?: string
	definition: SlideLayoutModel
}

export class PresentationParser {
	private warnings: DecypherWarning[] = []
	private slideParser: SlideParser

	constructor() {
		this.slideParser = new SlideParser()
	}

	/**
	 * Parse extracted data into presentation model
	 */
	async parse(data: ExtractedData, outputFolder: string): Promise<PresentationModel> {
		// Parse presentation metadata
		const metadata = this.parseMetadata(data.presentationXml)

		// Convert media files to assets first (need this for mapping)
		const media = this.convertMediaToAssets(data.mediaFiles)

		// Build relationship ID → media ID mapping
		const relToMediaId = this.buildRelationshipToMediaIdMap(data, media)
		const navigationContext = this.buildSlideNavigationContext(data)

		// Parse slides with media mapping
		const slides: SlideModel[] = []
		const orderedPartNumbers = [...navigationContext.byPresentationSlideId.values()].map(target => target.partNumber)
		const seenPartNumbers = new Set(orderedPartNumbers)
		for (const partNumber of data.slides.keys()) if (!seenPartNumbers.has(partNumber)) orderedPartNumbers.push(partNumber)
		for (const slideNum of orderedPartNumbers) {
			const slideData = data.slides.get(slideNum)
			if (!slideData) continue
			const slideModel = await this.slideParser.parse(
				slideNum,
				slideData,
				data,
				outputFolder,
				relToMediaId,
				navigationContext
			)
			const presentationIndex = slides.length + 1
			slideModel.id = navigationContext.byPartNumber.get(slideNum)?.targetSlideId || `slide-${presentationIndex}`
			slideModel.title ||= `Slide ${presentationIndex}`
			slideModel.name ||= slideModel.title
			slides.push(slideModel)
			this.warnings.push(...this.slideParser.getWarnings())
			this.slideParser.clearWarnings()
		}

		const inheritance = this.parseInheritanceTopology(data, metadata, slides)

		return {
			metadata,
			slides,
			media,
			...(navigationContext.sections.length > 0 ? {
				sections: navigationContext.sections.map(section => ({
					id: section.targetSectionId,
					title: section.title,
					slideIds: section.slideTargets.map(slide => slide.targetSlideId),
				}))
			} : {}),
			...(inheritance.themePresetId ? { themePresetId: inheritance.themePresetId } : {}),
			...(inheritance.theme ? { theme: inheritance.theme } : {}),
			...(inheritance.masters.length > 0 ? { masters: inheritance.masters } : {}),
			...(inheritance.layouts.length > 0 ? { layouts: inheritance.layouts } : {})
		}
	}

	private slidePartNumber(target: string): number | undefined {
		const fileName = path.posix.basename(target.split('\\').join('/'))
		const stem = fileName.endsWith('.xml') ? fileName.slice(0, -4) : fileName
		if (!stem.startsWith('slide')) return undefined
		const value = Number(stem.slice('slide'.length))
		return Number.isInteger(value) && value > 0 ? value : undefined
	}

	private buildSlideNavigationContext(data: ExtractedData): SlideNavigationContext {
		const byPartNumber = new Map<number, SlideNavigationTarget>()
		const byPresentationSlideId = new Map<string, SlideNavigationTarget>()
		const presentationRelationships = data.relationships.get('presentation') || []
		const document = this.parseXml(data.presentationXml)
		const slideIds = this.allElements(document, 'sldId')
		for (let index = 0; index < slideIds.length; index++) {
			const slideId = slideIds[index]
			const presentationSlideId = this.presentAttribute(slideId, 'id')
			const relationshipId = this.presentAttribute(slideId, 'r:id')
			const relationship = relationshipId ? presentationRelationships.find(candidate => candidate.id === relationshipId) : undefined
			const partNumber = relationship ? this.slidePartNumber(relationship.target) : undefined
			if (!presentationSlideId || partNumber === undefined || !data.slides.has(partNumber)) continue
			const target = {
				partNumber,
				presentationSlideId,
				targetSlideId: `slide-${index + 1}`,
				targetSlide: index + 1,
			}
			byPartNumber.set(partNumber, target)
			byPresentationSlideId.set(presentationSlideId, target)
		}
		const byPresentationSectionId = new Map<string, SectionNavigationTarget>()
		const sectionByPartNumber = new Map<number, SectionNavigationTarget>()
		const sections: SectionNavigationTarget[] = []
		for (const sectionElement of this.allElements(document, 'section')) {
			const presentationSectionId = this.presentAttribute(sectionElement, 'id')
			const title = this.presentAttribute(sectionElement, 'name')
			if (!presentationSectionId || title === undefined) continue
			const slideTargets = this.allElements(sectionElement, 'sldId')
				.map(element => this.presentAttribute(element, 'id'))
				.map(id => id ? byPresentationSlideId.get(id) : undefined)
				.filter((target): target is SlideNavigationTarget => Boolean(target))
			const section: SectionNavigationTarget = {
				presentationSectionId,
				targetSectionId: `section-${sections.length + 1}`,
				targetSection: sections.length + 1,
				title,
				slideTargets,
			}
			sections.push(section)
			byPresentationSectionId.set(presentationSectionId, section)
			for (const target of slideTargets) if (!sectionByPartNumber.has(target.partNumber)) sectionByPartNumber.set(target.partNumber, section)
		}
		const thumbnailDataUriByRelationship = new Map<string, string>()
		for (const [slideNum, slideData] of data.slides) {
			for (const relationship of slideData.relationships) {
				if (!relationship.type.endsWith('/image') || relationship.targetMode === 'External') continue
				const mediaName = path.basename(relationship.target)
				const media = data.mediaFiles.find(candidate => path.basename(candidate.partName) === mediaName)
				if (!media?.data?.length || !['image/png', 'image/jpeg'].includes(media.contentType)) continue
				thumbnailDataUriByRelationship.set(`${slideNum}:${relationship.id}`, `data:${media.contentType};base64,${media.data.toString('base64')}`)
			}
		}
		return { byPartNumber, byPresentationSlideId, byPresentationSectionId, sectionByPartNumber, sections, thumbnailDataUriByRelationship }
	}

	private parseInheritanceTopology(
		data: ExtractedData,
		metadata: PresentationMetadata,
		slides: SlideModel[]
	): { theme?: ThemeModel; themePresetId?: string; masters: SlideMasterModel[]; layouts: SlideLayoutModel[] } {
		const unorderedMasterParts = [...data.slideMasters.values()]
		const masterPartByName = new Map(unorderedMasterParts.map(part => [part.partName, part]))
		const masterParts: PackageXmlPart[] = []
		const presentationDocument = this.parseXml(data.presentationXml)
		const presentationRelationships = data.relationships.get('presentation') || []
		for (const masterId of this.allElements(presentationDocument, 'sldMasterId')) {
			const relationshipId = this.presentAttribute(masterId, 'r:id')
			const relationship = relationshipId
				? presentationRelationships.find(candidate => candidate.id === relationshipId && candidate.type.endsWith('/slideMaster'))
				: undefined
			const partName = relationship ? this.resolvePackageTarget('ppt/presentation.xml', relationship.target) : undefined
			const part = partName ? masterPartByName.get(partName) : undefined
			if (part && !masterParts.includes(part)) masterParts.push(part)
		}
		for (const part of unorderedMasterParts) if (!masterParts.includes(part)) masterParts.push(part)

		const unorderedLayoutParts = [...data.slideLayouts.values()]
		const layoutPartByName = new Map(unorderedLayoutParts.map(part => [part.partName, part]))
		const layoutParts: PackageXmlPart[] = []
		for (const masterPart of masterParts) {
			const masterDocument = this.parseXml(masterPart.xml)
			for (const layoutId of this.allElements(masterDocument, 'sldLayoutId')) {
				const relationshipId = this.presentAttribute(layoutId, 'r:id')
				const relationship = relationshipId
					? masterPart.relationships.find(candidate => candidate.id === relationshipId && candidate.type.endsWith('/slideLayout'))
					: undefined
				const partName = relationship ? this.resolvePackageTarget(masterPart.partName, relationship.target) : undefined
				const part = partName ? layoutPartByName.get(partName) : undefined
				if (part && !layoutParts.includes(part)) layoutParts.push(part)
			}
		}
		for (const part of unorderedLayoutParts) if (!layoutParts.includes(part)) layoutParts.push(part)
		if (masterParts.length === 0 || layoutParts.length === 0) return { masters: [], layouts: [] }

		const usedMasterNames = new Set<string>()
		const masterByPartName = new Map<string, MasterRecord>()
		for (let index = 0; index < masterParts.length; index++) {
			const part = masterParts[index]
			const document = this.parseXml(part.xml)
			const cSld = this.firstElement(document, 'cSld')
			const name = this.semanticIdentifier(this.presentAttribute(cSld, 'name'), `Master_${index + 1}`, usedMasterNames)
			const themeRelationship = part.relationships.find(rel => rel.type.endsWith('/theme'))
			const themePartName = themeRelationship ? this.resolvePackageTarget(part.partName, themeRelationship.target) : undefined
			const txStyles = this.firstElement(document, 'txStyles')
			const otherDefaultRun = this.directElement(this.directElement(this.directElement(txStyles, 'otherStyle'), 'defPPr'), 'defRPr')
			const inheritedLang = this.presentAttribute(otherDefaultRun, 'lang') || this.allElements(document, 'defRPr')
				.map(run => this.presentAttribute(run, 'lang'))
				.find((value): value is string => Boolean(value))
			const background = this.semanticSolidBackground(document)
			const objects = this.semanticFixedObjects(document)
			const placeholders = this.semanticPlaceholderDefinitions(document)
			const headerFooter = this.semanticHeaderFooter(document)
			const colorMap = this.semanticColorMap(document, 'clrMap')
			const textStyles = this.semanticMasterTextStyles(document)
			const definition: SlideMasterModel = {
				title: name,
				name,
				...(background ? { background } : {}),
				...(objects.length > 0 ? { objects } : {}),
				...(placeholders.length > 0 ? { placeholders } : {}),
				...(headerFooter ? { headerFooter } : {}),
				...(colorMap ? { colorMap } : {}),
				...(textStyles ? { textStyles } : {})
			}
			masterByPartName.set(part.partName, { part, name, themePartName, inheritedLang, definition })
		}

		const usedLayoutNames = new Set<string>()
		const layoutByPartName = new Map<string, LayoutRecord>()
		for (let index = 0; index < layoutParts.length; index++) {
			const part = layoutParts[index]
			const document = this.parseXml(part.xml)
			const root = this.firstElement(document, 'sldLayout')
			const cSld = this.firstElement(document, 'cSld')
			const name = this.semanticIdentifier(this.presentAttribute(cSld, 'name'), `Layout_${index + 1}`, usedLayoutNames)
			const masterRelationship = part.relationships.find(rel => rel.type.endsWith('/slideMaster'))
			const masterPartName = masterRelationship ? this.resolvePackageTarget(part.partName, masterRelationship.target) : undefined
			const masterName = masterPartName ? masterByPartName.get(masterPartName)?.name : undefined
			const background = this.semanticSolidBackground(document)
			const objects = this.semanticFixedObjects(document)
			const placeholders = this.semanticPlaceholderDefinitions(document)
			const headerFooter = this.semanticHeaderFooter(document)
			const colorMapOverride = this.semanticColorMap(document, 'overrideClrMapping')
			const definition: SlideLayoutModel = {
				name,
				width: metadata.layout.width,
				height: metadata.layout.height,
				...(this.presentAttribute(root, 'type') ? { type: this.presentAttribute(root, 'type') } : {}),
				...(masterName ? { masterName } : {}),
				...(background ? { background } : {}),
				...(objects.length > 0 ? { objects } : {}),
				...(placeholders.length > 0 ? { placeholders } : {}),
				...(headerFooter ? { headerFooter } : {}),
				...(colorMapOverride ? { colorMapOverride } : {})
			}
			layoutByPartName.set(part.partName, { part, name, masterPartName, masterName, definition })
		}

		const slideLayoutRecords = new Map<number, LayoutRecord>()
		for (const [slideNumber, slideData] of data.slides) {
			const layoutRelationship = slideData.relationships.find(rel => rel.type.endsWith('/slideLayout'))
			const layoutPartName = layoutRelationship
				? this.resolvePackageTarget(`ppt/slides/slide${slideNumber}.xml`, layoutRelationship.target)
				: undefined
			const layout = layoutPartName ? layoutByPartName.get(layoutPartName) : undefined
			if (layout) slideLayoutRecords.set(slideNumber, layout)
		}

		for (const slide of slides) {
			const layout = slideLayoutRecords.get(slide.index)
			if (!layout) continue
			slide.layoutName = layout.name
			if (layout.masterName) slide.masterName = layout.masterName
			const slideData = data.slides.get(slide.index)
			if (!slideData) continue
			const document = this.parseXml(slideData.xml)
			const root = this.firstElement(document, 'sld')
			const colorMapOverride = this.semanticColorMap(document, 'overrideClrMapping')
			if (colorMapOverride) slide.colorMapOverride = colorMapOverride
			const showMasterShapes = this.ooxmlBoolean(this.presentAttribute(root, 'showMasterSp'))
			const showMasterPhAnim = this.ooxmlBoolean(this.presentAttribute(root, 'showMasterPhAnim'))
			if (showMasterShapes !== undefined) slide.showMasterShapes = showMasterShapes
			if (showMasterPhAnim !== undefined) slide.showMasterPhAnim = showMasterPhAnim
		}

		const defaultMaster = masterParts.length > 0 ? masterByPartName.get(masterParts[0].partName) : undefined
		let themePart: PackageXmlPart | undefined
		if (defaultMaster?.themePartName) {
			themePart = [...data.themes.values()].find(part => part.partName === defaultMaster.themePartName)
		}
		if (!themePart) themePart = data.themes.values().next().value
		const themeDocument = themePart ? this.parseXml(themePart.xml) : undefined
		const theme = themeDocument ? this.semanticTheme(themeDocument) : undefined
		const themePresetId = themeDocument ? this.semanticThemePresetId(themeDocument) : undefined
		if (theme && defaultMaster?.inheritedLang) theme.lang = defaultMaster.inheritedLang

		return {
			theme,
			themePresetId,
			masters: masterParts.map(part => masterByPartName.get(part.partName)?.definition).filter((definition): definition is SlideMasterModel => Boolean(definition)),
			layouts: layoutParts.map(part => layoutByPartName.get(part.partName)?.definition).filter((definition): definition is SlideLayoutModel => Boolean(definition))
		}
	}

	private parseXml(xml: string): Document {
		return new DOMParser().parseFromString(xml, 'application/xml')
	}

	private allElements(root: Document | Element | null | undefined, localName: string): Element[] {
		if (!root) return []
		const result: Element[] = []
		if ((root as Element).localName === localName) result.push(root as Element)
		const nodes = root.getElementsByTagName('*')
		for (let index = 0; index < nodes.length; index++) {
			const element = nodes.item(index)
			if (element?.localName === localName) result.push(element)
		}
		return result
	}

	private firstElement(root: Document | Element | null | undefined, localName: string): Element | null {
		return this.allElements(root, localName)[0] || null
	}

	private directElements(parent: Element | null | undefined): Element[] {
		if (!parent) return []
		const result: Element[] = []
		for (let index = 0; index < parent.childNodes.length; index++) {
			const node = parent.childNodes.item(index)
			if (node?.nodeType === 1) result.push(node as Element)
		}
		return result
	}

	private directElement(parent: Element | null | undefined, localNames: string | string[]): Element | null {
		const accepted = new Set(Array.isArray(localNames) ? localNames : [localNames])
		return this.directElements(parent).find(element => accepted.has(element.localName)) || null
	}

	private presentAttribute(element: Element | null | undefined, name: string): string | undefined {
		return element?.hasAttribute(name) ? element.getAttribute(name) || '' : undefined
	}

	private resolvePackageTarget(sourcePart: string, target: string): string | undefined {
		if (!target || target.includes('://')) return undefined
		const normalized = target.startsWith('/')
			? path.posix.normalize(target.substring(1))
			: path.posix.normalize(path.posix.join(path.posix.dirname(sourcePart), target))
		return !normalized || normalized === '..' || normalized.startsWith('../') ? undefined : normalized
	}

	private semanticIdentifier(value: string | undefined, fallback: string, used: Set<string>): string {
		const raw = value?.trim() || ''
		const stem = (raw || fallback).replace(/[^A-Za-z0-9._:-]+/g, '_').replace(/^_+|_+$/g, '') || fallback
		let candidate = stem
		let suffix = 2
		while (used.has(candidate)) candidate = `${stem}_${suffix++}`
		used.add(candidate)
		return candidate
	}

	private ooxmlBoolean(value: string | undefined): boolean | undefined {
		if (value === undefined) return undefined
		const normalized = value.trim().toLowerCase()
		if (['1', 'true', 'on', 'yes'].includes(normalized)) return true
		if (['0', 'false', 'off', 'no'].includes(normalized)) return false
		return undefined
	}

	private semanticHeaderFooter(document: Document): HeaderFooterPolicyModel | undefined {
		const element = this.firstElement(document, 'hf')
		if (!element) return undefined
		const result: HeaderFooterPolicyModel = {}
		for (const [nativeName, publicName] of [
			['dt', 'date'], ['hdr', 'header'], ['ftr', 'footer'], ['sldNum', 'slideNumber']
		] as const) {
			const value = this.ooxmlBoolean(this.presentAttribute(element, nativeName))
			if (value !== undefined) result[publicName] = value
		}
		return Object.keys(result).length > 0 ? result : undefined
	}

	private semanticColorToken(parent: Element | null | undefined, allowScheme = true): string | undefined {
		if (!parent) return undefined
		const direct = this.directElements(parent).find(element => ['srgbClr', 'schemeClr', 'sysClr'].includes(element.localName))
		const colorElement = direct
			|| this.firstElement(parent, 'srgbClr')
			|| (allowScheme ? this.firstElement(parent, 'schemeClr') : null)
			|| this.firstElement(parent, 'sysClr')
		if (!colorElement) return undefined
		if (colorElement.localName === 'schemeClr') {
			const value = this.presentAttribute(colorElement, 'val')
			return allowScheme && value && /^(?:bg1|tx1|bg2|tx2|dk1|lt1|dk2|lt2|accent[1-6]|hlink|folHlink|phClr)$/.test(value)
				? value
				: undefined
		}
		const value = colorElement.localName === 'sysClr'
			? this.presentAttribute(colorElement, 'lastClr')
			: this.presentAttribute(colorElement, 'val')
		return value && /^[0-9A-Fa-f]{6}$/.test(value) ? value.toUpperCase() : undefined
	}

	private semanticTransparency(parent: Element | null | undefined): number | undefined {
		const raw = this.presentAttribute(this.firstElement(parent, 'alpha'), 'val')
		if (raw === undefined) return undefined
		const value = Number(raw)
		if (!Number.isFinite(value)) return undefined
		return Number(Math.max(0, Math.min(100, 100 - value / 1000)).toFixed(3))
	}

	private semanticSolidFill(parent: Element | null | undefined, allowScheme = true): InheritanceFillModel | undefined {
		if (!parent) return undefined
		if (this.directElement(parent, 'noFill')) return { type: 'none' }
		const solidFill = this.directElement(parent, 'solidFill')
		if (!solidFill) return undefined
		const color = this.semanticColorToken(solidFill, allowScheme)
		const transparency = this.semanticTransparency(solidFill)
		return {
			type: 'solid',
			...(color ? { color } : {}),
			...(transparency !== undefined ? { transparency } : {})
		}
	}

	private semanticLine(spPr: Element | null | undefined, allowScheme = true): InheritanceLineModel | undefined {
		const line = this.directElement(spPr, 'ln')
		if (!line) return undefined
		if (this.directElement(line, 'noFill')) return { type: 'none' }
		const solidFill = this.directElement(line, 'solidFill')
		const color = this.semanticColorToken(solidFill, allowScheme)
		const transparency = this.semanticTransparency(solidFill)
		const rawWidth = this.presentAttribute(line, 'w')
		const width = rawWidth === undefined ? NaN : Number(rawWidth)
		const dash = this.directElement(line, 'prstDash')
		return {
			type: 'solid',
			...(color ? { color } : {}),
			...(Number.isFinite(width) && width >= 0 ? { width: this.emuToPoints(width) } : {}),
			...(transparency !== undefined ? { transparency } : {}),
			...(this.presentAttribute(dash, 'val') ? { dashType: this.presentAttribute(dash, 'val') } : {})
		}
	}

	private semanticShadow(spPr: Element | null | undefined): InheritanceShadowModel | undefined {
		const outerShadow = this.directElement(this.directElement(spPr, 'effectLst'), 'outerShdw')
		if (!outerShadow) return undefined
		const color = this.semanticColorToken(outerShadow, false)
		const numberAttribute = (name: string): number | undefined => {
			const raw = this.presentAttribute(outerShadow, name)
			if (raw === undefined) return undefined
			const value = Number(raw)
			return Number.isFinite(value) ? value : undefined
		}
		const blur = numberAttribute('blurRad')
		const distance = numberAttribute('dist')
		const direction = numberAttribute('dir')
		const transparency = this.semanticTransparency(outerShadow)
		return {
			type: 'outer',
			...(color ? { color } : {}),
			...(blur !== undefined ? { blur: this.emuToPoints(blur) } : {}),
			...(distance !== undefined ? { distance: this.emuToPoints(distance) } : {}),
			...(direction !== undefined ? { angle: Number((direction / 60000).toFixed(3)) } : {}),
			...(transparency !== undefined ? { opacity: Number((1 - transparency / 100).toFixed(6)) } : {})
		}
	}

	private semanticTextStyle(
		node: Element | null | undefined,
		options: { includeValign?: boolean; allowScheme?: boolean } = {}
	): InheritanceTextStyleModel | undefined {
		if (!node) return undefined
		const paragraph = this.firstElement(node, 'lvl1pPr')
			|| this.firstElement(node, 'defPPr')
			|| this.firstElement(node, 'pPr')
			|| node
		const run = this.firstElement(paragraph, 'defRPr')
			|| this.firstElement(paragraph, 'rPr')
			|| this.firstElement(paragraph, 'endParaRPr')
		const result: InheritanceTextStyleModel = {}
		const fontFace = this.presentAttribute(this.firstElement(run, 'latin'), 'typeface')
		if (fontFace) result.fontFace = fontFace
		const rawSize = this.presentAttribute(run, 'sz')
		const size = rawSize === undefined ? NaN : Number(rawSize)
		if (Number.isFinite(size) && size > 0) result.fontSize = Number((size / 100).toFixed(3))
		const color = this.semanticColorToken(run, options.allowScheme !== false)
		if (color) result.color = color
		for (const [nativeName, publicName] of [['b', 'bold'], ['i', 'italic']] as const) {
			const value = this.ooxmlBoolean(this.presentAttribute(run, nativeName))
			if (value !== undefined) result[publicName] = value
		}
		const align = ({ l: 'left', ctr: 'center', r: 'right', just: 'justify' } as const)[this.presentAttribute(paragraph, 'algn') || '']
		if (align) result.align = align
		if (options.includeValign) {
			const valign = ({ t: 'top', ctr: 'middle', b: 'bottom' } as const)[this.presentAttribute(this.firstElement(node, 'bodyPr'), 'anchor') || '']
			if (valign) result.valign = valign
		}
		return Object.keys(result).length > 0 ? result : undefined
	}

	private semanticStyleReferences(shape: Element): PlaceholderVisualStyleModel['styleRefs'] | undefined {
		const style = this.directElement(shape, 'style')
		if (!style) return undefined
		const result: NonNullable<PlaceholderVisualStyleModel['styleRefs']> = {}
		for (const [publicName, nativeName] of [
			['line', 'lnRef'], ['fill', 'fillRef'], ['effect', 'effectRef'], ['font', 'fontRef']
		] as const) {
			const reference = this.directElement(style, nativeName)
			if (!reference) continue
			const entry: { index?: number; role?: 'major' | 'minor' | 'none'; color?: string } = {}
			const index = this.presentAttribute(reference, 'idx')
			if (publicName === 'font' && (index === 'major' || index === 'minor' || index === 'none')) entry.role = index
			else if (index !== undefined && Number.isInteger(Number(index)) && Number(index) >= 0) entry.index = Number(index)
			const color = this.semanticColorToken(reference)
			if (color) entry.color = color
			result[publicName] = entry
		}
		return Object.keys(result).length > 0 ? result : undefined
	}

	private semanticPlaceholderStyle(shape: Element): PlaceholderVisualStyleModel | undefined {
		const spPr = this.directElement(shape, 'spPr')
		const preset = this.presentAttribute(this.firstElement(spPr, 'prstGeom'), 'prst')
		const fill = this.semanticSolidFill(spPr)
		const line = this.semanticLine(spPr)
		const shadow = this.semanticShadow(spPr)
		const styleRefs = this.semanticStyleReferences(shape)
		const textStyle = this.semanticTextStyle(this.firstElement(shape, 'txBody'), { includeValign: true })
		const result: PlaceholderVisualStyleModel = {
			...(preset ? { preset } : {}),
			...(fill ? { fill } : {}),
			...(line ? { line } : {}),
			...(shadow ? { shadow } : {}),
			...(styleRefs ? { styleRefs } : {}),
			...(textStyle || {})
		}
		return Object.keys(result).length > 0 ? result : undefined
	}

	private semanticGeometry(shape: Element): { x: number; y: number; w: number; h: number } | undefined {
		const spPr = this.directElement(shape, ['spPr', 'grpSpPr'])
		const xfrm = this.firstElement(spPr, 'xfrm')
		const off = this.directElement(xfrm, 'off')
		const ext = this.directElement(xfrm, 'ext')
		const values = [
			this.presentAttribute(off, 'x'), this.presentAttribute(off, 'y'),
			this.presentAttribute(ext, 'cx'), this.presentAttribute(ext, 'cy')
		].map(value => value === undefined ? NaN : Number(value))
		if (!values.every(Number.isFinite) || values[2] < 0 || values[3] < 0) return undefined
		return {
			x: this.emuToInches(values[0]), y: this.emuToInches(values[1]),
			w: this.emuToInches(values[2]), h: this.emuToInches(values[3])
		}
	}

	private semanticShapeText(shape: Element): string | undefined {
		const txBody = this.firstElement(shape, 'txBody')
		if (!txBody) return undefined
		const paragraphs = this.allElements(txBody, 'p').map(paragraph =>
			this.allElements(paragraph, 't').map(run => run.textContent || '').join('')
		)
		return paragraphs.length > 0 ? paragraphs.join('\n') : ''
	}

	private semanticFixedObjects(document: Document): LayoutOwnedObjectModel[] {
		const spTree = this.directElement(this.firstElement(document, 'cSld'), 'spTree')
		if (!spTree) return []
		const objects: LayoutOwnedObjectModel[] = []
		for (const shape of this.directElements(spTree)) {
			if (shape.localName !== 'sp' && shape.localName !== 'cxnSp') continue
			if (this.firstElement(shape, 'ph')) continue
			const geometry = this.semanticGeometry(shape)
			if (!geometry) continue
			const spPr = this.directElement(shape, 'spPr')
			const preset = this.presentAttribute(this.firstElement(spPr, 'prstGeom'), 'prst')
			const objectName = this.presentAttribute(this.firstElement(shape, 'cNvPr'), 'name')
			const fill = this.semanticSolidFill(spPr, false)
			const line = this.semanticLine(spPr, false)
			const shadow = this.semanticShadow(spPr)
			const common = {
				...geometry,
				...(objectName ? { objectName } : {}),
				...(fill ? { fill } : {}),
				...(line ? { line } : {}),
				...(shadow ? { shadow } : {})
			}
			const text = this.semanticShapeText(shape)
			if (text !== undefined && text.length > 0) {
				objects.push({
					text: {
						text,
						options: {
							...common,
							...(this.semanticTextStyle(this.firstElement(shape, 'txBody'), { includeValign: true, allowScheme: false }) || {})
						}
					}
				})
			} else if (shape.localName === 'cxnSp' || preset === 'line') objects.push({ line: common })
			else if (preset === 'rect') objects.push({ rect: common })
		}
		return objects
	}

	private semanticSolidBackground(document: Document): InheritanceFillModel | undefined {
		const background = this.directElement(this.firstElement(document, 'cSld'), 'bg')
		const fill = this.semanticSolidFill(this.directElement(background, 'bgPr'), false)
		return fill?.type === 'solid' && fill.color ? fill : undefined
	}

	private semanticColorMap(document: Document, localName: string): InheritanceColorMap | undefined {
		const element = this.firstElement(document, localName)
		if (!element) return undefined
		const result: InheritanceColorMap = {}
		for (const key of COLOR_MAP_KEYS) {
			const value = this.presentAttribute(element, key)
			if (value && (THEME_SLOTS as readonly string[]).includes(value)) result[key] = value
		}
		return Object.keys(result).length > 0 ? result : undefined
	}

	private semanticMasterTextStyles(document: Document): SlideMasterModel['textStyles'] | undefined {
		const txStyles = this.firstElement(document, 'txStyles')
		if (!txStyles) return undefined
		const result: NonNullable<SlideMasterModel['textStyles']> = {}
		for (const [publicName, nativeName] of [
			['title', 'titleStyle'], ['body', 'bodyStyle'], ['other', 'otherStyle']
		] as const) {
			const style = this.semanticTextStyle(this.directElement(txStyles, nativeName))
			if (style) result[publicName] = style
		}
		return Object.keys(result).length > 0 ? result : undefined
	}

	private semanticPlaceholderDefinitions(document: Document): PlaceholderDefinitionModel[] {
		const result: PlaceholderDefinitionModel[] = []
		const usedNames = new Set<string>()
		for (const placeholder of this.allElements(document, 'ph')) {
			const nvPr = placeholder.parentNode as Element | null
			const nonVisual = nvPr?.parentNode as Element | null
			const shape = nonVisual?.parentNode as Element | null
			if (nvPr?.localName !== 'nvPr' || !nonVisual || !shape) continue
			const nativeType = this.presentAttribute(placeholder, 'type') || 'obj'
			// Imported header placeholders remain private because authoring them on a
			// layout can make repair-disabled PowerPoint reject the package.
			if (nativeType === 'hdr') continue
			const type = PLACEHOLDER_TYPE_FROM_NATIVE[nativeType] || nativeType
			const rawIndex = this.presentAttribute(placeholder, 'idx')
			const index = rawIndex === undefined ? 0 : Number(rawIndex)
			if (!Number.isInteger(index) || index < 0 || index > 0xffffffff) continue
			const rawSize = this.presentAttribute(placeholder, 'sz')
			const size = rawSize === 'full' || rawSize === 'half' || rawSize === 'quarter' ? rawSize : undefined
			const rawOrient = this.presentAttribute(placeholder, 'orient')
			const orient = nativeType !== 'clipArt' && (rawOrient === 'horz' || rawOrient === 'vert') ? rawOrient : undefined
			const hasCustomPrompt = this.ooxmlBoolean(this.presentAttribute(placeholder, 'hasCustomPrompt'))
			const cNvPr = this.firstElement(nonVisual, 'cNvPr')
			const name = this.semanticIdentifier(
				this.presentAttribute(cNvPr, 'name'),
				`${type}-${index}`,
				usedNames
			).substring(0, 128)
			const geometry = this.semanticGeometry(shape)
			const style = this.semanticPlaceholderStyle(shape)
			result.push({
				name,
				type,
				idx: index,
				...(size ? { size } : {}),
				...(orient ? { orient } : {}),
				...(hasCustomPrompt !== undefined ? { hasCustomPrompt } : {}),
				...(geometry && geometry.w > 0 && geometry.h > 0 ? geometry : {}),
				...(style ? { style } : {})
			})
		}
		return result
	}

	private semanticTheme(document: Document): ThemeModel | undefined {
		const themeElement = this.firstElement(document, 'theme')
		const majorTypeface = this.presentAttribute(this.firstElement(this.firstElement(document, 'majorFont'), 'latin'), 'typeface')
		const minorTypeface = this.presentAttribute(this.firstElement(this.firstElement(document, 'minorFont'), 'latin'), 'typeface')
		const colorSchemeElement = this.firstElement(document, 'clrScheme')
		const colorScheme: NonNullable<ThemeModel['colorScheme']> = {}
		if (colorSchemeElement) {
			for (const slot of THEME_SLOTS) {
				const slotElement = this.directElement(colorSchemeElement, slot)
				const colorElement = this.directElements(slotElement).find(element => element.localName === 'srgbClr' || element.localName === 'sysClr')
				const value = colorElement?.localName === 'sysClr'
					? this.presentAttribute(colorElement, 'lastClr')
					: this.presentAttribute(colorElement, 'val')
				if (value && /^[0-9A-Fa-f]{6}$/.test(value)) colorScheme[slot] = value.toUpperCase()
			}
		}
		const result: ThemeModel = {
			...(this.presentAttribute(themeElement, 'name') ? { name: this.presentAttribute(themeElement, 'name') } : {}),
			...(minorTypeface ? { fontFace: minorTypeface, bodyFontFace: minorTypeface } : {}),
			...(majorTypeface ? { headFontFace: majorTypeface } : {}),
			...(Object.keys(colorScheme).length > 0 ? { colorScheme } : {})
		}
		return Object.keys(result).length > 0 ? result : undefined
	}

	private semanticThemePresetId(document: Document): string | undefined {
		const theme = this.firstElement(document, 'theme')
		const family = this.firstElement(document, 'themeFamily')
		const themeName = this.presentAttribute(theme, 'name')?.trim()
		const familyName = this.presentAttribute(family, 'name')?.trim()
		const familyId = this.presentAttribute(family, 'id')?.trim().toUpperCase()
		return themeName === 'Office Theme' && familyName === 'Office Theme' && familyId === OFFICE_THEME_FAMILY_ID
			? OFFICE_THEME_PRESET_ID
			: undefined
	}

	/**
	 * Parse presentation metadata from presentation.xml
	 */
	private parseMetadata(xml: string): PresentationMetadata {
		// Default to standard 16:9
		let width = 10
		let height = 5.625

		// Parse slide size
		// <p:sldSz cx="9144000" cy="6858000"/>
		const sldSzMatch = xml.match(/<p:sldSz\s+([^>]+)/)
		if (sldSzMatch) {
			const attrs = this.parseAttributes(sldSzMatch[1])
			if (attrs.cx) {
				width = this.emuToInches(parseInt(attrs.cx))
			}
			if (attrs.cy) {
				height = this.emuToInches(parseInt(attrs.cy))
			}
		}

		return {
			layout: { width, height }
		}
	}

	/**
	 * Convert media file entries to MediaAsset objects
	 */
	private convertMediaToAssets(mediaFiles: MediaFileEntry[]): MediaAsset[] {
		return mediaFiles.map((mf, index) => {
			const fileName = path.basename(mf.partName)
			const ext = path.extname(fileName).toLowerCase()
			
			let type: 'image' | 'video' | 'audio' = 'image'
			if (['.mp4', '.m4v', '.mov', '.avi', '.wmv'].includes(ext)) {
				type = 'video'
			} else if (['.mp3', '.wav', '.m4a', '.wma'].includes(ext)) {
				type = 'audio'
			}

			return {
				id: `media${index + 1}`,
				type,
				originalName: fileName,
				extractedPath: mf.extractedPath,
				mimeType: mf.contentType,
				relationshipId: '' // Will be filled when parsing slides
			}
		})
	}

	/**
	 * Build mapping from relationship ID to media asset ID
	 * Maps: rId5 → media1, rId6 → media2, etc.
	 */
	private buildRelationshipToMediaIdMap(
		data: ExtractedData,
		mediaAssets: MediaAsset[]
	): Map<string, string> {
		const map = new Map<string, string>()

		// For each slide, check its relationships
		for (const [slideNum, slideData] of data.slides) {
			for (const rel of slideData.relationships) {
				// Check if this relationship points to a media file
				// rel.target is like "../media/image1.png" or "../media/media1.mp4"
				const mediaFileName = path.basename(rel.target)
				
				// Find which media asset matches this file
				const mediaAsset = mediaAssets.find(ma => 
					path.basename(ma.extractedPath) === mediaFileName
				)
				
				if (mediaAsset) {
					// Map this relationship ID to the media asset ID
					// Key: slideNum + rId (e.g., "1:rId5")
					// Value: media asset ID (e.g., "media1")
					const key = `${slideNum}:${rel.id}`
					map.set(key, mediaAsset.id)
				}
			}
		}

		return map
	}

	/**
	 * Parse XML attributes
	 */
	private parseAttributes(attrString: string): { [key: string]: string } {
		const attrs: { [key: string]: string } = {}
		const matches = attrString.matchAll(/(\w+)="([^"]*)"/g)
		for (const match of matches) {
			attrs[match[1]] = match[2]
		}
		return attrs
	}

	/**
	 * Convert EMUs to inches
	 * 1 inch = 914400 EMUs
	 */
	private emuToInches(emu: number): number {
		return Math.round((emu / 914400) * 1000000) / 1000000
	}

	private emuToPoints(emu: number): number {
		return Math.round((emu / 12700) * 100) / 100
	}

	getWarnings(): DecypherWarning[] {
		return this.warnings
	}
}
