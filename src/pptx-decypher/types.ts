/**
 * PptxDecypher Type Definitions
 */

// ============================================================
// OPTIONS & RESULTS
// ============================================================

export interface DecypherOptions {
	/** Output directory for decyphered files (default: './decyphered') */
	outputDir?: string
	/** Whether to extract raw XML for debugging (default: true) */
	extractXml?: boolean
	/** Whether to extract media assets (default: true) */
	extractMedia?: boolean
	/** Whether to run validation after generation (default: true) */
	validate?: boolean
}

export interface DecypherResult {
	/** Success status */
	success: boolean
	/** Unique signature hash of the PPTX */
	signature: string
	/** Path to the generated .mjs file */
	generatorPath: string
	/** Path to the output folder */
	outputFolder: string
	/** Statistics about the decyphering process */
	stats: DecypherStats
	/** Any warnings or passthrough items */
	warnings: DecypherWarning[]
	/** Errors if any */
	errors: string[]
}

export interface DecypherStats {
	slideCount: number
	shapeCount: number
	animationCount: number
	mediaCount: number
	passthroughCount: number
}

export interface DecypherWarning {
	type: 'passthrough' | 'unsupported' | 'approximation'
	location: string  // e.g., "slide3.shape5"
	message: string
	details?: string
}

// ============================================================
// PRESENTATION MODEL
// ============================================================

export interface PresentationModel {
	metadata: PresentationMetadata
	slides: SlideModel[]
	media: MediaAsset[]
	theme?: ThemeModel
}

export interface PresentationMetadata {
	title?: string
	subject?: string
	author?: string
	company?: string
	revision?: number
	layout: { width: number; height: number }  // in inches
}

export interface SlideModel {
	index: number
	name?: string
	background?: BackgroundModel
	shapes: ShapeModel[]
	animations: AnimationModel[]
	transition?: TransitionModel
	notes?: string
}

export interface BackgroundModel {
	type: 'solid' | 'gradient' | 'image' | 'pattern'
	color?: string
	gradient?: GradientModel
	imagePath?: string
}

export interface GradientModel {
	type: 'linear' | 'radial'
	angle?: number
	stops: { position: number; color: string }[]
}

// ============================================================
// SHAPE MODEL
// ============================================================

export interface ShapeModel {
	/** Unique identifier within the slide */
	id: number
	/** Shape name (from PPTX) */
	name: string
	/** Shape type */
	type: ShapeType
	/** Position and size in inches */
	x: number
	y: number
	w: number
	h: number
	/** Rotation in degrees */
	rotation?: number
	/** Shape-specific options */
	options: ShapeOptions
	/** For text shapes */
	text?: TextModel
	/** For image shapes */
	imagePath?: string
	/** For media shapes (video/audio) */
	mediaPath?: string
	mediaType?: 'video' | 'audio'
	/** For table shapes */
	tableData?: TableModel
	/** For chart shapes */
	chartData?: ChartModel
	/** For passthrough (unsupported) shapes */
	passthrough?: PassthroughModel
	/** Stable edit handle and AI-facing mutation contract */
	edit?: ShapeEditHandle
}

export type ShapeType =
	| 'text'
	| 'shape'
	| 'image'
	| 'table'
	| 'chart'
	| 'smartArt'
	| 'media'
	| 'group'
	| '__passthrough__'

export interface ShapeOptions {
	// Fill
	fill?: FillModel
	// Border/Line
	line?: LineModel
	// Shadow
	shadow?: ShadowModel
	// 3D effects
	effect3D?: Effect3DModel
	// Other effects
	glow?: GlowModel
	softEdge?: { size: number }
	reflection?: ReflectionModel
	// Shape-specific
	shapeType?: string  // PptxGenJS shape type name
	hyperlink?: HyperlinkModel
	// Geometry adjustments
	adjustments?: number[]
}

// ============================================================
// EDITABILITY MODEL
// ============================================================

export type EditabilityTier =
	| 'semantic'
	| 'promotable'
	| 'wrapper-editable'
	| 'preserve-only'

