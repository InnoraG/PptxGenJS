/**
 * PptxGenJS: Validation Engine
 * Provides constraint-based validation for presentations
 * @since v4.0.0
 */

import { Coord, ISlideObject, PresLayout, PresSlide } from './core-interfaces'
import { validateGradientDirectionOption, validateText3DRotationOption, validateWordArtTransformOption } from './option-registry'

// ============================================================================
// VALIDATION TYPES
// ============================================================================

/**
 * Validation severity levels
 */
export type ValidationSeverity = 'error' | 'warning' | 'info'

/**
 * Validation mode - controls strictness
 * - 'strict': All issues are errors
 * - 'normal': Standard validation (default)
 * - 'lenient': Only critical issues are errors
 */
export type ValidationMode = 'strict' | 'normal' | 'lenient'

/**
 * Validation issue codes for programmatic handling
 */
export type ValidationIssueCode =
	// Position issues
	| 'ELEMENT_OFF_SLIDE_LEFT'
	| 'ELEMENT_OFF_SLIDE_RIGHT'
	| 'ELEMENT_OFF_SLIDE_TOP'
	| 'ELEMENT_OFF_SLIDE_BOTTOM'
	| 'ELEMENT_PARTIALLY_OFF_SLIDE'
	// Dimension issues
	| 'ZERO_WIDTH'
	| 'ZERO_HEIGHT'
	| 'NEGATIVE_DIMENSION'
	| 'OVERSIZED_ELEMENT'
	// Animation issues
	| 'INVALID_ANIMATION_TARGET'
	| 'ANIMATION_ON_MISSING_SHAPE'
	| 'DUPLICATE_ANIMATION'
	// Content issues
	| 'EMPTY_TEXT_BOX'
	| 'MISSING_IMAGE_SOURCE'
	| 'INVALID_MEDIA_TYPE'
	| 'INVALID_GRADIENT_DIRECTION'
	| 'GRADIENT_DIRECTION_ALIAS'
	| 'NON_FINITE_NUMBER'
	| 'INVALID_COORDINATE'
	| 'INVALID_COLOR'
	| 'INVALID_TRANSPARENCY'
	| 'INVALID_OPACITY'
	| 'INVALID_ROTATION'
	| 'INVALID_MARGIN'
	| 'INVALID_LINE_WIDTH'
	| 'INVALID_GRADIENT_STOP'
	| 'INVALID_HYPERLINK'
	| 'INVALID_TABLE_GRID'
	| 'INVALID_PASSTHROUGH_XML'
	| 'INVALID_TEXT3D_ROTATION'
	| 'TEXT3D_ROTATION_NORMALIZED'
	| 'INVALID_WORDART_TRANSFORM'
	| 'WORDART_TRANSFORM_ALIAS'
	// Layout issues
	| 'OVERLAPPING_ELEMENTS'
	| 'ELEMENT_TOO_SMALL'

export const REPAIR_RISK_ISSUE_CODES: ValidationIssueCode[] = [
	'MISSING_IMAGE_SOURCE',
	'INVALID_MEDIA_TYPE',
	'INVALID_GRADIENT_DIRECTION',
	'NON_FINITE_NUMBER',
	'INVALID_COORDINATE',
	'INVALID_COLOR',
	'INVALID_TRANSPARENCY',
	'INVALID_OPACITY',
	'INVALID_ROTATION',
	'INVALID_MARGIN',
	'INVALID_LINE_WIDTH',
	'INVALID_GRADIENT_STOP',
	'INVALID_HYPERLINK',
	'INVALID_TABLE_GRID',
	'INVALID_PASSTHROUGH_XML',
	'INVALID_TEXT3D_ROTATION',
	'INVALID_WORDART_TRANSFORM',
]

const REPAIR_RISK_ISSUE_CODE_SET = new Set<ValidationIssueCode>(REPAIR_RISK_ISSUE_CODES)

export function isRepairRiskIssue(issue: Pick<ValidationIssue, 'code' | 'severity'>): boolean {
	return issue.severity === 'error' && REPAIR_RISK_ISSUE_CODE_SET.has(issue.code)
}

/**
 * A single validation issue
 */
export interface ValidationIssue {
	/** Issue severity */
	severity: ValidationSeverity
	/** Programmatic issue code */
	code: ValidationIssueCode
	/** Human-readable message */
	message: string
	/** Slide number (1-based) */
	slideNumber?: number
	/** Shape name if applicable */
	shapeName?: string
	/** Shape index if applicable */
	shapeIndex?: number
	/** Suggested fix */
	suggestion?: string
	/** Whether auto-fix is available */
	autoFixAvailable: boolean
	/** Additional context data */
	context?: Record<string, unknown>
}

/**
 * Validation result for a single slide or entire presentation
 */
export interface ValidationResult {
	/** Whether validation passed (no errors) */
	valid: boolean
	/** Total number of issues */
	issueCount: number
	/** Number of errors */
	errorCount: number
	/** Number of warnings */
	warningCount: number
	/** Number of info items */
	infoCount: number
	/** All issues found */
	issues: ValidationIssue[]
}

/**
 * Validation options
 */
