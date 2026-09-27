/**
 * PptxExtractor - Extract and organize PPTX contents
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
import * as fs from 'fs';
import * as path from 'path';
import JSZip from 'jszip';
export class PptxExtractor {
    constructor(options) {
        this.options = options;
    }
    /**
     * Extract PPTX contents from buffer
     */
    extract(pptxBuffer, outputFolder) {
        return __awaiter(this, void 0, void 0, function* () {
            const zip = yield JSZip.loadAsync(pptxBuffer);
            // Parse content types
            const contentTypes = yield this.parseContentTypes(zip);
            // Parse main presentation relationships
            const presentationRels = yield this.parseRelationships(zip, 'ppt/_rels/presentation.xml.rels');
            // Parse presentation.xml
            const presentationXml = yield this.getFileContent(zip, 'ppt/presentation.xml');
            // Extract slides
            const slides = yield this.extractSlides(zip, outputFolder);
            // Extract theme
            const themeXml = yield this.getFileContent(zip, 'ppt/theme/theme1.xml');
            const themes = yield this.extractNumberedXmlParts(zip, 'ppt/theme', 'theme');
            const slideLayouts = yield this.extractNumberedXmlParts(zip, 'ppt/slideLayouts', 'slideLayout');
            const slideMasters = yield this.extractNumberedXmlParts(zip, 'ppt/slideMasters', 'slideMaster');
            // Extract media files
            const mediaFiles = yield this.extractMedia(zip, outputFolder);
            // Build relationships map
            const relationships = new Map();
            relationships.set('presentation', presentationRels);
            // Extract XML files for debugging
            if (this.options.extractXml) {
                yield this.extractXmlFiles(zip, outputFolder);
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
            };
        });
    }
    /**
     * Retain numbered structural XML parts and their relationships privately.
     * Public semantic names are assigned later, after the selected graph is known.
     */
    extractNumberedXmlParts(zip, folder, baseName) {
        return __awaiter(this, void 0, void 0, function* () {
            const entries = [];
            zip.forEach(relativePath => {
                const normalizedFolder = `${folder}/`;
                if (!relativePath.startsWith(normalizedFolder) || !relativePath.endsWith('.xml'))
                    return;
                const fileName = path.posix.basename(relativePath);
                const match = fileName.match(new RegExp(`^${baseName}(\\d+)\\.xml$`));
                if (match)
                    entries.push({ index: Number(match[1]), partName: relativePath });
            });
            entries.sort((left, right) => left.index - right.index);
            const result = new Map();
            for (const entry of entries) {
                const xml = yield this.getFileContent(zip, entry.partName);
                if (!xml)
                    continue;
                const relsPath = `${path.posix.dirname(entry.partName)}/_rels/${path.posix.basename(entry.partName)}.rels`;
                result.set(entry.index, {
                    partName: entry.partName,
                    xml,
                    relationships: yield this.parseRelationships(zip, relsPath)
                });
            }
            return result;
        });
    }
    /**
     * Parse [Content_Types].xml
     */
    parseContentTypes(zip) {
        return __awaiter(this, void 0, void 0, function* () {
            const content = yield this.getFileContent(zip, '[Content_Types].xml');
            if (!content)
                return [];
            const entries = [];
            // Parse Default entries
            const defaultMatches = content.matchAll(/<Default\s+([^>]+)\/>/g);
            for (const match of defaultMatches) {
                const attrs = this.parseAttributes(match[1]);
                if (attrs.ContentType) {
                    entries.push({
                        extension: attrs.Extension,
                        contentType: attrs.ContentType
                    });
                }
            }
            // Parse Override entries
            const overrideMatches = content.matchAll(/<Override\s+([^>]+)\/>/g);
            for (const match of overrideMatches) {
                const attrs = this.parseAttributes(match[1]);
                if (attrs.ContentType) {
                    entries.push({
                        partName: attrs.PartName,
                        contentType: attrs.ContentType
                    });
                }
            }
            return entries;
        });
    }
    /**
     * Parse relationships file
     */
    parseRelationships(zip, relsPath) {
        return __awaiter(this, void 0, void 0, function* () {
            const content = yield this.getFileContent(zip, relsPath);
            if (!content)
                return [];
            const entries = [];
            const matches = content.matchAll(/<Relationship\s+([^>]+)\/>/g);
            for (const match of matches) {
                const attrs = this.parseAttributes(match[1]);
                if (attrs.Id && attrs.Type && attrs.Target) {
                    entries.push({
                        id: attrs.Id,
                        type: attrs.Type,
                        target: attrs.Target,
                        targetMode: attrs.TargetMode
                    });
                }
            }
            return entries;
        });
    }
    /**
     * Extract all slides
     */
    extractSlides(zip, outputFolder) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            const slides = new Map();
            // Find all slide files
            const slideFiles = [];
            zip.forEach((relativePath) => {
                const match = relativePath.match(/^ppt\/slides\/slide(\d+)\.xml$/);
                if (match) {
                    slideFiles.push(relativePath);
                }
            });
            // Sort by slide number
            slideFiles.sort((a, b) => {
                var _a, _b;
                const numA = parseInt(((_a = a.match(/slide(\d+)/)) === null || _a === void 0 ? void 0 : _a[1]) || '0');
                const numB = parseInt(((_b = b.match(/slide(\d+)/)) === null || _b === void 0 ? void 0 : _b[1]) || '0');
                return numA - numB;
            });
            // Extract each slide
            for (const slideFile of slideFiles) {
                const slideNum = parseInt(((_a = slideFile.match(/slide(\d+)/)) === null || _a === void 0 ? void 0 : _a[1]) || '0');
                const xml = yield this.getFileContent(zip, slideFile);
                if (xml) {
                    // Get slide relationships
                    const relsPath = slideFile.replace('slides/', 'slides/_rels/').replace('.xml', '.xml.rels');
                    const relationships = yield this.parseRelationships(zip, relsPath);
                    // Resolve notes by relationship. Notes part numbers are independent of
                    // slide part numbers and must never be guessed from the filename.
                    const notesRelationship = relationships.find(rel => rel.type.endsWith('/notesSlide') && rel.targetMode !== 'External');
                    const normalizedTarget = (_b = notesRelationship === null || notesRelationship === void 0 ? void 0 : notesRelationship.target) === null || _b === void 0 ? void 0 : _b.split('\\').join('/');
                    const notesPath = normalizedTarget
                        ? (normalizedTarget.startsWith('/')
                            ? normalizedTarget.slice(1)
                            : path.posix.normalize(path.posix.join(path.posix.dirname(slideFile), normalizedTarget)))
                        : '';
                    const notesXml = yield this.getFileContent(zip, notesPath);
                    slides.set(slideNum, {
                        xml,
                        relationships,
                        notesXml: notesXml || undefined
                    });
                }
            }
            return slides;
        });
    }
    /**
     * Extract media files
     */
    extractMedia(zip, outputFolder) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.options.extractMedia)
                return [];
            const mediaFiles = [];
            const assetsFolder = path.join(outputFolder, 'assets');
            const mediaPromises = [];
            zip.forEach((relativePath, file) => {
                if (relativePath.startsWith('ppt/media/') && !file.dir) {
                    const promise = (() => __awaiter(this, void 0, void 0, function* () {
                        const data = yield file.async('nodebuffer');
                        const fileName = path.basename(relativePath);
                        const extractedPath = path.join(assetsFolder, fileName);
                        // Determine content type from extension
                        const ext = path.extname(fileName).toLowerCase();
                        const contentTypeMap = {
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
                        };
                        fs.writeFileSync(extractedPath, data);
                        mediaFiles.push({
                            partName: relativePath,
                            data,
                            contentType: contentTypeMap[ext] || 'application/octet-stream',
                            extractedPath
                        });
                    }))();
                    mediaPromises.push(promise);
                }
            });
            yield Promise.all(mediaPromises);
            return mediaFiles;
        });
    }
    /**
     * Extract XML files for debugging/reference
     */
    extractXmlFiles(zip, outputFolder) {
        return __awaiter(this, void 0, void 0, function* () {
            const extractedFolder = path.join(outputFolder, 'extracted');
            const promises = [];
            zip.forEach((relativePath, file) => {
                if (relativePath.endsWith('.xml') && !file.dir) {
                    const promise = (() => __awaiter(this, void 0, void 0, function* () {
                        const content = yield file.async('string');
                        // Create subdirectory structure
                        const targetPath = path.join(extractedFolder, relativePath);
                        const targetDir = path.dirname(targetPath);
                        if (!fs.existsSync(targetDir)) {
                            fs.mkdirSync(targetDir, { recursive: true });
                        }
                        // Format XML for readability
                        const formatted = this.formatXml(content);
                        fs.writeFileSync(targetPath, formatted);
                    }))();
                    promises.push(promise);
                }
            });
            yield Promise.all(promises);
        });
    }
    /**
     * Get file content from ZIP
     */
    getFileContent(zip, filePath) {
        return __awaiter(this, void 0, void 0, function* () {
            const file = zip.file(filePath);
            if (!file)
                return null;
            return yield file.async('string');
        });
    }
    /**
     * Parse XML attributes string into object
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
     * Simple XML formatting for readability
     */
    formatXml(xml) {
        // Basic indentation
        let formatted = '';
        let indent = 0;
        const parts = xml.replace(/>\s*</g, '>\n<').split('\n');
        for (const part of parts) {
            const trimmed = part.trim();
            if (!trimmed)
                continue;
            // Decrease indent for closing tags
            if (trimmed.startsWith('</')) {
                indent = Math.max(0, indent - 1);
            }
            formatted += '  '.repeat(indent) + trimmed + '\n';
            // Increase indent for opening tags (not self-closing)
            if (trimmed.startsWith('<') &&
                !trimmed.startsWith('</') &&
                !trimmed.startsWith('<?') &&
                !trimmed.endsWith('/>') &&
                !trimmed.includes('</')) {
                indent++;
            }
        }
        return formatted;
    }
}
//# sourceMappingURL=PptxExtractor.js.map