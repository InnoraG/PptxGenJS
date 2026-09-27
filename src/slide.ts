/**
 * PptxGenJS: Slide Class
 */

import { CHART_NAME, SHAPE_NAME, SLIDE_OBJECT_TYPES } from './core-enums'
import {
	AddSlideProps,
	AnimationProps,
	BackgroundProps,
	CameoProps,
	ConnectorProps,
	GroupProps,
	ZoomProps,
	SectionZoomProps,
	SummaryZoomProps,
	SectionProps,
	HexColor,
	IChartMulti,
	IChartOpts,
	IChartOptsLib,
	IOptsChartData,
	ISlideObject,
	ISlideRel,
	ISlideRelChart,
	ISlideRelMedia,
	EquationProps,
	ImageProps,
	MediaProps,
	RecordStudioCaptureProps,
	Model3DProps,
	ObjectOptions,
	PresLayout,
	PresSlide,
	ShapeProps,
	SmartArtNode,
	SmartArtProps,
	SlideLayout,
	SlideNumberProps,
	TableProps,
	TableRow,
	TextProps,
	TextPropsOptions,
	TransitionProps,
} from './core-interfaces'
import * as genObj from './gen-objects'
import { countParagraphs } from './gen-objects'
import { addAnimation as addAnimationInternal } from './gen-animations'
import { assertNativeDescendantAnimationInspectable, nativeGroupIdentityPlan } from './gen-group-animation-targets'
import { ValidationEngine, ValidationOptions, ValidationResult } from './validation-engine'

export default class Slide {
	private readonly _setSlideNum: (value: SlideNumberProps) => void
	/**
	 * Shape registry for named shape lookup
	 * Maps objectName -> ISlideObject for O(1) lookups
	 * @since v4.0.0
	 */
	private readonly _shapesByName: Map<string, ISlideObject> = new Map()

	public addSlide: (options?: AddSlideProps) => PresSlide
	public getSlide: (slideNum: number) => PresSlide
	/** Accessor to the presentation's sections (used by Section Zoom). @since v4.0.1 */
	public getSections: () => SectionProps[]
	public _name: string
	public _presLayout: PresLayout
	public _rels: ISlideRel[]
	public _relsChart: ISlideRelChart[]
	public _relsMedia: ISlideRelMedia[]
	public _rId: number
	public _slideId: number
	public _slideLayout: SlideLayout
	public _slideNum: number
	public _slideNumberProps: SlideNumberProps
	public _slideObjects: ISlideObject[]
	public _newAutoPagedSlides: PresSlide[]

	constructor(params: {
		addSlide: (options?: AddSlideProps) => PresSlide
		getSlide: (slideNum: number) => PresSlide
		getSections?: () => SectionProps[]
		presLayout: PresLayout
		setSlideNum: (value: SlideNumberProps) => void
		slideId: number
		slideRId: number
		slideNumber: number
		slideLayout?: SlideLayout
	}) {
		this.addSlide = params.addSlide
		this.getSlide = params.getSlide
		this.getSections = params.getSections || (() => [])
		this._name = `Slide ${params.slideNumber}`
		this._presLayout = params.presLayout
		this._rId = params.slideRId
		this._rels = []
		this._relsChart = []
		this._relsMedia = []
		this._setSlideNum = params.setSlideNum
		this._slideId = params.slideId
		this._slideLayout = params.slideLayout || null
		this._slideNum = params.slideNumber
		this._slideObjects = []
		/** NOTE: Slide Numbers: In order for Slide Numbers to function they need to be in all 3 files: master/layout/slide
		 * `defineSlideMaster` and `addNewSlide.slideNumber` will add {slideNumber} to `this.masterSlide` and `this.slideLayouts`
		 * so, lastly, add to the Slide now.
		 */
		this._slideNumberProps = this._slideLayout?._slideNumberProps ? this._slideLayout._slideNumberProps : null
	}

	/**
	 * Background color
	 * @type {string|BackgroundProps}
	 * @deprecated in v3.3.0 - use `background` instead
	 */
	private _bkgd: string | BackgroundProps
	public set bkgd(value: string | BackgroundProps) {
		this._bkgd = value
		if (!this._background || !this._background.color) {
			if (!this._background) this._background = {}
			if (typeof value === 'string') this._background.color = value
		}
	}

	public get bkgd(): string | BackgroundProps {
		return this._bkgd
	}

	/**
	 * Background color or image
	 * @type {BackgroundProps}
	 * @example solid color `background: { color:'FF0000' }`
	 * @example color+trans `background: { color:'FF0000', transparency:0.5 }`
	 * @example base64 `background: { data:'image/png;base64,ABC[...]123' }`
	 * @example url `background: { path:'https://some.url/image.jpg'}`
	 * @since v3.3.0
	 */
	private _background: BackgroundProps
	public set background(props: BackgroundProps) {
		this._background = props
		// Add background (image data/path must be captured before `exportPresentation()` is called)
		genObj.addBackgroundDefinition(props, this)
	}

	public get background(): BackgroundProps {
		return this._background
	}

	/**
	 * Default font color
	 * @type {HexColor}
	 */
	private _color: HexColor
	public set color(value: HexColor) {
		this._color = value
	}

	public get color(): HexColor {
		return this._color
	}

	/**
	 * @type {boolean}
	 */
	private _hidden: boolean
	public set hidden(value: boolean) {
		this._hidden = value
	}

	public get hidden(): boolean {
		return this._hidden
	}

	/**
	 * @type {SlideNumberProps}
	 */
	public set slideNumber(value: SlideNumberProps) {
		// NOTE: Slide Numbers: In order for Slide Numbers to function they need to be in all 3 files: master/layout/slide
		this._slideNumberProps = value
		this._setSlideNum(value)
	}

