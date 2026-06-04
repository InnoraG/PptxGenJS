/**
 * SlideParser - Parse individual slide XML into SlideModel
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
import { ShapeParser } from './ShapeParser.js';
import { AnimationParser } from './AnimationParser.js';
export class SlideParser {
    constructor() {
        this.warnings = [];
        this.shapeParser = new ShapeParser();
        this.animationParser = new AnimationParser();
    }
    /**
     * Parse slide XML into SlideModel
     */
    parse(slideNum, slideData, extractedData, outputFolder, relToMediaId // NEW: relationship ID → media ID mapping
    ) {
        return __awaiter(this, void 0, void 0, function* () {
            const xml = slideData.xml;
            // Parse background
            const background = this.parseBackground(xml);
            // Parse shapes
            const shapes = this.parseShapes(xml, slideData, slideNum, outputFolder, relToMediaId);
            this.warnings.push(...this.shapeParser.getWarnings());
            this.shapeParser.clearWarnings();
            // Parse animations
            const animations = this.parseAnimations(xml, shapes, slideNum, outputFolder);
            this.warnings.push(...this.animationParser.getWarnings());
            this.animationParser.clearWarnings();
            // Parse transition
            const transition = this.parseTransition(xml);
            // Parse notes
            const notes = this.parseNotes(slideData.notesXml);
            return {
                index: slideNum,
                background,
                shapes,
                animations,
                transition,
                notes
            };
        });
    }
    /**
     * Parse slide background
     */
    parseBackground(xml) {
        // Look for <p:bg> element
        const bgMatch = xml.match(/<p:bg>([\s\S]*?)<\/p:bg>/);
        if (!bgMatch)
            return undefined;
        const bgContent = bgMatch[1];
        // Solid fill
        const solidFillMatch = bgContent.match(/<a:solidFill>([\s\S]*?)<\/a:solidFill>/);
        if (solidFillMatch) {
            const color = this.extractColor(solidFillMatch[1]);
            if (color) {
                return { type: 'solid', color };
            }
        }
        // Gradient fill
        const gradFillMatch = bgContent.match(/<a:gradFill>([\s\S]*?)<\/a:gradFill>/);
        if (gradFillMatch) {
            const gradContent = gradFillMatch[1];
            const gradient = {
                type: 'linear',
                stops: []
            };
            // Parse gradient stops
            const gsMatches = gradContent.matchAll(/<a:gs\s+pos="(\d+)">[\s\S]*?<\/a:gs>/g);
            for (const gsMatch of gsMatches) {
                const position = parseInt(gsMatch[1]) / 1000;
                const color = this.extractColor(gsMatch[0]);
                if (color) {
                    gradient.stops.push({ position, color });
                }
            }
            // Parse angle
            const linMatch = gradContent.match(/<a:lin\s+ang="(\d+)"/);
            if (linMatch) {
                gradient.angle = parseInt(linMatch[1]) / 60000;
            }
            // Radial check
            if (gradContent.includes('<a:path')) {
                gradient.type = 'radial';
            }
            return { type: 'gradient', gradient };
        }
        // Image fill
        const blipFillMatch = bgContent.match(/<a:blipFill>/);
        if (blipFillMatch) {
            return { type: 'image' };
        }
        return undefined;
    }
    /**
     * Parse shapes from slide XML
     */
    parseShapes(xml, slideData, slideNum, outputFolder, relToMediaId) {
        return this.shapeParser.parseAll(xml, slideData, slideNum, outputFolder, relToMediaId);
    }
    /**
     * Parse animations from slide XML
     */
    parseAnimations(xml, shapes, slideNum, outputFolder) {
        return this.animationParser.parseAll(xml, shapes, slideNum, outputFolder);
    }
    /**
     * Parse slide transition
     */
    parseTransition(xml) {
        // Look for <p:transition> element
        const transMatch = xml.match(/<p:transition\s*([^>]*)>([\s\S]*?)<\/p:transition>/);
        if (!transMatch)
            return undefined;
        const attrs = this.parseAttributes(transMatch[1]);
        const content = transMatch[2];
        // Get transition type from child element
        const typeMatch = content.match(/<p:(\w+)(?:\s|\/|>)/);
        const type = typeMatch ? typeMatch[1] : 'fade';
        // Parse speed
        let speed = 'medium';
        if (attrs.spd === 'slow')
            speed = 'slow';
        else if (attrs.spd === 'fast')
            speed = 'fast';
        // Parse transition direction from child element
        const dirMatch = content.match(/dir="([^"]+)"/);
        const direction = dirMatch ? dirMatch[1] : undefined;
        // Parse auto-advance timing (advTm is in milliseconds)
        const advanceAfter = attrs.advTm ? parseInt(attrs.advTm) : undefined;
        return {
            type,
            speed,
            direction,
            advanceOnClick: attrs.advClick !== '0',
            advanceAfter
        };
    }
    /**
     * Parse notes from notes XML
     */
    parseNotes(notesXml) {
        if (!notesXml)
            return undefined;
        // Extract text from notes
        const textMatches = notesXml.matchAll(/<a:t>([^<]*)<\/a:t>/g);
        const texts = [];
        for (const match of textMatches) {
            texts.push(match[1]);
        }
        return texts.length > 0 ? texts.join('\n') : undefined;
    }
    /**
     * Extract color from XML fragment
     */
    extractColor(xml) {
        // srgbClr
        const srgbMatch = xml.match(/<a:srgbClr\s+val="([^"]+)"/);
        if (srgbMatch)
            return srgbMatch[1];
        // schemeClr (theme color)
        const schemeMatch = xml.match(/<a:schemeClr\s+val="([^"]+)"/);
        if (schemeMatch) {
            // Map scheme colors to reasonable defaults
            const schemeColors = {
                'bg1': 'FFFFFF',
                'bg2': 'E7E6E6',
                'tx1': '000000',
                'tx2': '44546A',
                'accent1': '4472C4',
                'accent2': 'ED7D31',
                'accent3': 'A5A5A5',
                'accent4': 'FFC000',
                'accent5': '5B9BD5',
                'accent6': '70AD47',
                'dk1': '000000',
                'dk2': '44546A',
                'lt1': 'FFFFFF',
                'lt2': 'E7E6E6',
                'hlink': '0563C1',
                'folHlink': '954F72'
            };
            return schemeColors[schemeMatch[1]] || '000000';
        }
        return undefined;
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
    getWarnings() {
        return this.warnings;
    }
    clearWarnings() {
        this.warnings = [];
    }
}
//# sourceMappingURL=SlideParser.js.map