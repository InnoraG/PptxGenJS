/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * PptxGenJS Interfaces
 */

import { CHART_NAME, PLACEHOLDER_TYPE, SHAPE_NAME, SLIDE_OBJECT_TYPES, TEXT_HALIGN, TEXT_VALIGN, WRITE_OUTPUT_TYPE } from './core-enums'

// Core Types
// ==========

/**
 * Coordinate number - either:
 * - Inches (0-n)
 * - Percentage (0-100)
 *
 * @example 10.25 // coordinate in inches
 * @example '75%' // coordinate as percentage of slide size
 */
export type Coord = number | `${number}%`
export interface PositionProps {
	/**
	 * Horizontal position
	 * - inches or percentage
	 * @example 10.25 // position in inches
	 * @example '75%' // position as percentage of slide size
	 */
	x?: Coord
	/**
	 * Vertical position
	 * - inches or percentage
	 * @example 10.25 // position in inches
	 * @example '75%' // position as percentage of slide size
	 */
	y?: Coord
	/**
	 * Height
	 * - inches or percentage
	 * @example 10.25 // height in inches
	 * @example '75%' // height as percentage of slide size
	 */
	h?: Coord
	/**
	 * Width
	 * - inches or percentage
	 * @example 10.25 // width in inches
	 * @example '75%' // width as percentage of slide size
	 */
	w?: Coord
}
/**
 * Either `data` or `path` is required
 */
export interface DataOrPathProps {
	/**
	 * URL or relative path
	 *
	 * @example 'https://onedrives.com/myimg.png` // retrieve image via URL
	 * @example '/home/gitbrent/images/myimg.png` // retrieve image via local path
	 */
	path?: string
	/**
	 * base64-encoded string
	 * - Useful for avoiding potential path/server issues
	 *
	 * @example 'image/png;base64,iVtDafDrBF[...]=' // pre-encoded image in base-64
	 */
	data?: string
}
export interface BackgroundProps extends DataOrPathProps, ShapeFillProps {
	/**
	 * Color (hex format)
	 * @deprecated v3.6.0 - use `ShapeFillProps` instead
	 */
	fill?: HexColor

	/**
	 * source URL
	 * @deprecated v3.6.0 - use `DataOrPathProps` instead - remove in v4.0.0
	 */
	src?: string
}
/**
 * Color in Hex format
 * @example 'FF3399'
 */
export type HexColor = string
export type ThemeColor =
	| 'tx1' | 'tx2' | 'bg1' | 'bg2'
	| 'dk1' | 'lt1' | 'dk2' | 'lt2'
	| 'accent1' | 'accent2' | 'accent3' | 'accent4' | 'accent5' | 'accent6'
	| 'hlink' | 'folHlink' | 'phClr'
export type Color = HexColor | ThemeColor

/** A color endpoint used by native picture duotone/recolor mappings. */
export interface PictureColorEndpoint {
	/** Hex, theme, or preset color name. */
	color?: Color
	/** Theme color alias, such as accent4. */
	scheme?: ThemeColor
	/** PowerPoint preset color name, such as black or white. */
	preset?: string
	/** Tint amount, normalized from 0 to 1. */
	tint?: number
	/** Shade amount, normalized from 0 to 1. */
	shade?: number
	/** Saturation multiplier from 0 to 4. */
	saturation?: number
	/** Opacity from 0 to 1. */
	opacity?: number
}
export type Margin = number | [number, number, number, number]
export type HAlign = 'left' | 'center' | 'right' | 'justify'
export type VAlign = 'top' | 'middle' | 'bottom'

// used by charts, shape, text
export interface BorderProps {
	/**
	 * Border type
	 * @default solid
	 */
	type?: 'none' | 'dash' | 'solid'
	/**
	 * Border color (hex)
	 * @example 'FF3399'
	 * @default '666666'
	 */
	color?: HexColor

	// TODO: add `transparency` prop to Borders (0-100%)

	// TODO: add `width` - deprecate `pt`
	/**
	 * Border size (points)
	 * @default 1
	 */
	pt?: number
}
// used by: image, object, text,
export interface HyperlinkProps {
	_rId: number
	/**
	 * Slide number to link to
	 */
	slide?: number
	/**
	 * Url to link to
	 */
	url?: string
	/**
	 * Hyperlink Tooltip
	 */
	tooltip?: string
	/**
	 * Native target frame for an external URL hyperlink (for example `_blank`).
	 * Not valid for internal slide hyperlinks.
	 */
	target?: string
}

/** Embedded WAV payload played by a PowerPoint click/hover action. */
export interface InteractiveActionSoundProps {
	source: string
	format: 'wav'
	name?: string
	/** @internal Slide relationship allocated immediately before package encoding. */
	_soundRid?: number
}

/** Closed, repair-safe PowerPoint Action Settings endpoint. */
export interface InteractiveActionEndpointProps {
	type: 'url' | 'slide' | 'jump' | 'endShow' | 'customShow' | 'none'
	url?: string
	targetSlideId?: string
	/** One-based slide number resolved by the semantic compiler. */
	targetSlide?: number
	jump?: 'firstSlide' | 'lastSlide' | 'lastSlideViewed' | 'nextSlide' | 'previousSlide'
	customShow?: string
	customShowId?: number
	showAndReturn?: true
	tooltip?: string | null
	history?: boolean | null
	highlightClick?: boolean | null
	endSound?: boolean | null
	sound?: InteractiveActionSoundProps | null
	/** @internal URL/slide relationship allocated immediately before package encoding. */
	_rId?: number
}

/** Independent click and hover action settings attached to one native object carrier. */
export interface InteractiveActionSetProps {
	click?: InteractiveActionEndpointProps | null
	hover?: InteractiveActionEndpointProps | null
}

/** Presentation-level custom show using zero-based slide indexes at runtime. */
export interface CustomShowProps {
	name: string
	id: number
	slides?: string[]
	slideIndexes: number[]
}
// used by: chart, text, image
export interface ShadowProps {
	/**
	 * shadow type
	 * @default 'none'
	 */
	type: 'outer' | 'inner' | 'none'
	/**
	 * opacity (percent)
	 * - range: 0.0-1.0
	 * @example 0.5 // 50% opaque
	 */
	opacity?: number // TODO: "Transparency (0-100%)" in PPT // TODO: deprecate and add `transparency`
	/**
	 * blur (points)
	 * - range: 0-100
	 * @default 0
	 */
	blur?: number
	/**
	 * angle (degrees)
	 * - range: 0-359
	 * @default 0
	 */
	angle?: number
	/**
	 * shadow offset (points)
	 * - range: 0-200
	 * @default 0
	 */
	offset?: number // TODO: "Distance" in PPT
	/**
	 * shadow color (hex format)
	 * @example 'FF3399'
	 */
	color?: HexColor
	/**
	 * whether to rotate shadow with shape
	 * @default false
	 */
	rotateWithShape?: boolean
	/**
	 * Horizontal scale of the shadow (1 = 100%)
	 * @default 1
	 */
	scaleX?: number
	/**
	 * Vertical scale of the shadow (1 = 100%)
	 * @default 1
	 */
	scaleY?: number
	/**
	 * Horizontal skew in degrees
	 * @default 0
	 */
	skewX?: number
	/**
	 * Vertical skew in degrees
	 * @default 0
	 */
	skewY?: number
}

// ============================================================================
// GRADIENT FILL TYPES
// ============================================================================

/**
 * Gradient stop definition - defines a color at a position in the gradient
 * @example { position: 0, color: 'FF0000' }  // Red at start
 * @example { position: 100, color: '0000FF', transparency: 50 }  // 50% transparent blue at end
 */
export interface GradientStopProps {
	/**
	 * Position of the gradient stop (0-100)
	 * - 0 = start of gradient
	 * - 100 = end of gradient
	 */
	position?: number
	/**
	 * Alias accepted by MCP/web clients for `position`.
	 */
	pos?: number
	/**
	 * Stop color. A structured colour object keeps the complete DrawingML
	 * transform chain editable instead of collapsing the stop to a preset.
	 * - `HexColor`, `ThemeColor`, or `PictureStyleColorProps`
	 * @example 'FF0000' // hex color (red)
	 * @example { color: 'accent1', tint: 0.2, luminance: 1.1 }
	 */
	color: Color | PictureStyleColorProps
	/**
	 * Stop transparency (0-100)
	 * @default 0
	 */
	transparency?: number
}

/**
 * Gradient direction/path types (matches PowerPoint)
 * - 'linear': Linear gradient at specified angle
 * - 'circle': Circular radial gradient (path)
 * - 'rect': Rectangular path gradient
 * - 'shape': Follows shape contour
 */
export type GradientDirection = 'linear' | 'circle' | 'rect' | 'shape'

/**
 * Gradient flip modes for tiling
 * - 'none': No flip
 * - 'x': Flip horizontally
 * - 'y': Flip vertically
 * - 'xy': Flip both
 */
export type GradientFlip = 'none' | 'x' | 'y' | 'xy'

/**
 * PowerPoint preset gradient names
 * These use the theme's accent colors
 */
export type GradientPreset =
	| 'lightGradient-accent1' | 'lightGradient-accent2' | 'lightGradient-accent3'
	| 'lightGradient-accent4' | 'lightGradient-accent5' | 'lightGradient-accent6'
	| 'topSpotlight-accent1' | 'topSpotlight-accent2' | 'topSpotlight-accent3'
	| 'topSpotlight-accent4' | 'topSpotlight-accent5' | 'topSpotlight-accent6'
	| 'bottomSpotlight-accent1' | 'bottomSpotlight-accent2' | 'bottomSpotlight-accent3'
	| 'bottomSpotlight-accent4' | 'bottomSpotlight-accent5' | 'bottomSpotlight-accent6'

/**
 * Rectangle definition for gradient positioning (l,t,r,b as percentages 0-100)
 */
export interface GradientRectProps {
	/** Left offset (0-100) */
	l?: number
	/** Top offset (0-100) */
	t?: number
	/** Right offset (0-100) */
	r?: number
	/** Bottom offset (0-100) */
	b?: number
}

/** Native glyph fill. Unlike a panel fill, this never accepts image payloads. */
export interface TextFillProps {
	type?: 'solid' | 'none' | 'gradient'
	color?: Color | null
	transparency?: number | null
	gradientDirection?: GradientDirection | null
	gradientAngle?: number | null
	gradientStops?: GradientStopProps[]
	rotateGradientWithShape?: boolean | null
	gradientFlip?: 'none' | 'x' | 'y' | 'xy' | null
	fillToRect?: GradientRectProps | null
	tileRect?: GradientRectProps | null
}

// used by: shape, table, text
export interface ShapeFillProps {
	/**
	 * Fill color
	 * - `HexColor` or `ThemeColor`
	 * @example 'FF0000' // hex color (red)
	 * @example pptx.SchemeColor.text1 // Theme color (Text1)
	 */
	color?: Color
	/**
	 * Transparency (percent)
	 * - MS-PPT > Format Shape > Fill & Line > Fill > Transparency
	 * - range: 0-100
	 * @default 0
	 */
	transparency?: number
	/**
	 * Fill type
	 * @default 'solid'
	 */
	type?: 'none' | 'solid' | 'gradient' | 'pattern' | 'texture' | 'picture'

	// ========== GRADIENT PROPERTIES ==========

	/**
	 * Gradient direction/path type
	 * - 'linear': Linear gradient at angle
	 * - 'circle': Circular radial gradient
	 * - 'rect': Rectangular path gradient
	 * - 'shape': Follows shape contour
	 * @default 'linear'
	 */
	gradientDirection?: GradientDirection
	/**
	 * Gradient stops - defines colors and positions
	 * Required when type is 'gradient'
	 * @example [{ position: 0, color: 'FF0000' }, { position: 100, color: '0000FF' }]
	 */
	gradientStops?: GradientStopProps[]
	/**
	 * Angle in degrees for linear gradients
	 * - PowerPoint convention: 0° = left-to-right
	 * - 90° = top-to-bottom
	 * - 180° = right-to-left
	 * - 270° = bottom-to-top
	 * @default 0
	 */
	gradientAngle?: number
	/**
	 * Use a preset gradient instead of custom stops
	 */
	gradientPreset?: GradientPreset
	/**
	 * Whether to rotate gradient with shape
	 * @default true
	 */
	rotateGradientWithShape?: boolean
	/**
	 * Flip mode for gradient tiling
	 * @default 'none'
	 */
	gradientFlip?: GradientFlip
	/**
	 * Fill-to-rect for path gradients (center point)
	 * - Defines the focus rectangle for path gradients
	 */
	fillToRect?: GradientRectProps
	/**
	 * Tile rect for gradient tiling
	 * - Defines the rectangular region to tile
	 */
	tileRect?: GradientRectProps

	/**
	 * Native pattern fill
	 */
	pattern?: {
		preset?: string
		foreground?: Color
		background?: Color
	}

	/**
	 * Picture or generated texture fill. `type` should be `texture` or `picture`.
	 * Placement maps to DrawingML `a:tile` / `a:stretch`. The image is stored as a media part.
	 */
	texture?: {
		data?: string
		path?: string
		asset?: string
		tile?: boolean
		scaleX?: number
		scaleY?: number
		offsetX?: number
		offsetY?: number
		alignment?: string
		flip?: string
		rotateWithShape?: boolean
		transparency?: number
		placement?: {
			mode?: 'tile' | 'stretch'
			scaleX?: number
			scaleY?: number
			offsetX?: number
			offsetY?: number
			alignment?: string
			flip?: string
			rotateWithShape?: boolean
		}
		source?: {
			kind?: 'asset' | 'nativePreset' | 'generated'
			asset?: string
			presetId?: string
			recipe?: Record<string, unknown>
		}
	}

	/** Stretch-to-shape picture fill. Same media embedding as `texture`. */
	picture?: {
		data?: string
		path?: string
	}

	/** Assigned during serialization: relationship id of the texture/picture blip. */
	_blipRid?: number

	/**
	 * Transparency (percent)
	 * @deprecated v3.3.0 - use `transparency`
	 */
	alpha?: number
}

export interface ShapeLineProps extends ShapeFillProps {
	/**
	 * Line width (pt)
	 * @default 1
	 */
	width?: number
	/**
	 * Native line endpoint cap. Rounded caps also round the ends of open freeforms.
	 * Omitted caps preserve the existing flat/default behavior.
	 */
	cap?: 'flat' | 'round' | 'square'
	/**
	 * Dash type
	 * @default 'solid'
	 */
	dashType?: 'solid' | 'dash' | 'dashDot' | 'lgDash' | 'lgDashDot' | 'lgDashDotDot' | 'sysDash' | 'sysDot'
	/**
	 * Begin arrow type
	 * @since v3.3.0
	 */
	beginArrowType?: 'none' | 'arrow' | 'diamond' | 'oval' | 'stealth' | 'triangle'
	/**
	 * End arrow type
	 * @since v3.3.0
	 */
	endArrowType?: 'none' | 'arrow' | 'diamond' | 'oval' | 'stealth' | 'triangle'
	/**
	 * Begin arrowhead width. PowerPoint exposes the small/medium/large
	 * arrow-size grid independently from the arrowhead type.
	 */
	beginArrowWidth?: 'sm' | 'med' | 'lg'
	/**
	 * Begin arrowhead length. PowerPoint exposes the small/medium/large
	 * arrow-size grid independently from the arrowhead type.
	 */
	beginArrowLength?: 'sm' | 'med' | 'lg'
	/** End arrowhead width from the native PowerPoint size grid. */
	endArrowWidth?: 'sm' | 'med' | 'lg'
	/** End arrowhead length from the native PowerPoint size grid. */
	endArrowLength?: 'sm' | 'med' | 'lg'

