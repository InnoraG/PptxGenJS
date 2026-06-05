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

import JSZip from 'jszip'
import Slide from './slide'
import {
	AlignH,
	AlignV,
	CHART_TYPE,
	ChartType,
	DEF_PRES_LAYOUT,
	DEF_PRES_LAYOUT_NAME,
	DEF_SLIDE_MARGIN_IN,
	EMU,
	OutputType,
	SCHEME_COLOR_NAMES,
	SHAPE_TYPE,
	SchemeColor,
	ShapeType,
	WRITE_OUTPUT_TYPE,
} from './core-enums'
import {
	AddSlideProps,
	IPresentationProps,
	NativePackagePart,
	PresentationShowSettings,
	PresLayout,
	PresSlide,
	SectionProps,
	SlideLayout,
	SlideMasterProps,
	SlideNumberProps,
	TableToSlidesProps,
	ThemeProps,
	WriteBaseProps,
	WriteFileProps,
	WriteProps,
} from './core-interfaces'
import * as genCharts from './gen-charts'
import * as genObj from './gen-objects'
import * as genMedia from './gen-media'
import * as genTable from './gen-tables'
import * as genXml from './gen-xml'
import { applyModel3DAutoFit } from './gen-model3d-fit'
import { ValidationEngine, ValidationOptions, ValidationResult, isRepairRiskIssue } from './validation-engine'
import { enableIterateEngine as _enableIterateEngine, disableIterateEngine as _disableIterateEngine } from './gen-animations-engine-iterate'

const VERSION = '4.0.1'

export default class PptxGenJS implements IPresentationProps {
	// Property getters/setters

	/**
	 * Presentation layout name
	 * Standard layouts:
	 * - 'LAYOUT_4x3'   (10"    x 7.5")
	 * - 'LAYOUT_16x9'  (10"    x 5.625")
	 * - 'LAYOUT_16x10' (10"    x 6.25")
	 * - 'LAYOUT_WIDE'  (13.33" x 7.5")
	 * Custom layouts:
	 * Use `pptx.defineLayout()` to create custom layouts (e.g.: 'A4')
	 * @type {string}
	 * @see https://support.office.com/en-us/article/Change-the-size-of-your-slides-040a811c-be43-40b9-8d04-0de5ed79987e
	 */
	private _layout: string
	public set layout(value: string) {
		const newLayout: PresLayout = this.LAYOUTS[value]

		if (newLayout) {
			this._layout = value
			this._presLayout = newLayout
		} else {
			throw new Error('UNKNOWN-LAYOUT')
		}
	}

	public get layout(): string {
		return this._layout
	}

	/**
	 * PptxGenJS Library Version
	 */
	private readonly _version: string = VERSION
	public get version(): string {
		return this._version
	}

	/**
	 * @type {string}
	 */
	private _author: string
	public set author(value: string) {
		this._author = value
	}

	public get author(): string {
		return this._author
	}

	/**
	 * @type {string}
	 */
	private _company: string
	public set company(value: string) {
		this._company = value
	}

	public get company(): string {
		return this._company
	}

	/**
	 * @type {string}
	 * @note the `revision` value must be a whole number only (without "." or "," - otherwise, PPT will throw errors upon opening!)
	 */
	private _revision: string
	public set revision(value: string) {
		this._revision = value
	}

	public get revision(): string {
		return this._revision
	}

	/**
	 * @type {string}
	 */
	private _subject: string
	public set subject(value: string) {
		this._subject = value
	}

	public get subject(): string {
		return this._subject
	}

	/**
	 * @type {ThemeProps}
	 */
	private _theme: ThemeProps
	public set theme(value: ThemeProps) {
		this._theme = value
	}

	public get theme(): ThemeProps {
		return this._theme
	}

	/**
	 * @type {string}
	 */
	private _title: string
	public set title(value: string) {
		this._title = value
	}

	public get title(): string {
		return this._title
	}

	/**
	 * Whether Right-to-Left (RTL) mode is enabled
	 * @type {boolean}
	 */
	private _rtlMode: boolean
	public set rtlMode(value: boolean) {
		this._rtlMode = value
	}

	public get rtlMode(): boolean {
		return this._rtlMode
	}

	/**
	 * Slideshow behavior.
	 */
	private _showSettings?: PresentationShowSettings
	public set showSettings(value: PresentationShowSettings | undefined) {
		this._showSettings = value
	}

	public get showSettings(): PresentationShowSettings | undefined {
		return this._showSettings
	}

	/** master slide layout object */
	private readonly _masterSlide: PresSlide
	public get masterSlide(): PresSlide {
		return this._masterSlide
	}

	/** this Presentation's Slide objects */
	private readonly _slides: PresSlide[]
	public get slides(): PresSlide[] {
		return this._slides
	}

	/** this Presentation's sections */
	private readonly _sections: SectionProps[]
	public get sections(): SectionProps[] {
		return this._sections
	}

