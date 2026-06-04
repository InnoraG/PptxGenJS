/**
 *  :: pptxgen.ts ::
 *
 *  JavaScript framework that creates PowerPoint (pptx) presentations
 *  https://github.com/gitbrent/PptxGenJS
 *
 *  This framework is released under the MIT Public License (MIT)
 *
 *  PptxGenJS (C) 2015-present Brent Ely -- https://github.com/gitbrent
 *
 *  Some code derived from the OfficeGen project:
 *  github.com/Ziv-Barber/officegen/ (Copyright 2013 Ziv Barber)
 *
 *  Permission is hereby granted, free of charge, to any person obtaining a copy
 *  of this software and associated documentation files (the "Software"), to deal
 *  in the Software without restriction, including without limitation the rights
 *  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 *  copies of the Software, and to permit persons to whom the Software is
 *  furnished to do so, subject to the following conditions:
 *
 *  The above copyright notice and this permission notice shall be included in all
 *  copies or substantial portions of the Software.
 *
 *  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 *  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 *  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 *  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 *  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 *  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 *  SOFTWARE.
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
/**
 * Units of Measure used in PowerPoint documents
 *
 * PowerPoint units are in `DXA` (except for font sizing)
 * - 1 inch is 1440 DXA
 * - 1 inch is 72 points
 * -  1 DXA is 1/20th's of a point
 * - 20 DXA is 1 point
 *
 * Another form of measurement using is an `EMU`
 * - 914400 EMUs is 1 inch
 * -  12700 EMUs is 1 point
 *
 * @see https://startbigthinksmall.wordpress.com/2010/01/04/points-inches-and-emus-measuring-units-in-office-open-xml/
 */
/**
 * Object Layouts
 *
 * - 16x9 (10" x 5.625")
 * - 16x10 (10" x 6.25")
 * - 4x3 (10" x 7.5")
 * - Wide (13.33" x 7.5")
 * - [custom] (any size)
 *
 * @see https://docs.microsoft.com/en-us/office/open-xml/structure-of-a-presentationml-document
 * @see https://docs.microsoft.com/en-us/previous-versions/office/developer/office-2010/hh273476(v=office.14)
 */
