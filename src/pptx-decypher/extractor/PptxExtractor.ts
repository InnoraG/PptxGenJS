/**
 * PptxExtractor - Extract and organize PPTX contents
 */

import * as fs from 'fs'
import * as path from 'path'
import JSZip from 'jszip'
import { DecypherOptions } from '../types.js'

export interface ExtractedData {
	/** Parsed content types */
	contentTypes: ContentTypeEntry[]
	/** Presentation.xml content */
	presentationXml: string
	/** Slide XML contents indexed by slide number */
	slides: Map<number, SlideExtracted>
	/** Relationships */
	relationships: Map<string, RelationshipEntry[]>
	/** Theme XML if present */
	themeXml?: string
	/** All physical theme parts retained privately for relationship-based selection. */
	themes: Map<number, PackageXmlPart>
	/** Slide layouts */
	slideLayouts: Map<number, PackageXmlPart>
	/** Slide masters */
	slideMasters: Map<number, PackageXmlPart>
	/** Media files extracted */
	mediaFiles: MediaFileEntry[]
	/** Raw ZIP for passthrough access */
	zip: JSZip
}

export interface SlideExtracted {
	xml: string
	relationships: RelationshipEntry[]
	notesXml?: string
}

/** Private package carrier. Its path/relationship IDs never enter PresentationModel. */
export interface PackageXmlPart {
	partName: string
	xml: string
	relationships: RelationshipEntry[]
}

export interface ContentTypeEntry {
	partName?: string
	extension?: string
	contentType: string
}

export interface RelationshipEntry {
	id: string
	type: string
	target: string
	targetMode?: string
}

export interface MediaFileEntry {
	partName: string
	data: Buffer
	contentType: string
	extractedPath: string
}

export class PptxExtractor {
	private options: Required<DecypherOptions>

	constructor(options: Required<DecypherOptions>) {
		this.options = options
	}

	/**
	 * Extract PPTX contents from buffer
	 */
	async extract(pptxBuffer: Buffer, outputFolder: string): Promise<ExtractedData> {
		const zip = await JSZip.loadAsync(pptxBuffer)

		// Parse content types
		const contentTypes = await this.parseContentTypes(zip)

		// Parse main presentation relationships
		const presentationRels = await this.parseRelationships(zip, 'ppt/_rels/presentation.xml.rels')

		// Parse presentation.xml
		const presentationXml = await this.getFileContent(zip, 'ppt/presentation.xml')

		// Extract slides
		const slides = await this.extractSlides(zip, outputFolder)

		// Extract theme
		const themeXml = await this.getFileContent(zip, 'ppt/theme/theme1.xml')
		const themes = await this.extractNumberedXmlParts(zip, 'ppt/theme', 'theme')
		const slideLayouts = await this.extractNumberedXmlParts(zip, 'ppt/slideLayouts', 'slideLayout')
		const slideMasters = await this.extractNumberedXmlParts(zip, 'ppt/slideMasters', 'slideMaster')

		// Extract media files
		const mediaFiles = await this.extractMedia(zip, outputFolder)

		// Build relationships map
		const relationships = new Map<string, RelationshipEntry[]>()
		relationships.set('presentation', presentationRels)

		// Extract XML files for debugging
		if (this.options.extractXml) {
			await this.extractXmlFiles(zip, outputFolder)
		}

		return {
			contentTypes,
			presentationXml,
			slides,
			relationships,
			themeXml,
			themes,
			slideLayouts,
			slideMasters,
			mediaFiles,
			zip
		}
	}