	/**
	 * Dash type
	 * @deprecated v3.3.0 - use `dashType`
	 */
	lineDash?: 'solid' | 'dash' | 'dashDot' | 'lgDash' | 'lgDashDot' | 'lgDashDotDot' | 'sysDash' | 'sysDot'
	/**
	 * @deprecated v3.3.0 - use `beginArrowType`
	 */
	lineHead?: 'none' | 'arrow' | 'diamond' | 'oval' | 'stealth' | 'triangle'
	/**
	 * @deprecated v3.3.0 - use `endArrowType`
	 */
	lineTail?: 'none' | 'arrow' | 'diamond' | 'oval' | 'stealth' | 'triangle'
	/**
	 * Line width (pt)
	 * @deprecated v3.3.0 - use `width`
	 */
	pt?: number
	/**
	 * Line size (pt)
	 * @deprecated v3.3.0 - use `width`
	 */
	size?: number
}
// used by: chart, slide, table, text
export interface TextBaseProps {
	/**
	 * Horizontal alignment
	 * @default 'left'
	 */
	align?: HAlign
	/**
	 * Bold style
	 * @default false
	 */
	bold?: boolean
	/**
	 * Add a line-break
	 * @default false
	 */
	breakLine?: boolean
	/**
	 * Add standard or custom bullet
	 * - use `true` for standard bullet
	 * - pass object options for custom bullet
	 * @default false
	 */
	bullet?:
	| boolean
	| {
		/**
		 * Bullet type
		 * @default bullet
		 */
		type?: 'bullet' | 'number'
		/**
		 * Bullet character code (unicode)
		 * @since v3.3.0
		 * @example '25BA' // 'BLACK RIGHT-POINTING POINTER' (U+25BA)
		 */
		characterCode?: string
		/**
		 * Indentation (space between bullet and text) (points)
		 * @since v3.3.0
		 * @default 27 // DEF_BULLET_MARGIN
		 * @example 10 // Indents text 10 points from bullet
		 */
		indent?: number
		/**
		 * Number type
		 * @since v3.3.0
		 * @example 'romanLcParenR' // roman numerals lower-case with paranthesis right
		 */
		numberType?:
		| 'alphaLcParenBoth'
		| 'alphaLcParenR'
		| 'alphaLcPeriod'
		| 'alphaUcParenBoth'
		| 'alphaUcParenR'
		| 'alphaUcPeriod'
		| 'arabicParenBoth'
		| 'arabicParenR'
		| 'arabicPeriod'
		| 'arabicPlain'
		| 'romanLcParenBoth'
		| 'romanLcParenR'
		| 'romanLcPeriod'
		| 'romanUcParenBoth'
		| 'romanUcParenR'
		| 'romanUcPeriod'
		/**
		 * Number bullets start at
		 * @since v3.3.0
		 * @default 1
		 * @example 10 // numbered bullets start with 10
		 */
		numberStartAt?: number
		/**
		 * Bullet color (hex RGB string)
		 * @example 'FF0000' // red bullet
		 */
		color?: string
		/**
		 * Bullet font face (typeface name)
		 * @example 'Arial'
		 */
		font?: string
		/**
		 * Bullet font size (points)
		 * @example 12
		 */
		fontSize?: number
		/**
		 * When true, emits buNone (no visible bullet) with optional buClr/buSzPts/buFont style properties.
		 * Used to match native PPTX/Google Slides that store bullet style alongside buNone.
		 * @example { none: true, color: '000000', font: 'Arial', fontSize: 11 }
		 */
		none?: boolean

		// DEPRECATED

		/**
		 * Bullet code (unicode)
		 * @deprecated v3.3.0 - use `characterCode`
		 */
		code?: string
		/**
		 * Margin between bullet and text
		 * @since v3.2.1
		 * @deplrecated v3.3.0 - use `indent`
		 */
		marginPt?: number
		/**
		 * Number to start with (only applies to type:number)
		 * @deprecated v3.3.0 - use `numberStartAt`
		 */
		startAt?: number
		/**
		 * Number type
		 * @deprecated v3.3.0 - use `numberType`
		 */
		style?: string
	}
	/**
	 * Text color
	 * - `HexColor` or `ThemeColor`
	 * - MS-PPT > Format Shape > Text Options > Text Fill & Outline > Text Fill > Color
	 * @example 'FF0000' // hex color (red)
	 * @example pptx.SchemeColor.text1 // Theme color (Text1)
	 */
	color?: Color
	/**
	 * Font face name
	 * @example 'Arial' // Arial font
	 */
	fontFace?: string
	/**
	 * Font size
	 * @example 12 // Font size 12
	 */
	fontSize?: number
	/**
	 * Complex-script typeface for this run. When omitted, fontFace remains the
	 * portable fallback for Latin, East Asian, and complex-script text.
	 */
	fontFaceComplexScript?: string
	/**
	 * Text highlight color (hex format)
	 * @example 'FFFF00' // yellow
	 */
	highlight?: HexColor
	/**
	 * italic style
	 * @default false
	 */
	italic?: boolean
	/**
	 * language
	 * - ISO 639-1 standard language code
	 * @default 'en-US' // english US
	 * @example 'fr-CA' // french Canadian
	 */
	lang?: string
	/**
	 * Add a soft line-break (shift+enter) before line text content
	 * @default false
	 * @since v3.5.0
	 */
	softBreakBefore?: boolean
	/**
	 * Emit a standalone <a:br/> even when this is the first/only run in a paragraph.
	 * Used by decypher for paragraphs whose only content is a break element.
	 */
	standaloneBreakParagraph?: boolean
	/**
	 * tab stops
	 * - PowerPoint: Paragraph > Tabs > Tab stop position
	 * @example [{ position:1 }, { position:3 }] // Set first tab stop to 1 inch, set second tab stop to 3 inches
	 */
	tabStops?: Array<{ position: number, alignment?: 'l' | 'r' | 'ctr' | 'dec' }>
	/**
	 * text direction
	 * `horz` = horizontal
	 * `vert` = rotate 90^
	 * `vert270` = rotate 270^
	 * `wordArtVert` = stacked
	 * @default 'horz'
	 */
	textDirection?: 'horz' | 'vert' | 'vert270' | 'wordArtVert'
	/**
	 * Transparency (percent)
	 * - MS-PPT > Format Shape > Text Options > Text Fill & Outline > Text Fill > Transparency
	 * - range: 0-100
	 * @default 0
	 */
	transparency?: number
	/**
	 * underline properties
	 * - PowerPoint: Font > Color & Underline > Underline Style/Underline Color
	 * @default (none)
	 */
	underline?: {
		style?:
		| 'dash'
		| 'dashHeavy'
		| 'dashLong'
		| 'dashLongHeavy'
		| 'dbl'
		| 'dotDash'
		| 'dotDashHeavy'
		/** @deprecated Historical library typo; normalized to dotDashHeavy by the authoring boundary. */
		| 'dotDashHeave'
		| 'dotDotDash'
		| 'dotDotDashHeavy'
		| 'dotted'
		| 'dottedHeavy'
		| 'heavy'
		| 'none'
		| 'sng'
		| 'wavy'
		| 'wavyDbl'
		| 'wavyHeavy'
		color?: Color
	}
	/**
	 * vertical alignment
	 * @default 'top'
	 */
	valign?: VAlign
}
export interface PlaceholderProps extends PositionProps, TextBaseProps {
	name: string
	type: PLACEHOLDER_TYPE
	/** PresentationML placeholder orientation. */
	orient?: 'horz' | 'vert'
	/** Whether PowerPoint should expose the authored placeholder prompt. */
	hasCustomPrompt?: boolean
	/**
	 * margin (points)
	 */
	margin?: Margin
}
export interface ObjectNameProps {
	/**
	 * Object name
	 * - used instead of default "Object N" name
	 * - PowerPoint: Home > Arrange > Selection Pane...
	 * @since v3.10.0
	 * @default 'Object 1'
	 * @example 'Antenna Design 9'
	 */
	objectName?: string
	/** Accessible title stored on the native p:cNvPr carrier. */
	accessibilityTitle?: string | null
	/** Accessible description stored on the native p:cNvPr carrier. */
	altText?: string | null
	/** Whether PowerPoint's Reading Order pane excludes this object. */
	isDecorative?: boolean | null
}
export type SmartArtLayout = 'process' | 'cycle' | 'hierarchy' | 'matrix' | 'pyramid' | 'list' | 'relationship' | 'picture' | 'timeline' | 'team'
export type SmartArtNodeSemanticRole = 'root' | 'manager' | 'member' | 'peer' | 'node' | 'image' | 'caption' | 'assistant'
export interface SmartArtNode {
	text?: string
	title?: string
	subtitle?: string
	/** Semantic role used for applicability validation and native hierarchy serialization. */
	role?: SmartArtNodeSemanticRole
	/**
	 * Image for picture SmartArt nodes. Native picture layouts require an image
	 * on every node; use a base64 data URL in hosted/MCP flows, or imagePath
	 * only when the runtime can read the local file.
	 */
	image?: string
	imagePath?: string
	imageUrl?: string
	imageData?: string
	children?: Array<string | SmartArtNode>
	color?: HexColor
	fill?: ShapeFillProps
	line?: ShapeLineProps
}
export interface SmartArtProps extends PositionProps, ObjectNameProps {
	/**
	 * Shape-built SmartArt-style layout, native SmartArt category, native layout
	 * name, or native PowerPoint catalog ID.
	 * @default 'process'
	 */
	layout?: SmartArtLayout | string
	/**
	 * Authoring mode. `shape` keeps the existing editable shape-built helper.
	 * `native` creates a real PowerPoint SmartArt graphicFrame and diagram parts
	 * from the full PowerPoint SmartArt catalog.
	 * @default 'shape'
	 */
	mode?: 'shape' | 'native'
	/**
	 * Convenience alias for `mode: "native"`.
	 */
	native?: boolean
	/**
	 * Native SmartArt layout catalog ID from the PowerPoint SmartArt catalog.
	 * Use `slide.addSmartArt({ mode: "native" })` for the default layout or
	 * a catalog ID/name/category for a specific native layout.
	 */
	layoutId?: string
	layoutName?: string
	quickStyleId?: string
	quickStyleName?: string
	colorStyleId?: string
	colorStyleName?: string
	/**
	 * Behavior when an explicitly requested native layout/style/color is not in
	 * the catalog. Omit (or use `reject`) to fail before mutation; use `default`
	 * only when the caller has deliberately accepted the documented fallback.
	 */
	presetFallback?: 'reject' | 'default'
	rightToLeft?: boolean
	/**
	 * Node labels or node objects. For hierarchy, the first node may carry children.
	 */
	nodes?: Array<string | SmartArtNode>
	title?: string
	/** Concise accessible description written to the SmartArt graphic frame. */
	altText?: string | null
	fontFace?: string
	fontSize?: number
	color?: HexColor
	/** Optional per-node text colors for native presets with alternating light/dark fills. */
	textColors?: HexColor[]
	palette?: HexColor[]
	fill?: ShapeFillProps
	line?: ShapeLineProps
	shadow?: ShadowProps
	animation?: AnimationProps | AnimationProps[]
	/** @internal Native SmartArt data model XML from decypher/roundtrip extraction. */
	_rawDataXml?: string
	/** @internal Native SmartArt layout XML from decypher/roundtrip extraction. */
	_rawLayoutXml?: string
	/** @internal Native SmartArt quick-style XML from decypher/roundtrip extraction. */
	_rawQuickStyleXml?: string
	/** @internal Native SmartArt color-style XML from decypher/roundtrip extraction. */
	_rawColorsXml?: string
	/** @internal Native SmartArt drawing XML from decypher/roundtrip extraction. */
	_rawDrawingXml?: string
	/** @internal Relationship part for extracted native SmartArt data XML. */
	_rawDataRelsXml?: string
	/** @internal Relationship part for extracted native SmartArt drawing XML. */
	_rawDrawingRelsXml?: string
}
/**
 * Theme color scheme — the 12 OOXML clrScheme slots. Hex values without a
 * leading '#'. Any slot left undefined falls back to the Office default, so a
 * caller can override just the accents (e.g. to make the whole deck adopt a
 * brand / art-direction palette) without restating the neutrals.
 */
export interface ThemeColorScheme {
	dk1?: string
	lt1?: string
	dk2?: string
	lt2?: string
	accent1?: string
	accent2?: string
	accent3?: string
	accent4?: string
	accent5?: string
	accent6?: string
	hlink?: string
	folHlink?: string
}

export interface ThemeProps {
	/** Semantic theme and scheme name used by native PowerPoint galleries. */
	name?: string
	/**
	 * Headings font face name
	 * @example 'Arial Narrow'
	 * @default 'Calibri Light'
	 */
	headFontFace?: string
	/**
	 * Body font face name
	 * @example 'Arial'
	 * @default 'Calibri'
	 */
	bodyFontFace?: string
	/** BCP-47 language inherited by the master text-style defaults. */
	lang?: string
	/**
	 * Theme color scheme (accent1..6, dk2, lt2, hlink, …). Drives every element
	 * that references a scheme color — notably native SmartArt and theme-driven
	 * chart series — so the deck's diagrams adopt the brand palette instead of
	 * the Office default. Undefined slots keep the Office default color.
	 */
	palette?: ThemeColorScheme
}

export interface InheritanceColorMap {
	bg1?: keyof ThemeColorScheme
	tx1?: keyof ThemeColorScheme
	bg2?: keyof ThemeColorScheme
	tx2?: keyof ThemeColorScheme
	accent1?: keyof ThemeColorScheme
	accent2?: keyof ThemeColorScheme
	accent3?: keyof ThemeColorScheme
	accent4?: keyof ThemeColorScheme
	accent5?: keyof ThemeColorScheme
	accent6?: keyof ThemeColorScheme
	hlink?: keyof ThemeColorScheme
	folHlink?: keyof ThemeColorScheme
}

export interface InheritanceTextStyle {
	fontFace?: string | null
	fontSize?: number | null
	color?: string | null
	bold?: boolean | null
	italic?: boolean | null
	align?: 'left' | 'center' | 'right' | 'justify' | null
}

export interface InheritanceTextStyles {
	title?: InheritanceTextStyle | null
	body?: InheritanceTextStyle | null
	other?: InheritanceTextStyle | null
}

export interface PlaceholderVisualStyle extends InheritanceTextStyle {
	preset?: SHAPE_NAME | string | null
	fill?: ShapeFillProps | null
	line?: ShapeLineProps | null
	shadow?: ShadowProps | null
	valign?: TEXT_VALIGN | null
	styleRefs?: {
		line?: { index?: number; color?: string }
		fill?: { index?: number; color?: string }
		effect?: { index?: number; color?: string }
		font?: { role?: 'major' | 'minor' | 'none'; color?: string }
	} | null
}

// image / media ==================================================================================
export type MediaType = 'audio' | 'online' | 'video'

/**
 * Cameo (live camera feed) properties.
 * A cameo is a native PowerPoint 2021+/2024 object: a picture marked with `alf:liveFeedProps`
 * that shows the presenter's live camera during a show. Authored as the camera-glyph placeholder.
 * @since v4.0.1
 * @see plans/cameo-ooxml-ground-truth.md
 */
export interface CameoProps extends PositionProps, ObjectNameProps {
	/**
	 * Frame shape (preset geometry) for the cameo.
	 * @default 'ellipse' (PowerPoint's default cameo is a circle)
	 */
	shape?: 'ellipse' | 'rect' | 'roundRect' | string
	/**
	 * Alt Text value ("How would you describe this object and its contents to someone who is blind?")
	 */
	altText?: string | null
	/**
	 * Advanced: override the placeholder image with a custom SVG data URI
	 * (`data:image/svg+xml;base64,...`). Defaults to PowerPoint's camera-glyph placeholder.
	 */
	posterSvgDataUri?: string
}

/**
 * Slide Zoom (zoom navigation) properties.
 * A native PowerPoint 2019+/2024 Slide Zoom: a clickable thumbnail that jumps to a target slide
 * during a show. Emitted as `mc:AlternateContent` (pslz:sldZm Choice + hyperlinked picture Fallback).
 * @since v4.0.1
 * @see plans/zoom-ooxml-ground-truth.md
 */
export interface ZoomProps extends PositionProps, ObjectNameProps {
	/** 1-based index of the target slide this zoom navigates to. Required. */
	targetSlide: number
	/** Zoom out back to the parent slide after the target. @default false */
	returnToParent?: boolean
	/** Zoom transition duration in milliseconds. @default 1000 */
	transitionDur?: number
	/**
	 * Advanced: override the thumbnail with a custom PNG/JPEG data URI
	 * (`data:image/png;base64,...`). Defaults to a neutral placeholder PowerPoint refreshes on edit.
	 */
	thumbnailDataUri?: string
	/** Alt Text value. */
	altText?: string | null
}

/**
 * Section Zoom (zoom navigation to a section) properties.
 * A native PowerPoint 2019+/2024 Section Zoom: a clickable thumbnail that jumps to a section
 * during a show. Emitted as `mc:AlternateContent` (psez:sectionZm Choice + hyperlinked picture
 * Fallback to the section's first slide). The deck must already have the target section.
 * @since v4.0.1
 * @see plans/section-zoom-ooxml-ground-truth.md
 */
export interface SectionZoomProps extends PositionProps, ObjectNameProps {
	/** Target section to navigate to: its title (string) or 1-based section index (number). Required. */
	targetSection: string | number
	/** Durable public semantic section id retained across rename/reorder. */
	targetSectionId?: string
	/** Zoom transition duration in milliseconds. @default 1000 */
	transitionDur?: number
	/**
	 * Advanced: override the thumbnail with a custom PNG/JPEG data URI
	 * (`data:image/png;base64,...`). Defaults to a neutral placeholder PowerPoint refreshes on edit.
	 */
	thumbnailDataUri?: string
	/** Alt Text value. */
	altText?: string | null
}

/**
 * Summary Zoom (zoom navigation summary slide) properties.
 * A native PowerPoint 2019+/2024 Summary Zoom: a generated slide with one clickable thumbnail per
 * section, laid out in a grid. Emitted as `mc:AlternateContent` (psuz:summaryZm Choice with one
 * `summaryZmObj` per section + a locked grpSp picture Fallback). The deck must already have sections;
 * a new "Summary Section" + summary slide are appended.
 * @since v4.0.1
 * @see plans/summary-zoom-ooxml-ground-truth.md
 */
export interface SummaryZoomProps extends ObjectNameProps {
	/**
	 * Which sections to include, by title or 1-based section index, in order.
	 * @default every existing content section (excludes the generated Summary Section), in order.
	 */
	sections?: Array<string | number>
	/** Durable public semantic section ids, in summary order. */
	sectionIds?: string[]
	/** Durable semantic identity for the generated summary section. */
	summarySectionId?: string
	/** Durable semantic identity for the generated summary slide. */
	summarySlideId?: string
	/** Title for the generated Summary Section. @default 'Summary Section' */
	summarySectionTitle?: string
	/** Zoom transition duration in milliseconds. @default 1000 */
	transitionDur?: number
	/** Object name for the summary-zoom graphic. @default 'Summary Zoom 1' */
	objectName?: string
	/**
	 * Advanced: override the per-section thumbnails with a custom PNG/JPEG data URI
	 * (`data:image/png;base64,...`). Defaults to a neutral placeholder PowerPoint refreshes on edit.
	 */
	thumbnailDataUri?: string
	/** Alt Text value. */
	altText?: string | null
}