import JSZip from 'jszip';
import Slide from './slide';
import { AlignH, AlignV, CHART_TYPE, ChartType, DEF_PRES_LAYOUT, DEF_PRES_LAYOUT_NAME, DEF_SLIDE_MARGIN_IN, EMU, OutputType, SCHEME_COLOR_NAMES, SHAPE_TYPE, SchemeColor, ShapeType, } from './core-enums';
import * as genCharts from './gen-charts';
import * as genObj from './gen-objects';
import * as genMedia from './gen-media';
import * as genTable from './gen-tables';
import * as genXml from './gen-xml';
import { applyModel3DAutoFit } from './gen-model3d-fit';
import { ValidationEngine, isRepairRiskIssue } from './validation-engine';
import { enableIterateEngine as _enableIterateEngine, disableIterateEngine as _disableIterateEngine } from './gen-animations-engine-iterate';
const VERSION = '4.0.1';
export default class PptxGenJS {
    set layout(value) {
        const newLayout = this.LAYOUTS[value];
        if (newLayout) {
            this._layout = value;
            this._presLayout = newLayout;
        }
        else {
            throw new Error('UNKNOWN-LAYOUT');
        }
    }
    get layout() {
        return this._layout;
    }
    get version() {
        return this._version;
    }
    set author(value) {
        this._author = value;
    }
    get author() {
        return this._author;
    }
    set company(value) {
        this._company = value;
    }
    get company() {
        return this._company;
    }
    set revision(value) {
        this._revision = value;
    }
    get revision() {
        return this._revision;
    }
    set subject(value) {
        this._subject = value;
    }
    get subject() {
        return this._subject;
    }
    set theme(value) {
        this._theme = value;
    }
    get theme() {
        return this._theme;
    }
    set title(value) {
        this._title = value;
    }
    get title() {
        return this._title;
    }
    set rtlMode(value) {
        this._rtlMode = value;
    }
    get rtlMode() {
        return this._rtlMode;
    }
    set showSettings(value) {
        this._showSettings = value;
    }
    get showSettings() {
        return this._showSettings;
    }
    get masterSlide() {
        return this._masterSlide;
    }
    get slides() {
        return this._slides;
    }
    get sections() {
        return this._sections;
    }
    get slideLayouts() {
        return this._slideLayouts;
    }
    get AlignH() {
        return this._alignH;
    }
    get AlignV() {
        return this._alignV;
    }
    get ChartType() {
        return this._chartType;
    }
    get OutputType() {
        return this._outputType;
    }
    get presLayout() {
        return this._presLayout;
    }
    get SchemeColor() {
        return this._schemeColor;
    }
    get ShapeType() {
        return this._shapeType;
    }
    get charts() {
        return this._charts;
    }
    get colors() {
        return this._colors;
    }
    get shapes() {
        return this._shapes;
    }
    // ============================================================================
    // Static Methods - Iterate Engine Control (PowerPoint-native animations)
    // ============================================================================
    /**
     * Enable PowerPoint-native iterate-based text animations
     *
     * When enabled, text animations (byParagraph/allAtOnce) use PowerPoint's
     * native <p:iterate> element instead of creating multiple separate animations.
     *
     * Benefits:
     * - Simpler XML structure (1 animation vs N animations)
     * - Smaller file sizes
     * - PowerPoint-native structure
     *
     * @static
     * @example
     * const pptx = require('pptxgenjs')
     * pptx.enableIterateEngine()
     * // Now all text animations will use iterate approach
     */
    static enableIterateEngine() {
        _enableIterateEngine();
    }
    /**
     * Disable PowerPoint-native iterate-based text animations (use legacy approach)
     *
     * When disabled (default), text animations use the legacy approach of creating
     * multiple separate animations (one per paragraph).
     *
     * @static
     * @example
     * const pptx = require('pptxgenjs')
     * pptx.disableIterateEngine()
     * // Now all text animations will use legacy approach
     */
    static disableIterateEngine() {
        _disableIterateEngine();
    }
    constructor() {
        /**
         * PptxGenJS Library Version
         */
        this._version = VERSION;
        // Exposed class props
        this._alignH = AlignH;
        this._alignV = AlignV;
        this._chartType = ChartType;
        this._outputType = OutputType;
        this._schemeColor = SchemeColor;
        this._shapeType = ShapeType;
        /**
         * @depricated use `ChartType`
         */
        this._charts = CHART_TYPE;
        /**
         * @depricated use `SchemeColor`
         */
        this._colors = SCHEME_COLOR_NAMES;
        /**
         * @depricated use `ShapeType`
         */
        this._shapes = SHAPE_TYPE;
        /**
         * Provides an API for `addTableDefinition` to create slides as needed for auto-paging
         * @param {AddSlideProps} options - slide masterName and/or sectionTitle
         * @return {PresSlide} new Slide
         */
        this.addNewSlide = (options) => {
            // Continue using sections if the first slide using auto-paging has a Section
            const sectAlreadyInUse = this.sections.length > 0 &&
                this.sections[this.sections.length - 1]._slides.filter(slide => slide._slideNum === this.slides[this.slides.length - 1]._slideNum).length > 0;
            options.sectionTitle = sectAlreadyInUse ? this.sections[this.sections.length - 1].title : null;
            return this.addSlide(options);
        };
        /**
         * Provides an API for `addTableDefinition` to get slide reference by number
         * @param {number} slideNum - slide number
         * @return {PresSlide} Slide
         * @since 3.0.0
         */
        this.getSlide = (slideNum) => this.slides.filter(slide => slide._slideNum === slideNum)[0];
        /**
         * Enables the `Slide` class to set PptxGenJS [Presentation] master/layout slidenumbers
         * @param {SlideNumberProps} slideNum - slide number config
         */
        this.setSlideNumber = (slideNum) => {
            // 1: Add slideNumber to slideMaster1.xml
            this.masterSlide._slideNumberProps = slideNum;
            // 2: Add slideNumber to DEF_PRES_LAYOUT_NAME layout
            this.slideLayouts.filter(layout => layout._name === DEF_PRES_LAYOUT_NAME)[0]._slideNumberProps = slideNum;
        };
        /**
         * Create all chart and media rels for this Presentation
         * @param {PresSlide | SlideLayout} slide - slide with rels
         * @param {JSZip} zip - JSZip instance
         * @param {Promise<string>[]} chartPromises - promise array
         */
        this.createChartMediaRels = (slide, zip, chartPromises) => {
            slide._relsChart.forEach(rel => chartPromises.push(genCharts.createExcelWorksheet(rel, zip)));
            slide._relsMedia.forEach(rel => {
                if (rel.type !== 'online' && rel.type !== 'hyperlink') {
                    // Cross-slide dedup: this media's binary is already written under a
                    // shared (canonical) Target by another slide's rel — skip re-writing.
                    if (rel._skipPackageWrite)
                        return;
                    // A: Loop vars
                    let data = rel.data && typeof rel.data === 'string' ? rel.data : '';
                    // B: Users will undoubtedly pass various string formats, so correct prefixes as needed
                    if (!data.includes(',') && !data.includes(';'))
                        data = 'image/png;base64,' + data;
                    else if (!data.includes(','))
                        data = 'image/png;base64,' + data;
                    else if (!data.includes(';'))
                        data = 'image/png;' + data;
                    // C: Add media
                    zip.file(rel.Target.replace('..', 'ppt'), data.split(',').pop(), { base64: true });
                }
            });
        };
        /**
         * Create and export the .pptx file
         * @param {string} exportName - output file type
         * @param {Blob} blobContent - Blob content
         * @return {Promise<string>} Promise with file name
         */
        this.writeFileToBrowser = (exportName, blobContent) => __awaiter(this, void 0, void 0, function* () {
            // STEP 1: Create element
            const eleLink = document.createElement('a');
            eleLink.setAttribute('style', 'display:none;');
            eleLink.dataset.interception = 'off'; // @see https://docs.microsoft.com/en-us/sharepoint/dev/spfx/hyperlinking
            document.body.appendChild(eleLink);
            // STEP 2: Download file to browser
            // DESIGN: Use `createObjectURL()` to D/L files in client browsers (FYI: synchronously executed)
            if (window.URL.createObjectURL) {
                const url = window.URL.createObjectURL(new Blob([blobContent], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }));
                eleLink.href = url;
                eleLink.download = exportName;
                eleLink.click();
                // Clean-up (NOTE: Add a slight delay before removing to avoid 'blob:null' error in Firefox Issue#81)
                setTimeout(() => {
                    window.URL.revokeObjectURL(url);
                    document.body.removeChild(eleLink);
                }, 100);
                // Done
                return yield Promise.resolve(exportName);
            }
        });
        /**
         * Create and export the .pptx file
         * @param {WRITE_OUTPUT_TYPE} outputType - output file type
         * @return {Promise<string | ArrayBuffer | Blob | Buffer | Uint8Array>} Promise with data or stream (node) or filename (browser)
         */
        this.exportPresentation = (props) => __awaiter(this, void 0, void 0, function* () {
            const arrChartPromises = [];
            let arrMediaPromises = [];
            const zip = new JSZip();
            const rawPackageParts = Array.isArray(this._rawPackageParts)
                ? this._rawPackageParts
                : [];
            const nativePackageParts = this.slides.flatMap(slide => slide._nativePackageParts || []);
            const packageParts = [...rawPackageParts, ...nativePackageParts];
            const rawSlideMasters = Array.isArray(this._rawSlideMasters)
                ? this._rawSlideMasters
                : [];
            const rawPresentationFonts = Array.isArray(this._rawPresentationFonts)
                ? this._rawPresentationFonts
                : [];
            const rawPresentationExtraRels = Array.isArray(this._rawPresentationExtraRels)
                ? this._rawPresentationExtraRels
                : [];
            const rawRootExtraRels = Array.isArray(this._rawRootExtraRels)
                ? this._rawRootExtraRels
                : [];
            const rawPresentationContentType = this._rawPresentationContentType;
            // STEP 1: Read/Encode all Media before zip as base64 content, etc. is required
            this.slides.forEach(slide => {
                arrMediaPromises = arrMediaPromises.concat(genMedia.encodeSlideMediaRels(slide));
            });
            this.slideLayouts.forEach(layout => {
                arrMediaPromises = arrMediaPromises.concat(genMedia.encodeSlideMediaRels(layout));
            });
            arrMediaPromises = arrMediaPromises.concat(genMedia.encodeSlideMediaRels(this.masterSlide));
            // STEP 2: Wait for Promises (if any) then generate the PPTX file
            return yield Promise.all(arrMediaPromises).then(() => __awaiter(this, void 0, void 0, function* () {
                // A0: Auto-fit 3D models. Media encoding has loaded each GLB into `_relsMedia[].data`
                // (base64); derive meterPerModelUnit/preTrans from geometry so PowerPoint frames any
                // model correctly. Runs before XML generation; skips models with explicit `trans`.
                applyModel3DAutoFit(this.slides);
                // A: Add empty placeholder objects to slides that don't already have them
                this.slides.forEach(slide => {
                    if (slide._slideLayout)
                        genObj.addPlaceholdersToSlideLayouts(slide);
                });
                // A2: Cross-slide media de-duplication.
                // `addMedia` only de-dupes a media file WITHIN a single slide, so the same
                // source video/audio/model3d asset referenced on N slides is otherwise
                // embedded N times. Collapse identical source files (keyed by type+path)
                // to ONE package part: later references re-point their `Target` to the
                // first one and skip the redundant binary write. Generic image rels are
                // left untouched; only model3d fallback posters opt into image dedupe.
                const mediaCanonicalTargetByPath = new Map();
                this.slides.forEach(slide => {
                    slide._relsMedia.forEach(rel => {
                        const relType = String(rel.type || '');
                        const isAvMedia = relType.startsWith('video/') || relType.startsWith('audio/');
                        const isModel3DMedia = rel.model3dAsset === 'glb' || rel.model3dAsset === 'poster';
                        if ((!isAvMedia && !isModel3DMedia) || !rel.path || rel.path.includes('preencoded'))
                            return;
                        const key = `${relType}|${rel.path}`;
                        const canonical = mediaCanonicalTargetByPath.get(key);
                        if (canonical) {
                            if (rel.Target !== canonical) {
                                rel.Target = canonical;
                                rel._skipPackageWrite = true;
                            }
                        }
                        else {
                            mediaCanonicalTargetByPath.set(key, rel.Target);
                        }
                    });
                });
                // B: Add all required folders and files
                zip.folder('_rels');
                zip.folder('docProps');
                zip.folder('ppt').folder('_rels');
                zip.folder('ppt/charts').folder('_rels');
                zip.folder('ppt/embeddings');
                zip.folder('ppt/media');
                zip.folder('ppt/slideLayouts').folder('_rels');
                zip.folder('ppt/slideMasters').folder('_rels');
                zip.folder('ppt/slides').folder('_rels');
                zip.folder('ppt/theme');
                zip.folder('ppt/notesMasters').folder('_rels');
                zip.folder('ppt/notesSlides').folder('_rels');
                zip.file('[Content_Types].xml', genXml.makeXmlContTypes(this.slides, this.slideLayouts, this.masterSlide, packageParts, rawPresentationContentType)); // TODO: pass only `this` like below! 20200206
                zip.file('_rels/.rels', genXml.makeXmlRootRels(rawRootExtraRels));
                zip.file('docProps/app.xml', genXml.makeXmlApp(this.slides, this.company)); // TODO: pass only `this` like below! 20200206
                zip.file('docProps/core.xml', genXml.makeXmlCore(this.title, this.subject, this.author, this.revision)); // TODO: pass only `this` like below! 20200206
                zip.file('ppt/_rels/presentation.xml.rels', genXml.makeXmlPresentationRels(this.slides, rawSlideMasters, rawPresentationFonts, rawPresentationExtraRels));
                zip.file('ppt/theme/theme1.xml', genXml.makeXmlTheme(this));
                zip.file('ppt/presentation.xml', genXml.makeXmlPresentation(this));
                zip.file('ppt/presProps.xml', genXml.makeXmlPresProps(this));
                zip.file('ppt/tableStyles.xml', genXml.makeXmlTableStyles());
                zip.file('ppt/viewProps.xml', genXml.makeXmlViewProps());
                // C: Create a Layout/Master/Rel/Slide file for each SlideLayout and Slide
                this.slideLayouts.forEach((layout, idx) => {
                    zip.file(`ppt/slideLayouts/slideLayout${idx + 1}.xml`, genXml.makeXmlLayout(layout));
                    zip.file(`ppt/slideLayouts/_rels/slideLayout${idx + 1}.xml.rels`, genXml.makeXmlSlideLayoutRel(idx + 1, this.slideLayouts));
                });
                this.slides.forEach((slide, idx) => {
                    zip.file(`ppt/slides/slide${idx + 1}.xml`, genXml.makeXmlSlide(slide));
                    zip.file(`ppt/slides/_rels/slide${idx + 1}.xml.rels`, genXml.makeXmlSlideRel(this.slides, this.slideLayouts, idx + 1));
                    // Create all slide notes related items. Notes of empty strings are created for slides which do not have notes specified, to keep track of _rels.
                    zip.file(`ppt/notesSlides/notesSlide${idx + 1}.xml`, genXml.makeXmlNotesSlide(slide));
                    zip.file(`ppt/notesSlides/_rels/notesSlide${idx + 1}.xml.rels`, genXml.makeXmlNotesSlideRel(idx + 1));
                });
                zip.file('ppt/slideMasters/slideMaster1.xml', genXml.makeXmlMaster(this.masterSlide, this.slideLayouts));
                zip.file('ppt/slideMasters/_rels/slideMaster1.xml.rels', genXml.makeXmlMasterRel(this.masterSlide, this.slideLayouts));
                zip.file('ppt/notesMasters/notesMaster1.xml', genXml.makeXmlNotesMaster());
                zip.file('ppt/notesMasters/_rels/notesMaster1.xml.rels', genXml.makeXmlNotesMasterRel());
                packageParts.forEach(part => {
                    let zipPath = part.path || '';
                    while (zipPath.startsWith('/'))
                        zipPath = zipPath.substring(1);
                    if (!zipPath || zipPath === '[Content_Types].xml' || zipPath.startsWith('ppt/slides/'))
                        return;
                    zip.file(zipPath, part.data || '', part.encoding === 'base64' ? { base64: true } : undefined);
                });
                // D: Create all Rels (images, media, chart data)
                this.slideLayouts.forEach(layout => {
                    this.createChartMediaRels(layout, zip, arrChartPromises);
                });
                this.slides.forEach(slide => {
                    this.createChartMediaRels(slide, zip, arrChartPromises);
                });
                this.createChartMediaRels(this.masterSlide, zip, arrChartPromises);
                // E: Wait for Promises (if any) then generate the PPTX file
                return yield Promise.all(arrChartPromises).then(() => __awaiter(this, void 0, void 0, function* () {
                    if (props.outputType === 'STREAM') {
                        // A: stream file
                        return yield zip.generateAsync({ type: 'nodebuffer', compression: props.compression ? 'DEFLATE' : 'STORE' });
                    }
                    else if (props.outputType) {
                        // B: Node [fs]: Output type user option or default
                        return yield zip.generateAsync({ type: props.outputType, compression: props.compression ? 'DEFLATE' : 'STORE' });
                    }
                    else {
                        // C: Browser: Output blob as app/ms-pptx
                        return yield zip.generateAsync({ type: 'blob', compression: props.compression ? 'DEFLATE' : 'STORE' });
                    }
                }));
            }));
        });
        const layout4x3 = { name: 'screen4x3', width: 9144000, height: 6858000 };
        const layout16x9 = { name: 'screen16x9', width: 9144000, height: 5143500 };
        const layout16x10 = { name: 'screen16x10', width: 9144000, height: 5715000 };
        const layoutWide = { name: 'custom', width: 12192000, height: 6858000 };
        // Set available layouts
        this.LAYOUTS = {
            LAYOUT_4x3: layout4x3,
            LAYOUT_16x9: layout16x9,
            LAYOUT_16x10: layout16x10,
            LAYOUT_WIDE: layoutWide,
        };
        // Core
        this._author = 'claudepptxmcp';
        this._company = 'claudepptxmcp';
        this._revision = '1'; // Note: Must be a whole number
        this._subject = 'claudepptxmcp Presentation';
        this._title = 'claudepptxmcp Presentation';
        // PptxGenJS props
        this._presLayout = {
            name: this.LAYOUTS[DEF_PRES_LAYOUT].name,
            _sizeW: this.LAYOUTS[DEF_PRES_LAYOUT].width,
            _sizeH: this.LAYOUTS[DEF_PRES_LAYOUT].height,
            width: this.LAYOUTS[DEF_PRES_LAYOUT].width,
            height: this.LAYOUTS[DEF_PRES_LAYOUT].height,
        };
        this._rtlMode = false;
        //
        this._slideLayouts = [
            {
                _margin: DEF_SLIDE_MARGIN_IN,
                _name: DEF_PRES_LAYOUT_NAME,
                _presLayout: this._presLayout,
                _rels: [],
                _relsChart: [],
                _relsMedia: [],
                _slide: null,
                _slideNum: 1000,
                _slideNumberProps: null,
                _slideObjects: [],
            },
        ];
        this._slides = [];
        this._sections = [];
        this._masterSlide = {
            addChart: null,
            addEquation: null,
            addImage: null,
            addMedia: null,
            addModel3D: null,
            addNotes: null,
            addShape: null,
            addSmartArt: null,
            addTable: null,
            addText: null,
            addPassthroughXml: null,
            //
            _name: null,
            _presLayout: this._presLayout,
            _rId: null,
            _rels: [],
            _relsChart: [],
            _relsMedia: [],
            _slideId: null,
            _slideLayout: null,
            _slideNum: null,
            _slideNumberProps: null,
            _slideObjects: [],
        };
    }
    // EXPORT METHODS
    /**
     * Export the current Presentation to stream
     * @param {WriteBaseProps} props - output properties
     * @returns {Promise<string | ArrayBuffer | Blob | Buffer | Uint8Array>} file stream
     */
    stream(props) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.exportPresentation({
                compression: props === null || props === void 0 ? void 0 : props.compression,
                outputType: 'STREAM',
            });
        });
    }
    /**
     * Export the current Presentation as JSZip content with the selected type
     * @param {WriteProps} props output properties
     * @returns {Promise<string | ArrayBuffer | Blob | Buffer | Uint8Array>} file content in selected type
     */
    write(props) {
        return __awaiter(this, void 0, void 0, function* () {
            // VALIDATION: Automatically validate and auto-correct off-slide elements (unless disabled)
            const noAutoCorrect = typeof props === 'object' && (props === null || props === void 0 ? void 0 : props.noOffSlideAutoCorrect) === true;
            this.validateBeforeExport(noAutoCorrect);
            // DEPRECATED: @deprecated v3.5.0 - outputType - [[remove in v4.0.0]]
            const propsOutpType = typeof props === 'object' && (props === null || props === void 0 ? void 0 : props.outputType) ? props.outputType : props ? props : null;
            const propsCompress = typeof props === 'object' && typeof (props === null || props === void 0 ? void 0 : props.compression) === 'boolean' ? props.compression : true;
            return yield this.exportPresentation({
                compression: propsCompress,
                outputType: propsOutpType,
            });
        });
    }
    /**
     * Export the current Presentation.
     * Write the generated presentation to disk (Node) or trigger a download (browser).
     * @param {WriteFileProps} props - output file properties
     * @returns {Promise<string>} the presentation name
     */
    writeFile(props) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            // VALIDATION: Automatically validate and auto-correct off-slide elements (unless disabled)
            const noAutoCorrect = typeof props === 'object' && (props === null || props === void 0 ? void 0 : props.noOffSlideAutoCorrect) === true;
            this.validateBeforeExport(noAutoCorrect);
            // STEP 1: Figure out where we are running
            const isNode = typeof process !== 'undefined' && !!((_a = process.versions) === null || _a === void 0 ? void 0 : _a.node) && ((_b = process.release) === null || _b === void 0 ? void 0 : _b.name) === 'node';
            // STEP 2: Normalise the user arguments
            if (typeof props === 'string') {
                // DEPRECATED: @deprecated v3.5.0 - fileName - [[remove in v4.0.0]]
                console.warn('[WARNING] writeFile(string) is deprecated - pass { fileName } instead.');
                props = { fileName: props };
            }
            const { fileName: rawName = 'Presentation.pptx', compression = true } = props;
            const lowerName = rawName.toLowerCase();
            const fileName = lowerName.endsWith('.pptx') || lowerName.endsWith('.pptm') ? rawName : `${rawName}.pptx`;
            // STEP 3: Get the binary/Blob from exportPresentation()
            const outputType = isNode ? 'nodebuffer' : null;
            const data = yield this.exportPresentation({ compression, outputType });
            // STEP 4: Write the file out
            if (isNode) {
                // Dynamically import to avoid bundling fs in the browser build
                const { promises: fs } = yield import('node:fs');
                const { writeFile } = fs;
                yield writeFile(fileName, data);
                return fileName;
            }
            // Browser branch - push a download
            yield this.writeFileToBrowser(fileName, data);
            return fileName;
        });
    }
    // VALIDATION METHODS
    /**
     * Validate the presentation for common issues
     * @param {ValidationOptions} options - validation options
     * @returns {ValidationResult} validation result with issues
     * @since v4.0.0
     * @example
     * // Basic validation
     * const result = pptx.validate();
     * if (!result.valid) {
     *   console.log('Issues found:', result.issues);
     * }
     *
     * // Strict validation with auto-fix
     * const result = pptx.validate({ mode: 'strict', autoFix: true });
     */
    validate(options) {
        const engine = new ValidationEngine(this._presLayout, this._slides, options === null || options === void 0 ? void 0 : options.mode);
        return engine.validate(options);
    }
    /**
     * Check if the presentation is valid (no errors)
     * @param {ValidationOptions} options - validation options
     * @returns {boolean} true if presentation has no validation errors
     * @since v4.0.0
     */
    isValid(options) {
        return this.validate(options).valid;
    }
    /**
     * Validate and auto-correct off-slide elements before export.
     * Called automatically by write() and writeFile().
     *
     * By default, applies a global scale ratio to fit all elements within slide boundaries.
     * If noOffSlideAutoCorrect is true, throws an error instead.
     *
     * @param noAutoCorrect - If true, throw error instead of auto-correcting
     * @private
     */
    validateBeforeExport(noAutoCorrect = false) {
        const slideWidth = this._presLayout.width / 914400; // EMU to inches
        const slideHeight = this._presLayout.height / 914400;
        const offSlideTolerance = 1000 / 914400; // Ignore sub-pixel EMU drift from imported decks.
        // Find all off-slide issues that extend beyond right or bottom
        const offSlideCodes = ['ELEMENT_OFF_SLIDE_RIGHT', 'ELEMENT_OFF_SLIDE_BOTTOM', 'ELEMENT_PARTIALLY_OFF_SLIDE'];
        const result = this.validate({ mode: 'normal' });
        const repairRiskIssues = result.issues.filter(isRepairRiskIssue);
        if (repairRiskIssues.length > 0) {
            const errorMessages = repairRiskIssues.slice(0, 25).map((err) => {
                var _a;
                const location = err.slideNumber ? `Slide ${err.slideNumber}` : 'Presentation';
                const element = err.shapeName ? ` (${err.shapeName})` : '';
                const path = typeof ((_a = err.context) === null || _a === void 0 ? void 0 : _a.path) === 'string' ? ` [${err.context.path}]` : '';
                return `${location}${element}: ${err.message}${path}`;
            });
            const moreCount = repairRiskIssues.length > 25 ? `\n...and ${repairRiskIssues.length - 25} more repair-risk issue(s).` : '';
            throw new Error(`PptxGenJS: Repair-risk validation failed with ${repairRiskIssues.length} issue(s):\n` +
                errorMessages.join('\n') +
                moreCount +
                '\n\nFix these object-model values before exporting; the serializer will not emit a PPTX with known repair-risk inputs.' +
                '\nUse pptx.validate({ checks: [\'repair\'] }) for the detailed repair-risk report.');
        }
        const offSlideIssues = result.issues.filter((issue) => {
            if (!offSlideCodes.includes(issue.code))
                return false;
            // Skip zero-size elements
            const context = issue.context;
            if ((context === null || context === void 0 ? void 0 : context.bounds) && context.bounds.w === 0 && context.bounds.h === 0)
                return false;
            if ((context === null || context === void 0 ? void 0 : context.bounds) && context.bounds.right <= slideWidth + offSlideTolerance && context.bounds.bottom <= slideHeight + offSlideTolerance)
                return false;
            // For partial off-slide, only flag if extending beyond right or bottom
            if (issue.code === 'ELEMENT_PARTIALLY_OFF_SLIDE' && (context === null || context === void 0 ? void 0 : context.bounds)) {
                const { right, bottom } = context.bounds;
                return right > slideWidth + offSlideTolerance || bottom > slideHeight + offSlideTolerance;
            }
            return true;
        });
        if (offSlideIssues.length === 0)
            return;
        // If auto-correct is disabled, throw error
        if (noAutoCorrect) {
            const errorMessages = offSlideIssues.map((err) => {
                const location = err.slideNumber ? `Slide ${err.slideNumber}` : 'Presentation';
                const element = err.shapeName ? ` (${err.shapeName})` : '';
                const context = err.context;
                let posInfo = '';
                if (context === null || context === void 0 ? void 0 : context.bounds) {
                    const b = context.bounds;
                    posInfo = ` [x:${b.x.toFixed(2)}, y:${b.y.toFixed(2)}, w:${b.w.toFixed(2)}, h:${b.h.toFixed(2)} → ends at (${b.right.toFixed(2)}, ${b.bottom.toFixed(2)})]`;
                }
                return `${location}${element}: ${err.message}${posInfo}`;
            });
            throw new Error(`PptxGenJS: Validation failed with ${offSlideIssues.length} off-slide element(s):\n` +
                errorMessages.join('\n') +
                `\n\nSlide boundaries: ${slideWidth.toFixed(3)}" x ${slideHeight.toFixed(3)}".` +
                '\nFix element positions so (x + w) ≤ slide width and (y + h) ≤ slide height.' +
                '\nOr remove noOffSlideAutoCorrect option to auto-correct.' +
                '\nUse pptx.validate() for detailed report.');
        }
        // AUTO-CORRECT: Calculate global scale ratio to fit all elements
        let maxRightOverflow = 1; // ratio: how much beyond right edge (1 = no overflow)
        let maxBottomOverflow = 1; // ratio: how much beyond bottom edge
        // Group issues by slide to calculate per-slide correction
        const slideCorrections = new Map();
        for (const issue of offSlideIssues) {
            const context = issue.context;
            if (!(context === null || context === void 0 ? void 0 : context.bounds) || !issue.slideNumber)
                continue;
            const { right, bottom } = context.bounds;
            if (right > slideWidth) {
                maxRightOverflow = Math.max(maxRightOverflow, right / slideWidth);
            }
            if (bottom > slideHeight) {
                maxBottomOverflow = Math.max(maxBottomOverflow, bottom / slideHeight);
            }
            // Track per-slide
            if (!slideCorrections.has(issue.slideNumber)) {
                slideCorrections.set(issue.slideNumber, { scaleX: 1, scaleY: 1, issues: [] });
            }
            const slideData = slideCorrections.get(issue.slideNumber);
            slideData.issues.push(issue);
            slideData.scaleX = Math.max(slideData.scaleX, right / slideWidth);
            slideData.scaleY = Math.max(slideData.scaleY, bottom / slideHeight);
        }
        // Apply corrections per slide
        const correctionLog = [];
        for (const [slideNum, correction] of slideCorrections) {
            const slide = this._slides[slideNum - 1];
            if (!(slide === null || slide === void 0 ? void 0 : slide._slideObjects))
                continue;
            // Calculate uniform scale to maintain aspect ratio
            const scale = 1 / Math.max(correction.scaleX, correction.scaleY);
            if (scale >= 1)
                continue; // No correction needed
            // Apply scale to ALL elements on this slide to maintain relative positioning
            for (const obj of slide._slideObjects) {
                if (!obj.options)
                    continue;
                const opts = obj.options;
                // Handle values that might be in EMUs (> 20) vs inches
                const isEmuX = typeof opts.x === 'number' && opts.x > 20;
                const isEmuY = typeof opts.y === 'number' && opts.y > 20;
                const isEmuW = typeof opts.w === 'number' && opts.w > 20;
                const isEmuH = typeof opts.h === 'number' && opts.h > 20;
                if (typeof opts.x === 'number') {
                    opts.x = isEmuX ? opts.x * scale : opts.x * scale;
                }
                if (typeof opts.y === 'number') {
                    opts.y = isEmuY ? opts.y * scale : opts.y * scale;
                }
                if (typeof opts.w === 'number') {
                    opts.w = isEmuW ? opts.w * scale : opts.w * scale;
                }
                if (typeof opts.h === 'number') {
                    opts.h = isEmuH ? opts.h * scale : opts.h * scale;
                }
            }
            const elementNames = correction.issues
                .map((i) => i.shapeName || `Shape ${i.shapeIndex}`)
                .slice(0, 3)
                .join(', ');
            const moreCount = correction.issues.length > 3 ? ` and ${correction.issues.length - 3} more` : '';
            correctionLog.push(`Slide ${slideNum}: Scaled by ${(scale * 100).toFixed(1)}% to fit ${correction.issues.length} element(s) (${elementNames}${moreCount})`);
        }
        // Log informational message about corrections
        if (correctionLog.length > 0) {
            console.info(`[PptxGenJS] Off-slide auto-correction applied:\n` +
                correctionLog.map((msg) => `  • ${msg}`).join('\n') +
                `\n  Slide boundaries: ${slideWidth.toFixed(3)}" x ${slideHeight.toFixed(3)}"` +
                `\n  To disable auto-correction, use: writeFile({ noOffSlideAutoCorrect: true })`);
        }
    }
    // PRESENTATION METHODS
    /**
     * Add a new Section to Presentation
     * @param {ISectionProps} section - section properties
     * @example pptx.addSection({ title:'Charts' });
     */
    addSection(section) {
        if (!section)
            console.warn('addSection requires an argument');
        else if (!section.title)
            console.warn('addSection requires a title');
        const newSection = {
            _type: 'user',
            _slides: [],
            title: section.title,
        };
        if (section.order)
            this.sections.splice(section.order, 0, newSection);
        else
            this._sections.push(newSection);
    }
    /**
     * Add a new Slide to Presentation
     * @param {AddSlideProps} options - slide options
     * @returns {PresSlide} the new Slide
     */
    addSlide(options) {
        // TODO: DEPRECATED: arg0 string "masterSlideName" dep as of 3.2.0
        const masterSlideName = typeof options === 'string' ? options : (options === null || options === void 0 ? void 0 : options.masterName) ? options.masterName : '';
        let slideLayout = {
            _name: this.LAYOUTS[DEF_PRES_LAYOUT].name,
            _presLayout: this.presLayout,
            _rels: [],
            _relsChart: [],
            _relsMedia: [],
            _slideNum: this.slides.length + 1,
        };
        if (masterSlideName) {
            const tmpLayout = this.slideLayouts.filter(layout => layout._name === masterSlideName)[0];
            if (tmpLayout)
                slideLayout = tmpLayout;
        }
        const newSlide = new Slide({
            addSlide: this.addNewSlide,
            getSlide: this.getSlide,
            presLayout: this.presLayout,
            setSlideNum: this.setSlideNumber,
            slideId: this.slides.length + 256,
            slideRId: this.slides.length + 2,
            slideNumber: this.slides.length + 1,
            slideLayout,
        });
        // A: Add slide to pres
        this._slides.push(newSlide);
        // B: Sections
        // B-1: Add slide to section (if any provided)
        // B-2: Handle slides without a section when sections are already is use ("loose" slides arent allowed, they all need a section)
        if (options === null || options === void 0 ? void 0 : options.sectionTitle) {
            const sect = this.sections.filter(section => section.title === options.sectionTitle)[0];
            if (!sect)
                console.warn(`addSlide: unable to find section with title: "${options.sectionTitle}"`);
            else
                sect._slides.push(newSlide);
        }
        else if (this.sections && this.sections.length > 0 && (!(options === null || options === void 0 ? void 0 : options.sectionTitle))) {
            const lastSect = this._sections[this.sections.length - 1];
            // CASE 1: The latest section is a default type - just add this one
            if (lastSect._type === 'default')
                lastSect._slides.push(newSlide);
            // CASE 2: There latest section is NOT a default type - create the defualt, add this slide
            else {
                this._sections.push({
                    title: `Default-${this.sections.filter(sect => sect._type === 'default').length + 1}`,
                    _type: 'default',
                    _slides: [newSlide],
                });
            }
        }
        return newSlide;
    }
    /**
     * Create a custom Slide Layout in any size
     * @param {PresLayout} layout - layout properties
     * @example pptx.defineLayout({ name:'A3', width:16.5, height:11.7 });
     */
    defineLayout(layout) {
        // @see https://support.office.com/en-us/article/Change-the-size-of-your-slides-040a811c-be43-40b9-8d04-0de5ed79987e
        if (!layout)
            console.warn('defineLayout requires `{name, width, height}`');
        else if (!layout.name)
            console.warn('defineLayout requires `name`');
        else if (!layout.width)
            console.warn('defineLayout requires `width`');
        else if (!layout.height)
            console.warn('defineLayout requires `height`');
        else if (typeof layout.height !== 'number')
            console.warn('defineLayout `height` should be a number (inches)');
        else if (typeof layout.width !== 'number')
            console.warn('defineLayout `width` should be a number (inches)');
        this.LAYOUTS[layout.name] = {
            name: layout.name,
            _sizeW: Math.round(Number(layout.width) * EMU),
            _sizeH: Math.round(Number(layout.height) * EMU),
            width: Math.round(Number(layout.width) * EMU),
            height: Math.round(Number(layout.height) * EMU),
        };
    }
    /**
     * Create a new slide master [layout] for the Presentation
     * @param {SlideMasterProps} props - layout properties
     */
    defineSlideMaster(props) {
        // (ISSUE#406;PULL#1176) deep clone the props object to avoid mutating the original object
        const propsClone = JSON.parse(JSON.stringify(props));
        if (!propsClone.title)
            throw new Error('defineSlideMaster() object argument requires a `title` value. (https://gitbrent.github.io/PptxGenJS/docs/masters.html)');
        const newLayout = {
            _margin: propsClone.margin || DEF_SLIDE_MARGIN_IN,
            _name: propsClone.title,
            _presLayout: this.presLayout,
            _rels: [],
            _relsChart: [],
            _relsMedia: [],
            _slide: null,
            _slideNum: 1000 + this.slideLayouts.length + 1,
            _slideNumberProps: propsClone.slideNumber || null,
            _slideObjects: [],
            background: propsClone.background || null,
            bkgd: propsClone.bkgd || null,
        };
        // STEP 1: Create the Slide Master/Layout
        genObj.createSlideMaster(propsClone, newLayout);
        // STEP 2: Add it to layout defs
        this.slideLayouts.push(newLayout);
        // STEP 3: Add background (image data/path must be captured before `exportPresentation()` is called)
        if (propsClone.background || propsClone.bkgd)
            genObj.addBackgroundDefinition(propsClone.background, newLayout);
        // STEP 4: Add slideNumber to master slide (if any)
        if (newLayout._slideNumberProps && !this.masterSlide._slideNumberProps)
            this.masterSlide._slideNumberProps = newLayout._slideNumberProps;
    }
    // HTML-TO-SLIDES METHODS
    /**
     * Reproduces an HTML table as a PowerPoint table - including column widths, style, etc. - creates 1 or more slides as needed
     * @param {string} eleId - table HTML element ID
     * @param {TableToSlidesProps} options - generation options
     */
    tableToSlides(eleId, options = {}) {
        // @note `verbose` option is undocumented; used for verbose output of layout process
        genTable.genTableToSlides(this, eleId, options, (options === null || options === void 0 ? void 0 : options.masterSlideName) ? this.slideLayouts.filter(layout => layout._name === options.masterSlideName)[0] : null);
    }
}
//# sourceMappingURL=pptxgen.js.map