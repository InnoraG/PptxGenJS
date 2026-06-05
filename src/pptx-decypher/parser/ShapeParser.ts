/**
 * ShapeParser - Parse shapes from slide XML
 */

import * as fs from 'fs'
import * as path from 'path'
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
	FillModel,
	LineModel,
	ShadowModel,
	GlowModel,
	PassthroughModel,
	DecypherWarning,
	ShapeEditabilityModel
} from '../types.js'
import { SlideExtracted } from '../extractor/PptxExtractor.js'

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
		relToMediaId?: Map<string, string>
	): ShapeModel[] {
		const shapes: ShapeModel[] = []

		for (const elementXml of this.extractShapeTreeChildren(xml)) {
			const tagName = this.readElementTagName(elementXml, 0)
			if (!tagName || tagName === 'p:nvGrpSpPr' || tagName === 'p:grpSpPr') continue

			let shape: ShapeModel | null = null
			if (tagName === 'p:sp') {
				shape = this.parseShape(elementXml, slideData, slideNum, outputFolder)
			} else if (tagName === 'p:pic') {
				shape = this.parsePicture(elementXml, slideData, slideNum, outputFolder, relToMediaId)
			} else if (tagName === 'p:graphicFrame') {
				shape = this.parseGraphicFrame(elementXml, slideData, slideNum, outputFolder)
			} else if (tagName === 'p:grpSp') {
				shape = this.parseGroupShape(elementXml, slideData, slideNum, outputFolder)
			} else if (tagName === 'mc:AlternateContent' && this.isChartExXml(elementXml)) {
				shape = this.parseChartExAlternateContent(elementXml, slideData, slideNum, outputFolder)
			} else {
				const idMatch = elementXml.match(/<p:cNvPr\s+id="(\d+)"/)
				if (idMatch) shape = this.parseUnknownElement(elementXml, parseInt(idMatch[1]), slideNum, outputFolder)
			}
			if (shape) {
				shape.edit = this.buildEditHandle(shape, slideNum, shapes.length, tagName)
				shapes.push(shape)
			}
		}

		return shapes
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

		return {
			id,
			name,
			type: '__passthrough__',
			x, y, w, h,
			rotation,
			options: {},
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
		outputFolder: string
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
			text = this.parseTextBody(xml)
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
			options: {},
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
			return this.parseTable(xml, id, name, x, y, w, h, slideNum, outputFolder)
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
		id: number,
		name: string,
		x: number,
		y: number,
		w: number,
		h: number,
		slideNum: number,
		outputFolder: string
	): ShapeModel {
		// For now, save tables as passthrough
		// TODO: Full table parsing
		const passthroughPath = this.savePassthrough(xml, slideNum, id, 'table', outputFolder)

		this.warnings.push({
			type: 'passthrough',
			location: `slide${slideNum}.shape${id}`,
			message: `Table "${name}" saved as passthrough`,
			details: 'Table parsing requires complex cell/merge handling'
		})

		return {
			id,
			name,
			type: '__passthrough__',
			x, y, w, h,
			options: {},
			passthrough: {
				reason: 'Table parsing not yet implemented',
				sourceXmlPath: passthroughPath,
				originalType: 'table'
			}
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
	private parseTextBody(xml: string): TextModel | undefined {
		const txBodyMatch = xml.match(/<p:txBody>([\s\S]*?)<\/p:txBody>/)
		if (!txBodyMatch) return undefined

		const txBodyContent = txBodyMatch[1]
		const paragraphs: ParagraphModel[] = []

		// Parse body properties
		const bodyProperties = this.parseBodyProperties(txBodyContent)

		// Parse paragraphs
		const pMatches = txBodyContent.matchAll(/<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g)
		for (const pMatch of pMatches) {
			const paragraph = this.parseParagraph(pMatch[0])
			if (paragraph) paragraphs.push(paragraph)
		}

		// NOTE: Do NOT auto-create empty paragraphs!
		// Some shapes legitimately have 0 paragraphs (empty text bodies)
		// The library will handle this correctly when generating

		return {
			paragraphs,
			bodyProperties
		}
	}

	/**
	 * Parse body properties
	 */
	private parseBodyProperties(xml: string): TextBodyProperties | undefined {
		const bodyPrMatch = xml.match(/<a:bodyPr\s*([^>\/]*)/)
		if (!bodyPrMatch) return undefined

		const attrs = this.parseAttributes(bodyPrMatch[1])
		const props: TextBodyProperties = {}

		// Vertical alignment
		if (attrs.anchor) {
			const anchorMap: { [key: string]: 'top' | 'middle' | 'bottom' } = {
				't': 'top',
				'ctr': 'middle',
				'b': 'bottom'
			}
			props.anchor = anchorMap[attrs.anchor]
		}

		// Insets
		if (attrs.lIns) props.lIns = this.emuToInches(parseInt(attrs.lIns))
		if (attrs.rIns) props.rIns = this.emuToInches(parseInt(attrs.rIns))
		if (attrs.tIns) props.tIns = this.emuToInches(parseInt(attrs.tIns))
		if (attrs.bIns) props.bIns = this.emuToInches(parseInt(attrs.bIns))

		// Rotation
		if (attrs.rot) props.rotation = parseInt(attrs.rot) / 60000

		// Vertical text
		if (attrs.vert && attrs.vert !== 'horz') {
			props.verticalText = true
		}

		// Autofit settings
		// Extract the full bodyPr element including children
		const bodyPrFullMatch = xml.match(/<a:bodyPr\s*[^>]*>([\s\S]*?)<\/a:bodyPr>/)
		if (bodyPrFullMatch) {
			const bodyPrContent = bodyPrFullMatch[1]
			// Check for autofit tags
			if (bodyPrContent.includes('<a:spAutoFit')) {
				props.autoFit = 'resize'  // Shape autofit (shrink text to fit)
			} else if (bodyPrContent.includes('<a:normAutofit')) {
				props.autoFit = 'shrink'  // Normal autofit (reduce font size)
			}
		}

		return Object.keys(props).length > 0 ? props : undefined
	}

	/**
	 * Parse a paragraph
	 */
	private parseParagraph(xml: string): ParagraphModel | undefined {
		const runs: TextRunModel[] = []

		// Parse paragraph properties
		const properties = this.parseParagraphProperties(xml)

		// Parse runs
		const rMatches = xml.matchAll(/<a:r>([\s\S]*?)<\/a:r>/g)
		for (const rMatch of rMatches) {
			const parsedRuns = this.parseTextRun(rMatch[1])
			if (parsedRuns) {
				// parseTextRun can now return multiple runs if text has embedded newlines
				if (Array.isArray(parsedRuns)) {
					runs.push(...parsedRuns)
				} else {
					runs.push(parsedRuns)
				}
			}
		}

		// Also check for field text (like slide numbers)
		const fldMatches = xml.matchAll(/<a:fld[^>]*>([\s\S]*?)<\/a:fld>/g)
		for (const fldMatch of fldMatches) {
			const textMatch = fldMatch[1].match(/<a:t>([^<]*)<\/a:t>/)
			if (textMatch) {
				runs.push({ text: textMatch[1] })
			}
		}

		// PowerPoint always creates at least 1 paragraph, even if empty
		// If no runs, create an empty text run to match frozen reference
		if (runs.length === 0) {
			runs.push({ text: '' })
		}

		return { runs, properties }
	}

	/**
	 * Parse paragraph properties
	 */
	private parseParagraphProperties(xml: string): ParagraphProperties | undefined {
		const pPrMatch = xml.match(/<a:pPr\s*([^>]*)/)
		if (!pPrMatch) return undefined

		const attrs = this.parseAttributes(pPrMatch[1])
		const props: ParagraphProperties = {}

		// Alignment
		if (attrs.algn) {
			const alignMap: { [key: string]: 'left' | 'center' | 'right' | 'justify' } = {
				'l': 'left',
				'ctr': 'center',
				'r': 'right',
				'just': 'justify'
			}
			props.align = alignMap[attrs.algn]
		}

		// Level (for bullets)
		if (attrs.lvl) {
			props.level = parseInt(attrs.lvl)
		}

		// Indent
		if (attrs.indent) {
			props.indent = this.emuToInches(parseInt(attrs.indent))
		}

		return Object.keys(props).length > 0 ? props : undefined
	}

	/**
	 * Parse a text run
	 * Returns single run or array of runs (if text has embedded newlines)
	 */
	private parseTextRun(xml: string): TextRunModel | TextRunModel[] | undefined {
		const textMatch = xml.match(/<a:t>([^<]*)<\/a:t>/)
		if (!textMatch) return undefined

		const text = textMatch[1]
		const properties = this.parseRunProperties(xml)

		// Check if text has embedded newlines (\r\n or \n)
		// PowerPoint can store these in a single <a:t> tag
		// We need to split into multiple runs with softBreakBefore
		if (text.includes('\n')) {
			const lines = text.split(/\r?\n/)
			return lines.map((line, idx) => ({
				text: line,
				properties: idx > 0 ? { ...properties, softBreakBefore: true } : properties
			}))
		}

		return { text, properties }
	}

	/**
	 * Parse run properties
	 */
	private parseRunProperties(xml: string): TextRunProperties | undefined {
		const rPrMatch = xml.match(/<a:rPr\s*([^>\/]*)([^>]*)>?([\s\S]*?)(?:<\/a:rPr>|$)/)
		if (!rPrMatch) return undefined

		const attrs = this.parseAttributes(rPrMatch[1] + rPrMatch[2])
		const content = rPrMatch[3] || ''
		const props: TextRunProperties = {}

		// Font size (in hundredths of a point)
		if (attrs.sz) {
			props.fontSize = parseInt(attrs.sz) / 100
		}

		// Bold
		if (attrs.b === '1') props.bold = true

		// Italic
		if (attrs.i === '1') props.italic = true

		// Underline
		if (attrs.u && attrs.u !== 'none') {
			props.underline = true
		}

		// Strike
		if (attrs.strike && attrs.strike !== 'noStrike') {
			props.strike = true
		}

		// Color
		const colorMatch = content.match(/<a:solidFill>([\s\S]*?)<\/a:solidFill>/)
		if (colorMatch) {
			props.color = this.extractColor(colorMatch[1])
		}

		// Font face
		const latinMatch = content.match(/<a:latin\s+typeface="([^"]+)"/)
		if (latinMatch) {
			props.fontFace = latinMatch[1]
		}

		return Object.keys(props).length > 0 ? props : undefined
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