/**
 * 3D Model properties
 * @since v4.0.0
 */
export interface Model3DProps extends PositionProps, ObjectNameProps {
	/**
	 * Path to GLB (binary glTF) 3D model file
	 * @example './models/car.glb'
	 */
	glbFile?: string
	/**
	 * Path to raster PNG fallback image (for non-3D-capable viewers)
	 * @example './models/car-preview.png'
	 */
	rasterFile?: string
	/**
	 * Emit only the native PowerPoint 3D model payload.
	 * When true, no raster preview or mc:Fallback picture is written.
	 * If `rasterFile` is omitted this mode is used automatically.
	 */
	nativeOnly?: boolean
	/**
	 * Alt Text value ("How would you describe this object and its contents to someone who is blind?")
	 * - PowerPoint: [right-click on a 3D model] > "Edit Alt Text..."
	 */
	altText?: string | null
	/**
	 * Rotation (degrees)
	 * - range: -360 to 360
	 * - native serializer precision: 1/60000 degree
	 * @default 0
	 */
	rotate?: number
	/**
	 * Flip horizontally?
	 * @default false
	 */
	flipH?: boolean
	/**
	 * Shadow props
	 */
	shadow?: ShadowProps
	/**
	 * Raw XML passthrough for mc:Fallback effectLst (outerShdw, reflection, etc.)
	 * Used by decypher tool to preserve native PP effects on fallback image
	 */
	_rawFallbackEffectLstXml?: string
	/**
	 * Raw XML passthrough for am3d:spPr effectLst (3D model shape effects)
	 * Used by decypher tool to preserve native PP 3D model effects
	 */
	_rawModel3dEffectLstXml?: string
	/**
	 * Camera configuration
	 */
	camera?: {
		pos?: { x: number; y: number; z: number }
		fov?: number
	}
	/**
	 * Transform configuration
	 */
	trans?: {
		meterPerModelUnit?: { n: number; d: number }
		preTrans?: { dx: number; dy: number; dz: number }
		scale?: { sx: number; sy: number; sz: number }
		rot?: { ax?: number; ay?: number; az?: number }
		postTrans?: { dx: number; dy: number; dz: number }
	}
	/**
	 * Ambient light configuration
	 * `illuminance` is a 0..1 scalar; 0..100 is accepted as a percentage.
	 */
	ambientLight?: {
		color?: { r: number; g: number; b: number }
		illuminance?: number
	}
	/**
	 * Point lights array
	 */
	ptLights?: Array<{
		color: { r: number; g: number; b: number }
		intensity: number
		pos: { x: number; y: number; z: number }
	}>
	/**
	 * Object viewport size
	 */
	objViewport?: number
	/** Internal authored gallery selector retained for semantic export/readback. */
	_model3dViewPresetId?: string
	/** Internal sparse manual view overrides used to reapply presets during updates. */
	_model3dAuthoredOverrides?: Record<string, unknown>
	/**
	 * Embedded-animation ("Scene") selection for rigged glTF/GLB models.
	 *
	 * PowerPoint activates the selected embedded glTF animation through the slide timing
	 * tree's `embeddedN` channel. Without posterFrame, static/edit posture comes from
	 * the GLB base transforms; `am3d:raster` remains the compatibility fallback/anchor.
	 *
	 * - `animId`       – 0-based glTF animation index (the "scene" to activate).
	 * - `length`       – clip length in milliseconds. PowerPoint recomputes it, but a
	 *                    correct value keeps playback timing right; omit if unknown.
	 * - `loop`         – play indefinitely (default) vs a single pass.
	 */
	scene?: {
		animId: number
		length?: number
		loop?: boolean
		/** Explicitly declare native embedded playback properties in addition to slide timing.
		 * Requires length in milliseconds. Omitted/false preserves timing-only playback.
		 */
		playbackMetadata?: boolean
	}
	/** Idle appearance selected from an embedded animation, independently of playback.
	 * animId is a zero-based animation index; progress is a normalized time from 0 to 1.
	 */
	posterFrame?: { animId: number; progress: number }
	/**
	 * Used internally by library
	 * @private
	 */
	_nativeMinimal?: boolean
	/**
	 * Explicit Shape ID (SPID) override
	 * @private
	 */
	spid?: number
	/**
	 * Raw am3d:model3d XML passthrough for exact reproduction
	 * When set, uses this XML directly instead of generating it
	 * @private
	 */
	_model3dXml?: string
	/**
	 * Original rId of the GLB file in the source PPTX (for _model3dXml rId replacement)
	 * @private
	 */
	_originalGlbRid?: string
	/**
	 * Original rId of the raster PNG in the source PPTX (for _model3dXml rId replacement)
	 * @private
	 */
	_originalRasterRid?: string
}

/** Theme- or RGB-aware colour plus editable DrawingML colour transforms. */
export interface PictureStyleColorProps {
	/** RGB hex, theme/scheme token, or preset colour token. */
	color?: Color | string
	/** Explicit theme token when a client prefers a named field over `color`. */
	scheme?: ThemeColor
	/** Explicit PowerPoint preset token when a client prefers a named field over `color`. */
	preset?: string
	/** Optional colour vocabulary used when `color` is not an RGB hex value. */
	colorType?: 'rgb' | 'scheme' | 'preset'
	/** Normalized 0..1 tint transform. */
	tint?: number
	/** Normalized 0..1 shade transform. */
	shade?: number
	/** Saturation multiplier; 1 is neutral. */
	saturation?: number
	/** Luminance multiplier; 1 is neutral. */
	luminance?: number
	/** Luminance offset; 0 is neutral and maps to DrawingML lumOff. */
	luminanceOffset?: number
	/** Normalized 0..1 opacity. */
	opacity?: number
}

/** Exact editable picture geometry used by Picture Styles. */
export interface PictureStyleGeometryProps {
	/** PowerPoint preset geometry, for example rect, ellipse, roundRect, round2DiagRect, or snip2DiagRect. */
	preset: string
	/** Named adj/adjN geometry handles as normalized 0..1 values; 0.08594 serializes as PowerPoint val 8594. */
	adjustments?: Record<string, number>
}

/** Exact editable picture frame fill used by Picture Styles. */
export interface PictureStyleFillProps {
	type: 'none' | 'solid'
	color?: PictureStyleColorProps
}

/** Expanded Picture Style border controls, including gallery-only line options. */
export interface PictureStyleLineProps {
	type?: 'none' | 'solid'
	widthPt?: number
	cap?: 'flat' | 'round' | 'square'
	compound?: 'single' | 'double' | 'thickThin' | 'thinThick' | 'triple'
	alignment?: 'center' | 'inset'
	dash?: string
	join?: 'miter' | 'round' | 'bevel'
	miterLimit?: number
	color?: PictureStyleColorProps
}

export type PictureStyleEffectProps =
	| {
		type: 'outerShadow' | 'innerShadow'
		blurPt?: number
		distancePt?: number
		directionDeg?: number
		alignment?: 'topLeft' | 'top' | 'topRight' | 'left' | 'center' | 'right' | 'bottomLeft' | 'bottom' | 'bottomRight'
		rotateWithShape?: boolean
		scaleX?: number
		scaleY?: number
		skewXDeg?: number
		skewYDeg?: number
		color?: PictureStyleColorProps
	}
	| {
		type: 'reflection'
		blurPt?: number
		startOpacity?: number
		endOpacity?: number
		startPosition?: number
		endPosition?: number
		distancePt?: number
		directionDeg?: number
		scaleX?: number
		scaleY?: number
		alignment?: 'topLeft' | 'top' | 'topRight' | 'left' | 'center' | 'right' | 'bottomLeft' | 'bottom' | 'bottomRight'
		rotateWithShape?: boolean
	}
	| { type: 'softEdge', radiusPt: number }

export interface PictureStyle3DProps {
	camera?: {
		preset: string
		perspectiveDeg?: number
		/** Alias for perspectiveDeg, matching PowerPoint's FieldOfView terminology. */
		fieldOfView?: number
		rotation?: { xDeg?: number, yDeg?: number, zDeg?: number }
	}
	lightRig?: {
		preset: string
		direction?: string
		rotation?: { xDeg?: number, yDeg?: number, zDeg?: number }
	}
	format?: {
		material?: string
		extrusionDepthPt?: number
		extrusionColor?: PictureStyleColorProps
		contourWidthPt?: number
		contourColor?: PictureStyleColorProps
		bevelTop?: { type?: string, widthPt?: number, heightPt?: number }
		bevelBottom?: { type?: string, widthPt?: number, heightPt?: number }
	}
}

/** Preset-free, fully typed decomposition of a native PowerPoint Picture Style. */
export interface PictureStyleProps {
	geometry?: PictureStyleGeometryProps | null
	fill?: PictureStyleFillProps | null
	line?: PictureStyleLineProps | null
	effects?: PictureStyleEffectProps[] | null
	threeD?: PictureStyle3DProps | null
}

export interface ImageProps extends PositionProps, DataOrPathProps, ObjectNameProps {
	/**
	 * Exact native picture preset geometry captured from an Office gallery tile.
	 * Position and extent remain engine-owned and are never included here.
	 * @private
	 */
	_rawPicPrstGeomXml?: string
	/** Preset-free editable Picture Style decomposition. Structured values override matching captured preset components. */
	pictureStyle?: PictureStyleProps | null
	/**
	 * Alt Text value ("How would you describe this object and its contents to someone who is blind?")
	 * - PowerPoint: [right-click on an image] > "Edit Alt Text..."
	 */
	altText?: string | null
	/**
	 * Flip horizontally?
	 * @default false
	 */
	flipH?: boolean
	/**
	 * Flip vertical?
	 * @default false
	 */
	flipV?: boolean
	hyperlink?: HyperlinkProps
	/**
	 * Placeholder type
	 * - values: 'body' | 'header' | 'footer' | 'title' | et. al.
	 * @example 'body'
	 * @see https://docs.microsoft.com/en-us/office/vba/api/powerpoint.ppplaceholdertype
	 */
	placeholder?: string
	/**
	 * Image rotation (degrees)
	 * - range: -360 to 360
	 * - native serializer precision: 1/60000 degree
	 * @default 0
	 * @example 180 // rotate image 180 degrees
	 */
	rotate?: number
	/**
	 * Native picture corrections, duotone, grayscale, and transparency.
	 */
	imageAdjustments?: {
		brightness?: number
		contrast?: number
		/** Native Picture Format sharpen/soften amount, from -1 (soften) to 1 (sharpen). */
		sharpness?: number
		/** Native picture saturation multiplier, from 0 (no saturation) to 4. Neutral is 1. */
		saturation?: number
		/** Native picture color temperature in Kelvin, clamped by PowerPoint to 1500..11500. Neutral is 6500. */
		temperature?: number
		transparency?: number
		colorMode?: 'normal' | 'grayscale' | 'duotone' | 'recolor'
		duotone?: { dark?: Color | PictureColorEndpoint, light?: Color | PictureColorEndpoint }
		/** Alias of duotone using Picture Format's Recolor terminology. */
		recolor?: { dark?: Color | PictureColorEndpoint, light?: Color | PictureColorEndpoint }
		/**
		 * Optional pre-encoded PowerPoint HD Photo layer for runtimes that cannot
		 * create the editable Picture Format source automatically. Advanced transport
		 * override for sharpness, saturation, temperature, and Artistic Effects.
		 */
		nativeImage?: { path?: string, data?: string }
		/** Optional rendered preview paired with nativeImage. */
		previewImage?: { path?: string, data?: string }
		artisticEffect?: {
			/** Native artistic effect type; every persistent Format Picture slider is serialized with its PowerPoint-authored range. */
			type?: string
			id?: string
			/** Optional nested parameter form; top-level parameter fields are accepted as aliases. */
			parameters?: Record<string, number>
			/** Effect transparency as a normalized 0..1 value. */
			transparency?: number
			/** Backward-compatible raw OOXML fixed-percentage transparency (0..100000). */
			trans?: number
			radius?: number
			brightness?: number
			contrast?: number
			pressure?: number
			intensity?: number
			smoothness?: number
			scaling?: number
			brushSize?: number
			pencilSize?: number
			grainSize?: number
			gridSize?: number
			crackSpacing?: number
			numberOfShades?: number
			detail?: number
			size?: number
			temperature?: number
			amount?: number
			/**
			 * Optional pre-encoded PowerPoint HD Photo layer for runtimes that cannot
			 * create one automatically. This is an advanced transport override; it is
			 * removed from the stored authoring options after the media relationship is
			 * created and is never serialized as JSON metadata.
			 */
			nativeImage?: { path?: string, data?: string }
			/** Optional pre-rendered effect preview paired with nativeImage. */
			previewImage?: { path?: string, data?: string }
			[key: string]: unknown
		}
	}
	/**
	 * Enable image rounding
	 * @default false
	 */
	rounding?: boolean
	/**
	 * Shadow Props
	 * - MS-PPT > Format Picture > Shadow
	 * @example
	 * { type: 'outer', color: '000000', opacity: 0.5, blur: 20,  offset: 20, angle: 270 }
	 */
	shadow?: ShadowProps
	/**
	 * Native picture border.
	 * - PowerPoint: Picture Format > Picture Border
	 */
	line?: ShapeLineProps
	/**
	 * Native picture glow.
	 * - PowerPoint: Picture Format > Picture Effects > Glow
	 */
	glow?: TextGlowProps
	/**
	 * Native picture reflection.
	 * - PowerPoint: Picture Format > Picture Effects > Reflection
	 */
	reflection?: ShapeReflectionProps
	/**
	 * Native picture soft edges.
	 * - PowerPoint: Picture Format > Picture Effects > Soft Edges
	 */
	softEdges?: ShapeSoftEdgesProps
	/** Native DrawingML blur on the picture surface. */
	blur?: { radiusPt?: number, size?: number, grow?: boolean }
	/** Native DrawingML fill-overlay blend on the picture surface. */
	fillOverlay?: { blend?: string, fill?: ShapeFillProps }
	/**
	 * Native picture 3-D format/rotation.
	 * - PowerPoint: Picture Format > Picture Effects > 3-D Format / 3-D Rotation
	 */
	effect3D?: Text3DProps
	/**
	 * Image sizing options
	 */
	sizing?: {
		/**
		 * Sizing type
		 */
		type: 'contain' | 'cover' | 'crop'
		/**
		 * Image width
		 * - inches or percentage
		 * @example 10.25 // position in inches
		 * @example '75%' // position as percentage of slide size
		 */
		w: Coord
		/**
		 * Image height
		 * - inches or percentage
		 * @example 10.25 // position in inches
		 * @example '75%' // position as percentage of slide size
		 */
		h: Coord
		/**
		 * Offset from left to crop image
		 * - `crop` only
		 * - inches or percentage
		 * @example 10.25 // position in inches
		 * @example '75%' // position as percentage of slide size
		 */
		x?: Coord
		/**
		 * Offset from top to crop image
		 * - `crop` only
		 * - inches or percentage
		 * @example 10.25 // position in inches
		 * @example '75%' // position as percentage of slide size
		 */
		y?: Coord
	}
	/**
	 * Transparency (percent)
	 * - MS-PPT > Format Picture > Picture > Picture Transparency > Transparency
	 * - range: 0-100
	 * @default 0
	 * @example 25 // 25% transparent
	 */
	transparency?: number
}
/**
 * Add media (audio/video) to slide
 * @requires either `link` or `path`
 */