	/**
	 * Retain numbered structural XML parts and their relationships privately.
	 * Public semantic names are assigned later, after the selected graph is known.
	 */
	private async extractNumberedXmlParts(
		zip: JSZip,
		folder: string,
		baseName: string
	): Promise<Map<number, PackageXmlPart>> {
		const entries: Array<{ index: number; partName: string }> = []
		zip.forEach(relativePath => {
			const normalizedFolder = `${folder}/`
			if (!relativePath.startsWith(normalizedFolder) || !relativePath.endsWith('.xml')) return
			const fileName = path.posix.basename(relativePath)
			const match = fileName.match(new RegExp(`^${baseName}(\\d+)\\.xml$`))
			if (match) entries.push({ index: Number(match[1]), partName: relativePath })
		})
		entries.sort((left, right) => left.index - right.index)

		const result = new Map<number, PackageXmlPart>()
		for (const entry of entries) {
			const xml = await this.getFileContent(zip, entry.partName)
			if (!xml) continue
			const relsPath = `${path.posix.dirname(entry.partName)}/_rels/${path.posix.basename(entry.partName)}.rels`
			result.set(entry.index, {
				partName: entry.partName,
				xml,
				relationships: await this.parseRelationships(zip, relsPath)
			})
		}
		return result
	}

	/**
	 * Parse [Content_Types].xml
	 */
	private async parseContentTypes(zip: JSZip): Promise<ContentTypeEntry[]> {
		const content = await this.getFileContent(zip, '[Content_Types].xml')
		if (!content) return []

		const entries: ContentTypeEntry[] = []
		
		// Parse Default entries
		const defaultMatches = content.matchAll(/<Default\s+([^>]+)\/>/g)
		for (const match of defaultMatches) {
			const attrs = this.parseAttributes(match[1])
			if (attrs.ContentType) {
				entries.push({
					extension: attrs.Extension,
					contentType: attrs.ContentType
				})
			}
		}

		// Parse Override entries
		const overrideMatches = content.matchAll(/<Override\s+([^>]+)\/>/g)
		for (const match of overrideMatches) {
			const attrs = this.parseAttributes(match[1])
			if (attrs.ContentType) {
				entries.push({
					partName: attrs.PartName,
					contentType: attrs.ContentType
				})
			}
		}

		return entries
	}

	/**
	 * Parse relationships file
	 */
	private async parseRelationships(zip: JSZip, relsPath: string): Promise<RelationshipEntry[]> {
		const content = await this.getFileContent(zip, relsPath)
		if (!content) return []

		const entries: RelationshipEntry[] = []
		const matches = content.matchAll(/<Relationship\s+([^>]+)\/>/g)
		
		for (const match of matches) {
			const attrs = this.parseAttributes(match[1])
			if (attrs.Id && attrs.Type && attrs.Target) {
				entries.push({
					id: attrs.Id,
					type: attrs.Type,
					target: attrs.Target,
					targetMode: attrs.TargetMode
				})
			}
		}

		return entries
	}

	/**
	 * Extract all slides
	 */
	private async extractSlides(zip: JSZip, outputFolder: string): Promise<Map<number, SlideExtracted>> {
		const slides = new Map<number, SlideExtracted>()

		// Find all slide files
		const slideFiles: string[] = []
		zip.forEach((relativePath) => {
			const match = relativePath.match(/^ppt\/slides\/slide(\d+)\.xml$/)
			if (match) {
				slideFiles.push(relativePath)
			}
		})

		// Sort by slide number
		slideFiles.sort((a, b) => {
			const numA = parseInt(a.match(/slide(\d+)/)?.[1] || '0')
			const numB = parseInt(b.match(/slide(\d+)/)?.[1] || '0')
			return numA - numB
		})

		// Extract each slide
		for (const slideFile of slideFiles) {
			const slideNum = parseInt(slideFile.match(/slide(\d+)/)?.[1] || '0')
			const xml = await this.getFileContent(zip, slideFile)
			
			if (xml) {
				// Get slide relationships
				const relsPath = slideFile.replace('slides/', 'slides/_rels/').replace('.xml', '.xml.rels')
				const relationships = await this.parseRelationships(zip, relsPath)

				// Resolve notes by relationship. Notes part numbers are independent of
				// slide part numbers and must never be guessed from the filename.
				const notesRelationship = relationships.find(rel => rel.type.endsWith('/notesSlide') && rel.targetMode !== 'External')
				const normalizedTarget = notesRelationship?.target?.split('\\').join('/')
				const notesPath = normalizedTarget
					? (normalizedTarget.startsWith('/')
						? normalizedTarget.slice(1)
						: path.posix.normalize(path.posix.join(path.posix.dirname(slideFile), normalizedTarget)))
					: ''
				const notesXml = await this.getFileContent(zip, notesPath)

				slides.set(slideNum, {
					xml,
					relationships,
					notesXml: notesXml || undefined
				})
			}
		}

		return slides
	}

