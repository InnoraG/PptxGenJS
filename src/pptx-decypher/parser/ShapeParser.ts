/**
 * ShapeParser - Parse shapes from slide XML
 */

import * as fs from 'fs'
import * as path from 'path'
import { DOMParser } from '@xmldom/xmldom'
import {
	ShapeModel,
	ShapeType,
	ShapeOptions,
	TextModel,
	ParagraphModel,
	TextRunModel,
	TextRunProperties,
	ParagraphProperties,
	TextBodyProperties,
	TableModel,
	FillModel,
	LineModel,
	ShadowModel,
	GlowModel,
	PassthroughModel,
	DecypherWarning,
	ShapeEditabilityModel
} from '../types.js'
import { SlideExtracted } from '../extractor/PptxExtractor.js'

export interface SlideNavigationTarget {
	partNumber: number
	presentationSlideId: string
	targetSlideId: string
	targetSlide: number
}

export interface SectionNavigationTarget {
	presentationSectionId: string
	targetSectionId: string
	targetSection: number
	title: string
	slideTargets: SlideNavigationTarget[]
}

export interface SlideNavigationContext {
	byPartNumber: Map<number, SlideNavigationTarget>
	byPresentationSlideId: Map<string, SlideNavigationTarget>
	byPresentationSectionId: Map<string, SectionNavigationTarget>
	sectionByPartNumber: Map<number, SectionNavigationTarget>
	sections: SectionNavigationTarget[]
	thumbnailDataUriByRelationship: Map<string, string>
}

const PLACEHOLDER_NATIVE_TO_SEMANTIC: Record<string, string> = {
	sldNum: 'slideNum', dt: 'date', media: 'media', body: 'body',
	ftr: 'footer', title: 'title', subTitle: 'subtitle', tbl: 'table',
}

function canonicalPlaceholderBindingFromNative(value: Record<string, unknown>): Record<string, unknown> | undefined {
	const nativeType = typeof value.phType === 'string' ? value.phType : undefined
	if (nativeType === 'hdr') return undefined
	const idx = typeof value.phIdx === 'number' && Number.isInteger(value.phIdx) ? value.phIdx : undefined
	const size = typeof value.phSz === 'string' ? value.phSz : undefined
	const orient = typeof value.phOrient === 'string' && nativeType !== 'clipArt' ? value.phOrient : undefined
	const hasCustomPrompt = typeof value.phHasCustomPrompt === 'boolean' ? value.phHasCustomPrompt : undefined
	if (!nativeType && idx === undefined && !size && !orient && hasCustomPrompt === undefined) return value.hasBarePh === true ? { bare: true } : undefined
	return {
		...(nativeType ? { type: PLACEHOLDER_NATIVE_TO_SEMANTIC[nativeType] || nativeType } : {}),
		...(idx !== undefined ? { idx } : {}),
		...(size ? { size } : {}),
		...(orient ? { orient } : {}),
		...(hasCustomPrompt !== undefined ? { hasCustomPrompt } : {}),
	}
}

// Map of OOXML preset geometry to PptxGenJS shape names
const PRESET_GEOMETRY_MAP: { [key: string]: string } = {
	'rect': 'rect',
	'roundRect': 'roundRect',
	'ellipse': 'ellipse',
	'triangle': 'triangle',
	'rtTriangle': 'rtTriangle',
	'parallelogram': 'parallelogram',
	'trapezoid': 'trapezoid',
	'pentagon': 'pentagon',
	'hexagon': 'hexagon',
	'heptagon': 'heptagon',
	'octagon': 'octagon',
	'star4': 'star4',
	'star5': 'star5',
	'star6': 'star6',
	'star8': 'star8',
	'star10': 'star10',
	'star12': 'star12',
	'star16': 'star16',
	'star24': 'star24',
	'star32': 'star32',
	'rightArrow': 'rightArrow',
	'leftArrow': 'leftArrow',
	'upArrow': 'upArrow',
	'downArrow': 'downArrow',
	'leftRightArrow': 'leftRightArrow',
	'upDownArrow': 'upDownArrow',
	'diamond': 'diamond',
	'plus': 'plus',
	'minus': 'minus',
	'cross': 'cross',
	'cloud': 'cloud',
	'heart': 'heart',
	'lightning': 'lightningBolt',
	'sun': 'sun',
	'moon': 'moon',
	'arc': 'arc',
	'line': 'line',
	'chevron': 'chevron',
	'homePlate': 'homePlate',
	'cube': 'cube',
	'can': 'can',
	'donut': 'donut',
	'noSmoking': 'noSmoking',
	'blockArc': 'blockArc',
	'foldedCorner': 'foldedCorner',
	'smileyFace': 'smileyFace',
	'actionButtonBlank': 'actionButtonBlank',
	'actionButtonHome': 'actionButtonHome',
	'actionButtonHelp': 'actionButtonHelp',
	'actionButtonInformation': 'actionButtonInformation',
	'actionButtonBackPrevious': 'actionButtonBackPrevious',
	'actionButtonForwardNext': 'actionButtonForwardNext',
	'actionButtonBeginning': 'actionButtonBeginning',
	'actionButtonEnd': 'actionButtonEnd',
	'actionButtonReturn': 'actionButtonReturn',
	'actionButtonDocument': 'actionButtonDocument',
	'actionButtonSound': 'actionButtonSound',
	'actionButtonMovie': 'actionButtonMovie',
	'flowChartProcess': 'flowChartProcess',
	'flowChartDecision': 'flowChartDecision',
	'flowChartTerminator': 'flowChartTerminator',
	'flowChartDocument': 'flowChartDocument',
	'flowChartPredefinedProcess': 'flowChartPredefinedProcess',
	'flowChartInternalStorage': 'flowChartInternalStorage',
	'flowChartManualInput': 'flowChartManualInput',
	'flowChartManualOperation': 'flowChartManualOperation',
	'flowChartConnector': 'flowChartConnector',
	'flowChartOffpageConnector': 'flowChartOffpageConnector',
	'flowChartDelay': 'flowChartDelay',
	'flowChartAlternateProcess': 'flowChartAlternateProcess',
	'callout1': 'wedgeRoundRectCallout',
	'callout2': 'wedgeRoundRectCallout',
	'callout3': 'wedgeRoundRectCallout',
	'wedgeRectCallout': 'wedgeRectCallout',
	'wedgeRoundRectCallout': 'wedgeRoundRectCallout',
	'wedgeEllipseCallout': 'wedgeEllipseCallout',
	'cloudCallout': 'cloudCallout',
	'borderCallout1': 'borderCallout1',
	'borderCallout2': 'borderCallout2',
	'borderCallout3': 'borderCallout3',
	'ribbon': 'ribbon',
	'ribbon2': 'ribbon2',
	'wave': 'wave',
	'doubleWave': 'doubleWave'
}

export class ShapeParser {
	private warnings: DecypherWarning[] = []

	/**
	 * Parse all shapes from slide XML
	 */
	parseAll(
		xml: string,
		slideData: SlideExtracted,
		slideNum: number,
		outputFolder: string,
		relToMediaId?: Map<string, string>,
		navigationContext?: SlideNavigationContext
	): ShapeModel[] {
		const shapes: ShapeModel[] = []

		for (const elementXml of this.extractShapeTreeChildren(xml)) {
			const tagName = this.readElementTagName(elementXml, 0)
			if (!tagName || tagName === 'p:nvGrpSpPr' || tagName === 'p:grpSpPr') continue

			let shape: ShapeModel | null = null
			if (tagName === 'p:sp') {
				shape = this.parseShape(elementXml, slideData, slideNum, outputFolder, navigationContext)
			} else if (tagName === 'p:pic') {
				shape = this.parsePicture(elementXml, slideData, slideNum, outputFolder, relToMediaId)
			} else if (tagName === 'p:graphicFrame') {
				shape = this.parseGraphicFrame(elementXml, slideData, slideNum, outputFolder)
			} else if (tagName === 'p:grpSp') {
				shape = this.parseGroupShape(elementXml, slideData, slideNum, outputFolder)
			} else if (tagName === 'mc:AlternateContent' && this.isSlideZoomXml(elementXml)) {
				shape = this.parseSlideZoom(elementXml, slideData, slideNum, outputFolder, navigationContext)
			} else if (tagName === 'mc:AlternateContent' && this.isSectionZoomXml(elementXml)) {
				shape = this.parseSectionZoom(elementXml, slideData, slideNum, outputFolder, navigationContext)
			} else if (tagName === 'mc:AlternateContent' && this.isSummaryZoomXml(elementXml)) {
				shape = this.parseSummaryZoom(elementXml, slideData, slideNum, outputFolder, navigationContext)
			} else if (tagName === 'mc:AlternateContent' && this.isChartExXml(elementXml)) {
				shape = this.parseChartExAlternateContent(elementXml, slideData, slideNum, outputFolder)
			} else {
				const idMatch = elementXml.match(/<p:cNvPr\s+id="(\d+)"/)
				if (idMatch) shape = this.parseUnknownElement(elementXml, parseInt(idMatch[1]), slideNum, outputFolder)
			}
			if (shape) {
				const accessibility = this.parseAccessibilityMetadata(elementXml)
				const placeholder = this.parsePlaceholderMetadata(elementXml)
				const isSemanticZoom = ['slideZoom', 'sectionZoom', 'summaryZoom'].includes(shape.type)
				const hyperlink = isSemanticZoom ? undefined : this.parseObjectHyperlink(elementXml, slideData, navigationContext)
				const interactiveActions = isSemanticZoom ? undefined : this.parseObjectSlideJumpActions(elementXml, slideData, navigationContext)
				if (Object.keys(accessibility).length || Object.keys(placeholder).length) {
					shape.options = { ...(shape.options || {}), ...accessibility, ...placeholder } as ShapeOptions
				}
				if (isSemanticZoom && typeof accessibility.altText === 'string') shape.altText = accessibility.altText
				if (hyperlink) shape.options.hyperlink = hyperlink
				if (interactiveActions) shape.options.interactiveActions = interactiveActions
				shape.edit = this.buildEditHandle(shape, slideNum, shapes.length, tagName)
				shapes.push(shape)
			}
		}

		return shapes
	}