export interface MediaProps extends PositionProps, DataOrPathProps, ObjectNameProps {
	/**
	 * Media type
	 * - Use 'online' to embed a YouTube video (only supported in recent versions of PowerPoint)
	 */
	type: MediaType
	/** Semantic/native placeholder role retained on the media p:nvPr carrier. */
	placeholder?: PLACEHOLDER_TYPE
	/** Native PresentationML placeholder type alias used by import/replay. */
	phType?: PLACEHOLDER_TYPE
	/** Native placeholder index. Zero is a valid explicit value. */
	phIdx?: number
	/** Native placeholder size. */
	phSz?: 'full' | 'half' | 'quarter'
	/** Native placeholder orientation. */
	phOrient?: 'horz' | 'vert'
	/** Native custom-prompt flag; false is retained explicitly in the object model. */
	phHasCustomPrompt?: boolean
	/** Semantic alias for phHasCustomPrompt. */
	hasCustomPrompt?: boolean
	/** Preserve an imported bare p:ph carrier. */
	hasBarePh?: boolean
	/** Accessible description emitted on the native media cNvPr carrier. */
	altText?: string | null
	/**
	 * Cover image
	 * @since 3.9.0
	 * @default "play button" image, gray background
	 */
	cover?: string
	/**
	 * Aspect-preserving media framing. `cover` fills the target box and crops
	 * the source instead of distorting the video frame. Source dimensions are
	 * supplied internally by media-aware callers when available.
	 */
	sizing?: {
		type: 'contain' | 'cover' | 'crop'
		w: Coord
		h: Coord
		x?: Coord
		y?: Coord
	}
	/** Clip the media frame to an ellipse; a square target becomes a circle. */
	rounding?: boolean
	/**
	 * Cover image transparency (percent)
	 * - Useful for hidden narration/audio controls
	 * - range: 0-100
	 * @default 0
	 */
	transparency?: number
	/**
	 * media file extension
	 * - use when the media file path does not already have an extension, ex: "/folder/SomeSong"
	 * @since 3.9.0
	 * @default extension from file provided
	 */
	extn?: string
	/**
	 * video embed link
	 * - works with YouTube
	 * - other sites may not show correctly in PowerPoint
	 * @example 'https://www.youtube.com/embed/Dph6ynRVyUc' // embed a youtube video
	 */
	link?: string
	/**
	 * full or local path
	 * @example 'https://freesounds/simpsons/bart.mp3' // embed mp3 audio clip from server
	 * @example '/sounds/simpsons_haha.mp3' // embed mp3 audio clip from local directory
	 */
	path?: string
	/**
	 * Enable interactive playback controls (click-on-media-to-pause)
	 * - When true: Generates interactiveSeq for click-on-video-to-pause behavior
	 * - When false: Only generates simple p:video node (use with animation-controlled playback)
	 * @default true
	 * @since v4.0.0
	 */
	interactivePlayback?: boolean
	/**
	 * Media timing volume in PowerPoint units (0-100000). Values are consumed
	 * by generated media timing nodes when playback animations are present.
	 */
	mediaVolume?: number
	/**
	 * Low-level serializer flag for native PowerPoint narration metadata.
	 * Product authoring should use the dedicated narration or Record Studio
	 * capture APIs instead of promoting ordinary media with this flag.
	 */
	isNarration?: boolean
	/**
	 * Whether the media control remains visible when playback stops.
	 * Native audio narration defaults this to false, matching PowerPoint recording output.
	 */
	showWhenStopped?: boolean
	/**
	 * End the audio timing node when PowerPoint raises the onStopAudio event.
	 * Native audio narration defaults this to true.
	 */
	endOnStopAudio?: boolean
	/**
	 * Native PowerPoint closed-caption tracks bound to this audio/video object.
	 * Each track is WebVTT stored as a PPTX Track part. These never become slide text boxes.
	 */
	closedCaptionTracks?: Array<{
		format?: 'webvtt'
		language?: string
		lang?: string
		label?: string
		id?: string
		vtt?: string
		text?: string
		data?: string
		path?: string
		embed?: boolean
		default?: boolean
	}>
}

// shapes =========================================================================================

/**
 * Shape reflection effect properties
 * - PowerPoint: Format Shape > Shape Effects > Reflection
 * @example { blur: 3, offset: 3, opacity: 0.5 }
 */
export interface ShapeReflectionProps {
	/**
	 * Blur radius (points)
	 * - range: 0-100
	 * @default 0
	 */
	blur?: number
	/**
	 * Distance from shape to reflection (points)
	 * - range: 0-100
	 * @default 0
	 */
	offset?: number
	/**
	 * Starting opacity (0.0 - 1.0)
	 * @default 0.5
	 */
	opacity?: number
	/**
	 * Ending opacity (0.0 - 1.0)
	 * @default 0
	 */
	endOpacity?: number
	/**
	 * Starting position of fade (0-100%)
	 * @default 0
	 */
	fadeStart?: number
	/**
	 * Ending position of fade (0-100%)
	 * @default 100
	 */
	fadeEnd?: number
	/**
	 * Reflection angle (degrees)
	 * @default 90
	 */
	angle?: number
	/**
	 * Vertical scaling of reflection (percent)
	 * - negative values flip the reflection
	 * @default -100
	 */
	scaleY?: number
}

/**
 * Shape soft edges effect properties
 * - PowerPoint: Format Shape > Shape Effects > Soft Edges
 * @example { size: 10 } // 10pt soft edge
 */
export interface ShapeSoftEdgesProps {
	/**
	 * Soft edge size (points)
	 * - range: 0-100
	 * @default 0
	 */
	size: number
}

export interface ShapeProps extends PositionProps, ObjectNameProps {
	/**
	 * Horizontal alignment
	 * @default 'left'
	 */
	align?: HAlign
	/**
	 * Radius (only for pptx.shapes.PIE, pptx.shapes.ARC, pptx.shapes.BLOCK_ARC)
	 * - In the case of pptx.shapes.BLOCK_ARC you have to setup the arcThicknessRatio
	 * - values: [0-359, 0-359]
	 * @since v3.4.0
	 * @default [270, 0]
	 */
	angleRange?: [number, number]
	/**
	 * Radius (only for pptx.shapes.BLOCK_ARC)
	 * - You have to setup the angleRange values too
	 * - values: 0.0-1.0
	 * @since v3.4.0
	 * @default 0.5
	 */
	arcThicknessRatio?: number
	/**
	 * Shape fill color properties
	 * @example { color:'FF0000' } // hex color (red)
	 * @example { color:'0088CC', transparency:50 } // hex color, 50% transparent
	 * @example { color:pptx.SchemeColor.accent1 } // Theme color Accent1
	 */
	fill?: ShapeFillProps
	/**
	 * Flip shape horizontally?
	 * @default false
	 */
	flipH?: boolean
	/**
	 * Flip shape vertical?
	 * @default false
	 */
	flipV?: boolean
	/**
	 * Glow effect for shape
	 * - PowerPoint: Format Shape > Shape Effects > Glow
	 * @example { size: 10, color: 'FF0000', opacity: 0.5 }
	 */
	glow?: TextGlowProps
	/**
	 * Add hyperlink to shape
	 * @example hyperlink: { url: "https://github.com/gitbrent/pptxgenjs", tooltip: "Visit Homepage" },
	 */
	hyperlink?: HyperlinkProps
	/**
	 * Line options
	 */
	line?: ShapeLineProps
	/**
	 * Points (only for pptx.shapes.CUSTOM_GEOMETRY)
	 * - type: 'arc'
	 * - `hR` Shape Arc Height Radius
	 * - `wR` Shape Arc Width Radius
	 * - `stAng` Shape Arc Start Angle
	 * - `swAng` Shape Arc Swing Angle
	 * @see http://www.datypic.com/sc/ooxml/e-a_arcTo-1.html
	 * @example [{ x: 0, y: 0 }, { x: 10, y: 10 }] // draw a line between those two points
	 */
	points?: Array<
		| { x: Coord, y: Coord, moveTo?: boolean }
		| { x: Coord, y: Coord, curve: { type: 'arc', hR: Coord, wR: Coord, stAng: number, swAng: number } }
		| { x: Coord, y: Coord, curve: { type: 'cubic', x1: Coord, y1: Coord, x2: Coord, y2: Coord } }
		| { x: Coord, y: Coord, curve: { type: 'quadratic', x1: Coord, y1: Coord } }
		| { close: true }
	>
	/**
	 * Rounded rectangle radius (only for pptx.shapes.ROUNDED_RECTANGLE)
	 * - values: 0.0 to 1.0
	 * @default 0
	 */
	rectRadius?: number
	/**
	 * Reflection effect for shape
	 * - PowerPoint: Format Shape > Shape Effects > Reflection
	 * @example { blur: 3, offset: 3, opacity: 0.5 }
	 */
	reflection?: ShapeReflectionProps
	/**
	 * Rotation (degrees)
	 * - range: -360 to 360
	 * - native serializer precision: 1/60000 degree
	 * @default 0
	 * @example 180 // rotate 180 degrees
	 */
	rotate?: number
	/**
	 * Shadow options
	 * TODO: need new demo.js entry for shape shadow
	 */
	shadow?: ShadowProps
	/**
	 * Soft edges effect for shape
	 * - PowerPoint: Format Shape > Shape Effects > Soft Edges
	 * @example { size: 10 } // 10pt soft edge
	 */
	softEdges?: ShapeSoftEdgesProps
	/**
	 * Native DrawingML blur
	 */
	blur?: { radiusPt?: number, size?: number, grow?: boolean }
	/**
	 * Native fill overlay blend
	 */
	fillOverlay?: { blend?: string, fill?: ShapeFillProps }
	/**
	 * 3D format effect for shape (bevel, material, lighting, depth)
	 * - PowerPoint: Format Shape > Shape Effects > 3-D Format
	 * @example { bevelTop: { type: 'circle', width: 10, height: 10 }, material: 'warmMatte', lighting: 'threePt' }
	 */
	effect3D?: Text3DProps

	/**
	 * @deprecated v3.3.0
	 */
	lineSize?: number
	/**
	 * @deprecated v3.3.0
	 */
	lineDash?: 'dash' | 'dashDot' | 'lgDash' | 'lgDashDot' | 'lgDashDotDot' | 'solid' | 'sysDash' | 'sysDot'
	/**
	 * @deprecated v3.3.0
	 */
	lineHead?: 'arrow' | 'diamond' | 'none' | 'oval' | 'stealth' | 'triangle'
	/**
	 * @deprecated v3.3.0
	 */
	lineTail?: 'arrow' | 'diamond' | 'none' | 'oval' | 'stealth' | 'triangle'
	/**
	 * Shape name (used instead of default "Shape N" name)
	 * @deprecated v3.10.0 - use `objectName`
	 */
	shapeName?: string
}

// tables =========================================================================================

export interface TableToSlidesProps extends TableProps {
	_arrObjTabHeadRows?: TableRow[]
	// _masterSlide?: SlideLayout

	/**
	 * Add an image to slide(s) created during autopaging
	 * - `image` prop requires either `path` or `data`
	 * - see `DataOrPathProps` for details on `image` props
	 * - see `PositionProps` for details on `options` props
	 */
	addImage?: { image: DataOrPathProps, options: PositionProps }
	/**
	 * Add a shape to slide(s) created during autopaging
	 */
	addShape?: { shapeName: SHAPE_NAME, options: ShapeProps }
	/**
	 * Add a table to slide(s) created during autopaging
	 */
	addTable?: { rows: TableRow[], options: TableProps }
	/**
	 * Add a text object to slide(s) created during autopaging
	 */
	addText?: { text: TextProps[], options: TextPropsOptions }
	/**
	 * Whether to enable auto-paging
	 * - auto-paging creates new slides as content overflows a slide
	 * @default true
	 */
	autoPage?: boolean
	/**
	 * Auto-paging character weight
	 * - adjusts how many characters are used before lines wrap
	 * - range: -1.0 to 1.0
	 * @see https://gitbrent.github.io/PptxGenJS/docs/api-tables.html
	 * @default 0.0
	 * @example 0.5 // lines are longer (increases the number of characters that can fit on a given line)
	 */
	autoPageCharWeight?: number
	/**
	 * Auto-paging line weight
	 * - adjusts how many lines are used before slides wrap
	 * - range: -1.0 to 1.0
	 * @see https://gitbrent.github.io/PptxGenJS/docs/api-tables.html
	 * @default 0.0
	 * @example 0.5 // tables are taller (increases the number of lines that can fit on a given slide)
	 */
	autoPageLineWeight?: number
	/**
	 * Whether to repeat head row(s) on new tables created by autopaging
	 * @since v3.3.0
	 * @default false
	 */
	autoPageRepeatHeader?: boolean
	/**
	 * The `y` location to use on subsequent slides created by autopaging
	 * @default (top margin of Slide)
	 */
	autoPageSlideStartY?: number
	/**
	 * Column widths (inches)
	 */
	colW?: number | number[]
	/**
	 * Master slide name
	 * - define a master slide to have your auto-paged slides have corporate design, etc.
	 * @see https://gitbrent.github.io/PptxGenJS/docs/masters.html
	 */
	masterSlideName?: string
	/**
	 * Slide margin
	 * - this margin will be across all slides created by auto-paging
	 */
	slideMargin?: Margin

	/**
	 * @deprecated v3.3.0 - use `autoPageRepeatHeader`
	 */
	addHeaderToEach?: boolean
	/**
	 * @deprecated v3.3.0 - use `autoPageSlideStartY`
	 */
	newSlideStartY?: number
}
export interface TableCellProps extends TextBaseProps {
	/**
	 * Auto-paging character weight
	 * - adjusts how many characters are used before lines wrap
	 * - range: -1.0 to 1.0
	 * @see https://gitbrent.github.io/PptxGenJS/docs/api-tables.html
	 * @default 0.0
	 * @example 0.5 // lines are longer (increases the number of characters that can fit on a given line)
	 */
	autoPageCharWeight?: number
	/**
	 * Auto-paging line weight
	 * - adjusts how many lines are used before slides wrap
	 * - range: -1.0 to 1.0
	 * @see https://gitbrent.github.io/PptxGenJS/docs/api-tables.html
	 * @default 0.0
	 * @example 0.5 // tables are taller (increases the number of lines that can fit on a given slide)
	 */
	autoPageLineWeight?: number
	/**
	 * Cell border
	 */
	border?: BorderProps | [BorderProps, BorderProps, BorderProps, BorderProps]
	/**
	 * Cell colspan
	 */
	colspan?: number
	/**
	 * Fill color
	 * @example { color:'FF0000' } // hex color (red)
	 * @example { color:'0088CC', transparency:50 } // hex color, 50% transparent
	 * @example { color:pptx.SchemeColor.accent1 } // theme color Accent1
	 */
	fill?: ShapeFillProps
	hyperlink?: HyperlinkProps
	/**
	 * Cell margin (inches)
	 * @default 0
	 */
	margin?: Margin
	/**
	 * Cell rowspan
	 */
	rowspan?: number
}
export interface TableProps extends PositionProps, TextBaseProps, ObjectNameProps {
	_arrObjTabHeadRows?: TableRow[]
	/** Named layout placeholder used by this editable table graphic frame. */
	placeholder?: string
	/** Native table placeholder role (`tbl`). */
	phType?: PLACEHOLDER_TYPE
	phIdx?: number
	phSz?: 'full' | 'half' | 'quarter'
	phOrient?: 'horz' | 'vert'
	phHasCustomPrompt?: boolean
	hasCustomPrompt?: boolean
	hasBarePh?: boolean

	/**
	 * PowerPoint table style GUID used in <a:tblPr><a:tableStyleId>.
	 * Built-in styles are resolved by PowerPoint; exact imported styles can also
	 * be preserved through the raw table property path.
	 */
	tableStyleId?: string
	/** Opaque PowerPoint Table Design gallery id resolved by the authoring engine. */
	tableStylePresetId?: string
	/**
	 * PowerPoint Table Design option: Header Row
	 */
	headerRow?: boolean
	/**
	 * PowerPoint Table Design option: Total Row
	 */
	totalRow?: boolean
	/**
	 * PowerPoint Table Design option: First Column
	 */
	firstColumn?: boolean
	/**
	 * PowerPoint Table Design option: Last Column
	 */
	lastColumn?: boolean
	/**
	 * PowerPoint Table Design option: Banded Rows
	 */
	bandedRows?: boolean
	/**
	 * PowerPoint Table Design option: Banded Columns
	 */
	bandedColumns?: boolean
	/**
	 * OOXML aliases for advanced callers.
	 */
	firstRow?: boolean
	lastRow?: boolean
	firstCol?: boolean
	lastCol?: boolean
	bandRow?: boolean
	bandCol?: boolean

	/**
	 * Whether to enable auto-paging
	 * - auto-paging creates new slides as content overflows a slide
	 * @default false
	 */
	autoPage?: boolean
	/**
	 * Auto-paging character weight
	 * - adjusts how many characters are used before lines wrap
	 * - range: -1.0 to 1.0
	 * @see https://gitbrent.github.io/PptxGenJS/docs/api-tables.html
	 * @default 0.0
	 * @example 0.5 // lines are longer (increases the number of characters that can fit on a given line)
	 */
	autoPageCharWeight?: number
	/**
	 * Auto-paging line weight
	 * - adjusts how many lines are used before slides wrap
	 * - range: -1.0 to 1.0
	 * @see https://gitbrent.github.io/PptxGenJS/docs/api-tables.html
	 * @default 0.0
	 * @example 0.5 // tables are taller (increases the number of lines that can fit on a given slide)
	 */
	autoPageLineWeight?: number
	/**
	 * Whether table header row(s) should be repeated on each new slide creating by autoPage.
	 * Use `autoPageHeaderRows` to designate how many rows comprise the table header (1+).
	 * @default false
	 * @since v3.3.0
	 */
	autoPageRepeatHeader?: boolean
	/**
	 * Number of rows that comprise table headers
	 * - required when `autoPageRepeatHeader` is set to true.
	 * @example 2 - repeats the first two table rows on each new slide created
	 * @default 1
	 * @since v3.3.0
	 */
	autoPageHeaderRows?: number
	/**
	 * The `y` location to use on subsequent slides created by autopaging
	 * @default (top margin of Slide)
	 */
	autoPageSlideStartY?: number
	/**
	 * Table border
	 * - single value is applied to all 4 sides
	 * - array of values in TRBL order for individual sides
	 */
	border?: BorderProps | [BorderProps, BorderProps, BorderProps, BorderProps]
	/**
	 * Width of table columns (inches)
	 * - single value is applied to every column equally based upon `w`
	 * - array of values in applied to each column in order
	 * @default columns of equal width based upon `w`
	 */
	colW?: number | number[]
	/**
	 * Cell background color
	 * @example { color:'FF0000' } // hex color (red)
	 * @example { color:'0088CC', transparency:50 } // hex color, 50% transparent
	 * @example { color:pptx.SchemeColor.accent1 } // theme color Accent1
	 */
	fill?: ShapeFillProps
	/**
	 * Cell margin (inches)
	 * - affects all table cells, is superceded by cell options
	 */
	margin?: Margin
	/**
	 * Height of table rows (inches)
	 * - single value is applied to every row equally based upon `h`
	 * - array of values in applied to each row in order
	 * @default rows of equal height based upon `h`
	 */
	rowH?: number | number[]
	/**
	 * DEV TOOL: Verbose Mode (to console)
	 * - tell the library to provide an almost ridiculous amount of detail during auto-paging calculations
	 * @default false // obviously
	 */
	verbose?: boolean // Undocumented; shows verbose output