	public get slideNumber(): SlideNumberProps {
		return this._slideNumberProps
	}

	/**
	 * Slide transition
	 * @type {TransitionProps}
	 */
	private _transition?: TransitionProps
	public set transition(value: TransitionProps) {
		this._transition = value
	}

	public get transition(): TransitionProps | undefined {
		return this._transition
	}

	public get newAutoPagedSlides(): PresSlide[] {
		return this._newAutoPagedSlides
	}

	// ============================================================================
	// SHAPE REGISTRY METHODS
	// ============================================================================

	/**
	 * Register a shape in the name registry for later lookup
	 * Called internally by add* methods when objectName is provided
	 * @param {ISlideObject} shape - the shape object to register
	 * @private
	 */
	private _registerShape(shape: ISlideObject): void {
		const name = shape.options?.objectName
		if (name) {
			// Auto-paged tables are registered by the inner page add and then seen
			// once more when the outer addTable call returns. Re-registering the
			// same object is idempotent; warn only when a different shape collides.
			if (this._shapesByName.has(name) && this._shapesByName.get(name) !== shape) {
				console.warn(`Slide ${this._slideNum}: Shape name "${name}" already exists. Overwriting reference.`)
			}
			this._shapesByName.set(name, shape)
		}
	}

	/**
	 * Get a shape by its objectName
	 * Enables named shape targeting for animations and updates
	 * @param {string} name - the objectName of the shape to find
	 * @return {ISlideObject | undefined} the shape object, or undefined if not found
	 * @since v4.0.0
	 * @example
	 * // Create a named shape
	 * slide.addShape('rect', { x: 1, y: 1, w: 2, h: 2, objectName: 'myRect' });
	 * 
	 * // Later, retrieve it by name
	 * const shape = slide.getShapeByName('myRect');
	 * if (shape) {
	 *   slide.addAnimation(shape, { type: 'entrance', effect: 'fade' });
	 * }
	 */
	getShapeByName(name: string): ISlideObject | undefined {
		return this._shapesByName.get(name)
	}

	/**
	 * Get all registered shape names on this slide
	 * @return {string[]} array of shape names
	 * @since v4.0.0
	 */
	getShapeNames(): string[] {
		return Array.from(this._shapesByName.keys())
	}

	/**
	 * Check if a shape with the given name exists on this slide
	 * @param {string} name - the objectName to check
	 * @return {boolean} true if shape exists
	 * @since v4.0.0
	 */
	hasShape(name: string): boolean {
		return this._shapesByName.has(name)
	}

	// ============================================================================
	// VALIDATION METHODS
	// ============================================================================

	/**
	 * Validate this slide for common issues
	 * @param {ValidationOptions} options - validation options
	 * @returns {ValidationResult} validation result with issues for this slide
	 * @since v4.0.0
	 * @example
	 * const result = slide.validate();
	 * if (!result.valid) {
	 *   console.log('Issues:', result.issues);
	 * }
	 */
	validate(options?: ValidationOptions): ValidationResult {
		const engine = new ValidationEngine(this._presLayout, [this as unknown as PresSlide], options?.mode)
		return engine.validateSlide(1, options)
	}

	// ============================================================================
	// CONTENT METHODS
	// ============================================================================

	/**
	 * Add chart to Slide
	 * @param {CHART_NAME|IChartMulti[]} type - chart type
	 * @param {object[]} data - data object
	 * @param {IChartOpts} options - chart options
	 * @return {Slide} this Slide
	 */
	addChart(type: CHART_NAME | IChartMulti[], data: IOptsChartData[], options?: IChartOpts): Slide {
		// FUTURE: TODO-VERSION-4: Remove first arg - only take data and opts, with "type" required on opts
		// Set `_type` on IChartOptsLib as its what is used as object is passed around
		const optionsWithType: IChartOptsLib = options || {}
		optionsWithType._type = type
		genObj.addChartDefinition(this, type, data, options)
		// Register shape if it has a name (enables getShapeByName + addAnimation)
		const lastShape = this._slideObjects[this._slideObjects.length - 1]
		if (lastShape) this._registerShape(lastShape)
		return this
	}

	/**
	 * Add a Cameo (live camera feed) to Slide
	 * @param {CameoProps} options - cameo options
	 * @return {Slide} this Slide
	 * @since v4.0.1
	 */
	addCameo(options: CameoProps): Slide {
		genObj.addCameoDefinition(this, options)
		// Register shape if it has a name
		const lastShape = this._slideObjects[this._slideObjects.length - 1]
		if (lastShape) this._registerShape(lastShape)
		return this
	}

	/**
	 * Add a Slide Zoom (zoom navigation) to Slide
	 * @param {ZoomProps} options - zoom options (requires targetSlide, a 1-based slide index)
	 * @return {Slide} this Slide
	 * @since v4.0.1
	 */
	addZoom(options: ZoomProps): Slide {
		genObj.addZoomDefinition(this, options)
		// Register shape if it has a name
		const lastShape = this._slideObjects[this._slideObjects.length - 1]
		if (lastShape) this._registerShape(lastShape)
		return this
	}

	/**
	 * Add a Section Zoom (zoom navigation to a section) to Slide
	 * @param {SectionZoomProps} options - section zoom options (requires targetSection: title or 1-based index)
	 * @return {Slide} this Slide
	 * @since v4.0.1
	 */
	addSectionZoom(options: SectionZoomProps): Slide {
		genObj.addSectionZoomDefinition(this, options)
		// Register shape if it has a name
		const lastShape = this._slideObjects[this._slideObjects.length - 1]
		if (lastShape) this._registerShape(lastShape)
		return this
	}