	/**
	 * Extract media files
	 */
	private async extractMedia(zip: JSZip, outputFolder: string): Promise<MediaFileEntry[]> {
		if (!this.options.extractMedia) return []

		const mediaFiles: MediaFileEntry[] = []
		const assetsFolder = path.join(outputFolder, 'assets')

		const mediaPromises: Promise<void>[] = []

		zip.forEach((relativePath, file) => {
			if (relativePath.startsWith('ppt/media/') && !file.dir) {
				const promise = (async () => {
					const data = await file.async('nodebuffer')
					const fileName = path.basename(relativePath)
					const extractedPath = path.join(assetsFolder, fileName)

					// Determine content type from extension
					const ext = path.extname(fileName).toLowerCase()
					const contentTypeMap: { [key: string]: string } = {
						'.png': 'image/png',
						'.jpg': 'image/jpeg',
						'.jpeg': 'image/jpeg',
						'.gif': 'image/gif',
						'.bmp': 'image/bmp',
						'.svg': 'image/svg+xml',
						'.emf': 'image/x-emf',
						'.wmf': 'image/x-wmf',
						'.mp4': 'video/mp4',
						'.m4v': 'video/mp4',
						'.mov': 'video/quicktime',
						'.avi': 'video/x-msvideo',
						'.mp3': 'audio/mpeg',
						'.wav': 'audio/wav',
						'.m4a': 'audio/mp4'
					}

					fs.writeFileSync(extractedPath, data)

					mediaFiles.push({
						partName: relativePath,
						data,
						contentType: contentTypeMap[ext] || 'application/octet-stream',
						extractedPath
					})
				})()
				mediaPromises.push(promise)
			}
		})

		await Promise.all(mediaPromises)
		return mediaFiles
	}

	/**
	 * Extract XML files for debugging/reference
	 */
	private async extractXmlFiles(zip: JSZip, outputFolder: string): Promise<void> {
		const extractedFolder = path.join(outputFolder, 'extracted')

		const promises: Promise<void>[] = []

		zip.forEach((relativePath, file) => {
			if (relativePath.endsWith('.xml') && !file.dir) {
				const promise = (async () => {
					const content = await file.async('string')
					
					// Create subdirectory structure
					const targetPath = path.join(extractedFolder, relativePath)
					const targetDir = path.dirname(targetPath)
					
					if (!fs.existsSync(targetDir)) {
						fs.mkdirSync(targetDir, { recursive: true })
					}

					// Format XML for readability
					const formatted = this.formatXml(content)
					fs.writeFileSync(targetPath, formatted)
				})()
				promises.push(promise)
			}
		})

		await Promise.all(promises)
	}

	/**
	 * Get file content from ZIP
	 */
	private async getFileContent(zip: JSZip, filePath: string): Promise<string | null> {
		const file = zip.file(filePath)
		if (!file) return null
		return await file.async('string')
	}

	/**
	 * Parse XML attributes string into object
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
	 * Simple XML formatting for readability
	 */
	private formatXml(xml: string): string {
		// Basic indentation
		let formatted = ''
		let indent = 0
		const parts = xml.replace(/>\s*</g, '>\n<').split('\n')

		for (const part of parts) {
			const trimmed = part.trim()
			if (!trimmed) continue

			// Decrease indent for closing tags
			if (trimmed.startsWith('</')) {
				indent = Math.max(0, indent - 1)
			}

			formatted += '  '.repeat(indent) + trimmed + '\n'

			// Increase indent for opening tags (not self-closing)
			if (trimmed.startsWith('<') && 
				!trimmed.startsWith('</') && 
				!trimmed.startsWith('<?') &&
				!trimmed.endsWith('/>') &&
				!trimmed.includes('</')) {
				indent++
			}
		}

		return formatted
	}
}