	/**
	 * @deprecated v3.3.0 - use `autoPageSlideStartY`
	 */
	newSlideStartY?: number
}
export interface TableCell {
	_type: SLIDE_OBJECT_TYPES.tablecell
	/** lines in this cell (autoPage) */
	_lines?: TableCell[][]
	/** `text` prop but guaranteed to hold "TableCell[]" */
	_tableCells?: TableCell[]
	/** height in EMU */
	_lineHeight?: number
	_hmerge?: boolean
	_vmerge?: boolean
	_rowContinue?: number
	_optImp?: any

	text?: string | TableCell[] // TODO: FUTURE: 20210815: ONly allow `TableCell[]` dealing with string|TableCell[] *SUCKS*
	options?: TableCellProps
}
export interface TableRowSlide {
	rows: TableRow[]
}
export type TableRow = TableCell[]

// text ===========================================================================================
export interface TextGlowProps {
	/**
	 * Border color (hex format)
	 * @example 'FF3399'
	 */
	color?: HexColor
	/**
	 * opacity (0.0 - 1.0)
	 * @example 0.5
	 * 50% opaque
	 */
	opacity?: number
	/**
	 * size (points)
	 */
	size: number
}

/**
 * WordArt preset text transform types
 * @see https://docs.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.presetTextWarpValues
 */
export type WordArtTransform =
	// No Transform
	| 'textNoShape'
	// Basic Transforms
	| 'textPlain'
	// Warps - Follow Path
	| 'textArchUp'
	| 'textArchDown'
	| 'textCircle'
	| 'textButton'
	// Warps - Warp
	| 'textArchUpPour'
	| 'textArchDownPour'
	| 'textCirclePour'
	| 'textButtonPour'
	| 'textCurveUp'
	| 'textCurveDown'
	| 'textCanUp'
	| 'textCanDown'
	| 'textWave1'
	| 'textWave2'
	| 'textWave4'
	| 'textDoubleWave1'
	| 'textInflate'
	| 'textDeflate'
	| 'textInflateBottom'
	| 'textDeflateBottom'
	| 'textInflateTop'
	| 'textDeflateTop'
	| 'textDeflateInflate'
	| 'textDeflateInflateDeflate'
	| 'textFadeRight'
	| 'textFadeLeft'
	| 'textFadeUp'
	| 'textFadeDown'
	| 'textSlantUp'
	| 'textSlantDown'
	| 'textCascadeUp'
	| 'textCascadeDown'
	// Warps - Chevron/Triangle
	| 'textChevron'
	| 'textChevronInverted'
	| 'textRingInside'
	| 'textRingOutside'
	| 'textTriangle'
	| 'textTriangleInverted'
	| 'textStop'

/**
 * WordArt transform properties for text
 * @example { transform: 'textArchUp' }
 * @example { transform: 'textWave1', adjustments: [50000] }
 */
export interface WordArtProps {
	/**
	 * WordArt preset transform type
	 * @example 'textArchUp'
	 */
	transform: WordArtTransform
	/**
	 * Optional native adjustment guide for the transform (in 1/100000 of shape dimension).
	 * PowerPoint persists one `adj` guide only for the transform families exposed by
	 * the BetterPPTX option catalog; unsupported families remain discrete selectors.
	 * @example [50000] // 50% adjustment
	 */
	adjustments?: number[]
}

/**
 * Text reflection effect properties
 * @example { blur: 0.5, offset: 0.5, opacity: 0.5 }
 */
export interface TextReflectionProps {
	/**
	 * Blur radius (points)
	 * - PowerPoint: Format Shape > Text Effects > Reflection > Blur
	 * - range: 0-100
	 * @default 0
	 */
	blur?: number
	/**
	 * Distance from text to reflection (points)
	 * - PowerPoint: Format Shape > Text Effects > Reflection > Distance
	 * - range: 0-100
	 * @default 0
	 */
	offset?: number
	/**
	 * Starting opacity (0.0 - 1.0)
	 * - PowerPoint: Format Shape > Text Effects > Reflection > Transparency
	 * @default 0.5
	 * @example 0.5 // 50% opaque
	 */
	opacity?: number
	/**
	 * Ending opacity (0.0 - 1.0)
	 * - Controls fade effect of reflection
	 * @default 0
	 */
	endOpacity?: number
	/**
	 * Starting position of fade (0-100%)
	 * @default 0
	 */
	fadeStart?: number
	/**
	 * Ending position of fade (0-100%)
	 * @default 100
	 */
	fadeEnd?: number
	/**
	 * Reflection angle (degrees)
	 * - range: 0-359
	 * @default 90
	 */
	angle?: number
	/**
	 * Vertical scaling of reflection (percent)
	 * - negative values flip the reflection
	 * @default -100
	 */
	scaleY?: number
}

/**
 * 3D bevel preset types
 * @see https://docs.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.bevelpresettypevalues
 */
export type BevelPreset =
	| 'angle'
	| 'artDeco'
	| 'circle'
	| 'convex'
	| 'coolSlant'
	| 'cross'
	| 'divot'
	| 'hardEdge'
	| 'relaxedInset'
	| 'riblet'
	| 'slope'
	| 'softRound'

/**
 * 3D preset material types
 * @see https://docs.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.presetmaterialtypevalues
 */
export type Material3D =
	| 'clear'
	| 'dkEdge'
	| 'flat'
	| 'legacyMatte'
	| 'legacyMetal'
	| 'legacyPlastic'
	| 'legacyWireframe'
	| 'matte'
	| 'metal'
	| 'plastic'
	| 'powder'
	| 'softEdge'
	| 'softmetal'
	| 'translucentPowder'
	| 'warmMatte'

/**
 * 3D lighting rig preset types
 */
export type LightRig3D =
	| 'balanced'
	| 'brightRoom'
	| 'chilly'
	| 'contrasting'
	| 'flat'
	| 'flood'
	| 'freezing'
	| 'glow'
	| 'harsh'
	| 'legacyFlat1'
	| 'legacyFlat2'
	| 'legacyFlat3'
	| 'legacyFlat4'
	| 'legacyHarsh1'
	| 'legacyHarsh2'
	| 'legacyHarsh3'
	| 'legacyHarsh4'
	| 'legacyNormal1'
	| 'legacyNormal2'
	| 'legacyNormal3'
	| 'legacyNormal4'
	| 'morning'
	| 'soft'
	| 'sunrise'
	| 'sunset'
	| 'threePt'
	| 'twoPt'

/**
 * 3D bevel properties
 */
export interface Bevel3DProps {
	/**
	 * Bevel preset type
	 * @default 'circle'
	 */
	type?: BevelPreset
	/**
	 * Bevel width (points)
	 * @default 6
	 */
	width?: number
	/**
	 * Bevel height (points)
	 * @default 6
	 */
	height?: number
}

/**
 * 3D text effect properties
 * @example { bevel: { type: 'circle', width: 6, height: 6 } }
 * @example { extrusion: 10, material: 'metal', lightRig: 'threePt' }
 * @example { bevel: { type: 'circle' }, rotationX: 15, rotationY: 15 } // with 3D rotation to show depth
 */
export interface Text3DProps {
	/**
	 * Top bevel settings
	 * - PowerPoint: Format Shape > Text Effects > 3-D Format > Top Bevel
	 */
	bevel?: Bevel3DProps
	/**
	 * Bottom bevel settings
	 * - PowerPoint: Format Shape > Text Effects > 3-D Format > Bottom Bevel
	 */
	bevelBottom?: Bevel3DProps
	/**
	 * Extrusion/depth (points)
	 * - PowerPoint: Format Shape > Text Effects > 3-D Format > Depth
	 * - Creates 3D depth effect
	 * - NOTE: Depth is only visible when 3D rotation is also applied!
	 * - PowerPoint range: 0..5000 points; native serializer resolution: 1/12700 point
	 * @default 0
	 */
	extrusion?: number
	/**
	 * Extrusion color (hex)
	 * @example 'FF3399'
	 */
	extrusionColor?: HexColor
	/**
	 * Contour width (points)
	 * - PowerPoint: Format Shape > Text Effects > 3-D Format > Contour
	 * @default 0
	 */
	contourWidth?: number
	/**
	 * Contour color (hex)
	 * @example 'FF3399'
	 */
	contourColor?: HexColor
	/**
	 * Material/surface type
	 * - PowerPoint: Format Shape > Text Effects > 3-D Format > Material
	 * @default 'warmMatte'
	 */
	material?: Material3D
	/**
	 * Lighting type
	 * - PowerPoint: Format Shape > Text Effects > 3-D Format > Lighting
	 * @default 'threePt'
	 */
	lightRig?: LightRig3D
	/**
	 * Light direction/rotation (degrees)
	 * - range: 0-359
	 * @default 0
	 */
	lightDirection?: number
	/**
	 * X-axis rotation (degrees)
	 * - PowerPoint: Format Shape > 3-D Rotation > X Rotation
	 * - range: -90 to 90
	 * - NOTE: Rotation is required to make bevel/depth effects visible!
	 * @default 0
	 */
	rotationX?: number
	/**
	 * Y-axis rotation (degrees)
	 * - PowerPoint: Format Shape > 3-D Rotation > Y Rotation
	 * - range: -90 to 90
	 * - NOTE: Rotation is required to make bevel/depth effects visible!
	 * @default 0
	 */
	rotationY?: number
	/**
	 * Z-axis rotation (degrees)
	 * - PowerPoint: Format Shape > 3-D Rotation > Z Rotation
	 * - range: 0-359
	 * @default 0
	 */
	rotationZ?: number
	/**
	 * Perspective field of view (degrees)
	 * - Only applies when using perspective camera presets
	 * - range: 0-120
	 * @default 45
	 */
	perspective?: number
}

export interface TextPropsOptions extends PositionProps, DataOrPathProps, TextBaseProps, ObjectNameProps {
	_bodyProp?: {
		// Note: Many of these duplicated as user options are transformed to _bodyProp options for XML processing
		autoFit?: boolean
		align?: TEXT_HALIGN
		anchor?: TEXT_VALIGN
		lIns?: number
		rIns?: number
		tIns?: number
		bIns?: number
		vert?: 'eaVert' | 'horz' | 'mongolianVert' | 'vert' | 'vert270' | 'wordArtVert' | 'wordArtVertRtl'
		wrap?: boolean
	}
	_lineIdx?: number
	/** When true, suppresses extra default XML tags added by PptxGenJS that are absent in native PowerPoint files. */
	_nativeMinimal?: boolean
	/** @internal Keep a populated slide placeholder bound to layout/master geometry and style. */
	_nativePlaceholderInheritance?: boolean
	/** @internal Emit p:spPr without a local a:xfrm so placeholder geometry inherits. */
	_omitTransform?: boolean
	/** @internal Emit an empty p:spPr for a fully inherited placeholder. */
	_emptySpPr?: boolean
	/** @internal Omit preset geometry when a slide authors only style components. */
	_omitShapePrstGeom?: boolean
	/** @internal Structured p:style references for inherited/native shape styling. */
	_shapeStyleRefs?: PlaceholderVisualStyle['styleRefs']
	/** @internal Canonical public placeholder style retained for exact export. */
	_betterpptxPlaceholderStyle?: PlaceholderVisualStyle | null

	baseline?: number
	/**
	 * Native DrawingML text field carried by this run. The public compiler
	 * supplies a canonical GUID before serialization.
	 */
	field?: {
		id: string
		type: string
	}
	/**
	 * Character spacing
	 */
	charSpacing?: number
	/**
	 * Text fit options
	 *
	 * MS-PPT > Format Shape > Shape Options > Text Box > "[unlabeled group]": [3 options below]
	 * - 'none' = Do not Autofit
	 * - 'shrink' = Shrink text on overflow
	 * - 'resize' = Resize shape to fit text
	 *
	 * **Note** 'shrink' and 'resize' only take effect after editing text/resize shape.
	 * Both PowerPoint and Word dynamically calculate a scaling factor and apply it when edit/resize occurs.
	 *
	 * There is no way for this library to trigger that behavior, sorry.
	 * @since v3.3.0
	 * @default "none"
	 */
	fit?: 'none' | 'shrink' | 'resize'
	/**
	 * Shape fill
	 * @example { color:'FF0000' } // hex color (red)
	 * @example { color:'0088CC', transparency:50 } // hex color, 50% transparent
	 * @example { color:pptx.SchemeColor.accent1 } // theme color Accent1
	 */
	fill?: ShapeFillProps
	/**
	 * Text character fill, independent from the containing text-box shape fill.
	 * PowerPoint: Format Shape > Text Options > Text Fill & Outline > Text Fill.
	 * Transparency is a 0–100 percentage value and is serialized on the text run.
	 */
	textFill?: TextFillProps | null
	/**
	 * Text character outline, independent from the containing text-box shape line.
	 * Transparency is a 0–100 percentage; widthPt is the glyph stroke width in points.
	 */
	textOutline?: { color?: Color, transparency?: number, widthPt?: number }
	/**
	 * Flip shape horizontally?
	 * @default false
	 */
	flipH?: boolean
	/**
	 * Flip shape vertical?
	 * @default false
	 */
	flipV?: boolean
	glow?: TextGlowProps
	hyperlink?: HyperlinkProps
	/**
	 * WordArt text transform effect
	 * @example { transform: 'textArchUp' }
	 * @example { transform: 'textWave1' }
	 */
	wordArt?: WordArtProps
	/**
	 * Text reflection effect
	 * @example { blur: 3, offset: 3, opacity: 0.5 }
	 */
	reflection?: TextReflectionProps
	/**
	 * 3D text effect (bevel, extrusion, lighting)
	 * @example { bevel: { type: 'circle', width: 6, height: 6 } }
	 * @example { extrusion: 10, material: 'metal', lightRig: 'threePt' }
	 */
	text3D?: Text3DProps
	/**
	 * Text shadow effect (applied to text characters, not shape)
	 * - PowerPoint: Format Shape > Text Effects > Shadow
	 * @example { type: 'outer', blur: 4, offset: 3, angle: 45, color: '000000', opacity: 0.5 }
	 */
	textShadow?: ShadowProps
	/**
	 * Text glow effect (applied to text characters only, not shape)
	 * - Use this instead of `glow` when you want glow only on text, not the shape box
	 * - PowerPoint: Format Shape > Text Effects > Glow
	 * @example { size: 8, color: 'FF0000', opacity: 0.6 }
	 */
	textGlow?: TextGlowProps
	/**
	 * Text reflection effect (applied to text characters only, not shape)
	 * - Use this instead of `reflection` when you want reflection only on text, not the shape box
	 * - PowerPoint: Format Shape > Text Effects > Reflection
	 * @example { blur: 0.5, offset: 4, opacity: 0.5, fadeEnd: 50 }
	 */
	textReflection?: TextReflectionProps
	indentLevel?: number
	/** Paragraph left indentation in points. */
	indent?: number
	/** Paragraph hanging indentation in points. */
	hanging?: number
	isTextBox?: boolean
	line?: ShapeLineProps
	/**
	 * Line spacing (pt)
	 * - PowerPoint: Paragraph > Indents and Spacing > Line Spacing: > "Exactly"
	 * @example 28 // 28pt
	 */
	lineSpacing?: number
	/**
	 * line spacing multiple (percent)
	 * - range: 0.0-9.99
	 * - PowerPoint: Paragraph > Indents and Spacing > Line Spacing: > "Multiple"
	 * @example 1.5 // 1.5X line spacing
	 * @since v3.5.0
	 */
	lineSpacingMultiple?: number
	// TODO: [20220219] powerpoint uses inches but library has always been pt... @future @deprecated - update in v4.0? [range: 0.0-22.0]
	/**
	 * Margin (points)
	 * - PowerPoint: Format Shape > Shape Options > Size & Properties > Text Box > Left/Right/Top/Bottom margin
	 * @default "Normal" margin in PowerPoint [3.5, 7.0, 3.5, 7.0] // (this library sets no value, but PowerPoint defaults to "Normal" [0.05", 0.1", 0.05", 0.1"])
	 * @example 0 // Top/Right/Bottom/Left margin 0 [0.0" in powerpoint]
	 * @example 10 // Top/Right/Bottom/Left margin 10 [0.14" in powerpoint]
	 * @example [10,5,10,5] // Top margin 10, Right margin 5, Bottom margin 10, Left margin 5
	 */
	margin?: Margin
	outline?: { color: Color, size: number }
	paraSpaceAfter?: number
	paraSpaceBefore?: number
	placeholder?: string
	/**
	 * Rounded rectangle radius (only for pptx.shapes.ROUNDED_RECTANGLE)
	 * - values: 0.0 to 1.0
	 * @default 0
	 */
	rectRadius?: number
	/**
	 * Rotation (degrees)
	 * - range: -360 to 360
	 * @default 0
	 * @example 180 // rotate 180 degrees
	 */
	rotate?: number
	/**
	 * Whether to enable right-to-left mode
	 * @default false
	 */
	rtlMode?: boolean
	shadow?: ShadowProps
	shape?: SHAPE_NAME
	strike?: boolean | 'dblStrike' | 'sngStrike'
	subscript?: boolean
	superscript?: boolean
	/**
	 * Vertical alignment
	 * @default middle
	 */
	valign?: VAlign
	vert?: 'eaVert' | 'horz' | 'mongolianVert' | 'vert' | 'vert270' | 'wordArtVert' | 'wordArtVertRtl'
	/**
	 * Text wrap
	 * @since v3.3.0
	 * @default true
	 */
	wrap?: boolean