	/**
	 * Add a Summary Zoom graphic to this (summary) slide. Prefer `pptx.addSummaryZoom(...)`, which
	 * also creates the summary slide and section. @see plans/summary-zoom-ooxml-ground-truth.md
	 * @param {SummaryZoomProps} options - summary zoom options
	 * @return {Slide} this Slide
	 * @since v4.0.1
	 */
	addSummaryZoom(options?: SummaryZoomProps): Slide {
		genObj.addSummaryZoomDefinition(this, options || ({} as SummaryZoomProps))
		// Register shape if it has a name
		const lastShape = this._slideObjects[this._slideObjects.length - 1]
		if (lastShape) this._registerShape(lastShape)
		return this
	}

	/**
	 * Add image to Slide
	 * @param {ImageProps} options - image options
	 * @return {Slide} this Slide
	 */
	addImage(options: ImageProps): Slide {
		genObj.addImageDefinition(this, options)
		// Register shape if it has a name
		const lastShape = this._slideObjects[this._slideObjects.length - 1]
		if (lastShape) this._registerShape(lastShape)
		return this
	}

	/**
	 * Add media (audio/video) to Slide
	 * @param {MediaProps} options - media options
	 * @return {Slide} this Slide
	 */
	addMedia(options: MediaProps): Slide {
		genObj.addMediaDefinition(this, options)
		// Register shape if it has a name
		const lastShape = this._slideObjects[this._slideObjects.length - 1]
		if (lastShape) this._registerShape(lastShape)
		return this
	}

	/**
	 * Add 3D Model to Slide
	 * @param {Model3DProps} options - 3D model options
	 * @returns {Slide} this Slide
	 * @since v4.0.0
	 */
	addModel3D(options: Model3DProps): Slide {
		genObj.addModel3DDefinition(this, options)
		// Register shape if it has a name
		const lastShape = this._slideObjects[this._slideObjects.length - 1]
		if (lastShape) this._registerShape(lastShape)
		return this
	}

	/**
	 * Add speaker notes to Slide
	 * @docs https://gitbrent.github.io/PptxGenJS/docs/speaker-notes.html
	 * @param {string} notes - notes to add to slide
	 * @return {Slide} this Slide
	 */
	addNotes(notes: string): Slide {
		genObj.addNotesDefinition(this, notes)
		return this
	}

	/**
	 * Add shape to Slide
	 * @param {SHAPE_NAME} shapeName - shape name
	 * @param {ShapeProps} options - shape options
	 * @return {Slide} this Slide
	 */
	addShape(shapeName: SHAPE_NAME, options?: ShapeProps): Slide {
		// NOTE: As of v3.1.0, <script> users are passing the old shape object from the shapes file (orig to the project)
		// But React/TypeScript users are passing the shapeName from an enum, which is a simple string, so lets cast
		// <script./> => `pptx.shapes.RECTANGLE` [string] "rect" ... shapeName['name'] = 'rect'
		// TypeScript => `pptxgen.shapes.RECTANGLE` [string] "rect" ... shapeName = 'rect'
		// let shapeNameDecode = typeof shapeName === 'object' && shapeName['name'] ? shapeName['name'] : shapeName
		genObj.addShapeDefinition(this, shapeName, options)
		// Register shape if it has a name
		const lastShape = this._slideObjects[this._slideObjects.length - 1]
		if (lastShape) this._registerShape(lastShape)
		return this
	}

	/** Add a native, endpoint-aware PowerPoint connector. */
	addConnector(options: ConnectorProps = {}): Slide {
		genObj.addConnectorDefinition(this, options)
		const lastShape = this._slideObjects[this._slideObjects.length - 1]
		if (lastShape) this._registerShape(lastShape)
		return this
	}

	/**
	 * Add the recorded-video object for a native PowerPoint Record Studio
	 * session. Ordinary audio/video should continue to use addMedia().
	 */
	addRecordStudioCapture(options: RecordStudioCaptureProps): Slide {
		genObj.addRecordStudioCaptureDefinition(this, options)
		const lastShape = this._slideObjects[this._slideObjects.length - 1]
		if (lastShape) this._registerShape(lastShape)
		return this
	}

	/** Add a native editable PowerPoint group with engine-laid-out child primitives. */
	addGroup(options: GroupProps): Slide {
		genObj.addGroupDefinition(this, options)
		const lastShape = this._slideObjects[this._slideObjects.length - 1]
		if (lastShape) this._registerShape(lastShape)
		return this
	}