	private decodeXmlAttribute(value: string): string {
		return value
			.replace(/&#x([0-9a-f]+);/gi, (_m, hex) => String.fromCodePoint(parseInt(hex, 16)))
			.replace(/&#(\d+);/g, (_m, decimal) => String.fromCodePoint(parseInt(decimal, 10)))
			.replace(/&quot;/g, '"')
			.replace(/&apos;/g, "'")
			.replace(/&lt;/g, '<')
			.replace(/&gt;/g, '>')
			.replace(/&amp;/g, '&')
	}

	private parseAccessibilityMetadata(elementXml: string): Record<string, string | boolean> {
		// Only the first cNvPr belongs to the top-level object. This is important
		// for groups, whose child shapes carry independent accessibility metadata.
		const cNvPr = elementXml.match(/<p:cNvPr\b([^>]*?)(?:\/>|>([\s\S]*?)<\/p:cNvPr>)/)
		if (!cNvPr) return {}
		const attrs = cNvPr[1] || ''
		const inner = cNvPr[2] || ''
		const attribute = (name: string) => {
			const match = attrs.match(new RegExp(`(?:^|\\s)${name}=(?:"([^"]*)"|'([^']*)')`))
			return match ? this.decodeXmlAttribute(match[1] ?? match[2] ?? '') : undefined
		}
		const title = attribute('title')
		const altText = attribute('descr')
		const decorativeMatch = inner.match(/<(?:adec:)?decorative\b[^>]*\bval=(?:"([^"]+)"|'([^']+)')/i)
		const decorativeToken = decorativeMatch ? String(decorativeMatch[1] ?? decorativeMatch[2] ?? '').toLowerCase() : undefined
		return {
			...(title ? { accessibilityTitle: title } : {}),
			...(altText ? { altText } : {}),
			...(decorativeToken !== undefined ? { isDecorative: ['1', 'true', 'on'].includes(decorativeToken) } : {}),
		}
	}

	private parsePlaceholderMetadata(elementXml: string): Record<string, unknown> {
		const tagName = this.readElementTagName(elementXml, 0)
		const wrapperByTag: Record<string, string> = {
			'p:sp': 'p:nvSpPr',
			'p:pic': 'p:nvPicPr',
			'p:graphicFrame': 'p:nvGraphicFramePr',
			'p:cxnSp': 'p:nvCxnSpPr',
		}
		const wrapperName = wrapperByTag[tagName || ''] || (tagName === 'mc:AlternateContent' ? 'p:nvGraphicFramePr' : undefined)
		if (!wrapperName) return {}
		const escapedWrapper = wrapperName.replace(':', '\\:')
		const wrapper = elementXml.match(new RegExp(`<${escapedWrapper}\\b[\\s\\S]*?<\\/${escapedWrapper}>`))?.[0]
		if (!wrapper) return {}
		const ph = wrapper.match(/<p:ph\b([^>]*?)(?:\/>|>[\s\S]*?<\/p:ph>)/)
		if (!ph) return {}
		const attrs = ph[1] || ''
		const attribute = (name: string) => {
			const match = attrs.match(new RegExp(`(?:^|\\s)${name}=(?:"([^"]*)"|'([^']*)')`))
			return match ? this.decodeXmlAttribute(match[1] ?? match[2] ?? '') : undefined
		}
		const phType = attribute('type')
		const rawIdx = attribute('idx')
		const phIdx = rawIdx !== undefined ? Number(rawIdx) : (phType ? 0 : undefined)
		const phSz = attribute('sz')
		const phOrient = phType === 'clipArt' ? undefined : attribute('orient')
		const rawCustomPrompt = attribute('hasCustomPrompt')
		const phHasCustomPrompt = rawCustomPrompt !== undefined
			? ['1', 'true', 'on'].includes(rawCustomPrompt.toLowerCase())
			: (phType ? false : undefined)
		const hasBarePh = !phType && rawIdx === undefined && !phSz && !phOrient && rawCustomPrompt === undefined
		const native = {
			...(phType ? { phType } : {}),
			...(Number.isInteger(phIdx) ? { phIdx } : {}),
			...(phSz ? { phSz } : {}),
			...(phOrient ? { phOrient } : {}),
			...(phHasCustomPrompt !== undefined ? { phHasCustomPrompt } : {}),
			...(hasBarePh ? { hasBarePh: true } : {}),
		}
		const placeholderBinding = canonicalPlaceholderBindingFromNative(native)
		return {
			...native,
			...(phType ? { importedPlaceholderRole: phType === 'hdr' ? 'header' : (PLACEHOLDER_NATIVE_TO_SEMANTIC[phType] || phType) } : {}),
			...(placeholderBinding ? { placeholderBinding } : {}),
		}
	}

	private buildEditHandle(shape: ShapeModel, slideNum: number, shapeIndex: number, tagName: string) {
		const editability = this.buildEditability(shape)
		const objectName = shape.name || `Shape ${shape.id}`
		const localTag = tagName.includes(':') ? tagName.slice(tagName.indexOf(':') + 1) : tagName
		return {
			id: `slide${slideNum}:shape${shape.id}`,
			source: {
				kind: 'decypher' as const,
				slideNumber: slideNum,
				shapeIndex,
				shapeId: shape.id,
				objectName,
				ooxmlType: localTag,
			},
			stableSelectors: [
				`objectName:${objectName}`,
				`spid:${shape.id}`,
				`source:slide${slideNum}:shape${shape.id}`,
			],
			editability,
		}
	}

	private buildEditability(shape: ShapeModel): ShapeEditabilityModel {
		const lifecycleTools = [
			'betterpptx.slide.delete_shapes',
			'betterpptx.slide.reorder_shape',
		]
		const semanticByType: Record<string, ShapeEditabilityModel> = {
			text: {
				tier: 'semantic',
				semantic: true,
				tools: ['betterpptx.slide.update_shape', ...lifecycleTools],
				operations: ['text', 'style', 'geometry', 'animation-target'],
				note: 'Text shape was decoded into structured presentation objects and can be edited directly.',
			},
			shape: {
				tier: 'semantic',
				semantic: true,
				tools: ['betterpptx.slide.update_shape', ...lifecycleTools],
				operations: ['style', 'geometry', 'shape-type', 'animation-target'],
				note: 'Shape was decoded into structured presentation objects and can be edited directly.',
			},
			image: {
				tier: 'semantic',
				semantic: true,
				tools: ['betterpptx.slide.update_shape', ...lifecycleTools],
				operations: ['image-frame', 'style', 'geometry', 'animation-target'],
				note: 'Picture frame was decoded and can be moved, resized, cropped, restyled, or replaced by recreating the image object.',
				recreateWith: 'betterpptx.slide.add_image',
			},
			media: {
				tier: 'semantic',
				semantic: true,
				tools: ['betterpptx.slide.update_media', 'betterpptx.slide.update_shape', ...lifecycleTools],
				operations: ['media-playback', 'style', 'geometry', 'animation-target'],
				note: 'Media object was decoded into a structured audio/video object with playback and wrapper edit tools.',
			},
			slideZoom: {
				tier: 'semantic',
				semantic: true,
				tools: ['betterpptx.slide.update_shape', ...lifecycleTools],
				operations: ['slide-navigation', 'geometry', 'delete'],
				note: 'Native Slide Zoom was decoded with a stable target and thumbnail and can be recreated semantically.',
				recreateWith: 'betterpptx.slide.add_zoom',
			},
			sectionZoom: {
				tier: 'semantic', semantic: true,
				tools: ['betterpptx.slide.update_shape', ...lifecycleTools],
				operations: ['section-navigation', 'geometry', 'delete'],
				note: 'Native Section Zoom was decoded with portable section identity and can be recreated semantically.',
				recreateWith: 'betterpptx.slide.add_section_zoom',
			},
			summaryZoom: {
				tier: 'semantic', semantic: true,
				tools: ['betterpptx.slide.update_shape', ...lifecycleTools],
				operations: ['section-navigation', 'geometry', 'delete'],
				note: 'Native Summary Zoom was decoded with ordered portable section identities and per-section thumbnails.',
				recreateWith: 'betterpptx.deck.add_summary_zoom',
			},
		}
		if (shape.type !== '__passthrough__') {
			return semanticByType[shape.type] || {
				tier: 'semantic',
				semantic: true,
				tools: ['betterpptx.slide.update_shape', ...lifecycleTools],
				operations: ['style', 'geometry', 'animation-target'],
				note: 'Object was decoded into a structured presentation object and can be edited directly.',
			}
		}

		const originalType = shape.passthrough?.originalType || 'unknown'
		const metadata = shape.passthrough?.metadata || {}
		const sourceFormat = typeof metadata.sourceFormat === 'string' ? metadata.sourceFormat : originalType
		if (originalType === 'chartEx' || sourceFormat === 'chartEx') {
			return {
				tier: 'promotable',
				semantic: true,
				tools: ['betterpptx.slide.update_chart', 'betterpptx.slide.update_shape', ...lifecycleTools],
				operations: ['chart-data', 'chart-type', 'style', 'geometry', 'animation-target'],
				note: 'ChartEx is preserved exactly until the first update_chart call, which promotes it to a native editable ChartEx chart.',
				limitations: ['Exact raw ChartEx XML is replaced once promoted. Validate before saving.'],
				recreateWith: 'betterpptx.slide.add_chart',
			}
		}

		const recreateByType: Record<string, string> = {
			chart: 'betterpptx.slide.add_chart',
			table: 'betterpptx.slide.add_table',
			smartart: 'betterpptx.slide.add_smartart',
			group: 'shape-built primitives',
			diagram: 'betterpptx.slide.add_smartart',
			graphicFrame: 'structured slide primitive matching the intended graphic',
		}
		return {
			tier: originalType === 'oleObj' || originalType === 'control' ? 'preserve-only' : 'wrapper-editable',
			semantic: false,
			tools: ['betterpptx.slide.update_shape', ...lifecycleTools],
			operations: ['wrapper-style', 'wrapper-metadata', 'z-order', 'delete'],
			note: 'Raw OOXML is preserved for repair safety. Use wrapper edits only, or recreate/promote as a structured object for semantic edits.',
			limitations: ['Direct semantic edits to the raw payload are intentionally blocked unless a typed promotion path exists.'],
			recreateWith: recreateByType[originalType] || 'matching betterpptx.slide.add_* primitive',
		}
	}

	private isChartExXml(xml: string): boolean {
		return xml.includes('drawing/2014/chartex')
			|| xml.includes('drawing/2015/9/8/chartex')
			|| xml.includes('relationships/chartEx')
			|| xml.includes('<cx:chart')
	}

	private isSlideZoomXml(xml: string): boolean {
		return xml.includes('http://schemas.microsoft.com/office/powerpoint/2016/slidezoom')
			&& xml.includes('sldZm')
	}

	private isSectionZoomXml(xml: string): boolean {
		return xml.includes('http://schemas.microsoft.com/office/powerpoint/2016/sectionzoom')
			&& xml.includes('sectionZm')
	}

	private isSummaryZoomXml(xml: string): boolean {
		return xml.includes('http://schemas.microsoft.com/office/powerpoint/2016/summaryzoom')
			&& xml.includes('summaryZm')
	}

	private parseOoxmlBoolean(value: string | undefined): boolean | undefined {
		if (value === undefined) return undefined
		const token = value.trim().toLowerCase()
		if (['1', 'true', 'on', 'yes'].includes(token)) return true
		if (['0', 'false', 'off', 'no'].includes(token)) return false
		return undefined
	}

	private relationshipSlidePartNumber(target: string): number | undefined {
		const fileName = path.posix.basename(target.split('\\').join('/'))
		const stem = fileName.endsWith('.xml') ? fileName.slice(0, -4) : fileName
		if (!stem.startsWith('slide')) return undefined
		const value = Number(stem.slice('slide'.length))
		return Number.isInteger(value) && value > 0 ? value : undefined
	}

	private parseObjectHyperlink(
		xml: string,
		slideData: SlideExtracted,
		navigationContext?: SlideNavigationContext
	): ShapeOptions['hyperlink'] {
		const document = new DOMParser().parseFromString(
			`<root xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${xml}</root>`,
			'application/xml'
		)
		const cNvPr = this.firstTextElement(document, 'cNvPr')
		const element = this.directTextElement(cNvPr, 'hlinkClick')
		if (!element || this.directTextElement(element, 'snd')) return undefined
		const targetFrame = this.textAttribute(element, 'tgtFrame') ?? this.textAttribute(element, 'target')
		const relationshipId = this.textAttribute(element, 'r:id')
		const relationship = relationshipId ? slideData.relationships.find(candidate => candidate.id === relationshipId) : undefined
		if (!relationship) return undefined
		const action = this.textAttribute(element, 'action') || ''
		const tooltip = this.textAttribute(element, 'tooltip')
		const target = this.decodeXmlAttribute(relationship.target)
		if (relationship.targetMode === 'External' && relationship.type.endsWith('/hyperlink') && !action) {
			// These Action Settings attributes have no representation in HyperlinkModel.
			if (['history', 'highlightClick', 'endSnd'].some(attribute => this.textAttribute(element, attribute) !== undefined)) return undefined
			return { url: target, ...(tooltip !== undefined ? { tooltip } : {}), ...(targetFrame ? { target: targetFrame } : {}) }
		}
		if (!targetFrame && relationship.type.endsWith('/slide') && action === 'ppaction://hlinksldjump' && navigationContext) {
			const partNumber = this.relationshipSlidePartNumber(target)
			const resolved = partNumber === undefined ? undefined : navigationContext.byPartNumber.get(partNumber)
			if (resolved) return { slide: resolved.targetSlide, ...(tooltip !== undefined ? { tooltip } : {}) }
		}
		return undefined
	}

	private parseObjectSlideJumpActions(
		xml: string,
		slideData: SlideExtracted,
		navigationContext?: SlideNavigationContext
	): ShapeOptions['interactiveActions'] {
		if (!navigationContext) return undefined
		const document = new DOMParser().parseFromString(
			`<root xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${xml}</root>`,
			'application/xml'
		)
		const cNvPr = this.firstTextElement(document, 'cNvPr')
		if (!cNvPr) return undefined
		const actionElements = this.directTextElements(cNvPr).filter(element => element.localName === 'hlinkClick' || element.localName === 'hlinkHover')
		if (actionElements.length === 0) return undefined

		const actions: NonNullable<ShapeOptions['interactiveActions']> = {}
		for (const element of actionElements) {
			if (this.textAttribute(element, 'action') !== 'ppaction://hlinksldjump') return undefined
			if (this.directTextElement(element, 'snd')) return undefined
			const relationshipId = this.textAttribute(element, 'r:id')
			const relationship = relationshipId ? slideData.relationships.find(candidate => candidate.id === relationshipId) : undefined
			if (!relationship || !relationship.type.endsWith('/slide')) return undefined
			const partNumber = this.relationshipSlidePartNumber(relationship.target)
			const target = partNumber === undefined ? undefined : navigationContext.byPartNumber.get(partNumber)
			if (!target) return undefined
			const history = this.textAttribute(element, 'history')
			const highlightClick = this.textAttribute(element, 'highlightClick')
			const endSound = this.textAttribute(element, 'endSnd')
			const parsedHistory = this.parseOoxmlBoolean(history)
			const parsedHighlightClick = this.parseOoxmlBoolean(highlightClick)
			const parsedEndSound = this.parseOoxmlBoolean(endSound)
			if ((history !== undefined && parsedHistory === undefined) ||
				(highlightClick !== undefined && parsedHighlightClick === undefined) ||
				(endSound !== undefined && parsedEndSound === undefined)) return undefined
			const endpoint = {
				type: 'slide' as const,
				targetSlideId: target.targetSlideId,
				targetSlide: target.targetSlide,
				...(this.textAttribute(element, 'tooltip') !== undefined ? { tooltip: this.textAttribute(element, 'tooltip') } : {}),
				...(parsedHistory !== undefined ? { history: parsedHistory } : {}),
				...(parsedHighlightClick !== undefined ? { highlightClick: parsedHighlightClick } : {}),
				...(parsedEndSound !== undefined ? { endSound: parsedEndSound } : {}),
			}
			if (element.localName === 'hlinkClick') actions.click = endpoint
			else actions.hover = endpoint
		}
		return actions
	}

	private slideZoomPassthrough(
		xml: string,
		id: number,
		name: string,
		slideNum: number,
		outputFolder: string,
		reason: string
	): ShapeModel {
		const { x, y, w, h, rotation } = this.parseTransform(xml)
		const passthroughPath = this.savePassthrough(xml, slideNum, id, 'slideZoom', outputFolder)
		this.warnings.push({
			type: 'passthrough',
			location: `slide${slideNum}.shape${id}`,
			message: `Slide Zoom "${name}" saved as passthrough`,
			details: reason,
		})
		return {
			id, name, type: '__passthrough__', x, y, w, h, rotation, options: {},
			passthrough: {
				reason,
				sourceXmlPath: passthroughPath,
				originalType: 'slideZoom',
				metadata: { semanticKind: 'slideZoom', sourceFormat: 'slideZoom', preservation: 'passthrough' },
			},
		}
	}

	private parseSlideZoom(
		xml: string,
		slideData: SlideExtracted,
		slideNum: number,
		outputFolder: string,
		navigationContext?: SlideNavigationContext
	): ShapeModel | null {
		const document = new DOMParser().parseFromString(
			`<root xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:pslz="http://schemas.microsoft.com/office/powerpoint/2016/slidezoom">${xml}</root>`,
			'application/xml'
		)
		const graphicFrame = this.firstTextElement(document, 'graphicFrame')
		const cNvPr = this.firstTextElement(graphicFrame, 'cNvPr')
		const rawId = this.textAttribute(cNvPr, 'id')
		const id = rawId !== undefined && Number.isInteger(Number(rawId)) ? Number(rawId) : 0
		const name = this.textAttribute(cNvPr, 'name') || `Slide Zoom ${id || 1}`
		if (!id) return null
		const fail = (reason: string) => this.slideZoomPassthrough(xml, id, name, slideNum, outputFolder, reason)
		if (!navigationContext) return fail('Slide Zoom target topology is unavailable')

		const graphicData = this.firstTextElement(graphicFrame, 'graphicData')
		if (!graphicData || this.textAttribute(graphicData, 'uri') !== 'http://schemas.microsoft.com/office/powerpoint/2016/slidezoom') {
			return fail('Slide Zoom Choice payload is missing')
		}
		const zoomObject = this.firstTextElement(graphicData, 'sldZmObj')
		const zoomProperties = this.firstTextElement(zoomObject, 'zmPr')
		const presentationSlideId = this.textAttribute(zoomObject, 'sldId')
		const choiceTarget = presentationSlideId ? navigationContext.byPresentationSlideId.get(presentationSlideId) : undefined
		if (!choiceTarget) return fail('Slide Zoom Choice target does not resolve to a presentation slide ID')

		const fallback = this.allTextElements(document, 'Fallback')[0] || null
		const fallbackPicture = this.firstTextElement(fallback, 'pic')
		const fallbackCNvPr = this.firstTextElement(fallbackPicture, 'cNvPr')
		const click = this.directTextElement(fallbackCNvPr, 'hlinkClick')
		if (!click || this.textAttribute(click, 'action') !== 'ppaction://hlinksldjump') {
			return fail('Slide Zoom fallback slide action is missing')
		}
		const slideRelationshipId = this.textAttribute(click, 'r:id')
		const slideRelationship = slideRelationshipId ? slideData.relationships.find(candidate => candidate.id === slideRelationshipId) : undefined
		const fallbackPartNumber = slideRelationship && slideRelationship.type.endsWith('/slide')
			? this.relationshipSlidePartNumber(slideRelationship.target)
			: undefined
		const fallbackTarget = fallbackPartNumber === undefined ? undefined : navigationContext.byPartNumber.get(fallbackPartNumber)
		if (!fallbackTarget || fallbackTarget.partNumber !== choiceTarget.partNumber) {
			return fail('Slide Zoom Choice and fallback targets do not agree')
		}

		const choiceBlip = this.firstTextElement(zoomProperties, 'blip')
		const fallbackBlip = this.firstTextElement(fallbackPicture, 'blip')
		const choiceThumbnailRelationshipId = this.textAttribute(choiceBlip, 'r:embed')
		const fallbackThumbnailRelationshipId = this.textAttribute(fallbackBlip, 'r:embed')
		if (!choiceThumbnailRelationshipId || choiceThumbnailRelationshipId !== fallbackThumbnailRelationshipId) {
			return fail('Slide Zoom Choice and fallback thumbnails do not agree')
		}
		const thumbnailDataUri = navigationContext.thumbnailDataUriByRelationship.get(`${slideNum}:${choiceThumbnailRelationshipId}`)
		if (!thumbnailDataUri) return fail('Slide Zoom thumbnail payload is unavailable')

		const returnToken = this.textAttribute(zoomProperties, 'returnToParent')
		const returnToParent = this.parseOoxmlBoolean(returnToken)
		if (returnToken !== undefined && returnToParent === undefined) return fail('Slide Zoom returnToParent value is invalid')
		const durationToken = this.textAttribute(zoomProperties, 'transitionDur')
		const transitionDur = durationToken === undefined ? undefined : Number(durationToken)
		if (durationToken !== undefined && (!Number.isFinite(transitionDur) || Number(transitionDur) < 0)) return fail('Slide Zoom transitionDur value is invalid')
		const nativeTransform = this.parseTransform(xml)
		const x = this.emuToInches(nativeTransform.x)
		const y = this.emuToInches(nativeTransform.y)
		const w = this.emuToInches(nativeTransform.w)
		const h = this.emuToInches(nativeTransform.h)
		const rotation = nativeTransform.rotation
		return {
			id,
			name,
			type: 'slideZoom',
			kind: 'slideZoom',
			bbox: { x, y, w, h },
			targetSlideId: choiceTarget.targetSlideId,
			thumbnailDataUri,
			...(returnToParent !== undefined ? { returnToParent } : {}),
			...(transitionDur !== undefined ? { transitionDur } : {}),
			x, y, w, h, rotation,
			options: {
				targetSlideId: choiceTarget.targetSlideId,
				targetSlide: choiceTarget.targetSlide,
				thumbnailDataUri,
				...(returnToParent !== undefined ? { returnToParent } : {}),
				...(transitionDur !== undefined ? { transitionDur } : {}),
			},
		}
	}

	private semanticZoomPassthrough(
		xml: string,
		id: number,
		name: string,
		kind: 'sectionZoom' | 'summaryZoom',
		slideNum: number,
		outputFolder: string,
		reason: string
	): ShapeModel {
		const native = this.parseTransform(xml)
		const x = this.emuToInches(native.x)
		const y = this.emuToInches(native.y)
		const w = this.emuToInches(native.w)
		const h = this.emuToInches(native.h)
		const passthroughPath = this.savePassthrough(xml, slideNum, id, kind, outputFolder)
		this.warnings.push({
			type: 'passthrough',
			location: `slide${slideNum}.shape${id}`,
			message: `${kind === 'sectionZoom' ? 'Section' : 'Summary'} Zoom "${name}" saved as passthrough`,
			details: reason,
		})
		return {
			id, name, type: '__passthrough__', x, y, w, h, rotation: native.rotation, options: {},
			passthrough: {
				reason,
				sourceXmlPath: passthroughPath,
				originalType: kind,
				metadata: { semanticKind: kind, sourceFormat: kind, preservation: 'passthrough' },
			},
		}
	}

	private sameNativeTransform(left: { x: number; y: number; w: number; h: number; rotation?: number }, right: { x: number; y: number; w: number; h: number; rotation?: number }): boolean {
		return left.x === right.x && left.y === right.y && left.w === right.w && left.h === right.h && left.rotation === right.rotation
	}

	private parseSectionZoom(
		xml: string,
		slideData: SlideExtracted,
		slideNum: number,
		outputFolder: string,
		navigationContext?: SlideNavigationContext
	): ShapeModel | null {
		const document = new DOMParser().parseFromString(
			`<root xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:psez="http://schemas.microsoft.com/office/powerpoint/2016/sectionzoom">${xml}</root>`,
			'application/xml'
		)
		const graphicFrame = this.firstTextElement(document, 'graphicFrame')
		const cNvPr = this.firstTextElement(graphicFrame, 'cNvPr')
		const rawId = this.textAttribute(cNvPr, 'id')
		const id = rawId !== undefined && Number.isInteger(Number(rawId)) ? Number(rawId) : 0
		const name = this.textAttribute(cNvPr, 'name') || `Section Zoom ${id || 1}`
		if (!id) return null
		const fail = (reason: string) => this.semanticZoomPassthrough(xml, id, name, 'sectionZoom', slideNum, outputFolder, reason)
		if (!navigationContext) return fail('Section Zoom target topology is unavailable')

		const graphicData = this.firstTextElement(graphicFrame, 'graphicData')
		if (!graphicData || this.textAttribute(graphicData, 'uri') !== 'http://schemas.microsoft.com/office/powerpoint/2016/sectionzoom') {
			return fail('Section Zoom Choice payload is missing')
		}
		const objects = this.allTextElements(graphicData, 'sectionZmObj')
		if (objects.length !== 1) return fail('Section Zoom must contain exactly one Choice target')
		const zoomObject = objects[0]
		const zoomProperties = this.firstTextElement(zoomObject, 'zmPr')
		const nativeSectionId = this.textAttribute(zoomObject, 'sectionId')
		const section = nativeSectionId ? navigationContext.byPresentationSectionId.get(nativeSectionId) : undefined
		const firstSlide = section?.slideTargets[0]
		if (!section || !firstSlide) return fail('Section Zoom Choice target does not resolve to a non-empty presentation section')

		const fallback = this.allTextElements(document, 'Fallback')[0] || null
		const fallbackPictures = this.allTextElements(fallback, 'pic')
		if (fallbackPictures.length !== 1) return fail('Section Zoom fallback picture is missing or ambiguous')
		const fallbackPicture = fallbackPictures[0]
		const fallbackCNvPr = this.firstTextElement(fallbackPicture, 'cNvPr')
		if (this.textAttribute(fallbackCNvPr, 'id') !== String(id) || (this.textAttribute(fallbackCNvPr, 'name') || '') !== name) {
			return fail('Section Zoom Choice and fallback nonvisual identities do not agree')
		}
		for (const attribute of ['title', 'descr']) {
			const choiceValue = this.textAttribute(cNvPr, attribute)
			const fallbackValue = this.textAttribute(fallbackCNvPr, attribute)
			if (choiceValue !== undefined && fallbackValue !== undefined && choiceValue !== fallbackValue) return fail(`Section Zoom Choice and fallback ${attribute} values do not agree`)
		}
		const click = this.directTextElement(fallbackCNvPr, 'hlinkClick')
		if (!click || this.textAttribute(click, 'action') !== 'ppaction://hlinksldjump') return fail('Section Zoom fallback slide action is missing')
		const slideRelationshipId = this.textAttribute(click, 'r:id')
		const slideRelationship = slideRelationshipId ? slideData.relationships.find(candidate => candidate.id === slideRelationshipId) : undefined
		const fallbackPartNumber = slideRelationship?.type.endsWith('/slide') ? this.relationshipSlidePartNumber(slideRelationship.target) : undefined
		if (fallbackPartNumber !== firstSlide.partNumber) return fail('Section Zoom Choice section and fallback first-slide target do not agree')

		const choiceBlip = this.firstTextElement(zoomProperties, 'blip')
		const fallbackBlip = this.firstTextElement(fallbackPicture, 'blip')
		const choiceThumbnailRelationshipId = this.textAttribute(choiceBlip, 'r:embed')
		if (!choiceThumbnailRelationshipId || choiceThumbnailRelationshipId !== this.textAttribute(fallbackBlip, 'r:embed')) {
			return fail('Section Zoom Choice and fallback thumbnails do not agree')
		}
		const thumbnailDataUri = navigationContext.thumbnailDataUriByRelationship.get(`${slideNum}:${choiceThumbnailRelationshipId}`)
		if (!thumbnailDataUri) return fail('Section Zoom thumbnail payload is unavailable')
		const durationToken = this.textAttribute(zoomProperties, 'transitionDur')
		const transitionDur = durationToken === undefined ? undefined : Number(durationToken)
		if (durationToken !== undefined && (!Number.isFinite(transitionDur) || Number(transitionDur) < 0)) return fail('Section Zoom transitionDur value is invalid')

		const nativeTransform = this.parseTransform(String(graphicFrame))
		const fallbackTransform = this.parseTransform(String(fallbackPicture))
		if (!this.sameNativeTransform(nativeTransform, fallbackTransform)) return fail('Section Zoom Choice and fallback geometry do not agree')
		const x = this.emuToInches(nativeTransform.x)
		const y = this.emuToInches(nativeTransform.y)
		const w = this.emuToInches(nativeTransform.w)
		const h = this.emuToInches(nativeTransform.h)
		return {
			id, name, type: 'sectionZoom', kind: 'sectionZoom',
			bbox: { x, y, w, h }, targetSectionId: section.targetSectionId, targetSlideId: firstSlide.targetSlideId,
			thumbnailDataUri, ...(transitionDur !== undefined ? { transitionDur } : {}),
			x, y, w, h, rotation: nativeTransform.rotation,
			options: {
				targetSectionId: section.targetSectionId,
				targetSection: section.targetSection,
				targetSlideId: firstSlide.targetSlideId,
				thumbnailDataUri,
				...(transitionDur !== undefined ? { transitionDur } : {}),
			},
		}
	}

	private parseSummaryZoom(
		xml: string,
		slideData: SlideExtracted,
		slideNum: number,
		outputFolder: string,
		navigationContext?: SlideNavigationContext
	): ShapeModel | null {
		const document = new DOMParser().parseFromString(
			`<root xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:psuz="http://schemas.microsoft.com/office/powerpoint/2016/summaryzoom">${xml}</root>`,
			'application/xml'
		)
		const graphicFrame = this.firstTextElement(document, 'graphicFrame')
		const cNvPr = this.firstTextElement(graphicFrame, 'cNvPr')
		const rawId = this.textAttribute(cNvPr, 'id')
		const id = rawId !== undefined && Number.isInteger(Number(rawId)) ? Number(rawId) : 0
		const name = this.textAttribute(cNvPr, 'name') || `Summary Zoom ${id || 1}`
		if (!id) return null
		const fail = (reason: string) => this.semanticZoomPassthrough(xml, id, name, 'summaryZoom', slideNum, outputFolder, reason)
		if (!navigationContext) return fail('Summary Zoom target topology is unavailable')
		const graphicData = this.firstTextElement(graphicFrame, 'graphicData')
		if (!graphicData || this.textAttribute(graphicData, 'uri') !== 'http://schemas.microsoft.com/office/powerpoint/2016/summaryzoom') return fail('Summary Zoom Choice payload is missing')
		const summary = this.firstTextElement(graphicData, 'summaryZm')
		const zoomObjects = this.directTextElements(summary).filter(element => element.localName === 'summaryZmObj')
		if (!summary || zoomObjects.length === 0 || !this.directTextElement(summary, 'gridLayout')) return fail('Summary Zoom grid payload is missing')

		const fallback = this.allTextElements(document, 'Fallback')[0] || null
		const fallbackGroup = this.firstTextElement(fallback, 'grpSp')
		const fallbackCNvPr = this.firstTextElement(fallbackGroup, 'cNvPr')
		if (!fallbackGroup || this.textAttribute(fallbackCNvPr, 'id') !== String(id) || (this.textAttribute(fallbackCNvPr, 'name') || '') !== name) {
			return fail('Summary Zoom Choice and fallback nonvisual identities do not agree')
		}
		for (const attribute of ['title', 'descr']) {
			const choiceValue = this.textAttribute(cNvPr, attribute)
			const fallbackValue = this.textAttribute(fallbackCNvPr, attribute)
			if (choiceValue !== undefined && fallbackValue !== undefined && choiceValue !== fallbackValue) return fail(`Summary Zoom Choice and fallback ${attribute} values do not agree`)
		}
		const fallbackPictures = this.directTextElements(fallbackGroup).filter(element => element.localName === 'pic')
		if (fallbackPictures.length !== zoomObjects.length) return fail('Summary Zoom Choice and fallback item counts do not agree')
		const frameTransform = this.parseTransform(String(graphicFrame))
		const fallbackFrameTransform = this.parseTransform(String(fallbackGroup))
		if (!this.sameNativeTransform(frameTransform, fallbackFrameTransform)) return fail('Summary Zoom Choice and fallback frame geometry do not agree')

		const items = []
		const sectionIds = new Set<string>()
		let transitionDur: number | undefined
		for (let index = 0; index < zoomObjects.length; index++) {
			const zoomObject = zoomObjects[index]
			const nativeSectionId = this.textAttribute(zoomObject, 'sectionId')
			const section = nativeSectionId ? navigationContext.byPresentationSectionId.get(nativeSectionId) : undefined
			const firstSlide = section?.slideTargets[0]
			if (!section || !firstSlide || sectionIds.has(section.targetSectionId)) return fail('Summary Zoom contains an unknown, empty, or duplicate section target')
			sectionIds.add(section.targetSectionId)
			const zoomProperties = this.firstTextElement(zoomObject, 'zmPr')
			const durationToken = this.textAttribute(zoomProperties, 'transitionDur')
			const itemDuration = durationToken === undefined ? undefined : Number(durationToken)
			if (durationToken !== undefined && (!Number.isFinite(itemDuration) || Number(itemDuration) < 0)) return fail('Summary Zoom transitionDur value is invalid')
			if (index === 0) transitionDur = itemDuration
			else if (itemDuration !== transitionDur) return fail('Summary Zoom per-section transition durations cannot be represented by the public model')

			const fallbackPicture = fallbackPictures[index]
			const pictureCNvPr = this.firstTextElement(fallbackPicture, 'cNvPr')
			const click = this.directTextElement(pictureCNvPr, 'hlinkClick')
			if (!click || this.textAttribute(click, 'action') !== 'ppaction://hlinksldjump') return fail('Summary Zoom fallback slide action is missing')
			const slideRelationshipId = this.textAttribute(click, 'r:id')
			const slideRelationship = slideRelationshipId ? slideData.relationships.find(candidate => candidate.id === slideRelationshipId) : undefined
			const fallbackPartNumber = slideRelationship?.type.endsWith('/slide') ? this.relationshipSlidePartNumber(slideRelationship.target) : undefined
			if (fallbackPartNumber !== firstSlide.partNumber) return fail('Summary Zoom Choice section and fallback first-slide target do not agree')

			const choiceThumbnailRelationshipId = this.textAttribute(this.firstTextElement(zoomProperties, 'blip'), 'r:embed')
			const fallbackThumbnailRelationshipId = this.textAttribute(this.firstTextElement(fallbackPicture, 'blip'), 'r:embed')
			if (!choiceThumbnailRelationshipId || choiceThumbnailRelationshipId !== fallbackThumbnailRelationshipId) return fail('Summary Zoom Choice and fallback thumbnails do not agree')
			const thumbnailDataUri = navigationContext.thumbnailDataUriByRelationship.get(`${slideNum}:${choiceThumbnailRelationshipId}`)
			if (!thumbnailDataUri) return fail('Summary Zoom thumbnail payload is unavailable')

			const choiceTile = this.parseTransform(String(zoomProperties))
			const fallbackTile = this.parseTransform(String(fallbackPicture))
			const directMatch = this.sameNativeTransform(choiceTile, fallbackTile)
			const relativeMatch = choiceTile.w === fallbackTile.w && choiceTile.h === fallbackTile.h &&
				choiceTile.x + frameTransform.x === fallbackTile.x && choiceTile.y + frameTransform.y === fallbackTile.y &&
				choiceTile.rotation === fallbackTile.rotation
			if (!directMatch && !relativeMatch) return fail('Summary Zoom Choice and fallback item geometry do not agree')
			items.push({
				targetSectionId: section.targetSectionId,
				targetSection: section.targetSection,
				targetSlideId: firstSlide.targetSlideId,
				thumbnailDataUri,
				bbox: {
					x: this.emuToInches(fallbackTile.x), y: this.emuToInches(fallbackTile.y),
					w: this.emuToInches(fallbackTile.w), h: this.emuToInches(fallbackTile.h),
				},
			})
		}

		const x = this.emuToInches(frameTransform.x)
		const y = this.emuToInches(frameTransform.y)
		const w = this.emuToInches(frameTransform.w)
		const h = this.emuToInches(frameTransform.h)
		const portableSectionIds = [...sectionIds]
		const ownSection = navigationContext.sectionByPartNumber.get(slideNum)
		return {
			id, name, type: 'summaryZoom', kind: 'summaryZoom', bbox: { x, y, w, h },
			sectionIds: portableSectionIds, summaryZoomItems: items,
			...(ownSection ? { summarySectionId: ownSection.targetSectionId } : {}),
			...(transitionDur !== undefined ? { transitionDur } : {}),
			x, y, w, h, rotation: frameTransform.rotation,
			options: {
				sectionIds: portableSectionIds,
				summaryZoomItems: items,
				...(ownSection ? { summarySectionId: ownSection.targetSectionId } : {}),
				...(transitionDur !== undefined ? { transitionDur } : {}),
			},
		}
	}

	private parseChartExAlternateContent(
		xml: string,
		slideData: SlideExtracted,
		slideNum: number,
		outputFolder: string
	): ShapeModel | null {
		const idMatch = xml.match(/<p:cNvPr\s+id="(\d+)"\s+name="([^"]*)"/)
		if (!idMatch) return null

		const id = parseInt(idMatch[1])
		const name = idMatch[2]
		const { x, y, w, h, rotation } = this.parseTransform(xml)
		const passthroughPath = this.savePassthrough(xml, slideNum, id, 'chartEx', outputFolder)
		const reason = 'Modern ChartEx chart with AlternateContent fallback'

		this.warnings.push({
			type: 'passthrough',
			location: `slide${slideNum}.shape${id}`,
			message: `ChartEx "${name}" saved as passthrough`,
			details: reason
		})
		const options: Record<string, unknown> = {}

		return {
			id,
			name,
			type: '__passthrough__',
			x, y, w, h,
			rotation,
			options,
			passthrough: {
				reason,
				sourceXmlPath: passthroughPath,
				originalType: 'chartEx',
				metadata: {
					semanticKind: 'chart',
					sourceFormat: 'chartEx',
					preservation: 'passthrough'
				}
			}
		}
	}

	/**
	 * Parse a single <p:sp> shape element
	 */
	private parseShape(
		xml: string,
		slideData: SlideExtracted,
		slideNum: number,
		outputFolder: string,
		navigationContext?: SlideNavigationContext
	): ShapeModel | null {
		// Extract shape ID
		const idMatch = xml.match(/<p:cNvPr\s+id="(\d+)"\s+name="([^"]*)"/)
		if (!idMatch) return null

		const id = parseInt(idMatch[1])
		const name = idMatch[2]

		// Extract position and size
		const { x, y, w, h, rotation } = this.parseTransform(xml)
		// Determine shape type
		const presetMatch = xml.match(/<a:prstGeom\s+prst="([^"]+)"/)
		const presetGeom = presetMatch ? presetMatch[1] : null