	/**
	 * Whether "Fit to Shape?" is enabled
	 * @deprecated v3.3.0 - use `fit`
	 */
	autoFit?: boolean
	/**
	 * Whather "Shrink Text on Overflow?" is enabled
	 * @deprecated v3.3.0 - use `fit`
	 */
	shrinkText?: boolean
	/**
	 * Inset
	 * @deprecated v3.10.0 - use `margin`
	 */
	inset?: number
	/**
	 * Dash type
	 * @deprecated v3.3.0 - use `line.dashType`
	 */
	lineDash?: 'solid' | 'dash' | 'dashDot' | 'lgDash' | 'lgDashDot' | 'lgDashDotDot' | 'sysDash' | 'sysDot'
	/**
	 * @deprecated v3.3.0 - use `line.beginArrowType`
	 */
	lineHead?: 'none' | 'arrow' | 'diamond' | 'oval' | 'stealth' | 'triangle'
	/**
	 * @deprecated v3.3.0 - use `line.width`
	 */
	lineSize?: number
	/**
	 * @deprecated v3.3.0 - use `line.endArrowType`
	 */
	lineTail?: 'none' | 'arrow' | 'diamond' | 'oval' | 'stealth' | 'triangle'
}
export interface TextProps {
	text?: string
	options?: TextPropsOptions
}

export type EquationSourceFormat = 'plain' | 'unicodeMath' | 'omml' | 'template'
export type EquationDisplayMode = 'professional' | 'linear'

export type EquationTemplate =
	| string
	| {
		kind:
			| 'text'
			| 'row'
			| 'group'
			| 'fraction'
			| 'frac'
			| 'superscript'
			| 'sup'
			| 'subscript'
			| 'sub'
			| 'subsup'
			| 'presubsup'
			| 'preSubSup'
			| 'radical'
			| 'sqrt'
			| 'nary'
			| 'summation'
			| 'sum'
			| 'integral'
			| 'bracket'
			| 'delimiter'
			| 'cases'
			| 'eqArr'
			| 'function'
			| 'func'
			| 'accent'
			| 'bar'
			| 'overbar'
			| 'underbar'
			| 'box'
			| 'boxed'
			| 'limit'
			| 'limlow'
			| 'limitUpper'
			| 'limupp'
			| 'log'
			| 'operator'
			| 'groupChar'
			| 'groupchr'
			| 'matrix'
		text?: string
		value?: string
		items?: EquationTemplate[]
		children?: EquationTemplate[]
		base?: EquationTemplate
		expression?: EquationTemplate
		numerator?: EquationTemplate
		denominator?: EquationTemplate
		/** Office Math fraction presentation: stacked/bar, skewed, linear, or no-bar/small. */
		fractionType?: 'bar' | 'skw' | 'lin' | 'noBar'
		num?: EquationTemplate
		den?: EquationTemplate
		exponent?: EquationTemplate
		sup?: EquationTemplate
		subscript?: EquationTemplate
		sub?: EquationTemplate
		degree?: EquationTemplate
		radicand?: EquationTemplate
		lower?: EquationTemplate
		upper?: EquationTemplate
		body?: EquationTemplate
		left?: string
		right?: string
		separator?: string
		functionName?: EquationTemplate
		name?: string
		accentChar?: string
		position?: 'top' | 'bottom'
		groupChar?: string
		verticalJustification?: 'top' | 'bottom'
		limitLocation?: 'undOvr' | 'subSup'
		hideSub?: boolean
		hideSup?: boolean
		grow?: boolean
		italic?: boolean
		rows?: EquationTemplate[][]
		cells?: EquationTemplate[][]
		symbol?: string
		slots?: Record<string, EquationTemplate | EquationTemplate[] | EquationTemplate[][] | string>
	}

export interface EquationFallbackProps extends DataOrPathProps {
	/**
	 * Whether this fallback was generated by a trusted renderer.
	 * Native equations do not require a fallback, but caller-supplied fallbacks improve downlevel rendering.
	 */
	rendered?: boolean
}

export interface EquationProps extends PositionProps, TextBaseProps, ObjectNameProps {
	/**
	 * Equation source. Use `sourceFormat: "omml"` for exact Office Math XML, `template` for semantic structures,
	 * or `plain` / `unicodeMath` for simple native math text.
	 */
	source: string | EquationTemplate
	sourceFormat?: EquationSourceFormat
	display?: EquationDisplayMode
	align?: HAlign
	/**
	 * Optional caller-supplied fallback image. The library does not rasterize math by default.
	 */
	fallback?: false | EquationFallbackProps
	altText?: string | null
	lang?: string
	rotate?: number
	fontFace?: string
	fontSize?: number
	color?: Color
}

// charts =========================================================================================
// FUTURE: BREAKING-CHANGE: (soln: use `OptsDataLabelPosition|string` until 3.5/4.0)
/*
export interface OptsDataLabelPosition {
	pie: 'ctr' | 'inEnd' | 'outEnd' | 'bestFit'
	scatter: 'b' | 'ctr' | 'l' | 'r' | 't'
	// TODO: add all othere chart types
}
*/

export type ChartAxisTickMark = 'none' | 'inside' | 'outside' | 'cross'
export type ChartLineCap = 'flat' | 'round' | 'square'

export interface OptsChartData {
	_dataIndex?: number

	/**
	 * category labels
	 * @example ['Year 2000', 'Year 2010', 'Year 2020'] // single-level category axes labels
	 * @example [['Year 2000', 'Year 2010', 'Year 2020'], ['Decades', '', '']] // multi-level category axes labels
	 * @since `labels` string[][] type added v3.11.0
	 */
	labels?: string[] | string[][]
	/**
	 * series name
	 * @example 'Locations'
	 */
	name?: string
	/**
	 * bubble sizes
	 * @example [5, 1, 5, 1]
	 */
	sizes?: number[]
	/**
	 * category values
	 * @example [2000, 2010, 2020]
	 */
	values?: number[]
	/**
	 * Override `chartColors`
	 */
	// color?: string // TODO: WIP: (Pull #727)
}
// Used internally, probably shouldn't be used by end users
export interface IOptsChartData extends OptsChartData {
	labels?: string[][]
}
export interface OptsChartGridLine {
	/**
	 * MS-PPT > Chart format > Format Major Gridlines > Line > Cap type
	 * - line cap type
	 * @default flat
	 */
	cap?: ChartLineCap
	/**
	 * Gridline color (hex)
	 * @example 'FF3399'
	 */
	color?: HexColor
	/**
	 * Gridline size (points)
	 */
	size?: number
	/**
	 * Gridline style
	 */
	style?: 'solid' | 'dash' | 'dot' | 'none'
}
// TODO: 202008: chart types remain with predicated with "I" in v3.3.0 (ran out of time!)
export interface IChartMulti {
	type: CHART_NAME
	data: IOptsChartData[]
	options: IChartOptsLib
}
export interface IChartPropsFillLine {
	/**
	 * PowerPoint: Format Chart Area/Plot > Border ["Line"]
	 * @example border: {color: 'FF0000', pt: 1} // hex RGB color, 1 pt line
	 */
	border?: BorderProps
	/**
	 * PowerPoint: Format Chart Area/Plot Area > Fill
	 * @example fill: {color: '696969'} // hex RGB color value
	 * @example fill: {color: pptx.SchemeColor.background2} // Theme color value
	 * @example fill: {transparency: 50} // 50% transparency
	 */
	fill?: ShapeFillProps
}
export interface IChartAreaProps extends IChartPropsFillLine {
	/**
	 * Whether the chart area has rounded corners
	 * - only applies when either `fill` or `border` is used
	 * @default true
	 * @since v3.11
	 */
	roundedCorners?: boolean
}
export interface IChartPropsBase {
	/**
	 * Axis position
	 */
	axisPos?: 'b' | 'l' | 'r' | 't'
	chartColors?: HexColor[]
	/**
	 * opacity (0 - 100)
	 * @example 50 // 50% opaque
	 */
	chartColorsOpacity?: number
	dataBorder?: BorderProps
	displayBlanksAs?: string
	invertedColors?: HexColor[]
	lang?: string
	layout?: PositionProps
	shadow?: ShadowProps
	/**
	 * @default false
	 */
	showLabel?: boolean
	showLeaderLines?: boolean
	/**
	 * @default false
	 */
	showLegend?: boolean
	/**
	 * @default false
	 */
	showPercent?: boolean
	/**
	 * @default false
	 */
	showSerName?: boolean
	/**
	 * @default false
	 */
	showTitle?: boolean
	/**
	 * @default false
	 */
	showValue?: boolean
	/**
	 * 3D Perspecitve
	 * - range: 0-120
	 * @default 30
	 */
	v3DPerspective?: number
	/**
	 * Right Angle Axes
	 * - Shows chart from first-person perspective
	 * - Overrides `v3DPerspective` when true
	 * - PowerPoint: Chart Options > 3-D Rotation
	 * @default false
	 */
	v3DRAngAx?: boolean
	/**
	 * X Rotation
	 * - PowerPoint: Chart Options > 3-D Rotation
	 * - range: 0-359.9
	 * @default 30
	 */
	v3DRotX?: number
	/**
	 * Y Rotation
	 * - range: 0-359.9
	 * @default 30
	 */
	v3DRotY?: number

	/**
	 * PowerPoint: Format Chart Area (Fill & Border/Line)
	 * @since v3.11
	 */
	chartArea?: IChartAreaProps
	/**
	 * PowerPoint: Format Plot Area (Fill & Border/Line)
	 * @since v3.11
	 */
	plotArea?: IChartPropsFillLine

	/**
	 * @deprecated v3.11.0 - use `plotArea.border`
	 */
	border?: BorderProps
	/**
	 * @deprecated v3.11.0 - use `plotArea.fill`
	 */
	fill?: HexColor
}
export interface IChartPropsAxisCat {
	/**
	 * Multi-Chart prop: array of cat axes
	 */
	catAxes?: IChartPropsAxisCat[]
	catAxisBaseTimeUnit?: string
	catAxisCrossesAt?: number | 'autoZero'
	catAxisHidden?: boolean
	catAxisLabelColor?: string
	catAxisLabelFontBold?: boolean
	catAxisLabelFontFace?: string
	catAxisLabelFontItalic?: boolean
	catAxisLabelFontSize?: number
	catAxisLabelFrequency?: string
	catAxisLabelPos?: 'none' | 'low' | 'high' | 'nextTo'
	catAxisLabelRotate?: number
	catAxisLineColor?: string
	catAxisLineShow?: boolean
	catAxisLineSize?: number
	catAxisLineStyle?: 'solid' | 'dash' | 'dot'
	catAxisMajorTickMark?: ChartAxisTickMark
	catAxisMajorTimeUnit?: string
	catAxisMajorUnit?: number
	catAxisMaxVal?: number
	catAxisMinorTickMark?: ChartAxisTickMark
	catAxisMinorTimeUnit?: string
	catAxisMinorUnit?: number
	catAxisMinVal?: number
	/** @since v3.11.0 */
	catAxisMultiLevelLabels?: boolean
	catAxisOrientation?: 'minMax'
	catAxisTitle?: string
	catAxisTitleColor?: string
	catAxisTitleFontFace?: string
	catAxisTitleFontSize?: number
	catAxisTitleRotate?: number
	catGridLine?: OptsChartGridLine
	catLabelFormatCode?: string
	/**
	 * Whether data should use secondary category axis (instead of primary)
	 * @default false
	 */
	secondaryCatAxis?: boolean
	showCatAxisTitle?: boolean
}
export interface IChartPropsAxisSer {
	serAxisBaseTimeUnit?: string
	serAxisHidden?: boolean
	serAxisLabelColor?: string
	serAxisLabelFontBold?: boolean
	serAxisLabelFontFace?: string
	serAxisLabelFontItalic?: boolean
	serAxisLabelFontSize?: number
	serAxisLabelFrequency?: string
	serAxisLabelPos?: 'none' | 'low' | 'high' | 'nextTo'
	serAxisLineColor?: string
	serAxisLineShow?: boolean
	serAxisMajorTimeUnit?: string
	serAxisMajorUnit?: number
	serAxisMinorTimeUnit?: string
	serAxisMinorUnit?: number
	serAxisOrientation?: string
	serAxisTitle?: string
	serAxisTitleColor?: string
	serAxisTitleFontFace?: string
	serAxisTitleFontSize?: number
	serAxisTitleRotate?: number
	serGridLine?: OptsChartGridLine
	serLabelFormatCode?: string
	showSerAxisTitle?: boolean
}
export interface IChartPropsAxisVal {
	/**
	 * Whether data should use secondary value axis (instead of primary)
	 * @default false
	 */
	secondaryValAxis?: boolean
	showValAxisTitle?: boolean
	/**
	 * Multi-Chart prop: array of val axes
	 */
	valAxes?: IChartPropsAxisVal[]
	valAxisCrossesAt?: number | 'autoZero'
	valAxisDisplayUnit?: 'billions' | 'hundredMillions' | 'hundreds' | 'hundredThousands' | 'millions' | 'tenMillions' | 'tenThousands' | 'thousands' | 'trillions'
	valAxisDisplayUnitLabel?: boolean
	valAxisHidden?: boolean
	valAxisLabelColor?: string
	valAxisLabelFontBold?: boolean
	valAxisLabelFontFace?: string
	valAxisLabelFontItalic?: boolean
	valAxisLabelFontSize?: number
	valAxisLabelFormatCode?: string
	valAxisLabelPos?: 'none' | 'low' | 'high' | 'nextTo'
	valAxisLabelRotate?: number
	valAxisLineColor?: string
	valAxisLineShow?: boolean
	valAxisLineSize?: number
	valAxisLineStyle?: 'solid' | 'dash' | 'dot'
	/**
	 * PowerPoint: Format Axis > Axis Options > Logarithmic scale - Base
	 * - range: 2-99
	 * @since v3.5.0
	 */
	valAxisLogScaleBase?: number
	valAxisMajorTickMark?: ChartAxisTickMark
	valAxisMajorUnit?: number
	valAxisMaxVal?: number
	valAxisMinorTickMark?: ChartAxisTickMark
	valAxisMinVal?: number
	valAxisOrientation?: 'minMax'
	valAxisTitle?: string
	valAxisTitleColor?: string
	valAxisTitleFontFace?: string
	valAxisTitleFontSize?: number
	valAxisTitleRotate?: number
	valGridLine?: OptsChartGridLine
	/**
	 * Value label format code
	 * - this also directs Data Table formatting
	 * @since v3.3.0
	 * @example '#%' // round percent
	 * @example '0.00%' // shows values as '0.00%'
	 * @example '$0.00' // shows values as '$0.00'
	 */
	valLabelFormatCode?: string
}
export interface IChartPropsChartBar {
	bar3DShape?: string
	barDir?: string
	barGapDepthPct?: number
	/**
	 * MS-PPT > Format chart > Format Data Point > Series Options >  "Gap Width"
	 * - width (percent)
	 * - range: `0`-`500`
	 * @default 150
	 */
	barGapWidthPct?: number
	barGrouping?: string
	/**
	 * MS-PPT > Format chart > Format Data Point > Series Options >  "Series Overlap"
	 * - overlap (percent)
	 * - range: `-100`-`100`
	 * @since v3.9.0
	 * @default 0
	 */
	barOverlapPct?: number
}
export interface IChartPropsChartDoughnut {
	dataNoEffects?: boolean
	holeSize?: number
}
export interface IChartPropsChartLine {
	/**
	 * MS-PPT > Chart format > Format Data Series > Line > Cap type
	 * - line cap type
	 * @default flat
	 */
	lineCap?: ChartLineCap
	/**
	 * MS-PPT > Chart format > Format Data Series > Marker Options > Built-in > Type
	 * - line dash type
	 * @default solid
	 */
	lineDash?: 'dash' | 'dashDot' | 'lgDash' | 'lgDashDot' | 'lgDashDotDot' | 'solid' | 'sysDash' | 'sysDot'
	/**
	 * MS-PPT > Chart format > Format Data Series > Marker Options > Built-in > Type
	 * - marker type
	 * @default circle
	 */
	lineDataSymbol?: 'circle' | 'dash' | 'diamond' | 'dot' | 'none' | 'square' | 'triangle'
	/**
	 * MS-PPT > Chart format > Format Data Series > [Marker Options] > Border > Color
	 * - border color
	 * @default circle
	 */
	lineDataSymbolLineColor?: string
	/**
	 * MS-PPT > Chart format > Format Data Series > [Marker Options] > Border > Width
	 * - border width (points)
	 * @default 0.75
	 */
	lineDataSymbolLineSize?: number
	/**
	 * MS-PPT > Chart format > Format Data Series > Marker Options > Built-in > Size
	 * - marker size
	 * - range: 2-72
	 * @default 6
	 */
	lineDataSymbolSize?: number
	/**
	 * MS-PPT > Chart format > Format Data Series > Line > Width
	 * - line width (points)
	 * - range: 0-1584
	 * @default 2
	 */
	lineSize?: number
	/**
	 * MS-PPT > Chart format > Format Data Series > Line > Smoothed line
	 * - "Smoothed line"
	 * @default false
	 */
	lineSmooth?: boolean
}
export interface IChartPropsChartPie {
	dataNoEffects?: boolean
	/**
	 * MS-PPT > Format chart > Format Data Series > Series Options >  "Angle of first slice"
	 * - angle (degrees)
	 * - range: 0-359
	 * @since v3.4.0
	 * @default 0
	 */
	firstSliceAng?: number
}
export interface IChartPropsChartRadar {
	/**
	 * MS-PPT > Chart Type > Waterfall
	 * - radar chart type
	 * @default standard
	 */
	radarStyle?: 'standard' | 'marker' | 'filled' // TODO: convert to 'radar'|'markers'|'filled' in 4.0 (verbatim with PPT app UI)
}
export interface IChartPropsDataLabel {
	dataLabelBkgrdColors?: boolean
	dataLabelColor?: string
	dataLabelFontBold?: boolean
	dataLabelFontFace?: string
	dataLabelFontItalic?: boolean
	dataLabelFontSize?: number
	/**
	 * Data label format code
	 * @example '#%' // round percent
	 * @example '0.00%' // shows values as '0.00%'
	 * @example '$0.00' // shows values as '$0.00'
	 */
	dataLabelFormatCode?: string
	dataLabelFormatScatter?: 'custom' | 'customXY' | 'XY'
	dataLabelPosition?: 'b' | 'bestFit' | 'ctr' | 'l' | 'r' | 't' | 'inEnd' | 'outEnd'
}
export interface IChartPropsDataTable {
	dataTableFontSize?: number
	/**
	 * Data table format code
	 * @since v3.3.0
	 * @example '#%' // round percent
	 * @example '0.00%' // shows values as '0.00%'
	 * @example '$0.00' // shows values as '$0.00'
	 */
	dataTableFormatCode?: string
	/**
	 * Whether to show a data table adjacent to the chart
	 * @default false
	 */
	showDataTable?: boolean
	showDataTableHorzBorder?: boolean
	showDataTableKeys?: boolean
	showDataTableOutline?: boolean
	showDataTableVertBorder?: boolean
}
export interface IChartPropsLegend {
	legendColor?: string
	legendFontFace?: string
	legendFontSize?: number
	legendPos?: 'b' | 'l' | 'r' | 't' | 'tr'
}
export interface IChartPropsTitle extends TextBaseProps {
	title?: string
	titleAlign?: string
	titleBold?: boolean
	titleColor?: string
	titleFontFace?: string
	titleFontSize?: number
	titlePos?: { x: number, y: number }
	titleRotate?: number
}
export interface IChartOpts
	extends IChartPropsAxisCat,
	IChartPropsAxisSer,
	IChartPropsAxisVal,
	IChartPropsBase,
	IChartPropsChartBar,
	IChartPropsChartDoughnut,
	IChartPropsChartLine,
	IChartPropsChartPie,
	IChartPropsChartRadar,
	IChartPropsDataLabel,
	IChartPropsDataTable,
	IChartPropsLegend,
	IChartPropsTitle,
	ObjectNameProps,
	OptsChartGridLine,
	PositionProps {
	/**
	 * Alt Text value ("How would you describe this object and its contents to someone who is blind?")
	 * - PowerPoint: [right-click on a chart] > "Edit Alt Text..."
	 */
	altText?: string | null
	/** Named layout placeholder used by this editable chart graphic frame. */
	placeholder?: string
	/** Native chart placeholder role (`chart`). */
	phType?: PLACEHOLDER_TYPE
	phIdx?: number
	phSz?: 'full' | 'half' | 'quarter'
	phOrient?: 'horz' | 'vert'
	phHasCustomPrompt?: boolean
	hasCustomPrompt?: boolean
	hasBarePh?: boolean
	/**
	 * Override the ChartEx layoutId for modern Office chart families.
	 * Used for chart types such as treemap, sunburst, histogram, pareto,
	 * boxWhisker, waterfall, funnel, and regionMap.
	 */
	chartExLayoutId?: string
	/** PowerPoint chart gallery style variant (1-49 in the bundled Office corpus). */
	chartGalleryVariant?: number
	/** Native legacy chart style number (PowerPoint gallery style value). */
	chartStyleId?: number
	/** Office modern chart-style ID (101–112) used with the c14 compatibility branch. */
	chartStyleModernId?: number
	/** Optional ChartEx color-style gallery variant. */
	chartColorStyleId?: number
}