	/**
	 * Add a SmartArt diagram to Slide.
	 *
	 * Default mode creates editable PowerPoint shapes for common diagram layouts.
	 * `mode: "native"` creates a true PowerPoint SmartArt graphicFrame for the
	 * supported native subset.
	 * @param {SmartArtProps} options - SmartArt diagram options
	 * @return {Slide} this Slide
	 * @since v4.0.0
	 */
	addSmartArt(options: SmartArtProps = {}): Slide {
		if (options.native || options.mode === 'native') {
			genObj.addNativeSmartArtDefinition(this, options)
			const lastShape = this._slideObjects[this._slideObjects.length - 1]
			if (lastShape) this._registerShape(lastShape)
			return this
		}

		const asNumber = (value: unknown, fallback: number) => {
			const n = typeof value === 'number' ? value : Number(value)
			return Number.isFinite(n) ? n : fallback
		}
		const x = asNumber(options.x, 1)
		const y = asNumber(options.y, 1)
		const w = Math.max(1, asNumber(options.w, 8))
		const h = Math.max(0.8, asNumber(options.h, 3))
		const palette = options.palette && options.palette.length > 0
			? options.palette
			: ['2563EB', '14B8A6', 'F59E0B', 'EF4444', '8B5CF6', '22C55E']
		const objectName = options.objectName || `smartart-${this._slideObjects.length + 1}`
		const layoutName = String(options.layout || 'process').toLowerCase().replace(/[^a-z0-9]+/g, '')
		const layout =
			layoutName.includes('picture') ? 'picture' :
			layoutName.includes('timeline') ? 'timeline' :
			layoutName.includes('team') || layoutName.includes('meet') ? 'team' :
			layoutName.includes('cycle') ? 'cycle' :
			layoutName.includes('hierarchy') || layoutName.includes('org') ? 'hierarchy' :
			layoutName.includes('matrix') ? 'matrix' :
			layoutName.includes('pyramid') ? 'pyramid' :
			layoutName.includes('relation') || layoutName.includes('venn') || layoutName.includes('radial') ? 'relationship' :
			layoutName.includes('list') || layoutName.includes('block') ? 'list' :
			'process'
		const textColor = options.color || 'FFFFFF'
		const fontFace = options.fontFace || 'Aptos'
		const fontSize = options.fontSize || 10
		const defaultLine = options.line || { color: 'FFFFFF', transparency: 35, width: 1 }
		const animations = options.animation ? (Array.isArray(options.animation) ? options.animation : [options.animation]) : []
		const normalizeNode = (node: string | SmartArtNode, index: number): SmartArtNode => {
			if (typeof node === 'string') return { text: node }
			return { ...node, text: node.text || node.title || `Node ${index + 1}` }
		}
		const nodes = (options.nodes && options.nodes.length > 0 ? options.nodes : ['Plan', 'Build', 'Validate']).map(normalizeNode)
		let workY = y
		let workH = h
		if (options.title) {
			this.addText(options.title, {
				x,
				y: workY,
				w,
				h: 0.28,
				fontFace,
				fontSize: fontSize + 2,
				bold: true,
				color: textColor,
				margin: 0,
				objectName: `${objectName}-title`,
				fit: 'shrink',
			})
			workY += 0.38
			workH = Math.max(0.5, workH - 0.38)
		}
		const colorFor = (index: number) => palette[index % palette.length]
		const animateNode = (shapeObj?: ISlideObject) => {
			if (!shapeObj) return
			animations.forEach(animation => this.addAnimation(shapeObj, animation))
		}
		const addLabel = (node: SmartArtNode, index: number, nx: number, ny: number, nw: number, nh: number, bold = true) => {
			this.addText(String(node.text || node.title || `Node ${index + 1}`), {
				x: nx + 0.08,
				y: ny + Math.max(0.03, nh * 0.18),
				w: Math.max(0.1, nw - 0.16),
				h: Math.max(0.1, nh * 0.64),
				fontFace,
				fontSize,
				bold,
				color: textColor,
				align: 'center',
				valign: 'middle',
				margin: 0.02,
				fit: 'shrink',
				objectName: `${objectName}-label-${index + 1}`,
			})
		}
		const addNode = (node: SmartArtNode, index: number, nx: number, ny: number, nw: number, nh: number, shapeName: SHAPE_NAME = 'roundRect' as SHAPE_NAME) => {
			this.addShape(shapeName, {
				x: nx,
				y: ny,
				w: nw,
				h: nh,
				fill: node.fill || options.fill || { color: node.color || colorFor(index) },
				line: node.line || defaultLine,
				shadow: options.shadow,
				objectName: `${objectName}-node-${index + 1}`,
			})
			const shapeObj = this._slideObjects[this._slideObjects.length - 1]
			addLabel(node, index, nx, ny, nw, nh)
			animateNode(shapeObj)
		}
		const addPictureNode = (node: SmartArtNode, index: number, nx: number, ny: number, nw: number, nh: number) => {
			const imageRef = node.image || node.imagePath
			const imageSize = Math.min(nh, nw * 0.38)
			if (imageRef) {
				this.addImage({ path: imageRef, x: nx, y: ny, w: imageSize, h: imageSize, rounding: true, objectName: `${objectName}-image-${index + 1}` } as any)
			} else {
				this.addShape('ellipse' as SHAPE_NAME, {
					x: nx,
					y: ny,
					w: imageSize,
					h: imageSize,
					fill: node.fill || { color: node.color || colorFor(index), transparency: 8 },
					line: node.line || defaultLine,
					objectName: `${objectName}-image-${index + 1}`,
				})
			}
			this.addText(String(node.text || node.title || `Node ${index + 1}`), {
				x: nx + imageSize + 0.16,
				y: ny + 0.05,
				w: Math.max(0.1, nw - imageSize - 0.16),
				h: node.subtitle ? Math.max(0.14, nh * 0.42) : Math.max(0.14, nh * 0.74),
				fontFace,
				fontSize,
				bold: true,
				color: textColor,
				margin: 0.02,
				fit: 'shrink',
				objectName: `${objectName}-label-${index + 1}`,
			})
			if (node.subtitle) {
				this.addText(String(node.subtitle), {
					x: nx + imageSize + 0.16,
					y: ny + Math.max(0.24, nh * 0.5),
					w: Math.max(0.1, nw - imageSize - 0.16),
					h: Math.max(0.12, nh * 0.36),
					fontFace,
					fontSize: Math.max(6, fontSize - 2),
					color: textColor,
					transparency: 18,
					margin: 0.02,
					fit: 'shrink',
					objectName: `${objectName}-subtitle-${index + 1}`,
				} as any)
			}
		}
		const addConnector = (index: number, x1: number, y1: number, x2: number, y2: number, arrow = true, direction?: { x: number, y: number }) => {
			const minLineDimension = 0.001
			const hostRight = x + w
			const hostBottom = y + h
			const clampCoordinate = (value: number, min: number, max: number, fallback: number) =>
				Math.min(max, Math.max(min, Number.isFinite(value) ? value : fallback))
			const startX = clampCoordinate(x1, x, hostRight, x)
			const startY = clampCoordinate(y1, y, hostBottom, y)
			const endX = clampCoordinate(x2, x, hostRight, startX)
			const endY = clampCoordinate(y2, y, hostBottom, startY)
			const deltaX = endX - startX
			const deltaY = endY - startY
			const horizontalDirection = Math.abs(deltaX) >= minLineDimension ? deltaX : (direction?.x || 0)
			const verticalDirection = Math.abs(deltaY) >= minLineDimension ? deltaY : (direction?.y || 0)
			const lineW = Math.max(minLineDimension, Math.abs(deltaX))
			const lineH = Math.max(minLineDimension, Math.abs(deltaY))
			const lineX = Math.abs(deltaX) >= minLineDimension
				? Math.min(startX, endX, hostRight - lineW)
				: clampCoordinate(startX + (horizontalDirection < 0 ? -lineW : 0), x, hostRight - lineW, x)
			const lineY = Math.abs(deltaY) >= minLineDimension
				? Math.min(startY, endY, hostBottom - lineH)
				: clampCoordinate(startY + (verticalDirection < 0 ? -lineH : 0), y, hostBottom - lineH, y)
			this.addShape('line' as SHAPE_NAME, {
				x: lineX,
				y: lineY,
				w: lineW,
				h: lineH,
				flipH: horizontalDirection < 0,
				flipV: verticalDirection < 0,
				line: { color: '94A3B8', transparency: 20, width: 1.1, ...(options.line || {}), endArrowType: arrow ? 'triangle' : 'none' },
				objectName: `${objectName}-connector-${index + 1}`,
			})
		}
		const ellipseBoundaryPoint = (
			fromX: number,
			fromY: number,
			fromW: number,
			fromH: number,
			toX: number,
			toY: number,
		) => {
			const deltaX = toX - fromX
			const deltaY = toY - fromY
			const radiusX = Math.max(0.001, fromW / 2)
			const radiusY = Math.max(0.001, fromH / 2)
			const denominator = Math.sqrt((deltaX * deltaX) / (radiusX * radiusX) + (deltaY * deltaY) / (radiusY * radiusY))
			if (!Number.isFinite(denominator) || denominator <= 1) return { x: fromX, y: fromY }
			return { x: fromX + deltaX / denominator, y: fromY + deltaY / denominator }
		}

		if (layout === 'picture' || layout === 'team') {
			const cols = layout === 'team' ? Math.min(4, Math.max(1, Math.ceil(Math.sqrt(nodes.length)))) : 1
			const rows = Math.ceil(nodes.length / cols)
			const gap = 0.18
			const nodeW = (w - gap * (cols - 1)) / cols
			const nodeH = (workH - gap * (rows - 1)) / rows
			nodes.forEach((node, index) => {
				const nx = x + (index % cols) * (nodeW + gap)
				const ny = workY + Math.floor(index / cols) * (nodeH + gap)
				if (layout === 'team') {
					this.addShape('roundRect' as SHAPE_NAME, {
						x: nx,
						y: ny,
						w: nodeW,
						h: nodeH,
						fill: node.fill || options.fill || { color: '0F172A', transparency: 8 },
						line: node.line || defaultLine,
						shadow: options.shadow,
						objectName: `${objectName}-node-${index + 1}`,
					})
					const shapeObj = this._slideObjects[this._slideObjects.length - 1]
					animateNode(shapeObj)
					const picSize = Math.min(nodeW * 0.34, nodeH * 0.56)
					this.addShape('ellipse' as SHAPE_NAME, {
						x: nx + (nodeW - picSize) / 2,
						y: ny + 0.1,
						w: picSize,
						h: picSize,
						fill: node.fill || { color: node.color || colorFor(index) },
						line: node.line || defaultLine,
						objectName: `${objectName}-portrait-${index + 1}`,
					})
					this.addText(String(node.text || node.title || `Member ${index + 1}`), {
						x: nx + 0.1,
						y: ny + picSize + 0.2,
						w: Math.max(0.1, nodeW - 0.2),
						h: Math.max(0.12, nodeH - picSize - 0.25),
						fontFace,
						fontSize,
						bold: true,
						color: textColor,
						align: 'center',
						valign: 'middle',
						margin: 0.02,
						fit: 'shrink',
						objectName: `${objectName}-label-${index + 1}`,
					})
				} else {
					addPictureNode(node, index, nx, ny, nodeW, nodeH)
				}
			})
		} else if (layout === 'timeline') {
			const midY = workY + workH * 0.5
			addConnector(0, x, midY, x + w, midY, false)
			const gap = w / Math.max(nodes.length, 1)
			const nodeW = Math.min(2.2, gap * 0.8)
			const verticalCapacity = Math.max(0.1, workH / 2 - 0.22)
			const nodeH = Math.min(0.9, workH * 0.34, verticalCapacity)
			nodes.forEach((node, index) => {
				const cx = x + gap * index + gap / 2
				const ny = index % 2 === 0 ? midY - nodeH - 0.22 : midY + 0.22
				addConnector(index + 1, cx, midY, cx, ny + (index % 2 === 0 ? nodeH : 0), false)
				addNode(node, index, cx - nodeW / 2, ny, nodeW, nodeH)
			})
		} else if (layout === 'list') {
			const gap = Math.min(0.16, workH / Math.max(nodes.length, 1) * 0.12)
			const nodeH = (workH - gap * (nodes.length - 1)) / nodes.length
			nodes.forEach((node, index) => addNode(node, index, x, workY + index * (nodeH + gap), w, nodeH))
		} else if (layout === 'matrix') {
			const cols = Math.ceil(Math.sqrt(nodes.length))
			const rows = Math.ceil(nodes.length / cols)
			const gap = 0.12
			const nodeW = (w - gap * (cols - 1)) / cols
			const nodeH = (workH - gap * (rows - 1)) / rows
			nodes.forEach((node, index) => addNode(node, index, x + (index % cols) * (nodeW + gap), workY + Math.floor(index / cols) * (nodeH + gap), nodeW, nodeH, 'rect' as SHAPE_NAME))
		} else if (layout === 'hierarchy') {
			const root = nodes[0]
			const children = (root.children && root.children.length > 0 ? root.children.map(normalizeNode) : nodes.slice(1))
			const rootW = Math.min(w * 0.42, 3)
			const rootH = Math.min(0.72, workH * 0.3)
			const rootX = x + (w - rootW) / 2
			const rootY = workY
			addNode(root, 0, rootX, rootY, rootW, rootH)
			if (children.length > 0) {
				const gap = 0.16
				const childW = (w - gap * (children.length - 1)) / children.length
				const childH = Math.min(0.72, workH * 0.32)
				const childY = workY + workH - childH
				addConnector(0, x + w / 2, rootY + rootH, x + w / 2, childY - 0.08, false)
				children.forEach((child, index) => {
					const childX = x + index * (childW + gap)
					addConnector(index + 1, x + w / 2, childY - 0.08, childX + childW / 2, childY, true)
					addNode(child, index + 1, childX, childY, childW, childH)
				})
			}
		} else if (layout === 'cycle' || layout === 'relationship') {
			const cx = x + w / 2
			const cy = workY + workH / 2
			const nodeW = Math.min(1.4, w / 3)
			const nodeH = Math.min(0.68, workH / 3)
			const rx = Math.max(0.1, (w - nodeW) / 2)
			const ry = Math.max(0.1, (workH - nodeH) / 2)
			const start = layout === 'relationship' && nodes.length > 1 ? 1 : 0
			const positionedNodes: Array<{ node: SmartArtNode, index: number, x: number, y: number }> = []
			for (let i = start; i < nodes.length; i++) {
				const ordinal = i - start
				const count = Math.max(1, nodes.length - start)
				const angle = (-90 + (360 / count) * ordinal) * Math.PI / 180
				const nx = cx + Math.cos(angle) * rx - nodeW / 2
				const ny = cy + Math.sin(angle) * ry - nodeH / 2
				positionedNodes.push({ node: nodes[i], index: i, x: nx, y: ny })
			}
			if (layout === 'relationship') {
				positionedNodes.forEach(positioned => {
					const peerX = positioned.x + nodeW / 2
					const peerY = positioned.y + nodeH / 2
					const rootEdge = ellipseBoundaryPoint(cx, cy, nodeW, nodeH, peerX, peerY)
					const peerEdge = ellipseBoundaryPoint(peerX, peerY, nodeW, nodeH, cx, cy)
					addConnector(positioned.index, rootEdge.x, rootEdge.y, peerEdge.x, peerEdge.y, false, { x: peerX - cx, y: peerY - cy })
				})
				addNode(nodes[0], 0, cx - nodeW / 2, cy - nodeH / 2, nodeW, nodeH, 'ellipse' as SHAPE_NAME)
			}
			positionedNodes.forEach(positioned => addNode(positioned.node, positioned.index, positioned.x, positioned.y, nodeW, nodeH, 'ellipse' as SHAPE_NAME))
		} else if (layout === 'pyramid') {
			const gap = 0.08
			const nodeH = (workH - gap * (nodes.length - 1)) / nodes.length
			nodes.forEach((node, index) => {
				const ratio = (index + 1) / nodes.length
				const nodeW = Math.max(w * 0.25, w * ratio)
				addNode(node, index, x + (w - nodeW) / 2, workY + index * (nodeH + gap), nodeW, nodeH, 'trapezoid' as SHAPE_NAME)
			})
		} else {
			const gap = Math.min(0.18, w / Math.max(nodes.length, 1) * 0.08)
			const nodeW = (w - gap * (nodes.length - 1)) / nodes.length
			const nodeH = Math.min(workH, 0.9)
			const nodeY = workY + (workH - nodeH) / 2
			nodes.forEach((node, index) => addNode(node, index, x + index * (nodeW + gap), nodeY, nodeW, nodeH, nodes.length > 1 ? 'chevron' as SHAPE_NAME : 'roundRect' as SHAPE_NAME))
		}

		return this
	}