export interface ValidationOptions {
	/** Validation mode */
	mode?: ValidationMode
	/** Whether to attempt auto-fix */
	autoFix?: boolean
	/** Specific checks to run (runs all if not specified) */
	checks?: Array<'bounds' | 'dimensions' | 'animations' | 'content' | 'layout' | 'repair'>
	/** Slide numbers to validate (validates all if not specified) */
	slides?: number[]
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Convert Coord to inches (resolves percentages and EMUs)
 * 
 * Note: Different object types store dimensions differently:
 * - Tables: Store as EMUs (large numbers like 457200)
 * - Shapes/Text: Store as inches (small numbers like 0.5)
 * 
 * We detect EMUs by checking if the value is > 20 (no slide is 20+ inches)
 */
function coordToInches(coord: Coord | undefined, slideSize: number): number {
	if (coord === undefined) return 0
	if (typeof coord === 'number') {
		// Detect if value is in EMUs (914400 EMU = 1 inch)
		// Values > 20 are likely EMUs since slides are typically < 20 inches
		if (coord > 20) {
			return coord / 914400
		}
		return coord
	}
	// Handle percentage strings like '50%'
	const percentMatch = coord.match(/^(\d+(?:\.\d+)?)%$/)
	if (percentMatch) {
		return (parseFloat(percentMatch[1]) / 100) * slideSize
	}
	return 0
}

/**
 * Get element bounds in inches
 */
function getElementBounds(obj: ISlideObject, presLayout: PresLayout): {
	x: number
	y: number
	w: number
	h: number
	right: number
	bottom: number
} {
	const slideWidth = presLayout.width / 914400 // EMU to inches
	const slideHeight = presLayout.height / 914400

	const x = coordToInches(obj.options?.x, slideWidth)
	const y = coordToInches(obj.options?.y, slideHeight)
	const w = coordToInches(obj.options?.w, slideWidth)
	const h = coordToInches(obj.options?.h, slideHeight)

	return {
		x,
		y,
		w,
		h,
		right: x + w,
		bottom: y + h,
	}
}

/**
 * Returns true for slide objects that render on the slide canvas.
 *
 * Speaker notes and other non-rendered helper records can live in _slideObjects
 * so they travel with the slide during cloning/export. They do not have visual
 * bounds and must not participate in geometry validation.
 */
function isRenderableSlideObject(obj: ISlideObject | undefined): boolean {
	const kind = obj?.type || obj?._type
	return Boolean(kind && kind !== 'notes')
}

const PRESET_COLOR_NAMES = new Set([
	'black',
	'white',
	'red',
	'green',
	'blue',
	'yellow',
	'cyan',
	'magenta',
	'gray',
	'darkgray',
	'lightgray',
	'darkred',
	'darkgreen',
	'darkblue',
	'darkyellow',
	'darkcyan',
	'darkmagenta',
	'lightred',
	'lightgreen',
	'lightblue',
	'lightyellow',
	'lightcyan',
	'lightmagenta',
])

const SCHEME_COLOR_NAMES_SET = new Set(['tx1', 'tx2', 'bg1', 'bg2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'])

function isDecimalLiteral(value: string): boolean {
	const text = value.trim()
	if (!text) return false
	let index = 0
	if (text[0] === '+' || text[0] === '-') index = 1
	let digitCount = 0
	let dotCount = 0
	for (; index < text.length; index++) {
		const code = text.charCodeAt(index)
		if (code >= 48 && code <= 57) {
			digitCount++
			continue
		}
		if (text[index] === '.') {
			dotCount++
			if (dotCount > 1) return false
			continue
		}
		return false
	}
	return digitCount > 0
}

function isValidHexColor(value: string): boolean {
	const color = value.startsWith('#') ? value.slice(1) : value
	if (color.length !== 6) return false
	for (let index = 0; index < color.length; index++) {
		const code = color.charCodeAt(index)
		const isDigit = code >= 48 && code <= 57
		const isUpperHex = code >= 65 && code <= 70
		const isLowerHex = code >= 97 && code <= 102
		if (!isDigit && !isUpperHex && !isLowerHex) return false
	}
	return true
}

function isValidColorValue(value: unknown): boolean {
	if (typeof value === 'string') {
		const color = value.trim()
		if (!color) return false
		const normalized = color.startsWith('#') ? color.slice(1) : color
		return isValidHexColor(color) || SCHEME_COLOR_NAMES_SET.has(normalized) || PRESET_COLOR_NAMES.has(normalized.toLowerCase())
	}
	if (value && typeof value === 'object') {
		const preset = (value as { preset?: unknown }).preset
		return typeof preset === 'string' && PRESET_COLOR_NAMES.has(preset.trim().toLowerCase())
	}
	return false
}

function hasControlChars(value: string): boolean {
	for (let index = 0; index < value.length; index++) {
		const code = value.charCodeAt(index)
		if (code < 32 && code !== 9 && code !== 10 && code !== 13) return true
	}
	return false
}

function isValidCoordinateValue(value: unknown, dimension: boolean): boolean {
	if (value === undefined || value === null) return true
	if (typeof value === 'number') return Number.isFinite(value) && (!dimension || value >= 0)
	if (typeof value !== 'string') return false
	const text = value.trim()
	if (!text) return false
	const isPercent = text.endsWith('%')
	const numericText = isPercent ? text.slice(0, -1) : text
	if (!isDecimalLiteral(numericText)) return false
	const numericValue = Number(numericText)
	if (!Number.isFinite(numericValue)) return false
	if (isPercent) return numericValue >= 0 && numericValue <= 100
	return !dimension || numericValue >= 0
}

function isFiniteNumberInRange(value: unknown, min: number, max: number): boolean {
	return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
}

function isPositiveInteger(value: unknown): value is number {
	return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function hasAuthoredValue(value: unknown): boolean {
	return value !== undefined && value !== null
}

function formatValidationValue(value: unknown): string {
	if (typeof value === 'number') return Number.isNaN(value) ? 'NaN' : String(value)
	if (typeof value === 'string') return `"${value}"`
	if (value === undefined) return 'undefined'
	if (value === null) return 'null'
	return Object.prototype.toString.call(value)
}

// ============================================================================
// VALIDATION ENGINE CLASS
// ============================================================================

/**
 * ValidationEngine - Validates presentations and slides for common issues
 */
export class ValidationEngine {
	private presLayout: PresLayout
	private slides: PresSlide[]
	private mode: ValidationMode

	constructor(presLayout: PresLayout, slides: PresSlide[], mode: ValidationMode = 'normal') {
		this.presLayout = presLayout
		this.slides = slides
		this.mode = mode
	}

	/**
	 * Validate entire presentation
	 */
	validate(options?: ValidationOptions): ValidationResult {
		const opts = { mode: this.mode, ...options }
		const issues: ValidationIssue[] = []

		// Determine which slides to validate
		const slideNumbers = opts.slides || this.slides.map((_, i) => i + 1)
		const slidesToValidate = slideNumbers
			.map((num) => this.slides[num - 1])
			.filter(Boolean)

		// Run validation checks
		for (const slide of slidesToValidate) {
			const slideNum = this.slides.indexOf(slide) + 1

			// Run enabled checks
			if (!opts.checks || opts.checks.includes('bounds')) {
				issues.push(...this.validateBounds(slide, slideNum))
			}
			if (!opts.checks || opts.checks.includes('dimensions')) {
				issues.push(...this.validateDimensions(slide, slideNum))
			}
			if (!opts.checks || opts.checks.includes('animations')) {
				issues.push(...this.validateAnimations(slide, slideNum))
			}
			if (!opts.checks || opts.checks.includes('content')) {
				issues.push(...this.validateContent(slide, slideNum))
			}
			if (!opts.checks || opts.checks.includes('repair')) {
				issues.push(...this.validateRepairRisk(slide, slideNum))
			}
		}

		// Apply mode-based severity adjustments
		const adjustedIssues = this.adjustSeverities(issues, opts.mode || this.mode)

		// Auto-fix if requested
		if (opts.autoFix) {
			this.applyAutoFixes(adjustedIssues, slidesToValidate)
		}

		return this.createResult(adjustedIssues)
	}

	/**
	 * Validate a single slide
	 */
	validateSlide(slideNumber: number, options?: ValidationOptions): ValidationResult {
		return this.validate({ ...options, slides: [slideNumber] })
	}

	// ============================================================================
	// VALIDATION CHECKS
	// ============================================================================

	/**
	 * Validate element bounds (off-slide detection)
	 */
	private validateBounds(slide: PresSlide, slideNum: number): ValidationIssue[] {
		const issues: ValidationIssue[] = []
		const slideWidth = this.presLayout.width / 914400
		const slideHeight = this.presLayout.height / 914400

		slide._slideObjects?.forEach((obj, index) => {
			if (!isRenderableSlideObject(obj)) return

			const bounds = getElementBounds(obj, this.presLayout)
			const shapeName = obj.options?.objectName || `Shape ${index + 1}`

			// Check if completely off-slide
			if (bounds.right <= 0) {
				issues.push({
					severity: 'error',
					code: 'ELEMENT_OFF_SLIDE_LEFT',
					message: `Element "${shapeName}" is completely off the left side of the slide`,
					slideNumber: slideNum,
					shapeName,
					shapeIndex: index,
					suggestion: `Move element right by at least ${Math.abs(bounds.right).toFixed(2)} inches`,
					autoFixAvailable: true,
					context: { bounds, slideWidth, slideHeight },
				})
			} else if (bounds.x >= slideWidth) {
				issues.push({
					severity: 'error',
					code: 'ELEMENT_OFF_SLIDE_RIGHT',
					message: `Element "${shapeName}" is completely off the right side of the slide`,
					slideNumber: slideNum,
					shapeName,
					shapeIndex: index,
					suggestion: `Move element left by at least ${(bounds.x - slideWidth).toFixed(2)} inches`,
					autoFixAvailable: true,
					context: { bounds, slideWidth, slideHeight },
				})
			}

			if (bounds.bottom <= 0) {
				issues.push({
					severity: 'error',
					code: 'ELEMENT_OFF_SLIDE_TOP',
					message: `Element "${shapeName}" is completely off the top of the slide`,
					slideNumber: slideNum,
					shapeName,
					shapeIndex: index,
					suggestion: `Move element down by at least ${Math.abs(bounds.bottom).toFixed(2)} inches`,
					autoFixAvailable: true,
					context: { bounds, slideWidth, slideHeight },
				})
			} else if (bounds.y >= slideHeight) {
				issues.push({
					severity: 'error',
					code: 'ELEMENT_OFF_SLIDE_BOTTOM',
					message: `Element "${shapeName}" is completely off the bottom of the slide`,
					slideNumber: slideNum,
					shapeName,
					shapeIndex: index,
					suggestion: `Move element up by at least ${(bounds.y - slideHeight).toFixed(2)} inches`,
					autoFixAvailable: true,
					context: { bounds, slideWidth, slideHeight },
				})
			}

			// Check if partially off-slide (warning)
			if (
				bounds.x < 0 ||
				bounds.y < 0 ||
				bounds.right > slideWidth ||
				bounds.bottom > slideHeight
			) {
				// Only warn if not already an error (completely off)
				const isCompletelyOff =
					bounds.right <= 0 ||
					bounds.x >= slideWidth ||
					bounds.bottom <= 0 ||
					bounds.y >= slideHeight

				if (!isCompletelyOff) {
					issues.push({
						severity: 'warning',
						code: 'ELEMENT_PARTIALLY_OFF_SLIDE',
						message: `Element "${shapeName}" extends beyond slide boundaries`,
						slideNumber: slideNum,
						shapeName,
						shapeIndex: index,
						suggestion: 'Consider resizing or repositioning the element to fit within the slide',
						autoFixAvailable: true,
						context: { bounds, slideWidth, slideHeight },
					})
				}
			}
		})

		return issues
	}

	/**
	 * Validate element dimensions
	 */
	private validateDimensions(slide: PresSlide, slideNum: number): ValidationIssue[] {
		const issues: ValidationIssue[] = []
		const slideWidth = this.presLayout.width / 914400
		const slideHeight = this.presLayout.height / 914400

		slide._slideObjects?.forEach((obj, index) => {
			if (!isRenderableSlideObject(obj)) return

			const bounds = getElementBounds(obj, this.presLayout)
			const shapeName = obj.options?.objectName || `Shape ${index + 1}`

			// Check for zero dimensions
			if (bounds.w === 0) {
				issues.push({
					severity: 'error',
					code: 'ZERO_WIDTH',
					message: `Element "${shapeName}" has zero width`,
					slideNumber: slideNum,
					shapeName,
					shapeIndex: index,
					suggestion: 'Set a positive width value',
					autoFixAvailable: false,
				})
			}

			if (bounds.h === 0) {
				issues.push({
					severity: 'error',
					code: 'ZERO_HEIGHT',
					message: `Element "${shapeName}" has zero height`,
					slideNumber: slideNum,
					shapeName,
					shapeIndex: index,
					suggestion: 'Set a positive height value',
					autoFixAvailable: false,
				})
			}

			// Check for negative dimensions (via raw options)
			const rawW = obj.options?.w
			const rawH = obj.options?.h
			if (typeof rawW === 'number' && rawW < 0) {
				issues.push({
					severity: 'error',
					code: 'NEGATIVE_DIMENSION',
					message: `Element "${shapeName}" has negative width (${rawW})`,
					slideNumber: slideNum,
					shapeName,
					shapeIndex: index,
					suggestion: 'Use a positive width value',
					autoFixAvailable: true,
				})
			}

			if (typeof rawH === 'number' && rawH < 0) {
				issues.push({
					severity: 'error',
					code: 'NEGATIVE_DIMENSION',
					message: `Element "${shapeName}" has negative height (${rawH})`,
					slideNumber: slideNum,
					shapeName,
					shapeIndex: index,
					suggestion: 'Use a positive height value',
					autoFixAvailable: true,
				})
			}

			// Check for oversized elements
			if (bounds.w > slideWidth * 2 || bounds.h > slideHeight * 2) {
				issues.push({
					severity: 'warning',
					code: 'OVERSIZED_ELEMENT',
					message: `Element "${shapeName}" is significantly larger than the slide`,
					slideNumber: slideNum,
					shapeName,
					shapeIndex: index,
					suggestion: `Consider scaling down. Current: ${bounds.w.toFixed(2)}" x ${bounds.h.toFixed(2)}", Slide: ${slideWidth.toFixed(2)}" x ${slideHeight.toFixed(2)}"`,
					autoFixAvailable: true,
					context: { bounds, slideWidth, slideHeight },
				})
			}
		})

		return issues
	}

	/**
	 * Validate animations
	 */
	private validateAnimations(slide: PresSlide, slideNum: number): ValidationIssue[] {
		const issues: ValidationIssue[] = []

		// Check if slide has animations array
		const animations = (slide as unknown as { _animations?: Array<{ shapeId: number }> })._animations
		if (!animations || animations.length === 0) {
			return issues
		}

		const shapeCount = slide._slideObjects?.length || 0

		animations.forEach((anim, index) => {
			const shapeId = anim.shapeId
			const shapeIndex = shapeId - 2 // SPID = index + 2

			// Check if animation targets a valid shape
			if (shapeIndex < 0 || shapeIndex >= shapeCount) {
				issues.push({
					severity: 'error',
					code: 'ANIMATION_ON_MISSING_SHAPE',
					message: `Animation ${index + 1} targets non-existent shape (SPID: ${shapeId})`,
					slideNumber: slideNum,
					shapeIndex: shapeIndex,
					suggestion: 'Ensure the animation targets an existing shape',
					autoFixAvailable: false,
					context: { shapeId, shapeCount },
				})
			}
		})

		return issues
	}

	/**
	 * Validate content
	 */
	private validateContent(slide: PresSlide, slideNum: number): ValidationIssue[] {
		const issues: ValidationIssue[] = []
		const hasDisplayTextValue = (value: unknown): boolean => {
			if (typeof value === 'string') return value.trim().length > 0
			if (Array.isArray(value)) return value.some(hasDisplayTextValue)
			if (value && typeof value === 'object') {
				const text = (value as { text?: unknown }).text
				return text !== undefined && hasDisplayTextValue(text)
			}
			return false
		}

		issues.push(...this.validateGradientFill((slide as PresSlide & { background?: unknown }).background, slideNum, 'slide background'))

		slide._slideObjects?.forEach((obj, index) => {
			if (!isRenderableSlideObject(obj)) return

			const shapeName = obj.options?.objectName || `Shape ${index + 1}`
			issues.push(...this.validateGradientFill(obj.options?.fill, slideNum, `${shapeName} fill`, shapeName, index))
			issues.push(...this.validateText3DRotations((obj.options as { text3D?: unknown } | undefined)?.text3D, slideNum, `${shapeName} text3D`, shapeName, index))
			issues.push(...this.validateText3DRotations((obj.options as { effect3D?: unknown } | undefined)?.effect3D, slideNum, `${shapeName} effect3D`, shapeName, index))
			issues.push(...this.validateWordArtTransform((obj.options as { wordArt?: unknown } | undefined)?.wordArt, slideNum, `${shapeName} wordArt`, shapeName, index))

			// Check explicitly-authored text boxes for empty content. Decorative
			// shapes may serialize as text-capable objects without intended text.
			const optionText = (obj.options as { text?: unknown } | undefined)?.text
			const textValues = [obj.text, optionText].filter(value => value !== undefined && value !== null)
			if (obj._type === 'text' && textValues.length > 0) {
				const hasText = textValues.some(hasDisplayTextValue)
				if (!hasText) {
					issues.push({
						severity: 'info',
						code: 'EMPTY_TEXT_BOX',
						message: `Text box "${shapeName}" is empty`,
						slideNumber: slideNum,
						shapeName,
						shapeIndex: index,
						suggestion: 'Add text content or remove the empty text box',
						autoFixAvailable: false,
					})
				}
			}

			// Check for missing image source
			if (obj._type === 'image') {
				const hasSource = obj.image || obj.imageRid
				if (!hasSource) {
					issues.push({
						severity: 'error',
						code: 'MISSING_IMAGE_SOURCE',
						message: `Image "${shapeName}" has no source (data or path)`,
						slideNumber: slideNum,
						shapeName,
						shapeIndex: index,
						suggestion: 'Provide either a data URI or path for the image',
						autoFixAvailable: false,
					})
				}
			}
		})

		return issues
	}

	/**
	 * Validate values that can produce invalid XML or broken package state.
	 *
	 * These checks are intentionally object-model level: they catch impossible or
	 * serializer-dangerous values before XML/package generation starts.
	 */
	private validateRepairRisk(slide: PresSlide, slideNum: number): ValidationIssue[] {
		const issues: ValidationIssue[] = []

		issues.push(...this.validateFillRepairRisk((slide as PresSlide & { background?: unknown }).background, slideNum, 'slide background'))
		issues.push(...this.collectNonFiniteNumberIssues((slide as PresSlide & { background?: unknown }).background, slideNum, 'slide background'))

		slide._slideObjects?.forEach((obj, index) => {
			if (!isRenderableSlideObject(obj)) return

			const shapeName = obj.options?.objectName || `Shape ${index + 1}`
			const basePath = shapeName

			issues.push(...this.collectNonFiniteNumberIssues(obj.options, slideNum, `${basePath}.options`, shapeName, index))
			issues.push(...this.collectNonFiniteNumberIssues(obj.text, slideNum, `${basePath}.text`, shapeName, index))
			issues.push(...this.collectNonFiniteNumberIssues(obj.arrTabRows, slideNum, `${basePath}.tableRows`, shapeName, index))
			issues.push(...this.collectNonFiniteNumberIssues(obj.animation, slideNum, `${basePath}.animation`, shapeName, index))

			issues.push(...this.validateCommonOptionsRepairRisk(obj.options, slideNum, `${basePath}.options`, shapeName, index, obj.shape))

			if (Array.isArray(obj.text)) {
				obj.text.forEach((run, runIndex) => {
					if (run && typeof run === 'object') {
						issues.push(...this.validateCommonOptionsRepairRisk((run as { options?: unknown }).options, slideNum, `${basePath}.text[${runIndex}].options`, shapeName, index))
					}
				})
			}

			issues.push(...this.validateTableRepairRisk(obj.arrTabRows, obj.options, slideNum, `${basePath}.table`, shapeName, index))
			issues.push(...this.validatePassthroughRepairRisk(obj, slideNum, `${basePath}.passthrough`, shapeName, index))
		})

		const chartRels = (slide as PresSlide & { _relsChart?: Array<{ data?: unknown; opts?: unknown }> })._relsChart
		chartRels?.forEach((rel, index) => {
			const label = `slide ${slideNum} chartRel[${index}]`
			issues.push(...this.collectNonFiniteNumberIssues(rel.data, slideNum, `${label}.data`))
			issues.push(...this.collectNonFiniteNumberIssues(rel.opts, slideNum, `${label}.opts`))
			issues.push(...this.validateChartRepairRisk(rel.opts, slideNum, `${label}.opts`))
		})

		const animations = (slide as PresSlide & { _animations?: unknown })._animations
		issues.push(...this.collectNonFiniteNumberIssues(animations, slideNum, `slide ${slideNum}.animations`))

		return issues
	}

	private repairIssue(
		code: ValidationIssueCode,
		message: string,
		slideNum: number,
		path: string,
		shapeName?: string,
		shapeIndex?: number,
		value?: unknown,
		suggestion?: string
	): ValidationIssue {
		return {
			severity: 'error',
			code,
			message,
			slideNumber: slideNum,
			shapeName,
			shapeIndex,
			suggestion,
			autoFixAvailable: false,
			context: { path, value },
		}
	}

	private collectNonFiniteNumberIssues(
		value: unknown,
		slideNum: number,
		path: string,
		shapeName?: string,
		shapeIndex?: number
	): ValidationIssue[] {
		const issues: ValidationIssue[] = []
		const visited = new Set<unknown>()
		const visit = (current: unknown, currentPath: string): void => {
			if (typeof current === 'number') {
				if (!Number.isFinite(current)) {
					issues.push(this.repairIssue(
						'NON_FINITE_NUMBER',
						`${currentPath} must be a finite number; received ${formatValidationValue(current)}`,
						slideNum,
						currentPath,
						shapeName,
						shapeIndex,
						current,
						'Use a finite numeric value before generating PPTX XML.'
					))
				}
				return
			}
			if (!current || typeof current !== 'object') return
			if (visited.has(current)) return
			visited.add(current)
			if (current instanceof ArrayBuffer) return
			if (ArrayBuffer.isView(current as ArrayBufferView)) return
			const entries = Array.isArray(current)
				? current.map((item, index) => [String(index), item] as [string, unknown])
				: Object.entries(current as Record<string, unknown>)
			for (const [key, child] of entries) {
				if (typeof child === 'function') continue
				visit(child, Array.isArray(current) ? `${currentPath}[${key}]` : `${currentPath}.${key}`)
			}
		}
		visit(value, path)
		return issues
	}

	private validateCommonOptionsRepairRisk(
		options: unknown,
		slideNum: number,
		path: string,
		shapeName?: string,
		shapeIndex?: number,
		shape?: unknown
	): ValidationIssue[] {
		if (!options || typeof options !== 'object') return []
		const opts = options as Record<string, unknown>
		const issues: ValidationIssue[] = []

		issues.push(...this.validatePositionRepairRisk(opts, slideNum, path, shapeName, shapeIndex))
		issues.push(...this.validateFillRepairRisk(opts.fill, slideNum, `${path}.fill`, shapeName, shapeIndex))
		issues.push(...this.validateLineRepairRisk(opts.line, slideNum, `${path}.line`, shapeName, shapeIndex))
		issues.push(...this.validateHyperlinkRepairRisk(opts.hyperlink, slideNum, `${path}.hyperlink`, shapeName, shapeIndex))
		issues.push(...this.validateMarginRepairRisk(opts.margin, slideNum, `${path}.margin`, shapeName, shapeIndex))
		issues.push(...this.validateShadowRepairRisk(opts.shadow, slideNum, `${path}.shadow`, shapeName, shapeIndex))
		issues.push(...this.validateEffectRepairRisk(opts.glow, slideNum, `${path}.glow`, shapeName, shapeIndex))
		issues.push(...this.validateEffectRepairRisk(opts.textGlow, slideNum, `${path}.textGlow`, shapeName, shapeIndex))
		issues.push(...this.validateEffectRepairRisk(opts.reflection, slideNum, `${path}.reflection`, shapeName, shapeIndex))
		issues.push(...this.validateEffectRepairRisk(opts.textReflection, slideNum, `${path}.textReflection`, shapeName, shapeIndex))
		issues.push(...this.validateSoftEdgesRepairRisk(opts.softEdges, slideNum, `${path}.softEdges`, shapeName, shapeIndex))
		issues.push(...this.validateTextBaseRepairRisk(opts, slideNum, path, shapeName, shapeIndex))

		if (hasAuthoredValue(opts.color) && !isValidColorValue(opts.color)) {
			issues.push(this.repairIssue('INVALID_COLOR', `${path}.color must be a 6-digit RGB, scheme color, or preset color`, slideNum, `${path}.color`, shapeName, shapeIndex, opts.color))
		}
		if (hasAuthoredValue(opts.highlight) && !isValidColorValue(opts.highlight)) {
			issues.push(this.repairIssue('INVALID_COLOR', `${path}.highlight must be a 6-digit RGB, scheme color, or preset color`, slideNum, `${path}.highlight`, shapeName, shapeIndex, opts.highlight))
		}
		if (hasAuthoredValue(opts.rotate) && !isFiniteNumberInRange(opts.rotate, -360, 360)) {
			issues.push(this.repairIssue('INVALID_ROTATION', `${path}.rotate must be a finite number between -360 and 360 degrees`, slideNum, `${path}.rotate`, shapeName, shapeIndex, opts.rotate))
		}
		if (hasAuthoredValue(opts.rectRadius) && !isFiniteNumberInRange(opts.rectRadius, 0, 1)) {
			issues.push(this.repairIssue('INVALID_COORDINATE', `${path}.rectRadius must be between 0 and 1`, slideNum, `${path}.rectRadius`, shapeName, shapeIndex, opts.rectRadius))
		}
		if (hasAuthoredValue(opts.arcThicknessRatio) && !isFiniteNumberInRange(opts.arcThicknessRatio, 0, 1)) {
			issues.push(this.repairIssue('INVALID_COORDINATE', `${path}.arcThicknessRatio must be between 0 and 1`, slideNum, `${path}.arcThicknessRatio`, shapeName, shapeIndex, opts.arcThicknessRatio))
		}
		if (Array.isArray(opts.angleRange)) {
			if (opts.angleRange.length !== 2 || !opts.angleRange.every(value => isFiniteNumberInRange(value, 0, 359))) {
				issues.push(this.repairIssue('INVALID_ROTATION', `${path}.angleRange must contain two finite degree values between 0 and 359`, slideNum, `${path}.angleRange`, shapeName, shapeIndex, opts.angleRange))
			}
		}
		if (hasAuthoredValue(opts.sizing) && opts.sizing && typeof opts.sizing === 'object') {
			issues.push(...this.validatePositionRepairRisk(opts.sizing as Record<string, unknown>, slideNum, `${path}.sizing`, shapeName, shapeIndex))
		}
		if (shape === 'line') {
			return issues
		}
		return issues
	}

	private validatePositionRepairRisk(
		options: Record<string, unknown>,
		slideNum: number,
		path: string,
		shapeName?: string,
		shapeIndex?: number
	): ValidationIssue[] {
		const issues: ValidationIssue[] = []
		for (const field of ['x', 'y', 'w', 'h'] as const) {
			const value = options[field]
			if (value === undefined || value === null) continue
			const dimension = field === 'w' || field === 'h'
			if (!isValidCoordinateValue(value, dimension)) {
				issues.push(this.repairIssue(
					'INVALID_COORDINATE',
					`${path}.${field} must be a finite number or a 0-100% coordinate${dimension ? ' and must not be negative' : ''}`,
					slideNum,
					`${path}.${field}`,
					shapeName,
					shapeIndex,
					value
				))
			}
		}
		return issues
	}

	private validateFillRepairRisk(
		fill: unknown,
		slideNum: number,
		path: string,
		shapeName?: string,
		shapeIndex?: number
	): ValidationIssue[] {
		if (!fill || typeof fill !== 'object') return []
		const fillObj = fill as Record<string, unknown>
		const issues: ValidationIssue[] = []
		if (hasAuthoredValue(fillObj.color) && !isValidColorValue(fillObj.color)) {
			issues.push(this.repairIssue('INVALID_COLOR', `${path}.color must be a 6-digit RGB, scheme color, or preset color`, slideNum, `${path}.color`, shapeName, shapeIndex, fillObj.color))
		}
		for (const key of ['transparency', 'alpha'] as const) {
			if (hasAuthoredValue(fillObj[key]) && !isFiniteNumberInRange(fillObj[key], 0, 100)) {
				issues.push(this.repairIssue('INVALID_TRANSPARENCY', `${path}.${key} must be a finite percent between 0 and 100`, slideNum, `${path}.${key}`, shapeName, shapeIndex, fillObj[key]))
			}
		}
		if (Array.isArray(fillObj.gradientStops)) {
			if (fillObj.gradientStops.length < 2) {
				issues.push(this.repairIssue('INVALID_GRADIENT_STOP', `${path}.gradientStops must include at least two stops`, slideNum, `${path}.gradientStops`, shapeName, shapeIndex, fillObj.gradientStops))
			}
			fillObj.gradientStops.forEach((stop, index) => {
				issues.push(...this.validateGradientStopRepairRisk(stop, slideNum, `${path}.gradientStops[${index}]`, shapeName, shapeIndex))
			})
		}
		if (hasAuthoredValue(fillObj.gradientAngle) && !isFiniteNumberInRange(fillObj.gradientAngle, 0, 360)) {
			issues.push(this.repairIssue('INVALID_ROTATION', `${path}.gradientAngle must be a finite number between 0 and 360 degrees`, slideNum, `${path}.gradientAngle`, shapeName, shapeIndex, fillObj.gradientAngle))
		}
		issues.push(...this.validateGradientRectRepairRisk(fillObj.fillToRect, slideNum, `${path}.fillToRect`, shapeName, shapeIndex))
		issues.push(...this.validateGradientRectRepairRisk(fillObj.tileRect, slideNum, `${path}.tileRect`, shapeName, shapeIndex))
		return issues
	}

	private validateGradientStopRepairRisk(
		stop: unknown,
		slideNum: number,
		path: string,
		shapeName?: string,
		shapeIndex?: number
	): ValidationIssue[] {
		if (!stop || typeof stop !== 'object') {
			return [this.repairIssue('INVALID_GRADIENT_STOP', `${path} must be an object`, slideNum, path, shapeName, shapeIndex, stop)]
		}
		const stopObj = stop as Record<string, unknown>
		const issues: ValidationIssue[] = []
		const position = stopObj.position ?? stopObj.pos
		if (!hasAuthoredValue(position) || !isFiniteNumberInRange(position, 0, 100)) {
			issues.push(this.repairIssue('INVALID_GRADIENT_STOP', `${path}.position must be a finite percent between 0 and 100`, slideNum, `${path}.position`, shapeName, shapeIndex, position))
		}
		if (!isValidColorValue(stopObj.color)) {
			issues.push(this.repairIssue('INVALID_COLOR', `${path}.color must be a 6-digit RGB, scheme color, or preset color`, slideNum, `${path}.color`, shapeName, shapeIndex, stopObj.color))
		}
		if (hasAuthoredValue(stopObj.transparency) && !isFiniteNumberInRange(stopObj.transparency, 0, 100)) {
			issues.push(this.repairIssue('INVALID_TRANSPARENCY', `${path}.transparency must be a finite percent between 0 and 100`, slideNum, `${path}.transparency`, shapeName, shapeIndex, stopObj.transparency))
		}
		return issues
	}

	private validateGradientRectRepairRisk(
		rect: unknown,
		slideNum: number,
		path: string,
		shapeName?: string,
		shapeIndex?: number
	): ValidationIssue[] {
		if (rect === undefined || rect === null) return []
		if (typeof rect !== 'object') {
			return [this.repairIssue('INVALID_COORDINATE', `${path} must be an object with l/t/r/b percent values`, slideNum, path, shapeName, shapeIndex, rect)]
		}
		const rectObj = rect as Record<string, unknown>
		const issues: ValidationIssue[] = []
		for (const key of ['l', 't', 'r', 'b'] as const) {
			if (hasAuthoredValue(rectObj[key]) && !isFiniteNumberInRange(rectObj[key], 0, 100)) {
				issues.push(this.repairIssue('INVALID_COORDINATE', `${path}.${key} must be a finite percent between 0 and 100`, slideNum, `${path}.${key}`, shapeName, shapeIndex, rectObj[key]))
			}
		}
		return issues
	}

	private validateLineRepairRisk(
		line: unknown,
		slideNum: number,
		path: string,
		shapeName?: string,
		shapeIndex?: number
	): ValidationIssue[] {
		if (!line || typeof line !== 'object') return []
		const lineObj = line as Record<string, unknown>
		const issues = this.validateFillRepairRisk(line, slideNum, path, shapeName, shapeIndex)
		for (const key of ['width', 'pt', 'size'] as const) {
			if (hasAuthoredValue(lineObj[key]) && !isFiniteNumberInRange(lineObj[key], 0, 100)) {
				issues.push(this.repairIssue('INVALID_LINE_WIDTH', `${path}.${key} must be a finite point value between 0 and 100`, slideNum, `${path}.${key}`, shapeName, shapeIndex, lineObj[key]))
			}
		}
		return issues
	}

	private validateHyperlinkRepairRisk(
		hyperlink: unknown,
		slideNum: number,
		path: string,
		shapeName?: string,
		shapeIndex?: number
	): ValidationIssue[] {
		if (hyperlink === undefined || hyperlink === null) return []
		if (typeof hyperlink !== 'object') {
			return [this.repairIssue('INVALID_HYPERLINK', `${path} must be a hyperlink object`, slideNum, path, shapeName, shapeIndex, hyperlink)]
		}
		const link = hyperlink as Record<string, unknown>
		const issues: ValidationIssue[] = []
		if (hasAuthoredValue(link._rId) && !isPositiveInteger(link._rId)) {
			issues.push(this.repairIssue('INVALID_HYPERLINK', `${path}._rId must be a positive integer`, slideNum, `${path}._rId`, shapeName, shapeIndex, link._rId))
		}
		if (hasAuthoredValue(link.slide) && !isPositiveInteger(link.slide)) {
			issues.push(this.repairIssue('INVALID_HYPERLINK', `${path}.slide must be a positive slide number`, slideNum, `${path}.slide`, shapeName, shapeIndex, link.slide))
		}
		if (hasAuthoredValue(link.url)) {
			if (typeof link.url !== 'string' || !link.url.trim() || hasControlChars(link.url)) {
				issues.push(this.repairIssue('INVALID_HYPERLINK', `${path}.url must be a non-empty string without control characters`, slideNum, `${path}.url`, shapeName, shapeIndex, link.url))
			}
		}
		if (hasAuthoredValue(link.tooltip) && (typeof link.tooltip !== 'string' || hasControlChars(link.tooltip))) {
			issues.push(this.repairIssue('INVALID_HYPERLINK', `${path}.tooltip must be a string without control characters`, slideNum, `${path}.tooltip`, shapeName, shapeIndex, link.tooltip))
		}
		return issues
	}

	private validateMarginRepairRisk(
		margin: unknown,
		slideNum: number,
		path: string,
		shapeName?: string,
		shapeIndex?: number
	): ValidationIssue[] {
		if (margin === undefined || margin === null) return []
		const isValidMarginNumber = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100
		if (isValidMarginNumber(margin)) return []
		if (Array.isArray(margin) && margin.length === 4 && margin.every(isValidMarginNumber)) return []
		return [this.repairIssue('INVALID_MARGIN', `${path} must be a finite non-negative number or four-number array`, slideNum, path, shapeName, shapeIndex, margin)]
	}

	private validateShadowRepairRisk(
		shadow: unknown,
		slideNum: number,
		path: string,
		shapeName?: string,
		shapeIndex?: number
	): ValidationIssue[] {
		if (!shadow || typeof shadow !== 'object') return []
		const shadowObj = shadow as Record<string, unknown>
		const issues: ValidationIssue[] = []
		if (hasAuthoredValue(shadowObj.color) && !isValidColorValue(shadowObj.color)) {
			issues.push(this.repairIssue('INVALID_COLOR', `${path}.color must be a 6-digit RGB, scheme color, or preset color`, slideNum, `${path}.color`, shapeName, shapeIndex, shadowObj.color))
		}
		if (hasAuthoredValue(shadowObj.opacity) && !isFiniteNumberInRange(shadowObj.opacity, 0, 100)) {
			issues.push(this.repairIssue('INVALID_OPACITY', `${path}.opacity must be a finite number between 0 and 1, or 0 and 100 for percent-style input`, slideNum, `${path}.opacity`, shapeName, shapeIndex, shadowObj.opacity))
		}
		for (const key of ['blur', 'offset'] as const) {
			if (hasAuthoredValue(shadowObj[key]) && !isFiniteNumberInRange(shadowObj[key], 0, 200)) {
				issues.push(this.repairIssue('INVALID_COORDINATE', `${path}.${key} must be a finite non-negative point value`, slideNum, `${path}.${key}`, shapeName, shapeIndex, shadowObj[key]))
			}
		}
		if (hasAuthoredValue(shadowObj.angle) && !isFiniteNumberInRange(shadowObj.angle, 0, 359)) {
			issues.push(this.repairIssue('INVALID_ROTATION', `${path}.angle must be a finite number between 0 and 359 degrees`, slideNum, `${path}.angle`, shapeName, shapeIndex, shadowObj.angle))
		}
		return issues
	}

	private validateEffectRepairRisk(
		effect: unknown,
		slideNum: number,
		path: string,
		shapeName?: string,
		shapeIndex?: number
	): ValidationIssue[] {
		if (!effect || typeof effect !== 'object') return []
		const effectObj = effect as Record<string, unknown>
		const issues: ValidationIssue[] = []
		if (hasAuthoredValue(effectObj.color) && !isValidColorValue(effectObj.color)) {
			issues.push(this.repairIssue('INVALID_COLOR', `${path}.color must be a 6-digit RGB, scheme color, or preset color`, slideNum, `${path}.color`, shapeName, shapeIndex, effectObj.color))
		}
		if (hasAuthoredValue(effectObj.opacity) && !isFiniteNumberInRange(effectObj.opacity, 0, 100)) {
			issues.push(this.repairIssue('INVALID_OPACITY', `${path}.opacity must be a finite number between 0 and 1, or 0 and 100 for percent-style input`, slideNum, `${path}.opacity`, shapeName, shapeIndex, effectObj.opacity))
		}
		for (const key of ['size', 'blur', 'offset', 'fadeStart', 'fadeEnd', 'distance'] as const) {
			if (hasAuthoredValue(effectObj[key]) && !isFiniteNumberInRange(effectObj[key], 0, 200)) {
				issues.push(this.repairIssue('INVALID_COORDINATE', `${path}.${key} must be a finite non-negative value`, slideNum, `${path}.${key}`, shapeName, shapeIndex, effectObj[key]))
			}
		}
		if (hasAuthoredValue(effectObj.angle) && !isFiniteNumberInRange(effectObj.angle, 0, 359)) {
			issues.push(this.repairIssue('INVALID_ROTATION', `${path}.angle must be a finite number between 0 and 359 degrees`, slideNum, `${path}.angle`, shapeName, shapeIndex, effectObj.angle))
		}
		return issues
	}

	private validateSoftEdgesRepairRisk(
		softEdges: unknown,
		slideNum: number,
		path: string,
		shapeName?: string,
		shapeIndex?: number
	): ValidationIssue[] {
		if (!softEdges || typeof softEdges !== 'object') return []
		const value = (softEdges as { size?: unknown }).size
		if (hasAuthoredValue(value) && !isFiniteNumberInRange(value, 0, 100)) {
			return [this.repairIssue('INVALID_COORDINATE', `${path}.size must be a finite point value between 0 and 100`, slideNum, `${path}.size`, shapeName, shapeIndex, value)]
		}
		return []
	}

	private validateTextBaseRepairRisk(
		options: Record<string, unknown>,
		slideNum: number,
		path: string,
		shapeName?: string,
		shapeIndex?: number
	): ValidationIssue[] {
		const issues: ValidationIssue[] = []
		if (hasAuthoredValue(options.fontSize) && !isFiniteNumberInRange(options.fontSize, 1, 400)) {
			issues.push(this.repairIssue('INVALID_COORDINATE', `${path}.fontSize must be a finite point value between 1 and 400`, slideNum, `${path}.fontSize`, shapeName, shapeIndex, options.fontSize))
		}
		if (hasAuthoredValue(options.transparency) && !isFiniteNumberInRange(options.transparency, 0, 100)) {
			issues.push(this.repairIssue('INVALID_TRANSPARENCY', `${path}.transparency must be a finite percent between 0 and 100`, slideNum, `${path}.transparency`, shapeName, shapeIndex, options.transparency))
		}
		if (hasAuthoredValue(options.baseline) && !isFiniteNumberInRange(options.baseline, -100, 100)) {
			issues.push(this.repairIssue('INVALID_COORDINATE', `${path}.baseline must be a finite percent between -100 and 100`, slideNum, `${path}.baseline`, shapeName, shapeIndex, options.baseline))
		}
		for (const key of ['charSpacing', 'lineSpacing', 'paraSpaceAfter', 'paraSpaceBefore'] as const) {
			if (hasAuthoredValue(options[key]) && !isFiniteNumberInRange(options[key], 0, 400)) {
				issues.push(this.repairIssue('INVALID_COORDINATE', `${path}.${key} must be a finite non-negative point value`, slideNum, `${path}.${key}`, shapeName, shapeIndex, options[key]))
			}
		}
		if (hasAuthoredValue(options.lineSpacingMultiple) && !isFiniteNumberInRange(options.lineSpacingMultiple, 0, 9.99)) {
			issues.push(this.repairIssue('INVALID_COORDINATE', `${path}.lineSpacingMultiple must be a finite value between 0 and 9.99`, slideNum, `${path}.lineSpacingMultiple`, shapeName, shapeIndex, options.lineSpacingMultiple))
		}
		if (options.bullet && typeof options.bullet === 'object') {
			const bullet = options.bullet as Record<string, unknown>
			for (const key of ['indent', 'marginPt', 'fontSize'] as const) {
				if (hasAuthoredValue(bullet[key]) && !isFiniteNumberInRange(bullet[key], 0, 400)) {
					issues.push(this.repairIssue('INVALID_COORDINATE', `${path}.bullet.${key} must be a finite non-negative point value`, slideNum, `${path}.bullet.${key}`, shapeName, shapeIndex, bullet[key]))
				}
			}
			if (hasAuthoredValue(bullet.color) && !isValidColorValue(bullet.color)) {
				issues.push(this.repairIssue('INVALID_COLOR', `${path}.bullet.color must be a 6-digit RGB, scheme color, or preset color`, slideNum, `${path}.bullet.color`, shapeName, shapeIndex, bullet.color))
			}
			const numberStartAt = bullet.numberStartAt ?? bullet.startAt
			if (hasAuthoredValue(numberStartAt) && !isPositiveInteger(numberStartAt)) {
				issues.push(this.repairIssue('INVALID_COORDINATE', `${path}.bullet.numberStartAt must be a positive integer`, slideNum, `${path}.bullet.numberStartAt`, shapeName, shapeIndex, numberStartAt))
			}
		}
		if (options.underline && typeof options.underline === 'object') {
			const underline = options.underline as { color?: unknown }
			if (hasAuthoredValue(underline.color) && !isValidColorValue(underline.color)) {
				issues.push(this.repairIssue('INVALID_COLOR', `${path}.underline.color must be a 6-digit RGB, scheme color, or preset color`, slideNum, `${path}.underline.color`, shapeName, shapeIndex, underline.color))
			}
		}
		return issues
	}

	private validateTableRepairRisk(
		rows: unknown,
		options: unknown,
		slideNum: number,
		path: string,
		shapeName?: string,
		shapeIndex?: number
	): ValidationIssue[] {
		const issues: ValidationIssue[] = []
		if (rows === undefined || rows === null) return issues
		if (!Array.isArray(rows) || rows.length === 0) {
			return [this.repairIssue('INVALID_TABLE_GRID', `${path} must contain at least one row`, slideNum, path, shapeName, shapeIndex, rows)]
		}
		let maxColumns = 0
		rows.forEach((row, rowIndex) => {
			if (!Array.isArray(row) || row.length === 0) {
				issues.push(this.repairIssue('INVALID_TABLE_GRID', `${path}[${rowIndex}] must contain at least one cell`, slideNum, `${path}[${rowIndex}]`, shapeName, shapeIndex, row))
				return
			}
			maxColumns = Math.max(maxColumns, row.length)
			row.forEach((cell, cellIndex) => {
				if (cell && typeof cell === 'object') {
					const cellOptions = (cell as { options?: unknown }).options
					issues.push(...this.validateCommonOptionsRepairRisk(cellOptions, slideNum, `${path}[${rowIndex}][${cellIndex}].options`, shapeName, shapeIndex))
				}
			})
		})
		if (options && typeof options === 'object') {
			const opts = options as Record<string, unknown>
			if (Array.isArray(opts.colW)) {
				opts.colW.forEach((width, index) => {
					if (!isFiniteNumberInRange(width, 0.001, 100)) {
						issues.push(this.repairIssue('INVALID_TABLE_GRID', `${path}.options.colW[${index}] must be a positive finite width`, slideNum, `${path}.options.colW[${index}]`, shapeName, shapeIndex, width))
					}
				})
				if (maxColumns > 0 && opts.colW.length !== maxColumns) {
					issues.push(this.repairIssue('INVALID_TABLE_GRID', `${path}.options.colW length must match table column count`, slideNum, `${path}.options.colW`, shapeName, shapeIndex, opts.colW, 'Provide one positive column width per table column.'))
				}
			}
			if (Array.isArray(opts.rowH)) {
				opts.rowH.forEach((height, index) => {
					if (!isFiniteNumberInRange(height, 0.001, 100)) {
						issues.push(this.repairIssue('INVALID_TABLE_GRID', `${path}.options.rowH[${index}] must be a positive finite height`, slideNum, `${path}.options.rowH[${index}]`, shapeName, shapeIndex, height))
					}
				})
			}
		}
		return issues
	}

	private validatePassthroughRepairRisk(
		obj: ISlideObject,
		slideNum: number,
		path: string,
		shapeName?: string,
		shapeIndex?: number
	): ValidationIssue[] {
		if (!obj.passthrough) return []
		const xml = obj.passthrough.xml
		if (typeof xml !== 'string' || !xml.trim()) {
			return [this.repairIssue('INVALID_PASSTHROUGH_XML', `${path}.xml must be a non-empty string`, slideNum, `${path}.xml`, shapeName, shapeIndex, xml)]
		}
		return []
	}

	private validateChartRepairRisk(
		options: unknown,
		slideNum: number,
		path: string
	): ValidationIssue[] {
		if (!options || typeof options !== 'object') return []
		const opts = options as Record<string, unknown>
		const issues: ValidationIssue[] = []
		issues.push(...this.validatePositionRepairRisk(opts, slideNum, path))
		issues.push(...this.validateFillRepairRisk(opts.fill, slideNum, `${path}.fill`))
		issues.push(...this.validateLineRepairRisk(opts.line, slideNum, `${path}.line`))
		if (Array.isArray(opts.chartColors)) {
			opts.chartColors.forEach((color, index) => {
				if (!isValidColorValue(color)) {
					issues.push(this.repairIssue('INVALID_COLOR', `${path}.chartColors[${index}] must be a 6-digit RGB, scheme color, or preset color`, slideNum, `${path}.chartColors[${index}]`, undefined, undefined, color))
				}
			})
		}
		if (hasAuthoredValue(opts.chartColorsOpacity) && !isFiniteNumberInRange(opts.chartColorsOpacity, 0, 100)) {
			issues.push(this.repairIssue('INVALID_OPACITY', `${path}.chartColorsOpacity must be a finite percent between 0 and 100`, slideNum, `${path}.chartColorsOpacity`, undefined, undefined, opts.chartColorsOpacity))
		}
		return issues
	}

	private validateGradientFill(fill: unknown, slideNum: number, label: string, shapeName?: string, shapeIndex?: number): ValidationIssue[] {
		if (!fill || typeof fill !== 'object') return []
		const gradient = fill as { type?: unknown; gradientDirection?: unknown; gradientStops?: unknown }
		if (gradient.type !== 'gradient' && gradient.gradientDirection == null && !Array.isArray(gradient.gradientStops)) return []
		if (gradient.gradientDirection == null) return []

		const issue = validateGradientDirectionOption(gradient.gradientDirection, `${label}.gradientDirection`)
		if (!issue) return []
		return [{
			severity: issue.code.endsWith('_ALIAS') ? 'warning' : 'error',
			code: issue.code as ValidationIssueCode,
			message: issue.message,
			slideNumber: slideNum,
			shapeName,
			shapeIndex,
			suggestion: issue.suggestion,
			autoFixAvailable: false,
			context: issue as unknown as Record<string, unknown>,
		}]
	}

	private validateText3DRotations(text3D: unknown, slideNum: number, label: string, shapeName?: string, shapeIndex?: number): ValidationIssue[] {
		if (!text3D || typeof text3D !== 'object') return []
		const issues: ValidationIssue[] = []
		const rotations = text3D as Record<string, unknown>
		for (const key of ['rotationX', 'rotationY', 'rotationZ', 'lightDirection']) {
			const rawValue = rotations[key]
			if (rawValue == null) continue
			const issue = validateText3DRotationOption(rawValue, `${label}.${key}`)
			if (!issue) continue
			issues.push({
				severity: issue.code.endsWith('_NORMALIZED') ? 'warning' : 'error',
				code: issue.code as ValidationIssueCode,
				message: issue.message,
				slideNumber: slideNum,
				shapeName,
				shapeIndex,
				suggestion: issue.suggestion,
				autoFixAvailable: false,
				context: issue as unknown as Record<string, unknown>,
			})
		}
		return issues
	}

	private validateWordArtTransform(wordArt: unknown, slideNum: number, label: string, shapeName?: string, shapeIndex?: number): ValidationIssue[] {
		if (!wordArt || typeof wordArt !== 'object') return []
		const transform = (wordArt as { transform?: unknown }).transform
		if (transform == null) return []
		const issue = validateWordArtTransformOption(transform, `${label}.transform`)
		if (!issue) return []
		return [{
			severity: issue.code.endsWith('_ALIAS') ? 'warning' : 'error',
			code: issue.code as ValidationIssueCode,
			message: issue.message,
			slideNumber: slideNum,
			shapeName,
			shapeIndex,
			suggestion: issue.suggestion,
			autoFixAvailable: false,
			context: issue as unknown as Record<string, unknown>,
		}]
	}

	// ============================================================================
	// HELPER METHODS
	// ============================================================================

	/**
	 * Adjust severities based on validation mode
	 */
	private adjustSeverities(issues: ValidationIssue[], mode: ValidationMode): ValidationIssue[] {
		return issues.map((issue) => {
			if (mode === 'strict') {
				// In strict mode, warnings become errors
				if (issue.severity === 'warning') {
					return { ...issue, severity: 'error' as ValidationSeverity }
				}
			} else if (mode === 'lenient') {
				// In lenient mode, only critical issues remain errors
				const criticalCodes: ValidationIssueCode[] = [
					'MISSING_IMAGE_SOURCE',
					'ANIMATION_ON_MISSING_SHAPE',
					'INVALID_GRADIENT_DIRECTION',
					'INVALID_TEXT3D_ROTATION',
					'INVALID_WORDART_TRANSFORM',
					...REPAIR_RISK_ISSUE_CODES,
				]
				if (issue.severity === 'error' && !criticalCodes.includes(issue.code)) {
					return { ...issue, severity: 'warning' as ValidationSeverity }
				}
			}
			return issue
		})
	}

	/**
	 * Apply auto-fixes to issues that support it
	 */
	private applyAutoFixes(issues: ValidationIssue[], slides: PresSlide[]): void {
		for (const issue of issues) {
			if (!issue.autoFixAvailable || !issue.slideNumber || issue.shapeIndex === undefined) {
				continue
			}

			const slide = slides.find((s) => this.slides.indexOf(s) + 1 === issue.slideNumber)
			if (!slide) continue

			const shape = slide._slideObjects?.[issue.shapeIndex]
			if (!shape || !shape.options) continue

			const slideWidth = this.presLayout.width / 914400
			const slideHeight = this.presLayout.height / 914400

			switch (issue.code) {
				case 'ELEMENT_OFF_SLIDE_LEFT':
				case 'ELEMENT_OFF_SLIDE_RIGHT':
				case 'ELEMENT_OFF_SLIDE_TOP':
				case 'ELEMENT_OFF_SLIDE_BOTTOM':
				case 'ELEMENT_PARTIALLY_OFF_SLIDE': {
					// Clamp element to slide bounds
					const bounds = getElementBounds(shape, this.presLayout)
					if (bounds.x < 0) shape.options.x = 0
					if (bounds.y < 0) shape.options.y = 0
					if (bounds.right > slideWidth) {
						shape.options.x = Math.max(0, slideWidth - bounds.w)
					}
					if (bounds.bottom > slideHeight) {
						shape.options.y = Math.max(0, slideHeight - bounds.h)
					}
					break
				}
				case 'NEGATIVE_DIMENSION': {
					// Make dimensions positive
					if (typeof shape.options.w === 'number' && shape.options.w < 0) {
						shape.options.w = Math.abs(shape.options.w)
					}
					if (typeof shape.options.h === 'number' && shape.options.h < 0) {
						shape.options.h = Math.abs(shape.options.h)
					}
					break
				}
				case 'OVERSIZED_ELEMENT': {
					// Scale down to fit slide
					const bounds = getElementBounds(shape, this.presLayout)
					const scaleX = slideWidth / bounds.w
					const scaleY = slideHeight / bounds.h
					const scale = Math.min(scaleX, scaleY, 1) * 0.9 // 90% of slide max
					if (scale < 1) {
						shape.options.w = bounds.w * scale
						shape.options.h = bounds.h * scale
					}
					break
				}
			}
		}
	}

	/**
	 * Create validation result from issues
	 */
	private createResult(issues: ValidationIssue[]): ValidationResult {
		const errorCount = issues.filter((i) => i.severity === 'error').length
		const warningCount = issues.filter((i) => i.severity === 'warning').length
		const infoCount = issues.filter((i) => i.severity === 'info').length

		return {
			valid: errorCount === 0,
			issueCount: issues.length,
			errorCount,
			warningCount,
			infoCount,
			issues,
		}
	}

	// ============================================================================
	// STATIC FACTORY
	// ============================================================================

	/**
	 * Create a ValidationEngine for a presentation
	 */
	static create(presLayout: PresLayout, slides: PresSlide[], mode?: ValidationMode): ValidationEngine {
		return new ValidationEngine(presLayout, slides, mode)
	}
}

// ============================================================================
// EXPORTED HELPER FUNCTIONS
// ============================================================================

/**
 * Quick validation check - returns true if presentation is valid
 */
export function isValid(presLayout: PresLayout, slides: PresSlide[], options?: ValidationOptions): boolean {
	const engine = new ValidationEngine(presLayout, slides, options?.mode)
	return engine.validate(options).valid
}

/**
 * Get validation issues for a presentation
 */
export function getValidationIssues(
	presLayout: PresLayout,
	slides: PresSlide[],
	options?: ValidationOptions
): ValidationIssue[] {
	const engine = new ValidationEngine(presLayout, slides, options?.mode)
	return engine.validate(options).issues
}