		// Check if it has text
		const hasText = xml.includes('<p:txBody>')
		
		// Count actual paragraphs (shapes with 0 paragraphs should not be 'text')
		const paragraphCount = (xml.match(/<a:p\b/g) || []).length

		// Determine type
		let type: ShapeType = hasText ? 'text' : 'shape'
		let shapeType: string | undefined

		if (presetGeom && presetGeom !== 'rect') {
			type = 'shape'
			shapeType = PRESET_GEOMETRY_MAP[presetGeom] || presetGeom
		}

		// Parse shape options (fill, line, effects)
		const options = this.parseShapeOptions(xml)
		if (shapeType) {
			options.shapeType = shapeType
		}

		// Parse text if present
		let text: TextModel | undefined
		if (hasText) {
			text = this.parseTextBody(xml, slideData, navigationContext)
			// If text body has 0 paragraphs, don't include text property
			// This prevents the library from auto-creating empty paragraphs
			if (text && text.paragraphs.length === 0) {
				text = undefined
			}
		}

		return {
			id,
			name,
			type,
			x, y, w, h,
			rotation,
			options,
			text
		}
	}

	/**
	 * Parse a <p:pic> picture element (images, video, audio)
	 */
	private parsePicture(
		xml: string,
		slideData: SlideExtracted,
		slideNum: number,
		outputFolder: string,
		relToMediaId?: Map<string, string>
	): ShapeModel | null {
		// Extract ID and name
		const idMatch = xml.match(/<p:cNvPr\s+id="(\d+)"\s+name="([^"]*)"/)
		if (!idMatch) return null

		const id = parseInt(idMatch[1])
		const name = idMatch[2]

		// Extract position and size
		const { x, y, w, h, rotation } = this.parseTransform(xml)

		// Extract image/media relationship ID
		// For videos: Check for <p14:media r:embed="rId1"/> first (actual video file)
		// Otherwise fall back to <a:blip r:embed="rId4"/> (thumbnail image)
		const mediaEmbedMatch = xml.match(/<p14:media[^>]*r:embed="([^"]+)"/)
		const blipMatch = xml.match(/<a:blip\s+[^>]*r:embed="([^"]+)"/)
		const rId = mediaEmbedMatch ? mediaEmbedMatch[1] : (blipMatch ? blipMatch[1] : null)

		// Find the media ID using the relationship mapping
		let imagePath: string | undefined
		let mediaPath: string | undefined
		let mediaType: 'video' | 'audio' | undefined
		let shapeType: 'image' | 'media' = 'image'
		const options: Record<string, unknown> = {}
		const presetGeom = xml.match(/<a:prstGeom\s+prst="([^"]+)"/)?.[1]
		if (presetGeom) options._picPrstGeom = presetGeom

		if (rId && relToMediaId) {
			// Look up media ID from relationship ID
			const mapKey = `${slideNum}:${rId}`
			const mediaId = relToMediaId.get(mapKey)
			
			if (mediaId) {
				// We have a media ID! Now determine if it's image or video/audio
				const rel = slideData.relationships.find(r => r.id === rId)
				if (rel) {
					const mediaName = path.basename(rel.target)
					const ext = path.extname(mediaName).toLowerCase()

					// Determine if it's video, audio, or image
					const videoExts = ['.mp4', '.m4v', '.mov', '.avi', '.wmv', '.mpg', '.mpeg']
					const audioExts = ['.mp3', '.wav', '.m4a', '.wma', '.aac', '.ogg']

					if (videoExts.includes(ext)) {
						shapeType = 'media'
						mediaType = 'video'
						mediaPath = mediaId  // Store media ID, not path!
					} else if (audioExts.includes(ext)) {
						shapeType = 'media'
						mediaType = 'audio'
						mediaPath = mediaId  // Store media ID, not path!
					} else {
						// It's an image
						imagePath = mediaId  // Store media ID, not path!
					}
				}
			}
		}

		return {
			id,
			name,
			type: shapeType,
			x, y, w, h,
			rotation,
			options,
			imagePath,
			mediaPath,
			mediaType
		}
	}

	/**
	 * Parse a <p:graphicFrame> element (tables, charts, etc.)
	 */
	private parseGraphicFrame(
		xml: string,
		slideData: SlideExtracted,
		slideNum: number,
		outputFolder: string
	): ShapeModel | null {
		// Extract ID and name
		const idMatch = xml.match(/<p:cNvPr\s+id="(\d+)"\s+name="([^"]*)"/)
		if (!idMatch) return null

		const id = parseInt(idMatch[1])
		const name = idMatch[2]

		// Extract position and size
		const { x, y, w, h, rotation } = this.parseTransform(xml)

		// Check what type of graphic
		const isTable = xml.includes('<a:tbl>')
		const isChartEx = this.isChartExXml(xml)
		const isChart = !isChartEx && (xml.includes('<c:chart') || xml.includes('chart.xml'))
		const isSmartArt = xml.includes('drawingml/2006/diagram') || xml.includes('<dgm:')
		const isDiagram = xml.includes('drawingml/2006/lockedCanvas') || xml.includes('<lc:')

		if (isTable) {
			return this.parseTable(xml, slideData, id, name, x, y, w, h, slideNum, outputFolder)
		}

		// For charts, SmartArt, diagrams, and other complex graphics, use passthrough
		let graphicType = 'graphicFrame'
		let reason = 'Complex graphic frame'
		
		if (isChartEx) {
			graphicType = 'chartEx'
			reason = 'Modern ChartEx chart (preserved with package parts)'
		} else if (isChart) {
			graphicType = 'chart'
			reason = 'Chart (embedded Office object)'
		} else if (isSmartArt) {
			graphicType = 'smartart'
			reason = 'SmartArt diagram'
		} else if (isDiagram) {
			graphicType = 'diagram'
			reason = 'Drawing canvas/diagram'
		}

		const passthroughPath = this.savePassthrough(xml, slideNum, id, graphicType, outputFolder)

		this.warnings.push({
			type: 'passthrough',
			location: `slide${slideNum}.shape${id}`,
			message: `${graphicType.charAt(0).toUpperCase() + graphicType.slice(1)} "${name}" saved as passthrough`,
			details: reason
		})

		return {
			id,
			name,
			type: '__passthrough__',
			x, y, w, h,
			rotation,
			options: {},
			passthrough: {
				reason: reason,
				sourceXmlPath: passthroughPath,
				originalType: graphicType
			}
		}
	}

	/**
	 * Parse a table from <a:tbl>
	 */
	private parseTable(
		xml: string,
		slideData: SlideExtracted,
		id: number,
		name: string,
		x: number,
		y: number,
		w: number,
		h: number,
		slideNum: number,
		outputFolder: string
	): ShapeModel {
		// Tables are a first-class editable carrier.  Decode the portable cell/text
		// model here so open_uploaded/export_spec does not silently turn a native
		// table into an opaque graphic frame.  Complex cell extensions remain outside
		// this semantic subset and are handled by the existing package-preservation
		// path when they are encountered elsewhere.
		const document = new DOMParser().parseFromString(
			`<root xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${xml}</root>`,
			'application/xml'
		)
		const table = this.firstTextElement(document, 'tbl')
		const rows = table
			? this.directTextElements(table)
				.filter(element => element.localName === 'tr')
				.map(rowElement => ({
					cells: this.directTextElements(rowElement)
						.filter(element => element.localName === 'tc')
						.map(cellElement => this.parseTableCell(cellElement, slideData, slideNum)),
					height: this.numericAttribute(rowElement, 'h') !== undefined
						? this.emuToInches(this.numericAttribute(rowElement, 'h') as number)
						: undefined,
				}))
			: []
		const grid = table ? this.directTextElement(table, 'tblGrid') : null
		const colWidths = grid
			? this.directTextElements(grid)
				.filter(element => element.localName === 'gridCol')
				.map(element => this.numericAttribute(element, 'w'))
				.filter((value): value is number => value !== undefined)
				.map(value => this.emuToInches(value))
			: []
		const accessibility = this.parseAccessibilityMetadata(xml)
		const tableData: TableModel = {
			rows,
			options: {
				...(colWidths.length ? { colWidths } : {}),
				...(rows.some(row => row.height !== undefined) ? { rowHeights: rows.map(row => row.height || 0) } : {}),
			},
		}
		return {
			id,
			name,
			type: 'table',
			x, y, w, h,
			options: accessibility,
			tableData,
		}
	}

	private parseTableCell(cell: Element, slideData: SlideExtracted, slideNum: number): TableModel['rows'][number]['cells'][number] {
		const cellProperties = this.directTextElement(cell, 'tcPr')
		const textBody = this.directTextElement(cell, 'txBody')
		const cellText = textBody ? this.parseTextBodyElement(textBody, slideData) : undefined
		const gridSpan = this.numericAttribute(cell, 'gridSpan')
		const rowSpan = this.numericAttribute(cell, 'rowSpan')
		const anchor = cellProperties ? this.textAttribute(cellProperties, 'anchor') : undefined
		const marginAttrs = cellProperties
			? (['marL', 'marR', 'marT', 'marB'] as const).map(name => this.numericAttribute(cellProperties, name))
			: []
		const fillElement = cellProperties ? this.directTextElement(cellProperties, 'solidFill') : null
		const fillColor = this.textColor(fillElement)
		const cellOptions = {
			...(fillColor.color ? { fill: { type: 'solid' as const, color: fillColor.color, ...(fillColor.transparency !== undefined ? { transparency: fillColor.transparency } : {}) } } : {}),
			...(anchor && ({ t: 'top', ctr: 'middle', b: 'bottom' } as Record<string, 'top' | 'middle' | 'bottom'>)[anchor] ? { valign: ({ t: 'top', ctr: 'middle', b: 'bottom' } as Record<string, 'top' | 'middle' | 'bottom'>)[anchor] } : {}),
			...(marginAttrs.length === 4 && marginAttrs.every((value): value is number => value !== undefined)
				? { margin: { left: this.emuToInches(marginAttrs[0]), right: this.emuToInches(marginAttrs[1]), top: this.emuToInches(marginAttrs[2]), bottom: this.emuToInches(marginAttrs[3]) } }
				: {}),
			...(gridSpan !== undefined && gridSpan > 1 ? { colspan: gridSpan } : {}),
			...(rowSpan !== undefined && rowSpan > 1 ? { rowspan: rowSpan } : {}),
		}
		return {
			...(cellText ? { text: cellText } : {}),
			...(Object.keys(cellOptions).length ? { ...cellOptions } : {}),
		}
	}

	/**
	 * Parse a group shape
	 */
	private parseGroupShape(
		xml: string,
		slideData: SlideExtracted,
		slideNum: number,
		outputFolder: string
	): ShapeModel | null {
		const idMatch = xml.match(/<p:cNvPr\s+id="(\d+)"\s+name="([^"]*)"/)
		if (!idMatch) return null

		const id = parseInt(idMatch[1])
		const name = idMatch[2]

		const { x, y, w, h } = this.parseTransform(xml)

		// Save as passthrough
		const passthroughPath = this.savePassthrough(xml, slideNum, id, 'group', outputFolder)

		this.warnings.push({
			type: 'passthrough',
			location: `slide${slideNum}.shape${id}`,
			message: `Group "${name}" saved as passthrough`,
			details: 'Group shapes require recursive parsing'
		})

		return {
			id,
			name,
			type: '__passthrough__',
			x, y, w, h,
			options: {},
			passthrough: {
				reason: 'Group shapes not yet supported',
				sourceXmlPath: passthroughPath,
				originalType: 'group'
			}
		}
	}

	/**
	 * Parse an unknown/unsupported element (OLE, ActiveX, etc.)
	 */
	private parseUnknownElement(
		xml: string,
		id: number,
		slideNum: number,
		outputFolder: string
	): ShapeModel | null {
		// Extract name
		const nameMatch = xml.match(/<p:cNvPr\s+id="\d+"\s+name="([^"]*)"/)
		const name = nameMatch ? nameMatch[1] : `Unknown ${id}`

		// Try to get position/size (may not exist for all element types)
		let x = 0, y = 0, w = 914400, h = 914400
		try {
			const transform = this.parseTransform(xml)
			x = transform.x
			y = transform.y
			w = transform.w
			h = transform.h
		} catch (e) {
			// Some elements may not have transform - use defaults
		}

		// Detect element type from tag name
		const tagMatch = xml.match(/^<(p:\w+)\b/)
		const elementType = tagMatch ? tagMatch[1].replace('p:', '') : 'unknown'

		// Save as passthrough
		const passthroughPath = this.savePassthrough(xml, slideNum, id, elementType, outputFolder)

		this.warnings.push({
			type: 'passthrough',
			location: `slide${slideNum}.shape${id}`,
			message: `Unknown element "${name}" (${elementType}) saved as passthrough`,
			details: 'Unrecognized PowerPoint element type - preserved via passthrough'
		})

		return {
			id,
			name,
			type: '__passthrough__',
			x, y, w, h,
			options: {},
			passthrough: {
				reason: `Unsupported element type: ${elementType}`,
				sourceXmlPath: passthroughPath,
				originalType: elementType
			}
		}
	}

	/**
	 * Extract a complete XML element by tag name
	 */
	private isTagNameBoundary(ch: string | undefined): boolean {
		return !ch || ch === '>' || ch === '/' || ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n'
	}

	private readElementTagName(xml: string, startPos: number): string | null {
		if (xml[startPos] !== '<' || xml[startPos + 1] === '/' || xml[startPos + 1] === '?' || xml[startPos + 1] === '!') return null
		let i = startPos + 1
		while (i < xml.length && !this.isTagNameBoundary(xml[i])) i++
		return i > startPos + 1 ? xml.substring(startPos + 1, i) : null
	}

	private extractShapeTreeChildren(xml: string): string[] {
		const spTreeStart = xml.indexOf('<p:spTree')
		if (spTreeStart < 0 || !this.isTagNameBoundary(xml[spTreeStart + '<p:spTree'.length])) return []
		const spTreeXml = this.extractElement(xml, spTreeStart, 'p:spTree')
		if (!spTreeXml) return []
		const openEnd = spTreeXml.indexOf('>')
		const closeStart = spTreeXml.lastIndexOf('</p:spTree>')
		if (openEnd < 0 || closeStart < 0 || closeStart <= openEnd) return []
		const inner = spTreeXml.substring(openEnd + 1, closeStart)
		const children: string[] = []
		let searchPos = 0
		while (searchPos < inner.length) {
			const start = inner.indexOf('<', searchPos)
			if (start < 0) break
			const tagName = this.readElementTagName(inner, start)
			if (!tagName) {
				searchPos = start + 1
				continue
			}
			const element = this.extractElement(inner, start, tagName)
			if (!element) {
				searchPos = start + 1
				continue
			}
			children.push(element)
			searchPos = start + element.length
		}
		return children
	}

	private extractElementsByTag(xml: string, tagName: string): string[] {
		const out: string[] = []
		const openTag = `<${tagName}`
		let searchPos = 0
		while (searchPos < xml.length) {
			const start = xml.indexOf(openTag, searchPos)
			if (start < 0) break
			if (!this.isTagNameBoundary(xml[start + openTag.length])) {
				searchPos = start + openTag.length
				continue
			}
			const element = this.extractElement(xml, start, tagName)
			if (!element) {
				searchPos = start + openTag.length
				continue
			}
			out.push(element)
			searchPos = start + element.length
		}
		return out
	}

	private extractElement(xml: string, startPos: number, tagName: string): string | null {
		const openTag = `<${tagName}`
		const closeTag = `</${tagName}>`
		
		let depth = 0
		let i = startPos
		
		while (i < xml.length) {
			if (xml.substring(i, i + openTag.length) === openTag && this.isTagNameBoundary(xml[i + openTag.length])) {
				depth++
			} else if (xml.substring(i, i + closeTag.length) === closeTag) {
				depth--
				if (depth === 0) {
					return xml.substring(startPos, i + closeTag.length)
				}
			}
			i++
		}
		
		return null
	}

	/**
	 * Parse transform (position and size)
	 */
	private parseTransform(xml: string): { x: number; y: number; w: number; h: number; rotation?: number } {
		let x = 0, y = 0, w = 914400, h = 914400  // Default to 1 inch in EMU
		let rotation: number | undefined

		// Look for <a:off> (offset) and <a:ext> (extent)
		const offMatch = xml.match(/<a:off\s+x="(-?\d+)"\s+y="(-?\d+)"/)
		if (offMatch) {
			// Preserve raw EMU values - no conversion to inches
			x = parseInt(offMatch[1])
			y = parseInt(offMatch[2])
		}

		const extMatch = xml.match(/<a:ext\s+cx="(\d+)"\s+cy="(\d+)"/)
		if (extMatch) {
			// Preserve raw EMU values - no conversion to inches
			w = parseInt(extMatch[1])
			h = parseInt(extMatch[2])
		}

		// Look for rotation in <a:xfrm>
		const xfrmMatch = xml.match(/<a:xfrm[^>]*rot="(\d+)"/)
		if (xfrmMatch) {
			// Rotation is in 1/60000 of a degree
			rotation = parseInt(xfrmMatch[1]) / 60000
		}

		return { x, y, w, h, rotation }
	}

	/**
	 * Parse shape options (fill, line, effects)
	 */
	private parseShapeOptions(xml: string): ShapeOptions {
		const options: ShapeOptions = {}

		// Parse fill
		options.fill = this.parseFill(xml)

		// Parse line
		options.line = this.parseLine(xml)

		// Parse shadow
		const shadow = this.parseShadow(xml)
		if (shadow) options.shadow = shadow

		// Parse glow
		const glow = this.parseGlow(xml)
		if (glow) options.glow = glow

		// Parse 3D effects (scene3d and sp3d)
		const effect3D = this.parse3DEffects(xml)
		if (effect3D) options.effect3D = effect3D

		return options
	}

	/**
	 * Parse fill from spPr
	 */
	private parseFill(xml: string): FillModel | undefined {
		// Extract only the spPr section to avoid matching fills in text runs
		// NOTE: Some shapes have multiple <p:spPr> sections. We want the LAST one (visual properties)
		// Use global match to get all, then take the last one
		const allSpPrMatches = Array.from(xml.matchAll(/<p:spPr>([\s\S]*?)<\/p:spPr>/g))
		const spPrMatch = allSpPrMatches.length > 0 ? allSpPrMatches[allSpPrMatches.length - 1] : null
		const fillXml = spPrMatch ? spPrMatch[1] : xml
		
		// No fill - BUT exclude noFill inside <a:ln> (line element) which is for border, not shape fill
		// Check if noFill is at shape level, not inside line
		const noFillMatch = fillXml.match(/<a:noFill\/>/)
		if (noFillMatch) {
			// Make sure it's not inside <a:ln>...</a:ln>
			const lnMatch = fillXml.match(/<a:ln\b[^>]*>([\s\S]*?)<\/a:ln>/)
			const isInsideLine = lnMatch && lnMatch[1].includes('<a:noFill/>')
			if (!isInsideLine) {
				return { type: 'none' }
			}
		}

		// Solid fill
		const solidMatch = fillXml.match(/<a:solidFill>([\s\S]*?)<\/a:solidFill>/)
		if (solidMatch) {
			const content = solidMatch[1]
			const color = this.extractColor(content)
			
			// Extract alpha/transparency if present
			let transparency: number | undefined
			const alphaMatch = content.match(/<a:alpha\s+val="(\d+)"/)
			if (alphaMatch) {
				// Convert from OOXML alpha (0-100000) to transparency percentage (0-100)
				// OOXML alpha 70000 = 70% opaque = 30% transparent
				transparency = Math.round((100000 - parseInt(alphaMatch[1])) / 1000)
			}
			
			return { type: 'solid', color, transparency }
		}

		// Gradient fill
		const gradMatch = fillXml.match(/<a:gradFill>([\s\S]*?)<\/a:gradFill>/)
		if (gradMatch) {
			const gradContent = gradMatch[1]
			const gradient: { type: 'linear' | 'radial'; angle?: number; stops: { position: number; color: string }[] } = {
				type: 'linear',
				stops: []
			}

			// Parse gradient stops from <a:gsLst>
			const gsMatches = gradContent.matchAll(/<a:gs\s+pos="(\d+)">([\s\S]*?)<\/a:gs>/g)
			for (const gsMatch of gsMatches) {
				const position = parseInt(gsMatch[1]) / 1000 // OOXML uses 1/1000th percent
				const color = this.extractColor(gsMatch[2])
				if (color) {
					gradient.stops.push({ position, color })
				}
			}

			// Parse linear gradient angle from <a:lin ang="...">
			const linMatch = gradContent.match(/<a:lin\s+ang="(\d+)"/)
			if (linMatch) {
				gradient.type = 'linear'
				gradient.angle = parseInt(linMatch[1]) / 60000 // OOXML uses 60000ths of a degree
			}

			// Parse radial/path gradient from <a:path path="...">
			const pathMatch = gradContent.match(/<a:path\s+path="(\w+)"/)
			if (pathMatch) {
				gradient.type = 'radial'
			}

			return { type: 'gradient', gradient }
		}

		// Pattern fill
		if (fillXml.includes('<a:pattFill')) {
			return { type: 'pattern' }
		}

		// Picture fill
		if (fillXml.includes('<a:blipFill')) {
			return { type: 'picture' }
		}

		return undefined
	}

	/**
	 * Parse line/border
	 */
	private parseLine(xml: string): LineModel | undefined {
		const lnMatch = xml.match(/<a:ln\s*([^>]*)>([\s\S]*?)<\/a:ln>/)
		if (!lnMatch) return undefined

		const attrs = this.parseAttributes(lnMatch[1])
		const content = lnMatch[2]

		// No line
		if (content.includes('<a:noFill/>')) {
			return undefined
		}

		const line: LineModel = {}

		// Width in EMUs
		if (attrs.w) {
			line.width = this.emuToPoints(parseInt(attrs.w))
		}

		// Color
		const colorMatch = content.match(/<a:solidFill>([\s\S]*?)<\/a:solidFill>/)
		if (colorMatch) {
			line.color = this.extractColor(colorMatch[1])
		}

		// Dash type
		const dashMatch = content.match(/<a:prstDash\s+val="([^"]+)"/)
		if (dashMatch) {
			line.dashType = dashMatch[1]
		}

		return Object.keys(line).length > 0 ? line : undefined
	}

	/**
	 * Parse shadow effect
	 */
	private parseShadow(xml: string): ShadowModel | undefined {
		// Outer shadow
		const outerMatch = xml.match(/<a:outerShdw\s*([^>]*)>([\s\S]*?)<\/a:outerShdw>/)
		if (outerMatch) {
			const attrs = this.parseAttributes(outerMatch[1])
			const content = outerMatch[2]
			const color = this.extractColor(content)
			
			// Extract alpha opacity (nested inside color element)
			// Alpha is in percentage (100000 = 100%, 50000 = 50%)
			// Library expects 'opacity' (0-1 scale), not 'transparency'
			let opacity: number | undefined
			const alphaMatch = content.match(/<a:alpha\s+val="(\d+)"/)
			if (alphaMatch) {
				// Convert from OOXML alpha (0-100000) to library opacity (0-1)
				// OOXML alpha 40000 = 40% opacity = 0.4 in library
				opacity = parseInt(alphaMatch[1]) / 100000
			}

			return {
				type: 'outer',
				color,
				blur: attrs.blurRad ? this.emuToPoints(parseInt(attrs.blurRad)) : undefined,
				offset: attrs.dist ? this.emuToPoints(parseInt(attrs.dist)) : undefined,
				angle: attrs.dir ? parseInt(attrs.dir) / 60000 : undefined,
				opacity
			}
		}

		return undefined
	}

	/**
	 * Parse glow effect
	 */
	private parseGlow(xml: string): GlowModel | undefined {
		const glowMatch = xml.match(/<a:glow\s*([^>]*)>([\s\S]*?)<\/a:glow>/)
		if (!glowMatch) return undefined

		const attrs = this.parseAttributes(glowMatch[1])
		const content = glowMatch[2]
		const color = this.extractColor(content)

		return {
			color,
			size: attrs.rad ? this.emuToPoints(parseInt(attrs.rad)) : undefined
		}
	}

	/**
	 * Parse 3D effects (scene3d and sp3d) into structured model
	 * Returns Effect3DModel matching the library's Text3DProps structure
	 */
	private parse3DEffects(xml: string): any | undefined {
		// Extract the spPr section which contains 3D elements
		// NOTE: Some shapes have multiple <p:spPr> sections. We want the LAST one (visual properties)
		const allSpPrMatches = Array.from(xml.matchAll(/<p:spPr>([\s\S]*?)<\/p:spPr>/g))
		if (allSpPrMatches.length === 0) return undefined
		
		const spPrMatch = allSpPrMatches[allSpPrMatches.length - 1]
		const spPrContent = spPrMatch[1]
		const effect3D: any = {}
		let has3D = false

		// Parse scene3d (camera and lighting)
		const scene3dMatch = spPrContent.match(/<a:scene3d>([\s\S]*?)<\/a:scene3d>/)
		if (scene3dMatch) {
			const scene3dContent = scene3dMatch[1]
			
			// Parse camera
			const cameraMatch = scene3dContent.match(/<a:camera\s+prst="([^"]+)"(?:\s+fov="(\d+)")?>([\s\S]*?)<\/a:camera>/)
			if (cameraMatch) {
				const fov = cameraMatch[2]
				if (fov) {
					effect3D.perspective = parseInt(fov) / 60000 // Convert to degrees
					has3D = true
				}
				
				// Parse rotation
				const rotMatch = cameraMatch[3].match(/<a:rot\s+lat="(-?\d+)"\s+lon="(-?\d+)"\s+rev="(-?\d+)"/)
				if (rotMatch) {
					effect3D.rotationX = parseInt(rotMatch[1]) / 60000 // lat = X rotation
					effect3D.rotationY = parseInt(rotMatch[2]) / 60000 // lon = Y rotation
					effect3D.rotationZ = parseInt(rotMatch[3]) / 60000 // rev = Z rotation
					has3D = true
				}
			}
			
			// Parse light rig
			const lightMatch = scene3dContent.match(/<a:lightRig\s+rig="([^"]+)"(?:\s+dir="([^"]+)")?/)
			if (lightMatch) {
				effect3D.lightRig = lightMatch[1]
				has3D = true
			}
		}

		// Parse sp3d (shape 3D properties)
		const sp3dMatch = spPrContent.match(/<a:sp3d(?:\s+([^>]*?))?>([\s\S]*?)<\/a:sp3d>/)
		if (sp3dMatch) {
			const sp3dAttrs = sp3dMatch[1] || ''
			const sp3dContent = sp3dMatch[2]
			
			// Parse material
			const materialMatch = sp3dAttrs.match(/prstMaterial="([^"]+)"/)
			if (materialMatch) {
				effect3D.material = materialMatch[1]
				has3D = true
			}
			
			// Parse extrusion height
			const extrusionMatch = sp3dAttrs.match(/extrusionH="(\d+)"/)
			if (extrusionMatch) {
				effect3D.extrusion = parseInt(extrusionMatch[1]) / 12700 // Convert EMU to points
				has3D = true
			}
			
			// Parse contour width
			const contourMatch = sp3dAttrs.match(/contourW="(\d+)"/)
			if (contourMatch) {
				effect3D.contourWidth = parseInt(contourMatch[1]) / 12700 // Convert EMU to points
				has3D = true
			}
			
			// Parse top bevel
			const bevelTMatch = sp3dContent.match(/<a:bevelT\s+w="(\d+)"\s+h="(\d+)"(?:\s+prst="([^"]+)")?/)
			if (bevelTMatch) {
				effect3D.bevel = {
					width: parseInt(bevelTMatch[1]) / 12700, // Convert EMU to points
					height: parseInt(bevelTMatch[2]) / 12700,
					type: bevelTMatch[3] || 'circle'
				}
				has3D = true
			}
			
			// Parse bottom bevel
			const bevelBMatch = sp3dContent.match(/<a:bevelB\s+w="(\d+)"\s+h="(\d+)"(?:\s+prst="([^"]+)")?/)
			if (bevelBMatch) {
				effect3D.bevelBottom = {
					width: parseInt(bevelBMatch[1]) / 12700,
					height: parseInt(bevelBMatch[2]) / 12700,
					type: bevelBMatch[3] || 'circle'
				}
				has3D = true
			}
			
			// Parse extrusion color
			const extClrMatch = sp3dContent.match(/<a:extrusionClr>[\s\S]*?<a:srgbClr val="([^"]+)"/)
			if (extClrMatch) {
				effect3D.extrusionColor = extClrMatch[1]
				has3D = true
			}
			
			// Parse contour color
			const contourClrMatch = sp3dContent.match(/<a:contourClr>[\s\S]*?<a:srgbClr val="([^"]+)"/)
			if (contourClrMatch) {
				effect3D.contourColor = contourClrMatch[1]
				has3D = true
			}
		}

		return has3D ? effect3D : undefined
	}

	/**
	 * Parse text body
	 */
	private parseTextBody(xml: string, slideData: SlideExtracted, navigationContext?: SlideNavigationContext): TextModel | undefined {
		const document = new DOMParser().parseFromString(
			`<root xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${xml}</root>`,
			'application/xml'
		)
		const txBody = this.firstTextElement(document, 'txBody')
		return this.parseTextBodyElement(txBody, slideData, navigationContext)
	}

	private parseTextBodyElement(txBody: Element | null, slideData: SlideExtracted, navigationContext?: SlideNavigationContext): TextModel | undefined {
		if (!txBody) return undefined
		const bodyProperties = this.parseBodyProperties(this.directTextElement(txBody, 'bodyPr'))
		const paragraphs = this.directTextElements(txBody)
			.filter(element => element.localName === 'p')
			.map(element => this.parseParagraph(element, slideData, navigationContext))

		return { paragraphs, bodyProperties }
	}

	private allTextElements(root: Document | Element | null | undefined, localName: string): Element[] {
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

	private firstTextElement(root: Document | Element | null | undefined, localName: string): Element | null {
		return this.allTextElements(root, localName)[0] || null
	}

	private directTextElements(parent: Element | null | undefined): Element[] {
		if (!parent) return []
		const result: Element[] = []
		for (let index = 0; index < parent.childNodes.length; index++) {
			const node = parent.childNodes.item(index)
			if (node?.nodeType === 1) result.push(node as Element)
		}
		return result
	}

	private directTextElement(parent: Element | null | undefined, localName: string): Element | null {
		return this.directTextElements(parent).find(element => element.localName === localName) || null
	}

	private textAttribute(element: Element | null | undefined, name: string): string | undefined {
		return element?.hasAttribute(name) ? element.getAttribute(name) || '' : undefined
	}

	private numericAttribute(element: Element | null | undefined, name: string): number | undefined {
		const value = this.textAttribute(element, name)
		if (value === undefined || value === '') return undefined
		const number = Number(value)
		return Number.isFinite(number) ? number : undefined
	}

	private parseBodyProperties(bodyPr: Element | null): TextBodyProperties | undefined {
		if (!bodyPr) return undefined
		const props: TextBodyProperties = {}
		const anchor = this.textAttribute(bodyPr, 'anchor')
		if (anchor) props.anchor = ({ t: 'top', ctr: 'middle', b: 'bottom' } as const)[anchor]
		if (this.textAttribute(bodyPr, 'anchorCtr') !== undefined) props.anchorCtr = this.textAttribute(bodyPr, 'anchorCtr') !== '0'
		const wrap = this.textAttribute(bodyPr, 'wrap')
		if (wrap === 'square' || wrap === 'none') props.wrap = wrap
		for (const [nativeName, modelName] of [['lIns', 'lIns'], ['rIns', 'rIns'], ['tIns', 'tIns'], ['bIns', 'bIns']] as const) {
			const value = this.textAttribute(bodyPr, nativeName)
			if (value !== undefined && Number.isFinite(Number(value))) props[modelName] = this.emuToInches(Number(value))
		}
		const rotation = this.textAttribute(bodyPr, 'rot')
		if (rotation !== undefined && Number.isFinite(Number(rotation))) props.rotation = Number(rotation) / 60000
		const vert = this.textAttribute(bodyPr, 'vert')
		if (vert && vert !== 'horz') props.verticalText = true
		if (this.directTextElement(bodyPr, 'spAutoFit')) props.autoFit = 'resize'
		else if (this.directTextElement(bodyPr, 'normAutofit')) props.autoFit = 'shrink'
		else if (this.directTextElement(bodyPr, 'noAutofit')) props.autoFit = 'none'
		return Object.keys(props).length > 0 ? props : undefined
	}

	private parseParagraph(paragraph: Element, slideData: SlideExtracted, navigationContext?: SlideNavigationContext): ParagraphModel {
		const properties = this.parseParagraphProperties(this.directTextElement(paragraph, 'pPr'))
		const runs: TextRunModel[] = []
		let pendingBreak: TextRunProperties | undefined
		for (const child of this.directTextElements(paragraph)) {
			if (child.localName === 'br') {
				pendingBreak = { ...(this.parseRunProperties(this.directTextElement(child, 'rPr'), slideData, navigationContext) || {}), softBreakBefore: true }
				continue
			}
			if (child.localName !== 'r' && child.localName !== 'fld') continue
			const parsedRuns = this.parseTextRun(child, slideData, navigationContext)
			if (parsedRuns.length === 0) continue
			if (pendingBreak) {
				parsedRuns[0].properties = {
					...(parsedRuns[0].properties || {}),
					...pendingBreak,
					...(runs.length === 0 ? { standaloneBreakParagraph: true } : {})
				}
				pendingBreak = undefined
			}
			runs.push(...parsedRuns)
		}
		if (pendingBreak) runs.push({ text: '', properties: { ...pendingBreak, ...(runs.length === 0 ? { standaloneBreakParagraph: true } : {}) } })
		if (runs.length === 0) runs.push({ text: '' })
		return { runs, properties }
	}

	private parseParagraphProperties(pPr: Element | null): ParagraphProperties | undefined {
		if (!pPr) return undefined
		const props: ParagraphProperties = {}
		const align = this.textAttribute(pPr, 'algn')
		if (align) props.align = ({ l: 'left', ctr: 'center', r: 'right', just: 'justify' } as const)[align]
		const level = this.textAttribute(pPr, 'lvl')
		if (level !== undefined && Number.isInteger(Number(level))) props.level = Number(level)
		const rtl = this.textAttribute(pPr, 'rtl')
		if (rtl !== undefined) props.rtlMode = rtl !== '0'
		const marginLeft = this.textAttribute(pPr, 'marL')
		if (marginLeft !== undefined && Number.isFinite(Number(marginLeft))) props.indent = Math.round((Number(marginLeft) / 12700) * 100) / 100
		const nativeIndent = this.textAttribute(pPr, 'indent')
		if (nativeIndent !== undefined && Number(nativeIndent) < 0) props.hanging = Math.round((-Number(nativeIndent) / 12700) * 100) / 100

		const lineSpacing = this.directTextElement(pPr, 'lnSpc')
		const lineSpacingPoints = this.directTextElement(lineSpacing, 'spcPts')
		const lineSpacingPercent = this.directTextElement(lineSpacing, 'spcPct')
		if (lineSpacingPoints) props.lineSpacing = Number(this.textAttribute(lineSpacingPoints, 'val')) / 100
		else if (lineSpacingPercent) props.lineSpacingMultiple = Number(this.textAttribute(lineSpacingPercent, 'val')) / 100000
		const spaceBefore = this.directTextElement(this.directTextElement(pPr, 'spcBef'), 'spcPts')
		const spaceAfter = this.directTextElement(this.directTextElement(pPr, 'spcAft'), 'spcPts')
		if (spaceBefore) props.spaceBefore = Number(this.textAttribute(spaceBefore, 'val')) / 100
		if (spaceAfter) props.spaceAfter = Number(this.textAttribute(spaceAfter, 'val')) / 100

		const bullet = this.parseParagraphBullet(pPr)
		if (bullet) props.bullet = bullet
		const tabList = this.directTextElement(pPr, 'tabLst')
		if (tabList) {
			props.tabStops = this.directTextElements(tabList).filter(element => element.localName === 'tab').map(element => ({
				position: Math.round((Number(this.textAttribute(element, 'pos')) / 914400) * 100) / 100,
				...(this.textAttribute(element, 'algn') ? { alignment: this.textAttribute(element, 'algn') as 'l' | 'r' | 'ctr' | 'dec' } : {})
			})).filter(stop => Number.isFinite(stop.position))
		}
		return Object.keys(props).length > 0 ? props : undefined
	}

	private parseParagraphBullet(pPr: Element): ParagraphProperties['bullet'] {
		const noBullet = this.directTextElement(pPr, 'buNone')
		const character = this.directTextElement(pPr, 'buChar')
		const number = this.directTextElement(pPr, 'buAutoNum')
		if (!noBullet && !character && !number) return undefined
		const result: NonNullable<ParagraphProperties['bullet']> = {
			type: noBullet ? 'none' : number ? 'number' : 'bullet'
		}
		if (character) result.character = this.textAttribute(character, 'char')
		if (number) {
			result.numberType = this.textAttribute(number, 'type')
			const startAt = this.textAttribute(number, 'startAt')
			if (startAt !== undefined && Number.isInteger(Number(startAt))) result.startAt = Number(startAt)
		}
		const font = this.directTextElement(pPr, 'buFont')
		if (font) result.font = this.textAttribute(font, 'typeface')
		const size = this.directTextElement(pPr, 'buSzPts')
		if (size) result.size = Number(this.textAttribute(size, 'val')) / 100
		const color = this.textColor(this.directTextElement(pPr, 'buClr'))
		if (color.color) result.color = color.color
		return result
	}

	private parseTextRun(run: Element, slideData: SlideExtracted, navigationContext?: SlideNavigationContext): TextRunModel[] {
		const textElement = this.directTextElement(run, 't')
		if (!textElement) return []
		let properties = this.parseRunProperties(this.directTextElement(run, 'rPr'), slideData, navigationContext)
		if (run.localName === 'fld') {
			const type = this.textAttribute(run, 'type')
			if (type) {
				const field = { ...(this.textAttribute(run, 'id') ? { id: this.textAttribute(run, 'id') } : {}), type }
				properties = { ...(properties || {}), field }
			}
		}
		const text = textElement.textContent || ''
		const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
		return lines.map((line, index) => ({
			text: line,
			properties: Object.keys(properties || {}).length > 0 || index > 0
				? { ...(properties || {}), ...(index > 0 ? { softBreakBefore: true } : {}) }
				: undefined
		}))
	}

	private parseRunProperties(rPr: Element | null, slideData: SlideExtracted, navigationContext?: SlideNavigationContext): TextRunProperties | undefined {
		if (!rPr) return undefined
		const props: TextRunProperties = {}
		const size = this.textAttribute(rPr, 'sz')
		if (size !== undefined && Number(size) > 0) props.fontSize = Number(size) / 100
		for (const [attribute, key] of [['b', 'bold'], ['i', 'italic'], ['rtl', 'rtl']] as const) {
			const value = this.textAttribute(rPr, attribute)
			if (value !== undefined) props[key] = value !== '0'
		}
		const underline = this.textAttribute(rPr, 'u')
		if (underline !== undefined) props.underline = underline === 'none' ? false : { style: underline === 'dotDashHeave' ? 'dotDashHeavy' : underline }
		const strike = this.textAttribute(rPr, 'strike')
		if (strike !== undefined) props.strike = strike === 'noStrike' ? false : strike as TextRunProperties['strike']
		const spacing = this.textAttribute(rPr, 'spc')
		if (spacing !== undefined && Number.isFinite(Number(spacing))) props.charSpacing = Number(spacing) / 100
		const baseline = this.textAttribute(rPr, 'baseline')
		if (baseline !== undefined && Number.isFinite(Number(baseline))) {
			const nativeBaseline = Number(baseline)
			if (nativeBaseline === 30000) props.superscript = true
			else if (nativeBaseline === -40000) props.subscript = true
			else props.baseline = nativeBaseline / 1000
		}
		const lang = this.textAttribute(rPr, 'lang')
		if (lang) props.lang = lang
		const fill = this.textColor(this.directTextElement(rPr, 'solidFill'))
		if (fill.color) props.color = fill.color
		if (fill.transparency !== undefined) props.transparency = fill.transparency
		const highlight = this.textColor(this.directTextElement(rPr, 'highlight'))
		if (highlight.color) props.highlight = highlight.color
		const latin = this.directTextElement(rPr, 'latin')
		if (latin) props.fontFace = this.textAttribute(latin, 'typeface')
		const complexScript = this.directTextElement(rPr, 'cs')
		if (complexScript) props.fontFaceComplexScript = this.textAttribute(complexScript, 'typeface')
		const hyperlink = this.parseTextHyperlink(this.directTextElement(rPr, 'hlinkClick'), slideData, navigationContext)
		if (hyperlink) props.hyperlink = hyperlink
		return Object.keys(props).length > 0 ? props : undefined
	}

	private textColor(container: Element | null): { color?: string; transparency?: number } {
		if (!container) return {}
		const colorElement = this.directTextElements(container).find(element => ['srgbClr', 'prstClr', 'schemeClr', 'sysClr'].includes(element.localName))
		if (!colorElement) return {}
		let color = this.textAttribute(colorElement, 'val') || this.textAttribute(colorElement, 'lastClr')
		if (colorElement.localName === 'prstClr') color = ({ black: '000000', white: 'FFFFFF', red: 'FF0000', green: '00FF00', blue: '0000FF', yellow: 'FFFF00', cyan: '00FFFF', magenta: 'FF00FF', gray: '808080' } as Record<string, string>)[color || '']
		if (colorElement.localName === 'schemeClr') color = ({ dk1: '000000', lt1: 'FFFFFF', dk2: '44546A', lt2: 'E7E6E6', accent1: '4472C4', accent2: 'ED7D31', accent3: 'A5A5A5', accent4: 'FFC000', accent5: '5B9BD5', accent6: '70AD47', hlink: '0563C1', folHlink: '954F72' } as Record<string, string>)[color || '']
		const alpha = this.directTextElement(colorElement, 'alpha')
		const alphaValue = alpha ? Number(this.textAttribute(alpha, 'val')) : undefined
		return {
			...(color ? { color: color.toUpperCase() } : {}),
			...(alphaValue !== undefined && Number.isFinite(alphaValue) ? { transparency: Math.round((100 - alphaValue / 1000) * 1000) / 1000 } : {})
		}
	}

	private parseTextHyperlink(
		element: Element | null,
		slideData: SlideExtracted,
		navigationContext?: SlideNavigationContext
	): TextRunProperties['hyperlink'] {
		if (!element) return undefined
		const targetFrame = this.textAttribute(element, 'tgtFrame') ?? this.textAttribute(element, 'target')
		const relationshipId = this.textAttribute(element, 'r:id')
		const relationship = relationshipId ? slideData.relationships.find(candidate => candidate.id === relationshipId) : undefined
		if (!relationship) return undefined
		const tooltip = this.textAttribute(element, 'tooltip')
		const target = this.decodeXmlAttribute(relationship.target)
		const action = this.textAttribute(element, 'action') || ''
		if (relationship.targetMode === 'External' && relationship.type.endsWith('/hyperlink') && !action) {
			return { url: target, ...(tooltip !== undefined ? { tooltip } : {}), ...(targetFrame ? { target: targetFrame } : {}) }
		}
		if (!targetFrame && relationship.type.endsWith('/slide') && action === 'ppaction://hlinksldjump' && navigationContext) {
			const partNumber = this.relationshipSlidePartNumber(target)
			const resolved = partNumber === undefined ? undefined : navigationContext.byPartNumber.get(partNumber)
			if (resolved) return { slide: resolved.targetSlide, ...(tooltip !== undefined ? { tooltip } : {}) }
		}
		return undefined
	}

	/**
	 * Extract color from XML
	 */
	private extractColor(xml: string): string | undefined {
		// srgbClr
		const srgbMatch = xml.match(/<a:srgbClr\s+val="([^"]+)"/)
		if (srgbMatch) return srgbMatch[1]

		// prstClr (preset colors)
		const prstMatch = xml.match(/<a:prstClr\s+val="([^"]+)"/)
		if (prstMatch) {
			const presetColors: { [key: string]: string } = {
				'black': '000000',
				'white': 'FFFFFF',
				'red': 'FF0000',
				'green': '00FF00',
				'blue': '0000FF',
				'yellow': 'FFFF00',
				'cyan': '00FFFF',
				'magenta': 'FF00FF',
				'gray': '808080',
				'darkGray': '404040',
				'lightGray': 'C0C0C0'
			}
			return presetColors[prstMatch[1]] || '000000'
		}

		// schemeClr
		const schemeMatch = xml.match(/<a:schemeClr\s+val="([^"]+)"/)
		if (schemeMatch) {
			const schemeColors: { [key: string]: string } = {
				'bg1': 'FFFFFF', 'bg2': 'E7E6E6',
				'tx1': '000000', 'tx2': '44546A',
				'accent1': '4472C4', 'accent2': 'ED7D31',
				'accent3': 'A5A5A5', 'accent4': 'FFC000',
				'accent5': '5B9BD5', 'accent6': '70AD47',
				'dk1': '000000', 'dk2': '44546A',
				'lt1': 'FFFFFF', 'lt2': 'E7E6E6',
				'hlink': '0563C1', 'folHlink': '954F72'
			}
			return schemeColors[schemeMatch[1]] || '000000'
		}

		return undefined
	}

	/**
	 * Save element as passthrough
	 */
	private savePassthrough(
		xml: string,
		slideNum: number,
		shapeId: number,
		elementType: string,
		outputFolder: string
	): string {
		const fileName = `slide${slideNum}_shape${shapeId}_${elementType}.xml`
		const filePath = path.join(outputFolder, 'passthrough', fileName)
		fs.writeFileSync(filePath, xml)
		return `./passthrough/${fileName}`
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
	 */
	private emuToInches(emu: number): number {
		return Math.round((emu / 914400) * 10000) / 10000
	}

	/**
	 * Convert EMUs to points
	 */
	private emuToPoints(emu: number): number {
		return Math.round((emu / 12700) * 100) / 100
	}

	getWarnings(): DecypherWarning[] {
		return this.warnings
	}

	clearWarnings(): void {
		this.warnings = []
	}
}