	/**
	 * Add table to Slide
	 * @param {TableRow[]} tableRows - table rows
	 * @param {TableProps} options - table options
	 * @return {Slide} this Slide
	 */
	addTable(tableRows: TableRow[], options?: TableProps): Slide {
		// FUTURE: we pass `this` - we dont need to pass layouts - they can be read from this!
		this._newAutoPagedSlides = genObj.addTableDefinition(this, tableRows, options, this._slideLayout, this._presLayout, this.addSlide, this.getSlide)
		// Register shape if it has a name (enables getShapeByName + addAnimation)
		const lastShape = this._slideObjects[this._slideObjects.length - 1]
		if (lastShape) this._registerShape(lastShape)
		return this
	}

	/**
	 * Add a native PowerPoint equation/math zone to Slide.
	 * @param {EquationProps} options - equation source, source format, and position options
	 * @return {Slide} this Slide
	 */
	addEquation(options: EquationProps): Slide {
		genObj.addEquationDefinition(this, options)
		const lastShape = this._slideObjects[this._slideObjects.length - 1]
		if (lastShape) this._registerShape(lastShape)
		return this
	}

	/**
	 * Add text to Slide
	 * @param {string|TextProps[]} text - text string or complex object
	 * @param {TextPropsOptions} options - text options
	 * @return {Slide} this Slide
	 */
	addText(text: string | TextProps[], options?: TextPropsOptions): Slide {
		// A hyperlink on the addText options targets the whole text box and is
		// serialized on p:cNvPr. Do not reuse that same options object as the
		// synthetic run, or the link is duplicated on a:rPr. Authors who need a
		// run hyperlink use the rich-text array form explicitly.
		const runOptions = options && Object.prototype.hasOwnProperty.call(options, 'hyperlink')
			? Object.fromEntries(Object.entries(options).filter(([key]) => key !== 'hyperlink')) as TextPropsOptions
			: options
		const textParam = typeof text === 'string' || typeof text === 'number' ? [{ text, options: runOptions }] : text
		genObj.addTextDefinition(this, textParam, options, false)
		// Register shape if it has a name
		const lastShape = this._slideObjects[this._slideObjects.length - 1]
		if (lastShape) this._registerShape(lastShape)
		return this
	}

