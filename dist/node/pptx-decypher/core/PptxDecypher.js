/**
 * PptxDecypher - Main orchestrator class
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
import * as crypto from 'crypto';
import { PptxExtractor } from '../extractor/PptxExtractor.js';
import { PresentationParser } from '../parser/PresentationParser.js';
import { CodeGenerator } from '../generator/CodeGenerator.js';
export class PptxDecypher {
    constructor(options = {}) {
        this.warnings = [];
        this.errors = [];
        this.options = {
            outputDir: options.outputDir || './decyphered',
            extractXml: options.extractXml !== false,
            extractMedia: options.extractMedia !== false,
            validate: options.validate !== false
        };
    }
    /**
     * Decypher a PPTX file and generate a .mjs generator script
     */
    decypher(pptxPath) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log(`\n🔍 PptxDecypher: Starting analysis of ${pptxPath}`);
            try {
                const pptxBuffer = fs.readFileSync(pptxPath);
                const signature = this.calculateSignature(pptxBuffer);
                const outputFolder = this.createOutputFolders(signature, pptxPath);
                const { model, generatorPath, stats } = yield this.runPipeline(pptxBuffer, signature, outputFolder, pptxPath);
                console.log(`\n✅ Decyphering complete!`);
                console.log(`   📊 Slides: ${stats.slideCount}`);
                console.log(`   🔷 Shapes: ${stats.shapeCount}`);
                console.log(`   🎬 Animations: ${stats.animationCount}`);
                console.log(`   🖼️ Media: ${stats.mediaCount}`);
                if (stats.passthroughCount > 0) {
                    console.log(`   ⚠️ Passthrough: ${stats.passthroughCount}`);
                }
                return {
                    success: true,
                    signature,
                    generatorPath,
                    outputFolder,
                    stats,
                    warnings: this.warnings,
                    errors: this.errors
                };
            }
            catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                this.errors.push(errorMsg);
                console.error(`\n❌ Decyphering failed: ${errorMsg}`);
                return {
                    success: false,
                    signature: '',
                    generatorPath: '',
                    outputFolder: '',
                    stats: { slideCount: 0, shapeCount: 0, animationCount: 0, mediaCount: 0, passthroughCount: 0 },
                    warnings: this.warnings,
                    errors: this.errors
                };
            }
        });
    }
    /**
     * Decypher a PPTX from an in-memory Buffer (SaaS/server-side use)
     * Same as decypher() but accepts Buffer instead of file path.
     */
    decypherFromBuffer(pptxBuffer_1) {
        return __awaiter(this, arguments, void 0, function* (pptxBuffer, sourceName = 'uploaded.pptx') {
            try {
                const signature = this.calculateSignature(pptxBuffer);
                const outputFolder = this.createOutputFoldersForBuffer(signature, sourceName);
                const { generatorPath, stats } = yield this.runPipeline(pptxBuffer, signature, outputFolder, sourceName);
                return {
                    success: true,
                    signature,
                    generatorPath,
                    outputFolder,
                    stats,
                    warnings: this.warnings,
                    errors: this.errors
                };
            }
            catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                this.errors.push(errorMsg);
                return {
                    success: false,
                    signature: '',
                    generatorPath: '',
                    outputFolder: '',
                    stats: { slideCount: 0, shapeCount: 0, animationCount: 0, mediaCount: 0, passthroughCount: 0 },
                    warnings: this.warnings,
                    errors: this.errors
                };
            }
        });
    }
    /**
     * Decypher a PPTX and return the raw PresentationModel (for programmatic/AI editing)
     * Does NOT generate code — returns the structured model for manipulation.
     */
    decypherToModel(input_1) {
        return __awaiter(this, arguments, void 0, function* (input, sourceName = 'input.pptx') {
            try {
                const pptxBuffer = typeof input === 'string' ? fs.readFileSync(input) : input;
                const signature = this.calculateSignature(pptxBuffer);
                const outputFolder = this.createOutputFoldersForBuffer(signature, sourceName);
                const extractor = new PptxExtractor(this.options);
                const extractedData = yield extractor.extract(pptxBuffer, outputFolder);
                const parser = new PresentationParser();
                const model = yield parser.parse(extractedData, outputFolder);
                this.warnings.push(...parser.getWarnings());
                const stats = this.calculateStats(model);
                return {
                    success: true,
                    model,
                    signature,
                    stats,
                    warnings: this.warnings,
                    errors: this.errors
                };
            }
            catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                this.errors.push(errorMsg);
                return {
                    success: false,
                    signature: '',
                    stats: { slideCount: 0, shapeCount: 0, animationCount: 0, mediaCount: 0, passthroughCount: 0 },
                    warnings: this.warnings,
                    errors: this.errors
                };
            }
        });
    }
    /**
     * Internal pipeline shared by decypher() and decypherFromBuffer()
     */
    runPipeline(pptxBuffer, signature, outputFolder, sourcePath) {
        return __awaiter(this, void 0, void 0, function* () {
            const extractor = new PptxExtractor(this.options);
            const extractedData = yield extractor.extract(pptxBuffer, outputFolder);
            const parser = new PresentationParser();
            const model = yield parser.parse(extractedData, outputFolder);
            this.warnings.push(...parser.getWarnings());
            const generator = new CodeGenerator();
            const generatorPath = yield generator.generate(model, outputFolder, signature, sourcePath);
            const stats = this.calculateStats(model);
            return { model, generatorPath, stats };
        });
    }
    /**
     * Calculate unique signature from PPTX content
     * Uses SHA256 of core content (excluding volatile metadata)
     */
    calculateSignature(pptxBuffer) {
        // For now, use full content hash
        // TODO: Exclude volatile parts like docProps/core.xml timestamps
        const hash = crypto.createHash('sha256');
        hash.update(pptxBuffer);
        return hash.digest('hex').substring(0, 16);
    }
    /**
     * Create output folder structure
     */
    createOutputFolders(signature, sourcePath) {
        const baseFolder = path.join(this.options.outputDir, signature);
        // Create folder structure
        const folders = [
            baseFolder,
            path.join(baseFolder, 'source'),
            path.join(baseFolder, 'extracted'),
            path.join(baseFolder, 'assets'),
            path.join(baseFolder, 'output'),
            path.join(baseFolder, 'passthrough')
        ];
        for (const folder of folders) {
            if (!fs.existsSync(folder)) {
                fs.mkdirSync(folder, { recursive: true });
            }
        }
        // Copy source file
        const sourceFileName = path.basename(sourcePath);
        fs.copyFileSync(sourcePath, path.join(baseFolder, 'source', sourceFileName));
        // Create metadata file
        const metadata = {
            signature,
            sourceFile: sourceFileName,
            sourcePath: path.resolve(sourcePath),
            decypheredAt: new Date().toISOString(),
            version: '1.0.0'
        };
        fs.writeFileSync(path.join(baseFolder, 'metadata.json'), JSON.stringify(metadata, null, 2));
        return baseFolder;
    }
    /**
     * Create output folder structure for buffer-based input (no source file to copy)
     */
    createOutputFoldersForBuffer(signature, sourceName) {
        const baseFolder = path.join(this.options.outputDir, signature);
        const folders = [
            baseFolder,
            path.join(baseFolder, 'extracted'),
            path.join(baseFolder, 'assets'),
            path.join(baseFolder, 'output'),
            path.join(baseFolder, 'passthrough')
        ];
        for (const folder of folders) {
            if (!fs.existsSync(folder)) {
                fs.mkdirSync(folder, { recursive: true });
            }
        }
        // Create metadata file
        const metadata = {
            signature,
            sourceFile: sourceName,
            sourcePath: 'buffer',
            decypheredAt: new Date().toISOString(),
            version: '1.0.0'
        };
        fs.writeFileSync(path.join(baseFolder, 'metadata.json'), JSON.stringify(metadata, null, 2));
        return baseFolder;
    }
    /**
     * Calculate statistics from model
     */
    calculateStats(model) {
        let shapeCount = 0;
        let animationCount = 0;
        let passthroughCount = 0;
        for (const slide of model.slides) {
            for (const shape of slide.shapes) {
                shapeCount++;
                if (shape.type === '__passthrough__') {
                    passthroughCount++;
                }
            }
            for (const anim of slide.animations) {
                animationCount++;
                if (anim.type === '__passthrough__') {
                    passthroughCount++;
                }
            }
        }
        return {
            slideCount: model.slides.length,
            shapeCount,
            animationCount,
            mediaCount: model.media.length,
            passthroughCount
        };
    }
}
//# sourceMappingURL=PptxDecypher.js.map