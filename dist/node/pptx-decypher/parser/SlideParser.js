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
import { DOMParser } from '@xmldom/xmldom';
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
    parse(slideNum, slideData, extractedData, outputFolder, relToMediaId, // NEW: relationship ID → media ID mapping
    navigationContext) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const xml = slideData.xml;
            // Parse background
            const background = this.parseBackground(xml);
            // Parse shapes
            const shapes = this.parseShapes(xml, slideData, slideNum, outputFolder, relToMediaId, navigationContext);
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
            const slideProperties = this.parseSlideProperties(xml);
            return Object.assign(Object.assign(Object.assign({ index: slideNum }, slideProperties), (((_a = navigationContext === null || navigationContext === void 0 ? void 0 : navigationContext.sectionByPartNumber.get(slideNum)) === null || _a === void 0 ? void 0 : _a.targetSectionId)
                ? { sectionId: navigationContext.sectionByPartNumber.get(slideNum).targetSectionId }
                : {})), { background,
                shapes,
                animations,
                transition,
                notes });
        });
    }
    allElements(root, localName) {
        if (!root)
            return [];
        const result = [];
        if (root.localName === localName)
            result.push(root);
        const nodes = root.getElementsByTagName('*');
        for (let index = 0; index < nodes.length; index++) {
            const element = nodes.item(index);
            if ((element === null || element === void 0 ? void 0 : element.localName) === localName)
                result.push(element);
        }
        return result;
    }
    directElements(root) {
        if (!root)
            return [];
        const result = [];
        for (let index = 0; index < root.childNodes.length; index++) {
            const node = root.childNodes.item(index);
            if ((node === null || node === void 0 ? void 0 : node.nodeType) === 1)
                result.push(node);
        }
        return result;
    }
    presentAttribute(element, name) {
        return (element === null || element === void 0 ? void 0 : element.hasAttribute(name)) ? element.getAttribute(name) || '' : undefined;
    }
    ooxmlBoolean(value) {
        if (value === undefined)
            return undefined;
        const normalized = value.trim().toLowerCase();
        if (['1', 'true', 'on', 'yes'].includes(normalized))
            return true;
        if (['0', 'false', 'off', 'no'].includes(normalized))
            return false;
        return undefined;
    }
    parseSlideProperties(xml) {
        var _a;
        const document = new DOMParser().parseFromString(xml, 'application/xml');
        const root = this.allElements(document, 'sld')[0];
        const cSld = this.allElements(root, 'cSld')[0];
        const nativeTitle = (_a = this.presentAttribute(cSld, 'name')) === null || _a === void 0 ? void 0 : _a.trim();
        const show = this.ooxmlBoolean(this.presentAttribute(root, 'show'));
        const showMasterShapes = this.ooxmlBoolean(this.presentAttribute(root, 'showMasterSp'));
        const showMasterPhAnim = this.ooxmlBoolean(this.presentAttribute(root, 'showMasterPhAnim'));
        return Object.assign(Object.assign(Object.assign(Object.assign({}, (nativeTitle ? { title: nativeTitle, name: nativeTitle } : {})), (show !== undefined ? { hidden: !show } : {})), (showMasterShapes !== undefined ? { showMasterShapes, showMasterBackground: showMasterShapes } : {})), (showMasterPhAnim !== undefined ? { showMasterPhAnim } : {}));
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
    parseShapes(xml, slideData, slideNum, outputFolder, relToMediaId, navigationContext) {
        return this.shapeParser.parseAll(xml, slideData, slideNum, outputFolder, relToMediaId, navigationContext);
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
        const document = new DOMParser().parseFromString(xml, 'application/xml');
        const transition = this.allElements(document, 'transition')[0];
        if (!transition)
            return undefined;
        const child = this.directElements(transition)[0];
        if (!child)
            return undefined;
        const type = child.localName === 'pull' ? 'uncover' : child.localName;
        const rawSpeed = this.presentAttribute(transition, 'spd');
        const speed = rawSpeed === 'med' ? 'medium' : (rawSpeed === 'slow' || rawSpeed === 'fast' ? rawSpeed : undefined);
        const rawDirection = this.presentAttribute(child, 'dir');
        const directionMap = { u: 'up', d: 'down', l: 'left', r: 'right' };
        const direction = rawDirection ? (directionMap[rawDirection] || rawDirection) : undefined;
        const advanceOnClick = this.ooxmlBoolean(this.presentAttribute(transition, 'advClick'));
        const rawAdvanceAfter = this.presentAttribute(transition, 'advTm');
        const advanceAfterTime = rawAdvanceAfter === undefined ? undefined : Number(rawAdvanceAfter);
        const throughBlack = this.ooxmlBoolean(this.presentAttribute(child, 'thruBlk'));
        const splitDirection = type === 'split' && (rawDirection === 'in' || rawDirection === 'out') ? rawDirection : undefined;
        const splitOrient = type === 'split' ? this.presentAttribute(child, 'orient') : undefined;
        return Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({ type }, (speed ? { speed } : {})), (splitOrient === 'horz' || splitOrient === 'vert' ? { direction: splitOrient } : (direction ? { direction } : {}))), (advanceOnClick !== undefined ? { advanceOnClick } : {})), (Number.isFinite(advanceAfterTime) && Number(advanceAfterTime) >= 0 ? { advanceAfterTime: Number(advanceAfterTime) } : {})), (throughBlack !== undefined ? { throughBlack } : {})), (splitDirection ? { splitDirection } : {}));
    }
    /**
     * Parse notes from notes XML
     */
    parseNotes(notesXml) {
        if (!notesXml)
            return undefined;
        const document = new DOMParser().parseFromString(notesXml, 'application/xml');
        const bodyShape = this.allElements(document, 'sp').find(shape => {
            const placeholder = this.allElements(shape, 'ph')[0];
            return this.presentAttribute(placeholder, 'type') === 'body';
        });
        if (!bodyShape)
            return undefined;
        const paragraphs = this.allElements(bodyShape, 'p').map(paragraph => this.allElements(paragraph, 't').map(run => run.textContent || '').join(''));
        return paragraphs.join('\n');
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