	/**
	 * Add raw OOXML XML element (passthrough for unsupported elements)
	 * This allows injecting tables, charts, or other complex elements that aren't yet supported
	 * @param {string} xml - Raw OOXML XML string (e.g., <p:sp>...</p:sp>, <p:graphicFrame>...</p:graphicFrame>)
	 * @param {ObjectOptions} options - Optional metadata and positioning hints for tooling.
	 * @return {Slide} this Slide
	 * @since v4.0.0
	 * @example
	 * const tableXml = fs.readFileSync('./passthrough/table.xml', 'utf-8')
	 * slide.addPassthroughXml(tableXml)
	 */
	addPassthroughXml(xml: string, options: Partial<ObjectOptions> = {}): Slide {
		// Preserve the original shape ID from the passthrough XML.
		// Reassigning a sequential ID would break animation targets in _rawTimingXml
		// which reference shapes by their original spid values.
		// The original IDs from the source PPTX must be preserved exactly.
		// Strip XML declaration (<?xml ...?>) if present - it cannot appear inside a document.
		const updatedXml = xml.replace(/^<\?xml[^?]*\?>\s*/i, '')
		
		// Create a passthrough object that will be serialized as-is during XML generation
		const passthroughObj: ISlideObject = {
			type: 'passthrough',
			_type: SLIDE_OBJECT_TYPES.passthrough,
			options: { ...options } as ObjectOptions,
			passthrough: {
				xml: updatedXml
			}
		}
		this._slideObjects.push(passthroughObj)
		return this
	}