/**
 * A video payload authored as a native PowerPoint Record Studio capture.
 *
 * This is intentionally distinct from ordinary media. The presentation
 * authoring layer is responsible for attaching native slide notes, the
 * Record Studio timing tree, slide advance timing, and any native recorded
 * ink/laser actions that belong to the same session.
 */
export type RecordStudioCaptureProps = Omit<MediaProps, 'type' | 'isNarration' | 'showWhenStopped' | 'endOnStopAudio'> & {
	type?: 'video'
}

/**
 * Native PowerPoint connector properties.
 *
 * A connector is intentionally distinct from a line shape: PowerPoint stores
 * it as `p:cxnSp`, which preserves endpoint attachment/editability in the
 * native connector UI. The endpoint IDs/connection indices are optional so a
 * free connector can still be authored, while callers that know the target
 * shapes can request native binding.
 */
export interface ConnectorProps extends PositionProps, ObjectNameProps {
	connectorType?: 'straightConnector1' | 'elbowConnector2' | 'elbowConnector3' | 'elbowConnector4' | 'curvedConnector2' | 'curvedConnector3' | 'curvedConnector4'
	rotate?: number
	flipH?: boolean
	flipV?: boolean
	routing?: 'auto' | 'straight' | 'orthogonal' | 'elbow' | 'curved'
	startShapeId?: number
	startConnectionIndex?: number
	endShapeId?: number
	endConnectionIndex?: number
	line?: ShapeLineProps
	shadow?: ShadowProps
	/** Native connector effects, independent from the line and endpoint bindings. */
	glow?: TextGlowProps
	reflection?: TextReflectionProps
	softEdges?: ShapeSoftEdgesProps
	objectName?: string
	spid?: number
	/** Internal exact connector-gallery composition state. */
	_connectorStyleState?: {
		schemaVersion: 'betterpptx.connector-style-state.v1'
		connectorStylePresetId: string | null
		themeStyle?: {
			lineRef?: { index?: number, color?: PictureStyleColorProps }
			fillRef?: { index?: number, color?: PictureStyleColorProps }
			effectRef?: { index?: number, color?: PictureStyleColorProps }
			fontRef?: { role?: string, color?: PictureStyleColorProps }
		} | null
		presetLineDefaults?: ShapeLineProps
		authoredLineOverrides?: ShapeLineProps
		effectiveLine?: ShapeLineProps
	}
	/** Internal narrow DrawingML compatibility carriers for imported/gallery connectors. */
	_rawConnectorLineXml?: string
	_rawConnectorStyleXml?: string
}

/** Native editable group composed from engine-laid-out child objects. */
export interface GroupChildProps extends PositionProps, ObjectNameProps {
	kind?: 'shape' | 'connector' | 'group' | 'freeform' | 'customGeometry' | 'custom-geometry' | 'text' | 'textBox' | 'textShape' | 'image' | 'image-feature'
	shape?: SHAPE_NAME
	shapeName?: SHAPE_NAME
	text?: string | TextProps[]
	style?: Partial<TextPropsOptions & ImageProps>
	imageOptions?: Partial<ImageProps>
	data?: string
	path?: string
	rotate?: number
	rotation?: number
	flipH?: boolean
	flipV?: boolean
	/** Prepared only by native authoring; never accepted from a public client. */
	_nativeObject?: ISlideObject
	connectorType?: ConnectorProps['connectorType']
	routing?: ConnectorProps['routing']
	startShapeId?: number
	startConnectionIndex?: number
	endShapeId?: number
	endConnectionIndex?: number
	children?: GroupChildProps[]
	chOff?: PositionProps
	chExt?: PositionProps
	points?: ShapeProps['points']
	paths?: ShapeProps['points'][]
	booleanOperation?: 'combine' | 'fragment' | 'intersect' | 'subtract' | 'union'
	handle?: string
	geometryId?: string
	fill?: ShapeFillProps
	line?: ShapeLineProps
	glow?: TextGlowProps
	shadow?: ShadowProps
	reflection?: TextReflectionProps
	softEdges?: ShapeSoftEdgesProps
}

export interface GroupProps extends PositionProps, ObjectNameProps {
	children: GroupChildProps[]
	rotate?: number
	rotation?: number
	flipH?: boolean
	flipV?: boolean
	chOff?: PositionProps
	chExt?: PositionProps
}
export interface IChartOptsLib extends IChartOpts {
	_type?: CHART_NAME | IChartMulti[] // TODO: v3.4.0 - move to `IChartOpts`, remove `IChartOptsLib`
	_chartEx?: boolean
}
export interface ISlideRelChart extends OptsChartData {
	type: CHART_NAME | IChartMulti[]
	opts: IChartOptsLib
	data: IOptsChartData[]
	chartFamily?: 'legacy' | 'chartEx'
	// internal below
	rId: number
	Target: string
	globalId: number
	fileName: string
}

// Core
// ====
// PRIVATE vvv
export interface ISlideRel {
	type: SLIDE_OBJECT_TYPES
	Target: string
	fileName?: string
	data: any[] | string
	opts?: IChartOpts
	path?: string
	extn?: string
	globalId?: number
	rId: number
	/** Relationship owned by the structured Action Settings lifecycle. */
	_interactiveActionOwned?: boolean
}
export interface ISlideRelMedia {
	type: string
	/** Explicit OOXML relationship role for native media with shared targets. */
	mediaRelationshipRole?: 'primary' | 'companion' | 'cover' | 'online'
	opts?: MediaProps
	path?: string
	extn?: string
	data?: string | ArrayBuffer
	/** used to indicate that a media file has already been read/enocded (PERF) */
	isDuplicate?: boolean
	isSvgPng?: boolean
	svgSize?: { w: number, h: number }
	/** internal package dedupe scope for model3d assets */
	model3dAsset?: 'glb' | 'poster'
	/** Image relationship owned exclusively by the slide or layout background lifecycle. */
	isBackground?: boolean
	rId: number
	Target: string
	/** Native media caption track (WebVTT) bound to audio/video */
	isCaptionTrack?: boolean
	/** PowerPoint HD Photo layer used by native Picture Format Artistic Effects. */
	isArtisticEffectWdp?: boolean
	/** Visible raster relationship that supplies pixels for automatic HD Photo encoding. */
	artisticEffectSourceRid?: number
	/** Internal structured effect request used to create PowerPoint's cached preview. */
	artisticEffectSpec?: Record<string, unknown>
	/** Full structured Picture Format adjustment request used to create the cached preview and editable HD Photo source. */
	pictureAdjustmentSpec?: Record<string, unknown>
	/** Optional pre-rendered effect preview for runtimes without native Office rendering. */
	artisticEffectPreviewPath?: string
	artisticEffectPreviewData?: string
	/** Relationship/media part owned by the structured Action Settings lifecycle. */
	_interactiveActionOwned?: boolean
}
export interface NativePackagePart {
	path: string
	data: string
	encoding?: 'base64' | 'utf-8'
	contentType?: string
	defaultContentType?: string
}
export interface NativeSmartArtInfo {
	dataRid: string
	layoutRid: string
	quickStyleRid: string
	colorStyleRid: string
	drawingRid: string
	layoutId: string
	layoutName: string
	quickStyleId: string
	colorStyleId: string
	nodes: string[]
	/** Structured authored node tree retained for semantic export/update. */
	authoredNodes?: Array<string | SmartArtNode>
	/** Authored selector/format state retained alongside the flattened package model. */
	authoredOptions?: Partial<SmartArtProps>
	rightToLeft?: boolean
	fontFace?: string
	fontSize?: number
	color?: HexColor
	textColors?: HexColor[]
	palette?: HexColor[]
	title?: string
	altText?: string | null
	partPaths: {
		data: string
		layout: string
		quickStyle: string
		colors: string
		drawing: string
	}
}
export interface ISlideObject {
	_type: SLIDE_OBJECT_TYPES
	options?: ObjectOptions
	// equation
	equation?: EquationProps
	// native SmartArt
	smartArt?: NativeSmartArtInfo
	// text
	text?: TextProps[]
	// table
	arrTabRows?: TableCell[][]
	// chart
	chartRid?: number
	// image:
	image?: string
	imageRid?: number
	/** PowerPoint HD Photo relationship used by native Picture Format Artistic Effects. */
	artisticEffectRid?: number
	fallbackRid?: number
	hyperlink?: HyperlinkProps
	// media
	media?: string
	mtype?: MediaType
	// model3d
	model3dRid?: number
	rasterRid?: number
	// animation (can be single or multiple)
	animation?: AnimationProps | AnimationProps[]
	mediaRid?: number
	/** Explicit companion Office-media relationship for native audio/video. */
	mediaCompanionRid?: number
	/** Explicit preview-image relationship for native/online media. */
	mediaCoverRid?: number
	shape?: SHAPE_NAME
	connector?: ConnectorProps
	group?: GroupProps
	// passthrough (raw OOXML)
	type?: string  // for passthrough type identification
	passthrough?: {
		xml: string
	}
}
// PRIVATE ^^^

export interface WriteBaseProps {
	/**
	 * Whether to compress export (saves substantial space with minimal export time impact)
	 * @default true
	 * @since v3.5.0
	 */
	compression?: boolean
	/**
	 * Disable automatic off-slide correction.
	 * By default, elements extending beyond slide boundaries are automatically scaled/repositioned to fit.
	 * Set to true to throw an error instead of auto-correcting.
	 * @default false
	 * @since v4.0.0
	 */
	noOffSlideAutoCorrect?: boolean
	/**
	 * Preserve off-slide geometry instead of auto-correcting it.
	 * Intended for exact round-trip/decypher workflows where the source deck already contains off-slide elements.
	 * @default false
	 * @since v4.0.0
	 */
	preserveOffSlide?: boolean
}
export interface WriteProps extends WriteBaseProps {
	/**
	 * Output type
	 * - values: 'arraybuffer' | 'base64' | 'binarystring' | 'blob' | 'nodebuffer' | 'uint8array' | 'STREAM'
	 * @default 'blob'
	 */
	outputType?: WRITE_OUTPUT_TYPE
}
export interface WriteFileProps extends WriteBaseProps {
	/**
	 * Export file name
	 * @default 'Presentation.pptx'
	 */
	fileName?: string
}
export interface SectionProps {
	_type: 'user' | 'default'
	_slides: PresSlide[]
	/**
	 * Stable section GUID (ST_Guid, braces, upper), assigned lazily and reused across writes.
	 * Required so a Section Zoom can reference this section by id. @see plans/section-zoom-ooxml-ground-truth.md
	 */
	_id?: string
	/** Public semantic identity. Never serialized as a native section GUID. */
	_betterpptxSemanticId?: string
	/** Engine ownership marker for a generated Summary Zoom graph. */
	_betterpptxSummaryZoomOwner?: string

	/**
	 * Section title
	 */
	title: string
	/**
	 * Section order - uses to add section at any index
	 * - values: 1-n
	 */
	order?: number
}
export interface PresLayout {
	_sizeW?: number
	_sizeH?: number
	type?: string
	/**
	 * Optional native objects owned by this slide-layout part.  These are most
	 * commonly placeholder definitions, but the carrier also accepts the same
	 * editable object vocabulary as a slide master.
	 */
	objects?: SlideMasterProps['objects'] | null
	placeholders?: Array<{
		name: string
		type?: string
		idx?: number
		size?: string
		orient?: 'horz' | 'vert'
		hasCustomPrompt?: boolean
		x?: Coord
		y?: Coord
		w?: Coord
		h?: Coord
		margin?: Margin
		text?: string | Array<{ text?: string }>
		style?: PlaceholderVisualStyle | null
	}> | null
	background?: BackgroundProps | null
	margin?: Margin
	slideNumber?: SlideNumberProps | null
	/**
	 * Native PowerPoint header/footer visibility policy for this layout.
	 * The four leaves map directly to PresentationML p:hf attributes and are
	 * independently inherited by slides that use the layout.
	 */
	headerFooter?: HeaderFooterProps | null
	/** Layout-level overrideClrMapping; null/omission uses the master mapping. */
	colorMapOverride?: InheritanceColorMap | null
	bkgd?: string | BackgroundProps

	/**
	 * Layout Name
	 * @example 'LAYOUT_WIDE'
	 */
	name: string
	width: number
	height: number
}
export interface HeaderFooterProps {
	/** Show the date/time placeholder. */
	date?: boolean
	/** Show the header placeholder. */
	header?: boolean
	/** Show the footer placeholder. */
	footer?: boolean
	/** Show the slide-number placeholder. */
	slideNumber?: boolean
	/** Explicit aliases accepted by JSON-spec clients. */
	showDate?: boolean
	showHeader?: boolean
	showFooter?: boolean
	showSlideNumber?: boolean
}
export interface SlideNumberProps extends PositionProps, TextBaseProps {
	/**
	 * margin (points)
	 */
	margin?: Margin // TODO: convert to inches in 4.0 (valid values are 0-22)
}
export interface SlideMasterProps {
	/**
	 * Unique name for this master
	 */
	title: string
	background?: BackgroundProps | null
	margin?: Margin
	slideNumber?: SlideNumberProps | null
	headerFooter?: HeaderFooterProps | null
	/** Master-level p:clrMap. */
	colorMap?: InheritanceColorMap | null
	/** Master title/body/other text-style defaults. */
	textStyles?: InheritanceTextStyles | null
	/** Replace the named master/layout placeholder set; null or [] clears it. */
	placeholders?: PresLayout['placeholders']
	objects?: Array<| { chart: IChartOpts }
		| { image: ImageProps }
		| { line: ShapeProps }
		| { rect: ShapeProps }
		| { text: TextProps }
		| {
			placeholder: {
				options: PlaceholderProps
				/**
				 * Text to be shown in placeholder (shown until user focuses textbox or adds text)
				 * - Leave blank to have powerpoint show default phrase (ex: "Click to add title")
				 */
				text?: string
			}
		}> | null

