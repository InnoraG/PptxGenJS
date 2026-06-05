/**
 * PresentationParser - Parse extracted PPTX data into presentation model
 */

import * as path from 'path'
import { 
	PresentationModel, 
	PresentationMetadata,
	SlideModel,
	MediaAsset,
	DecypherWarning 
} from '../types.js'
import { ExtractedData, MediaFileEntry } from '../extractor/PptxExtractor.js'
import { SlideParser } from './SlideParser.js'

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

		// Parse slides with media mapping
		const slides: SlideModel[] = []
		for (const [slideNum, slideData] of data.slides) {
			const slideModel = await this.slideParser.parse(
				slideNum,
				slideData,
				data,
				outputFolder,
				relToMediaId  // Pass the mapping
			)
			slides.push(slideModel)
			this.warnings.push(...this.slideParser.getWarnings())
			this.slideParser.clearWarnings()
		}

		return {
			metadata,
			slides,
			media
		}
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
		return Math.round((emu / 914400) * 10000) / 10000
	}

	getWarnings(): DecypherWarning[] {
		return this.warnings
	}
}