	/**
	 * Add animation to a shape on this Slide
	 * This method allows adding animations independently of shape creation,
	 * giving users full control over animation order.
	 * @param {ISlideObject} target - the shape object to animate (returned from addText, addShape, etc.)
	 * @param {AnimationProps} animation - animation properties
	 * @return {Slide} this Slide
	 * @example
	 * // Create shapes first
	 * const shape1 = slide.addShape(pptx.ShapeType.rect, { x: 1, y: 1, w: 2, h: 2 });
	 * const shape2 = slide.addShape(pptx.ShapeType.rect, { x: 4, y: 1, w: 2, h: 2 });
	 * // Add animations in desired order (shape2 animates first)
	 * slide.addAnimation(shape2, { type: 'entrance', effect: 'fade' });
	 * slide.addAnimation(shape1, { type: 'entrance', effect: 'fade' });
	 */
	addAnimation(target: ISlideObject | string, animation: AnimationProps): Slide {
		// ========================================================================
		// SMART SHAPE RESOLUTION
		// ========================================================================
		// If target is a string, try to resolve it as a shape name
		// This allows both: addAnimation(shapeObject, ...) and addAnimation('shapeName', ...)
		let resolvedTarget: ISlideObject | undefined
		const descendants = nativeGroupIdentityPlan(this).targets
		
		if (typeof target === 'string') {
			// User passed a shape name - look it up automatically
			const matches = this._slideObjects.filter(object => object.options?.objectName === target)
			matches.push(...descendants.filter(entry => entry.name === target).map(entry => entry.target))
			if (matches.length > 1) throw new Error(`Animation target name "${target}" is ambiguous; give each explicitly targeted object a unique name.`)
			resolvedTarget = matches[0]
			if (!resolvedTarget) {
				console.error(`addAnimation: Shape with name "${target}" not found on this slide.`)
				console.error(`Available shape names: ${this.getShapeNames().join(', ') || '(none)'}`)
				console.error(`Tip: Make sure the shape has an 'objectName' property when created.`)
				return this
			}
		} else {
			// User passed a shape object - verify it exists on this slide
			resolvedTarget = target
		}
		
		// Find the shape's index to get its SPID
		const shapeIndex = this._slideObjects.indexOf(resolvedTarget)
		const descendant = descendants.find(entry => entry.target === resolvedTarget)
		if (descendant) {
			assertNativeDescendantAnimationInspectable(this)
			if (animation.spid !== undefined) throw new Error('A named descendant animation cannot override its native shape identity.')
		}
		if (shapeIndex === -1 && !descendant) {
			// Better error message with helpful suggestions
			console.error('addAnimation: Target shape not found on this slide.')
			console.error('Possible causes:')
			console.error('  1. Shape was created on a different slide')
			console.error('  2. Shape object reference is invalid')
			console.error('  3. Shape was not returned from add* method')
			console.error('\nSuggestion: Use named shapes instead:')
			console.error('  slide.addText("Hello", { objectName: "myText", ... })')
			console.error('  slide.addAnimation("myText", { ... })  // Pass name as string')
			return this
		}
		
		// Calculate SPID - priority order:
		// 1. Explicit spid on animation props (manual override)
		// 2. Passthrough shape's original spid (from source PPTX - must be preserved)
		// 3. Non-passthrough shape with explicit spid option
		// 4. Sequential ID based on position (fallback)
		let shapeId: number
		if (descendant) {
			// This is provisional. Serialization resolves the same object identity
			// again after every later object/group addition.
			shapeId = descendant.shapeId
		} else if (animation.spid !== undefined) {
			shapeId = animation.spid
		} else if (resolvedTarget.options?.spid !== undefined) {
			// Shape has an explicit spid (e.g. from decypher tool preserving original PPTX spids)
			shapeId = resolvedTarget.options.spid as number
		} else {
			shapeId = shapeIndex + 2
		}
		
		// Properly count paragraphs using the same logic as inline animation
		let paragraphCount = 1
		if (resolvedTarget.text && Array.isArray(resolvedTarget.text)) {
			paragraphCount = countParagraphs(resolvedTarget.text as TextProps[])
		}
		
		// Add the animation (signature: slide, target, shapeId, animation, paragraphCount)
		addAnimationInternal(this as unknown as PresSlide, resolvedTarget, shapeId, animation, paragraphCount)
		return this
	}