export interface ShapeEditabilityModel {
	/** How deep the MCP can safely mutate this object */
	tier: EditabilityTier
	/** True when object-specific mutation tools can update content/structure */
	semantic: boolean
	/** Token-friendly tool names the AI client should try first */
	tools: string[]
	/** Supported operation classes, e.g. text, data, style, geometry */
	operations: string[]
	/** Short user/AI-readable explanation */
	note: string
	/** Optional limitations to avoid repair-prone edits */
	limitations?: string[]
	/** Optional generator primitive for recreate-as-structured fallback */
	recreateWith?: string
}

export interface ShapeEditHandle {
	/** Stable opaque identifier derived from source slide/object identity */
	id: string
	/** Decypher/source provenance useful for edit routing */
	source: {
		kind: 'decypher'
		slideNumber: number
		shapeIndex: number
		shapeId: number
		objectName: string
		ooxmlType?: string
	}
	/** Preferred selectors in order of stability */
	stableSelectors: string[]
	/** Editability contract for this object */
	editability: ShapeEditabilityModel
}

export interface FillModel {
	type: 'solid' | 'gradient' | 'pattern' | 'picture' | 'none'
	color?: string
	transparency?: number
	gradient?: GradientModel
	patternType?: string
	imagePath?: string
}

export interface LineModel {
	color?: string
	width?: number  // in points
	dashType?: string
	transparency?: number
	compoundType?: string
	capType?: string
	joinType?: string
}

export interface ShadowModel {
	type: 'outer' | 'inner'
	color?: string
	blur?: number
	offset?: number
	angle?: number
	opacity?: number  // 0-1 scale (0 = fully transparent, 1 = fully opaque)
}

export interface GlowModel {
	color?: string
	size?: number
	transparency?: number
	opacity?: number  // Alternative to transparency (0-1 scale)
}

export interface ReflectionModel {
	blur?: number
	offset?: number
	transparency?: number
}

export interface Effect3DModel {
	/** Top bevel settings */
	bevel?: { type: string; width: number; height: number }
	/** Bottom bevel settings */
	bevelBottom?: { type: string; width: number; height: number }
	/** Extrusion/depth (points) */
	extrusion?: number
	/** Extrusion color (hex) */
	extrusionColor?: string
	/** Contour width (points) */
	contourWidth?: number
	/** Contour color (hex) */
	contourColor?: string
	/** Material/surface type */
	material?: string
	/** Lighting rig type */
	lightRig?: string
	/** Light direction/rotation (degrees) */
	lightDirection?: number
	/** X-axis rotation (degrees) */
	rotationX?: number
	/** Y-axis rotation (degrees) */
	rotationY?: number
	/** Z-axis rotation (degrees) */
	rotationZ?: number
	/** Perspective field of view (degrees) */
	perspective?: number
}

export interface HyperlinkModel {
	url?: string
	slide?: number
	tooltip?: string
}

// ============================================================
// TEXT MODEL
// ============================================================

export interface TextModel {
	paragraphs: ParagraphModel[]
	bodyProperties?: TextBodyProperties
}

export interface TextBodyProperties {
	anchor?: 'top' | 'middle' | 'bottom'
	anchorCtr?: boolean
	wrap?: 'square' | 'none'
	lIns?: number  // left inset in inches
	rIns?: number  // right inset
	tIns?: number  // top inset
	bIns?: number  // bottom inset
	autoFit?: 'none' | 'shrink' | 'resize'
	rotation?: number
	verticalText?: boolean
	// WordArt/text effects
	textShadow?: ShadowModel
	textGlow?: GlowModel
	textReflection?: ReflectionModel
	text3D?: Text3DModel
}

export interface Text3DModel {
	bevel?: { type: string; width: number; height: number }
	depth?: number
	contour?: { color: string; width: number }
	material?: string
}

export interface ParagraphModel {
	runs: TextRunModel[]
	properties?: ParagraphProperties
}

export interface ParagraphProperties {
	align?: 'left' | 'center' | 'right' | 'justify'
	indent?: number
	level?: number  // bullet level
	lineSpacing?: number
	spaceBefore?: number
	spaceAfter?: number
	bullet?: BulletModel
}

export interface BulletModel {
	type: 'bullet' | 'number' | 'none'
	character?: string
	startAt?: number
	color?: string
	size?: number
}

export interface TextRunModel {
	text: string
	properties?: TextRunProperties
}