	/**
	 * @deprecated v3.3.0 - use `background`
	 */
	bkgd?: string | BackgroundProps
}
export interface ObjectOptions extends ImageProps, Model3DProps, PositionProps, ShapeProps, TableCellProps, TextPropsOptions {
	/** @internal Closed Action Settings state lowered by BetterPPTX's semantic compiler. */
	interactiveActions?: InteractiveActionSetProps | InteractiveActionEndpointProps | null
	_placeholderIdx?: number
	_placeholderType?: PLACEHOLDER_TYPE
	_placeholderOrient?: 'horz' | 'vert'
	_placeholderHasCustomPrompt?: boolean
	/** Semantic label for raw passthrough objects, e.g. chartEx. */
	_passthroughOriginalType?: string
	/** Product-level kind for preserved raw objects, e.g. chart. */
	_passthroughSemanticKind?: string
	/** Source format for preserved raw objects, e.g. chartEx. */
	_passthroughSourceFormat?: string
	/** Preservation mode for raw objects. */
	_passthroughPreservation?: 'passthrough' | string
	/** Optional chartEx summary metadata for tooling. */
	_chartEx?: {
		semanticKind?: string
		sourceFormat?: string
		preservation?: string
		layoutIds?: string[]
		series?: number
		points?: number
		dimensionTypes?: string[]
	}
	/**
	 * When true, suppresses extra default XML tags added by PptxGenJS that are absent in native PowerPoint files.
	 * This includes: miter, prstDash, effectLst, hiddenLine, hiddenFill, buNone, endParaRPr.
	 * Use this when regenerating natively-created PowerPoint files to achieve structural identity.
	 * @since v4.x.x
	 */
	_nativeMinimal?: boolean

	cx?: Coord
	cy?: Coord
	animation?: AnimationProps
	margin?: Margin
	colW?: number | number[] // table
	rowH?: number | number[] // table
	/**
	 * Enable interactive playback controls for media (click-on-media-to-pause)
	 * @default true
	 * @since v4.0.0
	 */
	interactivePlayback?: boolean
	/**
	 * Explicit Shape ID (SPID/cNvPr id) override for shapes and images.
	 * When set, uses this value as the `id` attribute in `<p:cNvPr>` instead of the auto-computed idx+2.
	 * Used by the decypher tool to preserve original PowerPoint shape IDs for comparator matching.
	 * @since v4.x.x
	 */
	spid?: number
}

export interface SlideBaseProps {
	_bkgdImgRid?: number
	_margin?: Margin
	_name?: string
	_presLayout: PresLayout
	_rels: ISlideRel[]
	_relsChart: ISlideRelChart[] // needed as we use args:"PresSlide|SlideLayout" often
	_relsMedia: ISlideRelMedia[] // needed as we use args:"PresSlide|SlideLayout" often
	_nativePackageParts?: NativePackagePart[]
	_slideNum: number
	/** Semantic slide id retained by the BetterPPTX spec/runtime bridge. */
	_betterpptxSemanticId?: string
	_slideNumberProps?: SlideNumberProps
	_headerFooter?: HeaderFooterProps
	_showMasterSp?: boolean
	_showMasterPhAnim?: boolean
	/** Master carrier p:clrMap state. */
	_colorMap?: InheritanceColorMap | null
	/** Layout/slide p:clrMapOvr state. */
	_colorMapOverride?: InheritanceColorMap | null
	/** Master carrier p:txStyles state. */
	_textStyles?: InheritanceTextStyles | null
	_slideObjects?: ISlideObject[]

	background?: BackgroundProps
	/**
	 * @deprecated v3.3.0 - use `background`
	 */
	bkgd?: string | BackgroundProps
}
export interface SlideLayout extends SlideBaseProps {
	/** @internal Semantic parent master name for the authored single-master contract. */
	_betterpptxMasterName?: string | null
	/** @internal Typed physical parent master for multi-master package assembly. */
	_slideMaster?: PresSlide | null
	/** @internal Marks a layout owned by the semantic authored-layout collection. */
	_betterpptxOwnedLayout?: boolean
	/** @internal Distinguishes authored layout/master carrier roles. */
	_betterpptxCarrierKind?: 'layout' | 'master'
	_slide?: {
		_bkgdImgRid?: number
		back: string
		color: string
		hidden?: boolean
	}
}
export interface PresSlide extends SlideBaseProps {
	_rId: number
	_slideLayout: SlideLayout
	_slideId: number
	_animations?: Array<{ target: ISlideObject; animation: AnimationProps; shapeId: number; paragraphCount?: number }>
	/**
	 * Raw timing XML passthrough for slides with unsupported animations
	 * When set, this XML is used directly instead of generating animations
	 * @private
	 */
	_rawTimingXml?: string

	addChart: (type: CHART_NAME | IChartMulti[], data: IOptsChartData[], options?: IChartOpts) => PresSlide
	addEquation: (options: EquationProps) => PresSlide
	addCameo: (options: CameoProps) => PresSlide
	addZoom: (options: ZoomProps) => PresSlide
	addSectionZoom: (options: SectionZoomProps) => PresSlide
	addSummaryZoom: (options?: SummaryZoomProps) => PresSlide
	/** Accessor to the presentation's sections (used by Section/Summary Zoom to resolve sections). @private */
	getSections?: () => SectionProps[]
	addImage: (options: ImageProps) => PresSlide
	addMedia: (options: MediaProps) => PresSlide
	addRecordStudioCapture: (options: RecordStudioCaptureProps) => PresSlide
	addModel3D: (options: Model3DProps) => PresSlide
	addNotes: (notes: string) => PresSlide
	addShape: (shapeName: SHAPE_NAME, options?: ShapeProps) => PresSlide
	addConnector: (options?: ConnectorProps) => PresSlide
	addGroup: (options: GroupProps) => PresSlide
	addSmartArt: (options?: SmartArtProps) => PresSlide
	addTable: (tableRows: TableRow[], options?: TableProps) => PresSlide
	addText: (text: string | TextProps[], options?: TextPropsOptions) => PresSlide
	/**
	 * Add raw OOXML element (passthrough for unsupported elements)
	 * @param xml - Raw OOXML XML string (e.g., <p:sp>...</p:sp>, <p:graphicFrame>...</p:graphicFrame>)
	 * @since v4.0.0
	 */
	addPassthroughXml: (xml: string, options?: Partial<ObjectOptions>) => PresSlide

	/**
	 * Background color or image (`color` | `path` | `data`)
	 * @example { color: 'FF3399' } - hex color
	 * @example { color: 'FF3399', transparency:50 } - hex color with 50% transparency
	 * @example { path: 'https://onedrives.com/myimg.png` } - retrieve image via URL
	 * @example { path: '/home/gitbrent/images/myimg.png` } - retrieve image via local path
	 * @example { data: 'image/png;base64,iVtDaDrF[...]=' } - base64 string
	 * @since v3.3.0
	 */
	background?: BackgroundProps
	/**
	 * Slide transition
	 * @example { type: 'fade', speed: 'slow' }
	 * @example { type: 'push', direction: 'left' }
	 */
	transition?: TransitionProps
	/**
	 * Default text color (hex format)
	 * @example 'FF3399'
	 * @default '000000' (DEF_FONT_COLOR)
	 */
	color?: HexColor
	/**
	 * Whether slide is hidden
	 * @default false
	 */
	hidden?: boolean
	/** Whether shapes inherited from the slide master are shown. */
	showMasterShapes?: boolean
	/** Whether placeholder animations inherited from the slide master are shown. */
	showMasterPhAnim?: boolean
	/**
	 * Slide number options
	 */
	slideNumber?: SlideNumberProps
}
export interface AddSlideProps {
	masterName?: string // TODO: 20200528: rename to "masterTitle" (createMaster uses `title` so lets be consistent)
	sectionTitle?: string
}
export interface PresentationProps {
	author: string
	company: string
	layout: string
	masterSlide: PresSlide
	/**
	 * Presentation's layout
	 * read-only
	 */
	presLayout: PresLayout
	revision: string
	/**
	 * Whether to enable right-to-left mode
	 * @default false
	 */
	rtlMode: boolean
	/**
	 * Presentation slideshow behavior.
	 * When `useTimings` is true, PowerPoint will honor slide transition timings in slideshow mode.
	 */
	showSettings?: PresentationShowSettings
	subject: string
	theme: ThemeProps
	title: string
}
// PRIVATE interface
export interface IPresentationProps extends PresentationProps {
	customShows?: CustomShowProps[]
	sections: SectionProps[]
	slideLayouts: SlideLayout[]
	slideMasters: PresSlide[]
	slides: PresSlide[]
}

export interface PresentationShowSettings {
	/**
	 * Run the slideshow using slide timings and timed animation sequences.
	 */
	useTimings?: boolean
	/**
	 * Enable slide animation playback in slideshow mode.
	 */
	showAnimation?: boolean
	/**
	 * Enable narration playback in slideshow mode.
	 */
	showNarration?: boolean
	/**
	 * Loop the show continuously until stopped.
	 */
	loop?: boolean
	/**
	 * PowerPoint show mode.
	 */
	mode?: 'present' | 'browse' | 'kiosk'
	/**
	 * Kiosk mode restart interval in milliseconds.
	 */
	restartMs?: number
	/**
	 * Show PowerPoint media controls during slideshow playback.
	 */
	showMediaControls?: boolean
}

// TRANSITION and ANIMATION INTERFACES
export interface TransitionProps {
	type?: string
	speed?: 'slow' | 'medium' | 'med' | 'fast'
	duration?: number
	/** Readable millisecond alias accepted by semantic authoring layers. */
	durationMs?: number
	direction?: 'horz' | 'vert' | 'up' | 'down' | 'left' | 'right' | 'u' | 'd' | 'l' | 'r' | 'lu' | 'ld' | 'ru' | 'rd' | 'in' | 'out'
	throughBlack?: boolean
	splitDirection?: 'horz' | 'vert' | 'in' | 'out'
	pattern?: string
	spokes?: number
	clockwise?: boolean
	zoomFrom?: 'in' | 'out'
	option?: 'byObject' | 'byWord' | 'byChar'
	invX?: boolean
	invY?: boolean
	advanceOnClick?: boolean
	advanceAfterTime?: number
	p14dur?: number
}

export interface AnimationProps {
	/**
	 * Normalized portion of the selected embedded 3D animation to play.
	 * Supported only by emphasis/playScene. Values must satisfy 0 <= start < end <= 1.
	 * The authored duration controls playback time for this interval; omission plays the full scene.
	 */
	sceneProgress?: { start: number; end: number }
	/**
	 * Animation type
	 * - entrance: Object appears
	 * - exit: Object disappears
	 * - emphasis: Object changes appearance
	 * - motion: Object follows motion path
	 */
	type: 'entrance' | 'emphasis' | 'exit' | 'motion' | 'media'
	
	/**
	 * Animation effect name
	 * @example 'appear', 'fly', 'fade', 'zoom', 'spin', 'wipe', 'split', etc.
	 */
	effect?: string
	
	/**
	 * Animation duration (milliseconds)
	 * @default varies by animation type (entrance: 700, exit: 500, emphasis: 700)
	 */
	duration?: number
	/** Public semantic alias for duration; normalized to the native millisecond carrier. */
	durationMs?: number
	
	/**
	 * Delay before animation starts (milliseconds)
	 * @default 0
	 */
	delay?: number
	/** Public semantic alias for delay; normalized to the native millisecond carrier. */
	delayMs?: number
	
	/**
	 * Animation trigger
	 * @default 'onClick'
	 */
	trigger?: string
	
	/**
	 * Direction for directional animations (fly, wipe, crawl, peek, split, strips, wedge, etc.)
	 * @example 'fromLeft', 'fromRight', 'fromTop', 'fromBottom'
	 * @example 'fromTopLeft', 'fromTopRight', 'fromBottomLeft', 'fromBottomRight'
	 * @example For native 3D model Arrive: 'right', 'left', 'up', 'down', 'clockwise', 'counterclockwise'
	 */
	direction?: string

	/**
	 * Effect intensity for native 3D model animation options.
	 * @example 'subtle', 'moderate', 'strong'
	 */
	intensity?: string

	/**
	 * Rotation axis/space for native 3D model animation options.
	 * @example 'object', 'objectCenter', 'view', 'viewCenter'
	 */
	rotationAxis?: string

	/**
	 * Structured effect options for native/special animations. Currently used by
	 * 3D model Arrive for direction, intensity, and rotationAxis.
	 */
	effectOptions?: {
		direction?: string
		intensity?: string
		amount?: string
		rotationAxis?: string
		axis?: string
		space?: string
	}
	
	/**
	 * Repeat count
	 * @default 1
	 */
	repeatCount?: number | 'indefinite'
	
	/**
	 * Auto reverse animation
	 * @default false
	 */
	autoReverse?: boolean
	
	/**
	 * Motion path (for motion path animations)
	 */
	motionPath?: string
	
	/**
	 * Motion path data (SVG path format)
	 */
	motionPathData?: string
	/**
	 * Coordinate space used by motionPathData/pathData.
	 *
	 * Public authoring uses slide space by default. Set to `powerpoint` only
	 * when a caller intentionally supplies already-lowered native coordinates.
	 */
	motionPathCoordinateSpace?: 'slide' | 'powerpoint'
	/** Motion-path interpolation. Linear preserves sampled trajectory timing; null restores smooth. */
	motionEasing?: 'smooth' | 'linear' | null
	
	/**
	 * Scale factor (for zoom, grow/shrink animations)
	 */
	scale?: number | null
	/** Independent grow/shrink factor. 1 leaves this axis unchanged; null uses scale or the effect default. */
	scaleX?: number | null
	/** Independent grow/shrink factor. Scaling a text shape non-uniformly also stretches its glyphs. */
	scaleY?: number | null
	
	/**
	 * Rotation degrees (for spin, swivel animations)
	 * @example 90, 180, 360, 720
	 */
	rotation?: number | null
	
	/**
	 * Rotation direction (for spin animations)
	 * @default true (clockwise)
	 */
	clockwise?: boolean
	
	/**
	 * Target color (for color change animations)
	 */
	color?: string
	
	/**
	 * Shape type for shape-based animations (circle, box, diamond, plus, wedge)
	 */
	shapeType?: string
	
	/**
	 * Amount for various animations (transparency, etc.) and native 3D model
	 * options.
	 * @example For Turntable: 'halfSpin', 'fullSpin', 'continuous'
	 * @example For Swing: 'once', 'twice', 'continuous'
	 */
	amount?: number | string
	
	/**
	 * Number of spokes for wheel animation
	 * @example 1, 2, 3, 4, 8
	 */
	spokes?: number
	
	/**
	 * Animation sequence mode
	 * - 'asOneObject': Single shape animates as one unit (default)
	 * - 'allAtOnce': Multiple text/shape elements animate simultaneously
	 * - 'byParagraph': Text animates paragraph by paragraph
	 * @default 'asOneObject'
	 * @since v4.0.0
	 */
	sequence?: 'asOneObject' | 'allAtOnce' | 'byParagraph'
	
	/**
	 * Group ID for grouped animations
	 * - Used when multiple objects should animate together
	 * @default 0
	 * @since v4.0.0
	 */
	groupId?: number
	
	/**
	 * Explicit Shape ID (SPID) override
	 * - Allows overriding the auto-computed SPID for special cases
	 * - Use when default SPID calculation doesn't match the target shape
	 * - Tables use formula: tableNum * slideNum + 1 (different from regular shapes)
	 * - Regular shapes use: objectIndex + 2
	 * @since v4.0.0
	 */
	spid?: number
	
	/**
	 * Animation order index
	 * - Controls the position of this animation in the sequence
	 * - Lower numbers appear first in the animation sequence
	 * - Animations with the same order are sorted by their original add order
	 * - Useful for interleaving media animations with entrance animations
	 * @default undefined (uses add order)
	 * @since v4.0.0
	 */
	order?: number
	/**
	 * Media command for media animations (type: 'media')
	 * - Use with effect: 'play', 'pause', 'stop', 'togglePause'
	 * - Examples: 'playFrom(0.0)', 'togglePause', 'stop'
	 * @default 'playFrom(0.0)' for play, 'togglePause' for pause, 'stop' for stop
	 * @since v4.0.0
	 */
	mediaCommand?: string
	
	/**
	 * Control whether visibility setter (style.visibility) is added to entrance/exit animations
	 * - When true: Adds visibility setter to control object visibility (e.g., fade animations)
	 * - When false: No visibility setter added (object remains visible/hidden by other means)
	 * - When undefined: Uses default from animation registry
	 * @default undefined (uses registry default, typically true for fade/appear)
	 * @since v4.0.0
	 */
	usesVisibility?: boolean
}