	/**
	 * Add a group of animations that play together under a single click.
	 * This consolidates multiple animations into one click group, reducing
	 * the number of required clicks and matching PowerPoint's native behavior.
	 * 
	 * @param {Array<{target: ISlideObject, animation: AnimationProps}>} animations - array of animation configs
	 * @return {Slide} this Slide
	 * @example
	 * // Create shapes
	 * const shape1 = slide.addShape('rect', { x: 1, y: 1, w: 2, h: 2 });
	 * const shape2 = slide.addShape('rect', { x: 4, y: 1, w: 2, h: 2 });
	 * const shape3 = slide.addShape('rect', { x: 7, y: 1, w: 2, h: 2 });
	 * 
	 * // Group animations - ONE click triggers all three
	 * slide.addAnimationGroup([
	 *   { target: shape1, animation: { type: 'entrance', effect: 'fade' } },
	 *   { target: shape2, animation: { type: 'entrance', effect: 'fade', trigger: 'withPrevious' } },
	 *   { target: shape3, animation: { type: 'entrance', effect: 'fade', trigger: 'afterPrevious' } }
	 * ]);
	 * 
	 * @description
	 * Trigger behaviors within a group:
	 * - First animation: Always treated as 'onClick' (starts the group)
	 * - 'withPrevious': Plays simultaneously with the previous animation
	 * - 'afterPrevious': Plays after the previous animation completes
	 * 
	 * This generates more compact XML with fewer click groups, matching
	 * how PowerPoint natively structures grouped animations.
	 */
	addAnimationGroup(animations: Array<{ target: ISlideObject | string; animation: AnimationProps }>): Slide {
		if (!animations || animations.length === 0) {
			return this
		}

		// Process each animation in the group
		animations.forEach((item, index) => {
			const { target, animation } = item
			
			// Resolve target if it's a string (same logic as addAnimation)
			let resolvedTarget: ISlideObject | undefined
			if (typeof target === 'string') {
				resolvedTarget = this.getShapeByName(target)
				if (!resolvedTarget) {
					console.warn(`addAnimationGroup: Shape "${target}" at index ${index} not found on this slide`)
					return
				}
			} else {
				resolvedTarget = target
			}
			
			// Find the shape's index to get its SPID
			const shapeIndex = this._slideObjects.indexOf(resolvedTarget)
			if (shapeIndex === -1) {
				console.warn(`addAnimationGroup: target shape at index ${index} not found on this slide`)
				return
			}
			
			// Calculate SPID - use explicit spid from animation props if provided
			const shapeId = animation.spid !== undefined ? animation.spid : shapeIndex + 2
			
			// Properly count paragraphs using the same logic as inline animation
			let paragraphCount = 1
			if (resolvedTarget.text && Array.isArray(resolvedTarget.text)) {
				paragraphCount = countParagraphs(resolvedTarget.text as TextProps[])
			}
			
			// For the first animation in the group, force 'onClick' trigger
			// For subsequent animations, use their specified trigger or default to 'afterPrevious'
			const effectiveAnimation = { ...animation }
			if (index === 0) {
				effectiveAnimation.trigger = 'onClick'
			} else if (!effectiveAnimation.trigger) {
				// Default to afterPrevious for non-first animations if not specified
				effectiveAnimation.trigger = 'afterPrevious'
			}
			
			// Add the animation
			addAnimationInternal(this as unknown as PresSlide, resolvedTarget, shapeId, effectiveAnimation, paragraphCount)
		})

		return this
	}

	/**
	 * Set raw timing XML for passthrough (for slides with unsupported animations)
	 * When set, this XML is used directly instead of generating animations
	 * @param xml - Complete <p:timing>...</p:timing> block from reference PPTX
	 * @since v4.0.0
	 * @private
	 */
	setRawTimingXml(xml: string): Slide {
		;(this as unknown as PresSlide)._rawTimingXml = xml
		return this
	}
}