export interface TextRunProperties {
	fontSize?: number  // in points
	fontFace?: string
	bold?: boolean
	italic?: boolean
	underline?: boolean | { style: string }
	strike?: boolean | 'single' | 'double'
	color?: string
	highlight?: string
	subscript?: boolean
	superscript?: boolean
	charSpacing?: number
	baseline?: number
	// Soft line break (like Shift+Enter in PowerPoint)
	softBreakBefore?: boolean
	// Text effects
	shadow?: ShadowModel
	glow?: GlowModel
	outline?: LineModel
}

// ============================================================
// TABLE MODEL
// ============================================================

export interface TableModel {
	rows: TableRowModel[]
	options?: TableOptions
}

export interface TableRowModel {
	cells: TableCellModel[]
	height?: number
}

export interface TableCellModel {
	text?: TextModel
	fill?: FillModel
	border?: TableBorderModel
	colspan?: number
	rowspan?: number
	margin?: { left?: number; right?: number; top?: number; bottom?: number }
	valign?: 'top' | 'middle' | 'bottom'
}

export interface TableBorderModel {
	left?: LineModel
	right?: LineModel
	top?: LineModel
	bottom?: LineModel
}

export interface TableOptions {
	colWidths?: number[]
	rowHeights?: number[]
}

// ============================================================
// CHART MODEL
// ============================================================

export interface ChartModel {
	type: string
	data: ChartDataModel[]
	options?: ChartOptions
}

export interface ChartDataModel {
	name: string
	labels: string[]
	values: number[]
}

export interface ChartOptions {
	// Placeholder - charts are complex
	[key: string]: unknown
}

// ============================================================
// ANIMATION MODEL
// ============================================================

export interface AnimationModel {
	/** Target shape name */
	target: string
	/** Target shape ID */
	targetId?: number
	/** Animation type */
	type: 'entrance' | 'exit' | 'emphasis' | 'motion' | 'media' | '__passthrough__'
	/** Effect name (PptxGenJS effect name) */
	effect?: string
	/** Preset ID from OOXML */
	presetId?: number
	/** Preset subtype */
	presetSubtype?: number
	/** Sequence mode */
	sequence?: 'asOneObject' | 'byParagraph' | 'allAtOnce'
	/** Duration in milliseconds */
	duration?: number
	/** Delay in milliseconds */
	delay?: number
	/** Direction */
	direction?: string
	/** Trigger type */
	trigger?: 'onClick' | 'afterPrevious' | 'withPrevious'
	/** For media animations: media command (e.g., 'playFrom(3.8)', 'stop', 'togglePause') */
	mediaCommand?: string
	/** For motion path animations: named path (e.g., 'circlePath', 'heart') */
	motionPath?: string
	/** For motion path animations: raw SVG path data from <p:animMotion> */
	motionPathData?: string
	/** For emphasis animations: target color from <p:to> */
	emphasisColor?: string
	/** For emphasis animations: scale factor from <p:by> (e.g., 1.5 = 150%) */
	emphasisScale?: number
	/** For emphasis animations: raw <p:to> value */
	emphasisTo?: string
	/** For emphasis animations: raw <p:by> value */
	emphasisBy?: string
	/** For passthrough animations */
	passthrough?: PassthroughModel
}

// ============================================================
// TRANSITION MODEL
// ============================================================

export interface TransitionModel {
	type: string
	speed?: 'slow' | 'medium' | 'fast'
	direction?: string
	advanceOnClick?: boolean
	advanceAfter?: number  // milliseconds
}

// ============================================================
// MEDIA MODEL
// ============================================================

export interface MediaAsset {
	id: string
	type: 'image' | 'video' | 'audio'
	originalName: string
	extractedPath: string
	mimeType: string
	relationshipId: string
}

// ============================================================
// THEME MODEL
// ============================================================

export interface ThemeModel {
	colors: { [key: string]: string }
	fonts: {
		major: string
		minor: string
	}
}

// ============================================================
// PASSTHROUGH MODEL
// ============================================================

export interface PassthroughModel {
	/** Reason why this element is passthrough */
	reason: string
	/** Path to the raw XML file */
	sourceXmlPath: string
	/** Original element type from OOXML */
	originalType: string
	/** Any extracted metadata */
	metadata?: { [key: string]: unknown }
}