	/** slide layout definition objects, used for generating slide layout files */
	private readonly _slideLayouts: SlideLayout[]
	public get slideLayouts(): SlideLayout[] {
		return this._slideLayouts
	}

	private LAYOUTS: { [key: string]: PresLayout }

	// Exposed class props
	private readonly _alignH = AlignH
	public get AlignH(): typeof AlignH {
		return this._alignH
	}

	private readonly _alignV = AlignV
	public get AlignV(): typeof AlignV {
		return this._alignV
	}

	private readonly _chartType = ChartType
	public get ChartType(): typeof ChartType {
		return this._chartType
	}

	private readonly _outputType = OutputType
	public get OutputType(): typeof OutputType {
		return this._outputType
	}

	private _presLayout: PresLayout
	public get presLayout(): PresLayout {
		return this._presLayout
	}

	private readonly _schemeColor = SchemeColor
	public get SchemeColor(): typeof SchemeColor {
		return this._schemeColor
	}

	private readonly _shapeType = ShapeType
	public get ShapeType(): typeof ShapeType {
		return this._shapeType
	}

	/**
	 * @depricated use `ChartType`
	 */
	private readonly _charts = CHART_TYPE
	public get charts(): typeof CHART_TYPE {
		return this._charts
	}

	/**
	 * @depricated use `SchemeColor`
	 */
	private readonly _colors = SCHEME_COLOR_NAMES
	public get colors(): typeof SCHEME_COLOR_NAMES {
		return this._colors
	}

	/**
	 * @depricated use `ShapeType`
	 */
	private readonly _shapes = SHAPE_TYPE
	public get shapes(): typeof SHAPE_TYPE {
		return this._shapes
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
	static enableIterateEngine(): void {
		_enableIterateEngine()
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
	static disableIterateEngine(): void {
		_disableIterateEngine()
	}

	constructor() {
		const layout4x3: PresLayout = { name: 'screen4x3', width: 9144000, height: 6858000 }
		const layout16x9: PresLayout = { name: 'screen16x9', width: 9144000, height: 5143500 }
		const layout16x10: PresLayout = { name: 'screen16x10', width: 9144000, height: 5715000 }
		const layoutWide: PresLayout = { name: 'custom', width: 12192000, height: 6858000 }
		// Set available layouts
		this.LAYOUTS = {
			LAYOUT_4x3: layout4x3,
			LAYOUT_16x9: layout16x9,
			LAYOUT_16x10: layout16x10,
			LAYOUT_WIDE: layoutWide,
		}

		// Core
		this._author = 'betterpptx-mcp'
		this._company = 'betterpptx-mcp'
		this._revision = '1' // Note: Must be a whole number
		this._subject = 'betterpptx-mcp Presentation'
		this._title = 'betterpptx-mcp Presentation'
		// PptxGenJS props
		this._presLayout = {
			name: this.LAYOUTS[DEF_PRES_LAYOUT].name,
			_sizeW: this.LAYOUTS[DEF_PRES_LAYOUT].width,
			_sizeH: this.LAYOUTS[DEF_PRES_LAYOUT].height,
			width: this.LAYOUTS[DEF_PRES_LAYOUT].width,
			height: this.LAYOUTS[DEF_PRES_LAYOUT].height,
		}
		this._rtlMode = false
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
		]
		this._slides = []
		this._sections = []
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
		}
	}

	/**
	 * Provides an API for `addTableDefinition` to create slides as needed for auto-paging
	 * @param {AddSlideProps} options - slide masterName and/or sectionTitle
	 * @return {PresSlide} new Slide
	 */
	private readonly addNewSlide = (options?: AddSlideProps): PresSlide => {
		// Continue using sections if the first slide using auto-paging has a Section
		const sectAlreadyInUse =
			this.sections.length > 0 &&
			this.sections[this.sections.length - 1]._slides.filter(slide => slide._slideNum === this.slides[this.slides.length - 1]._slideNum).length > 0

		options.sectionTitle = sectAlreadyInUse ? this.sections[this.sections.length - 1].title : null

		return this.addSlide(options)
	}

	/**
	 * Provides an API for `addTableDefinition` to get slide reference by number
	 * @param {number} slideNum - slide number
	 * @return {PresSlide} Slide
	 * @since 3.0.0
	 */
	private readonly getSlide = (slideNum: number): PresSlide => this.slides.filter(slide => slide._slideNum === slideNum)[0]

	/**
	 * Enables the `Slide` class to set PptxGenJS [Presentation] master/layout slidenumbers
	 * @param {SlideNumberProps} slideNum - slide number config
	 */
	private readonly setSlideNumber = (slideNum: SlideNumberProps): void => {
		// 1: Add slideNumber to slideMaster1.xml
		this.masterSlide._slideNumberProps = slideNum

		// 2: Add slideNumber to DEF_PRES_LAYOUT_NAME layout
		this.slideLayouts.filter(layout => layout._name === DEF_PRES_LAYOUT_NAME)[0]._slideNumberProps = slideNum
	}

