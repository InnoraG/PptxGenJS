/**
 * PresentationParser - Parse extracted PPTX data into presentation model
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import * as path from 'path';
import { SlideParser } from './SlideParser.js';
export class PresentationParser {
    constructor() {
        this.warnings = [];
        this.slideParser = new SlideParser();
    }
    /**
     * Parse extracted data into presentation model
     */
    parse(data, outputFolder) {
        return __awaiter(this, void 0, void 0, function* () {
            // Parse presentation metadata
            const metadata = this.parseMetadata(data.presentationXml);
            // Convert media files to assets first (need this for mapping)
            const media = this.convertMediaToAssets(data.mediaFiles);
            // Build relationship ID → media ID mapping
            const relToMediaId = this.buildRelationshipToMediaIdMap(data, media);
            // Parse slides with media mapping
            const slides = [];
            for (const [slideNum, slideData] of data.slides) {
                const slideModel = yield this.slideParser.parse(slideNum, slideData, data, outputFolder, relToMediaId // Pass the mapping
                );
                slides.push(slideModel);
                this.warnings.push(...this.slideParser.getWarnings());
                this.slideParser.clearWarnings();
            }
            return {
                metadata,
                slides,
                media
            };
        });
    }
    /**
     * Parse presentation metadata from presentation.xml
     */
    parseMetadata(xml) {
        // Default to standard 16:9
        let width = 10;
        let height = 5.625;
        // Parse slide size
        // <p:sldSz cx="9144000" cy="6858000"/>
        const sldSzMatch = xml.match(/<p:sldSz\s+([^>]+)/);
        if (sldSzMatch) {
            const attrs = this.parseAttributes(sldSzMatch[1]);
            if (attrs.cx) {
                width = this.emuToInches(parseInt(attrs.cx));
            }
            if (attrs.cy) {
                height = this.emuToInches(parseInt(attrs.cy));
            }
        }
        return {
            layout: { width, height }
        };
    }
    /**
     * Convert media file entries to MediaAsset objects
     */
    convertMediaToAssets(mediaFiles) {
        return mediaFiles.map((mf, index) => {
            const fileName = path.basename(mf.partName);
            const ext = path.extname(fileName).toLowerCase();
            let type = 'image';
            if (['.mp4', '.m4v', '.mov', '.avi', '.wmv'].includes(ext)) {
                type = 'video';
            }
            else if (['.mp3', '.wav', '.m4a', '.wma'].includes(ext)) {
                type = 'audio';
            }
            return {
                id: `media${index + 1}`,
                type,
                originalName: fileName,
                extractedPath: mf.extractedPath,
                mimeType: mf.contentType,
                relationshipId: '' // Will be filled when parsing slides
            };
        });
    }
    /**
     * Build mapping from relationship ID to media asset ID
     * Maps: rId5 → media1, rId6 → media2, etc.
     */
    buildRelationshipToMediaIdMap(data, mediaAssets) {
        const map = new Map();
        // For each slide, check its relationships
        for (const [slideNum, slideData] of data.slides) {
            for (const rel of slideData.relationships) {
                // Check if this relationship points to a media file
                // rel.target is like "../media/image1.png" or "../media/media1.mp4"
                const mediaFileName = path.basename(rel.target);
                // Find which media asset matches this file
                const mediaAsset = mediaAssets.find(ma => path.basename(ma.extractedPath) === mediaFileName);
                if (mediaAsset) {
                    // Map this relationship ID to the media asset ID
                    // Key: slideNum + rId (e.g., "1:rId5")
                    // Value: media asset ID (e.g., "media1")
                    const key = `${slideNum}:${rel.id}`;
                    map.set(key, mediaAsset.id);
                }
            }
        }
        return map;
    }
    /**
     * Parse XML attributes
     */
    parseAttributes(attrString) {
        const attrs = {};
        const matches = attrString.matchAll(/(\w+)="([^"]*)"/g);
        for (const match of matches) {
            attrs[match[1]] = match[2];
        }
        return attrs;
    }
    /**
     * Convert EMUs to inches
     * 1 inch = 914400 EMUs
     */
    emuToInches(emu) {
        return Math.round((emu / 914400) * 10000) / 10000;
    }
    getWarnings() {
        return this.warnings;
    }
}
//# sourceMappingURL=PresentationParser.js.map