	/**
	 * Create all chart and media rels for this Presentation
	 * @param {PresSlide | SlideLayout} slide - slide with rels
	 * @param {JSZip} zip - JSZip instance
	 * @param {Promise<string>[]} chartPromises - promise array
	 */
	private readonly createChartMediaRels = (slide: PresSlide | SlideLayout, zip: JSZip, chartPromises: Promise<string>[]): void => {
		slide._relsChart.forEach(rel => chartPromises.push(genCharts.createExcelWorksheet(rel, zip)))
		slide._relsMedia.forEach(rel => {
			if (rel.type !== 'online' && rel.type !== 'hyperlink') {
				// Cross-slide dedup: this media's binary is already written under a
				// shared (canonical) Target by another slide's rel — skip re-writing.
				if ((rel as unknown as { _skipPackageWrite?: boolean })._skipPackageWrite) return

				// A: Loop vars
				let data: string = rel.data && typeof rel.data === 'string' ? rel.data : ''

				// B: Users will undoubtedly pass various string formats, so correct prefixes as needed
				if (!data.includes(',') && !data.includes(';')) data = 'image/png;base64,' + data
				else if (!data.includes(',')) data = 'image/png;base64,' + data
				else if (!data.includes(';')) data = 'image/png;' + data

				// C: Add media
				zip.file(rel.Target.replace('..', 'ppt'), data.split(',').pop(), { base64: true })
			}
		})
	}

	/**
	 * Create and export the .pptx file
	 * @param {string} exportName - output file type
	 * @param {Blob} blobContent - Blob content
	 * @return {Promise<string>} Promise with file name
	 */
	private readonly writeFileToBrowser = async (exportName: string, blobContent: Blob): Promise<string> => {
		// STEP 1: Create element
		const eleLink = document.createElement('a')
		eleLink.setAttribute('style', 'display:none;')
		eleLink.dataset.interception = 'off' // @see https://docs.microsoft.com/en-us/sharepoint/dev/spfx/hyperlinking
		document.body.appendChild(eleLink)

		// STEP 2: Download file to browser
		// DESIGN: Use `createObjectURL()` to D/L files in client browsers (FYI: synchronously executed)
		if (window.URL.createObjectURL) {
			const url = window.URL.createObjectURL(new Blob([blobContent], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }))
			eleLink.href = url
			eleLink.download = exportName
			eleLink.click()

			// Clean-up (NOTE: Add a slight delay before removing to avoid 'blob:null' error in Firefox Issue#81)
			setTimeout(() => {
				window.URL.revokeObjectURL(url)
				document.body.removeChild(eleLink)
			}, 100)

			// Done
			return await Promise.resolve(exportName)
		}
	}

	/**
	 * Create and export the .pptx file
	 * @param {WRITE_OUTPUT_TYPE} outputType - output file type
	 * @return {Promise<string | ArrayBuffer | Blob | Buffer | Uint8Array>} Promise with data or stream (node) or filename (browser)
	 */
	private readonly exportPresentation = async (props: WriteProps): Promise<string | ArrayBuffer | Blob | Buffer | Uint8Array> => {
		const arrChartPromises: Promise<string>[] = []
		let arrMediaPromises: Promise<string>[] = []
		const zip = new JSZip()
		const rawPackageParts = Array.isArray((this as unknown as { _rawPackageParts?: unknown })._rawPackageParts)
			? (this as unknown as { _rawPackageParts: NativePackagePart[] })._rawPackageParts
			: []
		const nativePackageParts = this.slides.flatMap(slide => slide._nativePackageParts || [])
		const packageParts = [...rawPackageParts, ...nativePackageParts]
		const rawSlideMasters = Array.isArray((this as unknown as { _rawSlideMasters?: unknown })._rawSlideMasters)
			? (this as unknown as { _rawSlideMasters: Array<{ id?: string | number; target?: string }> })._rawSlideMasters
			: []
		const rawPresentationFonts = Array.isArray((this as unknown as { _rawPresentationFonts?: unknown })._rawPresentationFonts)
			? (this as unknown as { _rawPresentationFonts: Array<Record<string, string>> })._rawPresentationFonts
			: []
		const rawPresentationExtraRels = Array.isArray((this as unknown as { _rawPresentationExtraRels?: unknown })._rawPresentationExtraRels)
			? (this as unknown as { _rawPresentationExtraRels: Array<{ type?: string; target?: string; targetMode?: string }> })._rawPresentationExtraRels
			: []
		const rawRootExtraRels = Array.isArray((this as unknown as { _rawRootExtraRels?: unknown })._rawRootExtraRels)
			? (this as unknown as { _rawRootExtraRels: Array<{ type?: string; target?: string; targetMode?: string }> })._rawRootExtraRels
			: []
		const rawPresentationContentType = (this as unknown as { _rawPresentationContentType?: string })._rawPresentationContentType

		// STEP 1: Read/Encode all Media before zip as base64 content, etc. is required
		this.slides.forEach(slide => {
			arrMediaPromises = arrMediaPromises.concat(genMedia.encodeSlideMediaRels(slide))
		})
		this.slideLayouts.forEach(layout => {
			arrMediaPromises = arrMediaPromises.concat(genMedia.encodeSlideMediaRels(layout))
		})
		arrMediaPromises = arrMediaPromises.concat(genMedia.encodeSlideMediaRels(this.masterSlide))

		// STEP 2: Wait for Promises (if any) then generate the PPTX file
		return await Promise.all(arrMediaPromises).then(async () => {
			// A0: Auto-fit 3D models. Media encoding has loaded each GLB into `_relsMedia[].data`
			// (base64); derive meterPerModelUnit/preTrans from geometry so PowerPoint frames any
			// model correctly. Runs before XML generation; skips models with explicit `trans`.
			applyModel3DAutoFit(this.slides)

			// A: Add empty placeholder objects to slides that don't already have them
			this.slides.forEach(slide => {
				if (slide._slideLayout) genObj.addPlaceholdersToSlideLayouts(slide)
			})

			// A2: Cross-slide media de-duplication.
			// `addMedia` only de-dupes a media file WITHIN a single slide, so the same
			// source video/audio/model3d asset referenced on N slides is otherwise
			// embedded N times. Collapse identical source files (keyed by type+path)
			// to ONE package part: later references re-point their `Target` to the
			// first one and skip the redundant binary write. Generic image rels are
			// left untouched; only model3d fallback posters opt into image dedupe.
			const mediaCanonicalTargetByPath = new Map<string, string>()
			this.slides.forEach(slide => {
				slide._relsMedia.forEach(rel => {
					const relType = String(rel.type || '')
					const isAvMedia = relType.startsWith('video/') || relType.startsWith('audio/')
					const isModel3DMedia = rel.model3dAsset === 'glb' || rel.model3dAsset === 'poster'
					if ((!isAvMedia && !isModel3DMedia) || !rel.path || rel.path.includes('preencoded')) return
					const key = `${relType}|${rel.path}`
					const canonical = mediaCanonicalTargetByPath.get(key)
					if (canonical) {
						if (rel.Target !== canonical) {
							rel.Target = canonical
							;(rel as unknown as { _skipPackageWrite?: boolean })._skipPackageWrite = true
						}
					} else {
						mediaCanonicalTargetByPath.set(key, rel.Target)
					}
				})
			})

			// B: Add all required folders and files
			zip.folder('_rels')
			zip.folder('docProps')
			zip.folder('ppt').folder('_rels')
			zip.folder('ppt/charts').folder('_rels')
			zip.folder('ppt/embeddings')
			zip.folder('ppt/media')
			zip.folder('ppt/slideLayouts').folder('_rels')
			zip.folder('ppt/slideMasters').folder('_rels')
			zip.folder('ppt/slides').folder('_rels')
			zip.folder('ppt/theme')
			zip.folder('ppt/notesMasters').folder('_rels')
			zip.folder('ppt/notesSlides').folder('_rels')
			zip.file('[Content_Types].xml', genXml.makeXmlContTypes(this.slides, this.slideLayouts, this.masterSlide, packageParts, rawPresentationContentType)) // TODO: pass only `this` like below! 20200206
			zip.file('_rels/.rels', genXml.makeXmlRootRels(rawRootExtraRels))
			zip.file('docProps/app.xml', genXml.makeXmlApp(this.slides, this.company)) // TODO: pass only `this` like below! 20200206
			zip.file('docProps/core.xml', genXml.makeXmlCore(this.title, this.subject, this.author, this.revision)) // TODO: pass only `this` like below! 20200206
			zip.file('ppt/_rels/presentation.xml.rels', genXml.makeXmlPresentationRels(this.slides, rawSlideMasters, rawPresentationFonts, rawPresentationExtraRels))
			zip.file('ppt/theme/theme1.xml', genXml.makeXmlTheme(this))
			zip.file('ppt/presentation.xml', genXml.makeXmlPresentation(this))
			zip.file('ppt/presProps.xml', genXml.makeXmlPresProps(this))
			zip.file('ppt/tableStyles.xml', genXml.makeXmlTableStyles())
			zip.file('ppt/viewProps.xml', genXml.makeXmlViewProps())

			// C: Create a Layout/Master/Rel/Slide file for each SlideLayout and Slide
			this.slideLayouts.forEach((layout, idx) => {
				zip.file(`ppt/slideLayouts/slideLayout${idx + 1}.xml`, genXml.makeXmlLayout(layout))
				zip.file(`ppt/slideLayouts/_rels/slideLayout${idx + 1}.xml.rels`, genXml.makeXmlSlideLayoutRel(idx + 1, this.slideLayouts))
			})
			this.slides.forEach((slide, idx) => {
				zip.file(`ppt/slides/slide${idx + 1}.xml`, genXml.makeXmlSlide(slide))
				zip.file(`ppt/slides/_rels/slide${idx + 1}.xml.rels`, genXml.makeXmlSlideRel(this.slides, this.slideLayouts, idx + 1))
				// Create all slide notes related items. Notes of empty strings are created for slides which do not have notes specified, to keep track of _rels.
				zip.file(`ppt/notesSlides/notesSlide${idx + 1}.xml`, genXml.makeXmlNotesSlide(slide))
				zip.file(`ppt/notesSlides/_rels/notesSlide${idx + 1}.xml.rels`, genXml.makeXmlNotesSlideRel(idx + 1))
			})
			zip.file('ppt/slideMasters/slideMaster1.xml', genXml.makeXmlMaster(this.masterSlide, this.slideLayouts))
			zip.file('ppt/slideMasters/_rels/slideMaster1.xml.rels', genXml.makeXmlMasterRel(this.masterSlide, this.slideLayouts))
			zip.file('ppt/notesMasters/notesMaster1.xml', genXml.makeXmlNotesMaster())
			zip.file('ppt/notesMasters/_rels/notesMaster1.xml.rels', genXml.makeXmlNotesMasterRel())

			packageParts.forEach(part => {
				let zipPath = part.path || ''
				while (zipPath.startsWith('/')) zipPath = zipPath.substring(1)
				if (!zipPath || zipPath === '[Content_Types].xml' || zipPath.startsWith('ppt/slides/')) return
				zip.file(zipPath, part.data || '', part.encoding === 'base64' ? { base64: true } : undefined)
			})

			// D: Create all Rels (images, media, chart data)
			this.slideLayouts.forEach(layout => {
				this.createChartMediaRels(layout, zip, arrChartPromises)
			})
			this.slides.forEach(slide => {
				this.createChartMediaRels(slide, zip, arrChartPromises)
			})
			this.createChartMediaRels(this.masterSlide, zip, arrChartPromises)

			// E: Wait for Promises (if any) then generate the PPTX file
			return await Promise.all(arrChartPromises).then(async () => {
				if (props.outputType === 'STREAM') {
					// A: stream file
					return await zip.generateAsync({ type: 'nodebuffer', compression: props.compression ? 'DEFLATE' : 'STORE' })
				} else if (props.outputType) {
					// B: Node [fs]: Output type user option or default
					return await zip.generateAsync({ type: props.outputType, compression: props.compression ? 'DEFLATE' : 'STORE' })
				} else {
					// C: Browser: Output blob as app/ms-pptx
					return await zip.generateAsync({ type: 'blob', compression: props.compression ? 'DEFLATE' : 'STORE' })
				}
			})
		})
	}

	// EXPORT METHODS

	/**
	 * Export the current Presentation to stream
	 * @param {WriteBaseProps} props - output properties
	 * @returns {Promise<string | ArrayBuffer | Blob | Buffer | Uint8Array>} file stream
	 */
	async stream(props?: WriteBaseProps): Promise<string | ArrayBuffer | Blob | Buffer | Uint8Array> {
		return await this.exportPresentation({
			compression: props?.compression,
			outputType: 'STREAM',
		})
	}

	/**
	 * Export the current Presentation as JSZip content with the selected type
	 * @param {WriteProps} props output properties
	 * @returns {Promise<string | ArrayBuffer | Blob | Buffer | Uint8Array>} file content in selected type
	 */
	async write(props?: WriteProps | WRITE_OUTPUT_TYPE): Promise<string | ArrayBuffer | Blob | Buffer | Uint8Array> {
		// VALIDATION: Automatically validate and auto-correct off-slide elements (unless disabled)
		const noAutoCorrect = typeof props === 'object' && props?.noOffSlideAutoCorrect === true
		this.validateBeforeExport(noAutoCorrect)

		// DEPRECATED: @deprecated v3.5.0 - outputType - [[remove in v4.0.0]]
		const propsOutpType = typeof props === 'object' && props?.outputType ? props.outputType : props ? (props as WRITE_OUTPUT_TYPE) : null
		const propsCompress = typeof props === 'object' && typeof props?.compression === 'boolean' ? props.compression : true

		return await this.exportPresentation({
			compression: propsCompress,
			outputType: propsOutpType,
		})
	}

	/**
	 * Export the current Presentation.
	 * Write the generated presentation to disk (Node) or trigger a download (browser).
	 * @param {WriteFileProps} props - output file properties
	 * @returns {Promise<string>} the presentation name
	 */
	async writeFile(props?: WriteFileProps | string): Promise<string> {
		// VALIDATION: Automatically validate and auto-correct off-slide elements (unless disabled)
		const noAutoCorrect = typeof props === 'object' && props?.noOffSlideAutoCorrect === true
		this.validateBeforeExport(noAutoCorrect)

		// STEP 1: Figure out where we are running
		const isNode = typeof process !== 'undefined' && !!process.versions?.node && process.release?.name === 'node'

		// STEP 2: Normalise the user arguments
		if (typeof props === 'string') {
			// DEPRECATED: @deprecated v3.5.0 - fileName - [[remove in v4.0.0]]
			console.warn('[WARNING] writeFile(string) is deprecated - pass { fileName } instead.')
			props = { fileName: props }
		}
		const { fileName: rawName = 'Presentation.pptx', compression = true } = props as WriteFileProps
		const lowerName = rawName.toLowerCase()
		const fileName = lowerName.endsWith('.pptx') || lowerName.endsWith('.pptm') ? rawName : `${rawName}.pptx`

		// STEP 3: Get the binary/Blob from exportPresentation()
		const outputType = isNode ? ('nodebuffer' as const) : null
		const data = await this.exportPresentation({ compression, outputType })

		// STEP 4: Write the file out
		if (isNode) {
			// Dynamically import to avoid bundling fs in the browser build
			const { promises: fs } = await import('node:fs')
			const { writeFile } = fs
			await writeFile(fileName, data as Buffer)
			return fileName
		}

		// Browser branch - push a download
		await this.writeFileToBrowser(fileName, data as Blob)
		return fileName
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
	validate(options?: ValidationOptions): ValidationResult {
		const engine = new ValidationEngine(this._presLayout, this._slides, options?.mode)
		return engine.validate(options)
	}

	/**
	 * Check if the presentation is valid (no errors)
	 * @param {ValidationOptions} options - validation options
	 * @returns {boolean} true if presentation has no validation errors
	 * @since v4.0.0
	 */
	isValid(options?: ValidationOptions): boolean {
		return this.validate(options).valid
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
	private validateBeforeExport(noAutoCorrect: boolean = false): void {
		const slideWidth = this._presLayout.width / 914400 // EMU to inches
		const slideHeight = this._presLayout.height / 914400
		const offSlideTolerance = 1000 / 914400 // Ignore sub-pixel EMU drift from imported decks.

		// Find all off-slide issues that extend beyond right or bottom
		const offSlideCodes = ['ELEMENT_OFF_SLIDE_RIGHT', 'ELEMENT_OFF_SLIDE_BOTTOM', 'ELEMENT_PARTIALLY_OFF_SLIDE']
		const result = this.validate({ mode: 'normal' })

		const repairRiskIssues = result.issues.filter(isRepairRiskIssue)
		if (repairRiskIssues.length > 0) {
			const errorMessages = repairRiskIssues.slice(0, 25).map((err) => {
				const location = err.slideNumber ? `Slide ${err.slideNumber}` : 'Presentation'
				const element = err.shapeName ? ` (${err.shapeName})` : ''
				const path = typeof err.context?.path === 'string' ? ` [${err.context.path}]` : ''
				return `${location}${element}: ${err.message}${path}`
			})
			const moreCount = repairRiskIssues.length > 25 ? `\n...and ${repairRiskIssues.length - 25} more repair-risk issue(s).` : ''
			throw new Error(
				`PptxGenJS: Repair-risk validation failed with ${repairRiskIssues.length} issue(s):\n` +
				errorMessages.join('\n') +
				moreCount +
				'\n\nFix these object-model values before exporting; the serializer will not emit a PPTX with known repair-risk inputs.' +
				'\nUse pptx.validate({ checks: [\'repair\'] }) for the detailed repair-risk report.'
			)
		}
		
		const offSlideIssues = result.issues.filter((issue) => {
			if (!offSlideCodes.includes(issue.code)) return false
			
			// Skip zero-size elements
			const context = issue.context as { bounds?: { w: number; h: number; right: number; bottom: number }; slideWidth?: number; slideHeight?: number }
			if (context?.bounds && context.bounds.w === 0 && context.bounds.h === 0) return false
			if (context?.bounds && context.bounds.right <= slideWidth + offSlideTolerance && context.bounds.bottom <= slideHeight + offSlideTolerance) return false
			
			// For partial off-slide, only flag if extending beyond right or bottom
			if (issue.code === 'ELEMENT_PARTIALLY_OFF_SLIDE' && context?.bounds) {
				const { right, bottom } = context.bounds
				return right > slideWidth + offSlideTolerance || bottom > slideHeight + offSlideTolerance
			}
			
			return true
		})

		if (offSlideIssues.length === 0) return

		// If auto-correct is disabled, throw error
		if (noAutoCorrect) {
			const errorMessages = offSlideIssues.map((err) => {
				const location = err.slideNumber ? `Slide ${err.slideNumber}` : 'Presentation'
				const element = err.shapeName ? ` (${err.shapeName})` : ''
				const context = err.context as { bounds?: { x: number; y: number; w: number; h: number; right: number; bottom: number } }
				let posInfo = ''
				if (context?.bounds) {
					const b = context.bounds
					posInfo = ` [x:${b.x.toFixed(2)}, y:${b.y.toFixed(2)}, w:${b.w.toFixed(2)}, h:${b.h.toFixed(2)} → ends at (${b.right.toFixed(2)}, ${b.bottom.toFixed(2)})]`
				}
				return `${location}${element}: ${err.message}${posInfo}`
			})

			throw new Error(
				`PptxGenJS: Validation failed with ${offSlideIssues.length} off-slide element(s):\n` +
				errorMessages.join('\n') +
				`\n\nSlide boundaries: ${slideWidth.toFixed(3)}" x ${slideHeight.toFixed(3)}".` +
				'\nFix element positions so (x + w) ≤ slide width and (y + h) ≤ slide height.' +
				'\nOr remove noOffSlideAutoCorrect option to auto-correct.' +
				'\nUse pptx.validate() for detailed report.'
			)
		}

		// AUTO-CORRECT: Calculate global scale ratio to fit all elements
		let maxRightOverflow = 1 // ratio: how much beyond right edge (1 = no overflow)
		let maxBottomOverflow = 1 // ratio: how much beyond bottom edge

		// Group issues by slide to calculate per-slide correction
		const slideCorrections = new Map<number, { scaleX: number; scaleY: number; issues: typeof offSlideIssues }>()

		for (const issue of offSlideIssues) {
			const context = issue.context as { bounds?: { x: number; y: number; w: number; h: number; right: number; bottom: number } }
			if (!context?.bounds || !issue.slideNumber) continue

			const { right, bottom } = context.bounds
			
			if (right > slideWidth) {
				maxRightOverflow = Math.max(maxRightOverflow, right / slideWidth)
			}
			if (bottom > slideHeight) {
				maxBottomOverflow = Math.max(maxBottomOverflow, bottom / slideHeight)
			}

			// Track per-slide
			if (!slideCorrections.has(issue.slideNumber)) {
				slideCorrections.set(issue.slideNumber, { scaleX: 1, scaleY: 1, issues: [] })
			}
			const slideData = slideCorrections.get(issue.slideNumber)!
			slideData.issues.push(issue)
			slideData.scaleX = Math.max(slideData.scaleX, right / slideWidth)
			slideData.scaleY = Math.max(slideData.scaleY, bottom / slideHeight)
		}

		// Apply corrections per slide
		const correctionLog: string[] = []

		for (const [slideNum, correction] of slideCorrections) {
			const slide = this._slides[slideNum - 1]
			if (!slide?._slideObjects) continue

			// Calculate uniform scale to maintain aspect ratio
			const scale = 1 / Math.max(correction.scaleX, correction.scaleY)
			
			if (scale >= 1) continue // No correction needed

			// Apply scale to ALL elements on this slide to maintain relative positioning
			for (const obj of slide._slideObjects) {
				if (!obj.options) continue

				const opts = obj.options as { x?: number; y?: number; w?: number; h?: number }
				
				// Handle values that might be in EMUs (> 20) vs inches
				const isEmuX = typeof opts.x === 'number' && opts.x > 20
				const isEmuY = typeof opts.y === 'number' && opts.y > 20
				const isEmuW = typeof opts.w === 'number' && opts.w > 20
				const isEmuH = typeof opts.h === 'number' && opts.h > 20

				if (typeof opts.x === 'number') {
					opts.x = isEmuX ? opts.x * scale : opts.x * scale
				}
				if (typeof opts.y === 'number') {
					opts.y = isEmuY ? opts.y * scale : opts.y * scale
				}
				if (typeof opts.w === 'number') {
					opts.w = isEmuW ? opts.w * scale : opts.w * scale
				}
				if (typeof opts.h === 'number') {
					opts.h = isEmuH ? opts.h * scale : opts.h * scale
				}
			}

			const elementNames = correction.issues
				.map((i) => i.shapeName || `Shape ${i.shapeIndex}`)
				.slice(0, 3)
				.join(', ')
			const moreCount = correction.issues.length > 3 ? ` and ${correction.issues.length - 3} more` : ''

			correctionLog.push(
				`Slide ${slideNum}: Scaled by ${(scale * 100).toFixed(1)}% to fit ${correction.issues.length} element(s) (${elementNames}${moreCount})`
			)
		}

		// Log informational message about corrections
		if (correctionLog.length > 0) {
			console.info(
				`[PptxGenJS] Off-slide auto-correction applied:\n` +
				correctionLog.map((msg) => `  • ${msg}`).join('\n') +
				`\n  Slide boundaries: ${slideWidth.toFixed(3)}" x ${slideHeight.toFixed(3)}"` +
				`\n  To disable auto-correction, use: writeFile({ noOffSlideAutoCorrect: true })`
			)
		}
	}

	// PRESENTATION METHODS

	/**
	 * Add a new Section to Presentation
	 * @param {ISectionProps} section - section properties
	 * @example pptx.addSection({ title:'Charts' });
	 */
	addSection(section: SectionProps): void {
		if (!section) console.warn('addSection requires an argument')
		else if (!section.title) console.warn('addSection requires a title')

		const newSection: SectionProps = {
			_type: 'user',
			_slides: [],
			title: section.title,
		}

		if (section.order) this.sections.splice(section.order, 0, newSection)
		else this._sections.push(newSection)
	}

	/**
	 * Add a new Slide to Presentation
	 * @param {AddSlideProps} options - slide options
	 * @returns {PresSlide} the new Slide
	 */
	addSlide(options?: AddSlideProps): PresSlide {
		// TODO: DEPRECATED: arg0 string "masterSlideName" dep as of 3.2.0
		const masterSlideName = typeof options === 'string' ? options : options?.masterName ? options.masterName : ''
		let slideLayout: SlideLayout = {
			_name: this.LAYOUTS[DEF_PRES_LAYOUT].name,
			_presLayout: this.presLayout,
			_rels: [],
			_relsChart: [],
			_relsMedia: [],
			_slideNum: this.slides.length + 1,
		}

		if (masterSlideName) {
			const tmpLayout = this.slideLayouts.filter(layout => layout._name === masterSlideName)[0]
			if (tmpLayout) slideLayout = tmpLayout
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
		})

		// A: Add slide to pres
		this._slides.push(newSlide)

		// B: Sections
		// B-1: Add slide to section (if any provided)
		// B-2: Handle slides without a section when sections are already is use ("loose" slides arent allowed, they all need a section)
		if (options?.sectionTitle) {
			const sect = this.sections.filter(section => section.title === options.sectionTitle)[0]
			if (!sect) console.warn(`addSlide: unable to find section with title: "${options.sectionTitle}"`)
			else sect._slides.push(newSlide)
		} else if (this.sections && this.sections.length > 0 && (!options?.sectionTitle)) {
			const lastSect = this._sections[this.sections.length - 1]

			// CASE 1: The latest section is a default type - just add this one
			if (lastSect._type === 'default') lastSect._slides.push(newSlide)
			// CASE 2: There latest section is NOT a default type - create the defualt, add this slide
			else {
				this._sections.push({
					title: `Default-${this.sections.filter(sect => sect._type === 'default').length + 1}`,
					_type: 'default',
					_slides: [newSlide],
				})
			}
		}

		return newSlide
	}

	/**
	 * Create a custom Slide Layout in any size
	 * @param {PresLayout} layout - layout properties
	 * @example pptx.defineLayout({ name:'A3', width:16.5, height:11.7 });
	 */
	defineLayout(layout: PresLayout): void {
		// @see https://support.office.com/en-us/article/Change-the-size-of-your-slides-040a811c-be43-40b9-8d04-0de5ed79987e
		if (!layout) console.warn('defineLayout requires `{name, width, height}`')
		else if (!layout.name) console.warn('defineLayout requires `name`')
		else if (!layout.width) console.warn('defineLayout requires `width`')
		else if (!layout.height) console.warn('defineLayout requires `height`')
		else if (typeof layout.height !== 'number') console.warn('defineLayout `height` should be a number (inches)')
		else if (typeof layout.width !== 'number') console.warn('defineLayout `width` should be a number (inches)')

		this.LAYOUTS[layout.name] = {
			name: layout.name,
			_sizeW: Math.round(Number(layout.width) * EMU),
			_sizeH: Math.round(Number(layout.height) * EMU),
			width: Math.round(Number(layout.width) * EMU),
			height: Math.round(Number(layout.height) * EMU),
		}
	}

	/**
	 * Create a new slide master [layout] for the Presentation
	 * @param {SlideMasterProps} props - layout properties
	 */
	defineSlideMaster(props: SlideMasterProps): void {
		// (ISSUE#406;PULL#1176) deep clone the props object to avoid mutating the original object
		const propsClone = JSON.parse(JSON.stringify(props))
		if (!propsClone.title) throw new Error('defineSlideMaster() object argument requires a `title` value. (https://gitbrent.github.io/PptxGenJS/docs/masters.html)')

		const newLayout: SlideLayout = {
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
		}

		// STEP 1: Create the Slide Master/Layout
		genObj.createSlideMaster(propsClone, newLayout)

		// STEP 2: Add it to layout defs
		this.slideLayouts.push(newLayout)

		// STEP 3: Add background (image data/path must be captured before `exportPresentation()` is called)
		if (propsClone.background || propsClone.bkgd) genObj.addBackgroundDefinition(propsClone.background, newLayout)

		// STEP 4: Add slideNumber to master slide (if any)
		if (newLayout._slideNumberProps && !this.masterSlide._slideNumberProps) this.masterSlide._slideNumberProps = newLayout._slideNumberProps
	}

	// HTML-TO-SLIDES METHODS

	/**
	 * Reproduces an HTML table as a PowerPoint table - including column widths, style, etc. - creates 1 or more slides as needed
	 * @param {string} eleId - table HTML element ID
	 * @param {TableToSlidesProps} options - generation options
	 */
	tableToSlides(eleId: string, options: TableToSlidesProps = {}): void {
		// @note `verbose` option is undocumented; used for verbose output of layout process
		genTable.genTableToSlides(
			this,
			eleId,
			options,
			options?.masterSlideName ? this.slideLayouts.filter(layout => layout._name === options.masterSlideName)[0] : null
		)
	}
}
