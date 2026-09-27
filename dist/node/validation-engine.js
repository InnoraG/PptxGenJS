/**
 * PptxGenJS: Validation Engine
 * Provides constraint-based validation for presentations
 * @since v4.0.0
 */
import { assertNativeDescendantAnimationInspectable, nativeGroupIdentityPlan } from './gen-group-animation-targets';
import { validateGradientDirectionOption, validateText3DRotationOption, validateWordArtTransformOption } from './option-registry';
export const REPAIR_RISK_ISSUE_CODES = [
    'MISSING_IMAGE_SOURCE',
    'INVALID_MEDIA_TYPE',
    'INVALID_GRADIENT_DIRECTION',
    'NON_FINITE_NUMBER',
    'INVALID_COORDINATE',
    'INVALID_COLOR',
    'INVALID_COLOR_TRANSFORM',
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
];
const REPAIR_RISK_ISSUE_CODE_SET = new Set(REPAIR_RISK_ISSUE_CODES);
export function isRepairRiskIssue(issue) {
    return issue.severity === 'error' && REPAIR_RISK_ISSUE_CODE_SET.has(issue.code);
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
function coordToInches(coord, slideSize) {
    if (coord === undefined)
        return 0;
    if (typeof coord === 'number') {
        // Detect if value is in EMUs (914400 EMU = 1 inch)
        // Values > 20 are likely EMUs since slides are typically < 20 inches
        if (coord > 20) {
            return coord / 914400;
        }
        return coord;
    }
    // Handle percentage strings like '50%'
    const percentMatch = coord.match(/^(\d+(?:\.\d+)?)%$/);
    if (percentMatch) {
        return (parseFloat(percentMatch[1]) / 100) * slideSize;
    }
    return 0;
}
/**
 * Get element bounds in inches
 */
function getElementBounds(obj, presLayout) {
    var _a, _b, _c, _d;
    const slideWidth = presLayout.width / 914400; // EMU to inches
    const slideHeight = presLayout.height / 914400;
    const x = coordToInches((_a = obj.options) === null || _a === void 0 ? void 0 : _a.x, slideWidth);
    const y = coordToInches((_b = obj.options) === null || _b === void 0 ? void 0 : _b.y, slideHeight);
    const w = coordToInches((_c = obj.options) === null || _c === void 0 ? void 0 : _c.w, slideWidth);
    const h = coordToInches((_d = obj.options) === null || _d === void 0 ? void 0 : _d.h, slideHeight);
    return {
        x,
        y,
        w,
        h,
        right: x + w,
        bottom: y + h,
    };
}
/**
 * Returns true for slide objects that render on the slide canvas.
 *
 * Speaker notes and other non-rendered helper records can live in _slideObjects
 * so they travel with the slide during cloning/export. They do not have visual
 * bounds and must not participate in geometry validation.
 */
function isRenderableSlideObject(obj) {
    const kind = (obj === null || obj === void 0 ? void 0 : obj.type) || (obj === null || obj === void 0 ? void 0 : obj._type);
    return Boolean(kind && kind !== 'notes');
}
function isLineGeometry(obj) {
    return (obj.type || obj._type) === 'connector' || obj.shape === 'line';
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
]);
const SCHEME_COLOR_NAMES_SET = new Set(['tx1', 'tx2', 'bg1', 'bg2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6']);
function isDecimalLiteral(value) {
    const text = value.trim();
    if (!text)
        return false;
    let index = 0;
    if (text[0] === '+' || text[0] === '-')
        index = 1;
    let digitCount = 0;
    let dotCount = 0;
    for (; index < text.length; index++) {
        const code = text.charCodeAt(index);
        if (code >= 48 && code <= 57) {
            digitCount++;
            continue;
        }
        if (text[index] === '.') {
            dotCount++;
            if (dotCount > 1)
                return false;
            continue;
        }
        return false;
    }
    return digitCount > 0;
}
/**
 * An off-stage starting frame is intentional only when native animation proves
 * its complete return. Inspect current geometry and target identity each time;
 * this rule requires no presenter metadata or cached authoring permission.
 */
function hasBoundedAutomaticEntry(slide, obj, shapeId, bounds, slideWidth, slideHeight, tolerance) {
    if (![bounds.x, bounds.y, bounds.w, bounds.h, slideWidth, slideHeight].every(Number.isFinite) || bounds.w <= 0 || bounds.h <= 0)
        return false;
    const records = (slide._animations || []).filter(record => record.target === obj);
    const once = (animation) => (animation.autoReverse === undefined || animation.autoReverse === false)
        && (animation.loop === undefined || animation.loop === false)
        && (animation.rewind === undefined || animation.rewind === false)
        && (animation.repeatCount === undefined || animation.repeatCount === 1)
        && animation.repeatDur === undefined;
    const timing = (animation) => {
        var _a, _b, _c;
        const delay = (_b = (_a = animation.delay) !== null && _a !== void 0 ? _a : animation.delayMs) !== null && _b !== void 0 ? _b : 0;
        const duration = (_c = animation.duration) !== null && _c !== void 0 ? _c : animation.durationMs;
        if (animation.trigger !== 'withPrevious' || !Number.isInteger(delay) || delay < 0 || !Number.isInteger(duration) || duration <= 0)
            return null;
        if (animation.delay !== undefined && animation.delayMs !== undefined && animation.delay !== animation.delayMs)
            return null;
        if (animation.duration !== undefined && animation.durationMs !== undefined && animation.duration !== animation.durationMs)
            return null;
        return { delay, duration };
    };
    for (const record of records) {
        const motion = record.animation;
        const clock = timing(motion);
        if (record.shapeId !== shapeId || motion.type !== 'motion' || !clock || !once(motion) || typeof motion.motionPathData !== 'string')
            continue;
        // A single straight segment cannot overshoot its destination. Complex,
        // malformed, relative-origin or non-finite paths need ordinary bounds review.
        const tokens = motion.motionPathData.trim().split(/\s+/);
        if (tokens.length !== 7 || tokens[0] !== 'M' || tokens[3] !== 'L' || tokens[6] !== 'E')
            continue;
        if (![tokens[1], tokens[2], tokens[4], tokens[5]].every(isDecimalLiteral))
            continue;
        const [startX, startY, dx, dy] = [tokens[1], tokens[2], tokens[4], tokens[5]].map(Number);
        if (![startX, startY, dx, dy].every(Number.isFinite) || startX !== 0 || startY !== 0)
            continue;
        const x = bounds.x + dx * slideWidth, y = bounds.y + dy * slideHeight;
        if (x < -tolerance || y < -tolerance || x + bounds.w > slideWidth + tolerance || y + bounds.h > slideHeight + tolerance)
            continue;
        const entrance = records.some(candidate => {
            const animation = candidate.animation, start = timing(animation);
            return candidate.shapeId === shapeId && animation.type === 'entrance' && ['appear', 'fade'].includes(animation.effect)
                && animation.usesVisibility !== false && once(animation) && (start === null || start === void 0 ? void 0 : start.delay) === clock.delay;
        });
        if (!entrance)
            continue;
        // A competing initial path could invalidate the endpoint. Later automatic
        // travel is independent of the initial-entry proof and remains supported.
        if (records.some(candidate => {
            if (candidate === record || candidate.animation.type !== 'motion')
                return false;
            const other = timing(candidate.animation);
            return candidate.shapeId !== shapeId || !other || other.delay < clock.delay + clock.duration;
        }))
            continue;
        return true;
    }
    return false;
}
function isValidHexColor(value) {
    const color = value.startsWith('#') ? value.slice(1) : value;
    if (color.length !== 6)
        return false;
    for (let index = 0; index < color.length; index++) {
        const code = color.charCodeAt(index);
        const isDigit = code >= 48 && code <= 57;
        const isUpperHex = code >= 65 && code <= 70;
        const isLowerHex = code >= 97 && code <= 102;
        if (!isDigit && !isUpperHex && !isLowerHex)
            return false;
    }
    return true;
}
function isValidColorValue(value) {
    var _a, _b;
    if (typeof value === 'string') {
        const color = value.trim();
        if (!color)
            return false;
        const normalized = color.startsWith('#') ? color.slice(1) : color;
        return isValidHexColor(color) || SCHEME_COLOR_NAMES_SET.has(normalized) || PRESET_COLOR_NAMES.has(normalized.toLowerCase());
    }
    if (value && typeof value === 'object') {
        const structured = value;
        const base = (_b = (_a = structured.color) !== null && _a !== void 0 ? _a : structured.scheme) !== null && _b !== void 0 ? _b : structured.preset;
        if (typeof base === 'string') {
            const normalized = base.trim().startsWith('#') ? base.trim().slice(1) : base.trim();
            return isValidHexColor(base.trim()) || SCHEME_COLOR_NAMES_SET.has(normalized) || PRESET_COLOR_NAMES.has(normalized.toLowerCase());
        }
        const preset = value.preset;
        return typeof preset === 'string' && PRESET_COLOR_NAMES.has(preset.trim().toLowerCase());
    }
    return false;
}
function hasControlChars(value) {
    for (let index = 0; index < value.length; index++) {
        const code = value.charCodeAt(index);
        if (code < 32 && code !== 9 && code !== 10 && code !== 13)
            return true;
    }
    return false;
}
function isValidCoordinateValue(value, dimension) {
    if (value === undefined || value === null)
        return true;
    if (typeof value === 'number')
        return Number.isFinite(value) && (!dimension || value >= 0);
    if (typeof value !== 'string')
        return false;
    const text = value.trim();
    if (!text)
        return false;
    const isPercent = text.endsWith('%');
    const numericText = isPercent ? text.slice(0, -1) : text;
    if (!isDecimalLiteral(numericText))
        return false;
    const numericValue = Number(numericText);
    if (!Number.isFinite(numericValue))
        return false;
    if (isPercent)
        return numericValue >= 0 && numericValue <= 100;
    return !dimension || numericValue >= 0;
}
function isFiniteNumberInRange(value, min, max) {
    return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}
function isPositiveInteger(value) {
    return typeof value === 'number' && Number.isInteger(value) && value > 0;
}
function hasAuthoredValue(value) {
    return value !== undefined && value !== null;
}
function formatValidationValue(value) {
    if (typeof value === 'number')
        return Number.isNaN(value) ? 'NaN' : String(value);
    if (typeof value === 'string')
        return `"${value}"`;
    if (value === undefined)
        return 'undefined';
    if (value === null)
        return 'null';
    return Object.prototype.toString.call(value);
}
// ============================================================================
// VALIDATION ENGINE CLASS
// ============================================================================
/**
 * ValidationEngine - Validates presentations and slides for common issues
 */
export class ValidationEngine {
    constructor(presLayout, slides, mode = 'normal') {
        this.presLayout = presLayout;
        this.slides = slides;
        this.mode = mode;
    }
    /**
     * Validate entire presentation
     */
    validate(options) {
        const opts = Object.assign({ mode: this.mode }, options);
        const issues = [];
        // Determine which slides to validate
        const slideNumbers = opts.slides || this.slides.map((_, i) => i + 1);
        const slidesToValidate = slideNumbers
            .map((num) => this.slides[num - 1])
            .filter(Boolean);
        // Run validation checks
        for (const slide of slidesToValidate) {
            const slideNum = this.slides.indexOf(slide) + 1;
            // Run enabled checks
            if (!opts.checks || opts.checks.includes('bounds')) {
                issues.push(...this.validateBounds(slide, slideNum));
            }
            if (!opts.checks || opts.checks.includes('dimensions')) {
                issues.push(...this.validateDimensions(slide, slideNum));
            }
            if (!opts.checks || opts.checks.includes('animations')) {
                issues.push(...this.validateAnimations(slide, slideNum));
            }
            if (!opts.checks || opts.checks.includes('content')) {
                issues.push(...this.validateContent(slide, slideNum));
            }
            if (!opts.checks || opts.checks.includes('repair')) {
                issues.push(...this.validateRepairRisk(slide, slideNum));
            }
        }
        // Apply mode-based severity adjustments
        const adjustedIssues = this.adjustSeverities(issues, opts.mode || this.mode);
        // Auto-fix if requested
        if (opts.autoFix) {
            this.applyAutoFixes(adjustedIssues, slidesToValidate);
        }
        return this.createResult(adjustedIssues);
    }
    /**
     * Validate a single slide
     */
    validateSlide(slideNumber, options) {
        return this.validate(Object.assign(Object.assign({}, options), { slides: [slideNumber] }));
    }
    // ============================================================================
    // VALIDATION CHECKS
    // ============================================================================
    /**
     * Validate element bounds (off-slide detection)
     */
    validateBounds(slide, slideNum) {
        var _a;
        const issues = [];
        const slideWidth = this.presLayout.width / 914400;
        const slideHeight = this.presLayout.height / 914400;
        // Native slide extents are integer EMUs. Independent edge coordinates can
        // differ by one rounding unit without producing any visible overflow.
        const edgeTolerance = 1 / 914400;
        (_a = slide._slideObjects) === null || _a === void 0 ? void 0 : _a.forEach((obj, index) => {
            var _a, _b, _c;
            if (!isRenderableSlideObject(obj))
                return;
            const bounds = getElementBounds(obj, this.presLayout);
            const shapeName = ((_a = obj.options) === null || _a === void 0 ? void 0 : _a.objectName) || `Shape ${index + 1}`;
            const linear = isLineGeometry(obj);
            const offLeft = bounds.right < -edgeTolerance || (!linear && bounds.right <= 0);
            const offRight = bounds.x > slideWidth + edgeTolerance || (!linear && bounds.x >= slideWidth);
            const offTop = bounds.bottom < -edgeTolerance || (!linear && bounds.bottom <= 0);
            const offBottom = bounds.y > slideHeight + edgeTolerance || (!linear && bounds.y >= slideHeight);
            if ((offLeft || offRight || offTop || offBottom)
                && hasBoundedAutomaticEntry(slide, obj, Number((_c = (_b = obj.options) === null || _b === void 0 ? void 0 : _b.spid) !== null && _c !== void 0 ? _c : index + 2), bounds, slideWidth, slideHeight, edgeTolerance))
                return;
            // Check if completely off-slide
            if (offLeft) {
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
                });
            }
            else if (offRight) {
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
                });
            }
            if (offTop) {
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
                });
            }
            else if (offBottom) {
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
                });
            }
            // Check if partially off-slide (warning)
            if (bounds.x < -edgeTolerance ||
                bounds.y < -edgeTolerance ||
                bounds.right > slideWidth + edgeTolerance ||
                bounds.bottom > slideHeight + edgeTolerance) {
                // Only warn if not already an error (completely off)
                const isCompletelyOff = offLeft || offRight || offTop || offBottom;
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
                    });
                }
            }
        });
        return issues;
    }
    /**
     * Validate element dimensions
     */
    validateDimensions(slide, slideNum) {
        var _a;
        const issues = [];
        const slideWidth = this.presLayout.width / 914400;
        const slideHeight = this.presLayout.height / 914400;
        (_a = slide._slideObjects) === null || _a === void 0 ? void 0 : _a.forEach((obj, index) => {
            var _a, _b, _c;
            if (!isRenderableSlideObject(obj))
                return;
            const bounds = getElementBounds(obj, this.presLayout);
            const shapeName = ((_a = obj.options) === null || _a === void 0 ? void 0 : _a.objectName) || `Shape ${index + 1}`;
            const nonzeroLine = isLineGeometry(obj) && (bounds.w > 0 || bounds.h > 0);
            // A horizontal/vertical connector has one zero axis by definition.
            // A point connector and zero-area non-line objects remain invalid.
            if (bounds.w === 0 && !nonzeroLine) {
                issues.push({
                    severity: 'error',
                    code: 'ZERO_WIDTH',
                    message: `Element "${shapeName}" has zero width`,
                    slideNumber: slideNum,
                    shapeName,
                    shapeIndex: index,
                    suggestion: 'Set a positive width value',
                    autoFixAvailable: false,
                });
            }
            if (bounds.h === 0 && !nonzeroLine) {
                issues.push({
                    severity: 'error',
                    code: 'ZERO_HEIGHT',
                    message: `Element "${shapeName}" has zero height`,
                    slideNumber: slideNum,
                    shapeName,
                    shapeIndex: index,
                    suggestion: 'Set a positive height value',
                    autoFixAvailable: false,
                });
            }
            // Check for negative dimensions (via raw options)
            const rawW = (_b = obj.options) === null || _b === void 0 ? void 0 : _b.w;
            const rawH = (_c = obj.options) === null || _c === void 0 ? void 0 : _c.h;
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
                });
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
                });
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
                });
            }
        });
        return issues;
    }
    /**
     * Validate animations
     */
    validateAnimations(slide, slideNum) {
        var _a;
        const issues = [];
        // Check if slide has animations array
        const animations = slide._animations;
        if (!animations || animations.length === 0) {
            return issues;
        }
        const shapeCount = ((_a = slide._slideObjects) === null || _a === void 0 ? void 0 : _a.length) || 0;
        // Explicit SPIDs are first-class in the native package (media, captions, and
        // imported/native objects do not necessarily equal positional index + 2). Keep
        // validation aligned with the actual object identity rather than rejecting a
        // valid animation merely because its SPID is sparse.
        const objectSpids = new Set((slide._slideObjects || []).map((obj, index) => { var _a, _b; return Number((_b = (_a = obj.options) === null || _a === void 0 ? void 0 : _a.spid) !== null && _b !== void 0 ? _b : index + 2); }));
        const nativeChildren = nativeGroupIdentityPlan(slide).targets;
        animations.forEach((anim, index) => {
            var _a;
            const shapeId = anim.shapeId;
            // Media animations may use an explicitly allocated SPID that is not
            // represented by the imported slide object's positional index. The
            // media target itself is authoritative in that case; ordinary shape
            // animations continue through the positional integrity check below.
            const target = anim.target;
            if ((target === null || target === void 0 ? void 0 : target._type) === 'media' || (target && ((_a = slide._slideObjects) === null || _a === void 0 ? void 0 : _a.includes(target))))
                return;
            const childMatches = target ? nativeChildren.filter(child => child.target === target) : [];
            if (childMatches.length) {
                let invalidReason;
                if (childMatches.length > 1)
                    invalidReason = 'The animation target occurs in more than one native group.';
                else {
                    try {
                        assertNativeDescendantAnimationInspectable(slide);
                    }
                    catch (_b) {
                        invalidReason = 'The native child animation cannot be verified while the slide contains opaque imported objects.';
                    }
                }
                if (!invalidReason)
                    return;
                issues.push({
                    severity: 'error', code: 'INVALID_ANIMATION_TARGET', message: invalidReason,
                    slideNumber: slideNum, suggestion: 'Use one unique native editable child target on an inspectable slide.',
                    autoFixAvailable: false, context: { shapeId },
                });
                return;
            }
            const shapeIndex = shapeId - 2; // SPID = index + 2
            // A detached object reference cannot borrow a number now assigned to
            // another object. Numeric-only legacy top-level records retain their
            // existing check; live descendants use the same plan as serialization.
            if (target || shapeIndex < 0 || shapeIndex >= shapeCount || !objectSpids.has(Number(shapeId))) {
                issues.push({
                    severity: 'error',
                    code: 'ANIMATION_ON_MISSING_SHAPE',
                    message: `Animation ${index + 1} targets non-existent shape (SPID: ${shapeId})`,
                    slideNumber: slideNum,
                    shapeIndex: shapeIndex,
                    suggestion: 'Ensure the animation targets an existing shape',
                    autoFixAvailable: false,
                    context: { shapeId, shapeCount },
                });
            }
        });
        return issues;
    }
    /**
     * Validate content
     */
    validateContent(slide, slideNum) {
        var _a;
        const issues = [];
        const hasDisplayTextValue = (value) => {
            if (typeof value === 'string')
                return value.trim().length > 0;
            if (Array.isArray(value))
                return value.some(hasDisplayTextValue);
            if (value && typeof value === 'object') {
                const text = value.text;
                return text !== undefined && hasDisplayTextValue(text);
            }
            return false;
        };
        issues.push(...this.validateGradientFill(slide.background, slideNum, 'slide background'));
        (_a = slide._slideObjects) === null || _a === void 0 ? void 0 : _a.forEach((obj, index) => {
            var _a, _b, _c, _d, _e, _f;
            if (!isRenderableSlideObject(obj))
                return;
            const shapeName = ((_a = obj.options) === null || _a === void 0 ? void 0 : _a.objectName) || `Shape ${index + 1}`;
            issues.push(...this.validateGradientFill((_b = obj.options) === null || _b === void 0 ? void 0 : _b.fill, slideNum, `${shapeName} fill`, shapeName, index));
            issues.push(...this.validateText3DRotations((_c = obj.options) === null || _c === void 0 ? void 0 : _c.text3D, slideNum, `${shapeName} text3D`, shapeName, index));
            issues.push(...this.validateText3DRotations((_d = obj.options) === null || _d === void 0 ? void 0 : _d.effect3D, slideNum, `${shapeName} effect3D`, shapeName, index));
            issues.push(...this.validateWordArtTransform((_e = obj.options) === null || _e === void 0 ? void 0 : _e.wordArt, slideNum, `${shapeName} wordArt`, shapeName, index));
            // Check explicitly-authored text boxes for empty content. Decorative
            // shapes may serialize as text-capable objects without intended text.
            const optionText = (_f = obj.options) === null || _f === void 0 ? void 0 : _f.text;
            const textValues = [obj.text, optionText].filter(value => value !== undefined && value !== null);
            if (obj._type === 'text' && textValues.length > 0) {
                const hasText = textValues.some(hasDisplayTextValue);
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
                    });
                }
            }
            // Check for missing image source
            if (obj._type === 'image') {
                const hasSource = obj.image || obj.imageRid;
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
                    });
                }
            }
        });
        return issues;
    }
    /**
     * Validate values that can produce invalid XML or broken package state.
     *
     * These checks are intentionally object-model level: they catch impossible or
     * serializer-dangerous values before XML/package generation starts.
     */
    validateRepairRisk(slide, slideNum) {
        var _a;
        const issues = [];
        issues.push(...this.validateFillRepairRisk(slide.background, slideNum, 'slide background'));
        issues.push(...this.collectNonFiniteNumberIssues(slide.background, slideNum, 'slide background'));
        (_a = slide._slideObjects) === null || _a === void 0 ? void 0 : _a.forEach((obj, index) => {
            var _a;
            if (!isRenderableSlideObject(obj))
                return;
            const shapeName = ((_a = obj.options) === null || _a === void 0 ? void 0 : _a.objectName) || `Shape ${index + 1}`;
            const basePath = shapeName;
            issues.push(...this.collectNonFiniteNumberIssues(obj.options, slideNum, `${basePath}.options`, shapeName, index));
            issues.push(...this.collectNonFiniteNumberIssues(obj.text, slideNum, `${basePath}.text`, shapeName, index));
            issues.push(...this.collectNonFiniteNumberIssues(obj.arrTabRows, slideNum, `${basePath}.tableRows`, shapeName, index));
            issues.push(...this.collectNonFiniteNumberIssues(obj.animation, slideNum, `${basePath}.animation`, shapeName, index));
            const marginContext = (obj.type || obj._type) === 'table' ? 'table' : 'text';
            issues.push(...this.validateCommonOptionsRepairRisk(obj.options, slideNum, `${basePath}.options`, shapeName, index, obj.shape, marginContext));
            // Pictures carry their click hyperlink at the slide-object level rather
            // than inside options. Validate that package relationship source too.
            if (obj.hyperlink !== undefined && obj.hyperlink !== null) {
                issues.push(...this.validateHyperlinkRepairRisk(obj.hyperlink, slideNum, `${basePath}.hyperlink`, shapeName, index));
            }
            if (Array.isArray(obj.text)) {
                obj.text.forEach((run, runIndex) => {
                    if (run && typeof run === 'object') {
                        issues.push(...this.validateCommonOptionsRepairRisk(run.options, slideNum, `${basePath}.text[${runIndex}].options`, shapeName, index));
                    }
                });
            }
            issues.push(...this.validateTableRepairRisk(obj.arrTabRows, obj.options, slideNum, `${basePath}.table`, shapeName, index));
            issues.push(...this.validatePassthroughRepairRisk(obj, slideNum, `${basePath}.passthrough`, shapeName, index));
        });
        const chartRels = slide._relsChart;
        chartRels === null || chartRels === void 0 ? void 0 : chartRels.forEach((rel, index) => {
            const label = `slide ${slideNum} chartRel[${index}]`;
            issues.push(...this.collectNonFiniteNumberIssues(rel.data, slideNum, `${label}.data`));
            issues.push(...this.collectNonFiniteNumberIssues(rel.opts, slideNum, `${label}.opts`));
            issues.push(...this.validateChartRepairRisk(rel.opts, slideNum, `${label}.opts`));
        });
        const animations = slide._animations;
        issues.push(...this.collectNonFiniteNumberIssues(animations, slideNum, `slide ${slideNum}.animations`));
        return issues;
    }
    repairIssue(code, message, slideNum, path, shapeName, shapeIndex, value, suggestion) {
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
        };
    }
    collectNonFiniteNumberIssues(value, slideNum, path, shapeName, shapeIndex) {
        const issues = [];
        const visited = new Set();
        const visit = (current, currentPath) => {
            if (typeof current === 'number') {
                if (!Number.isFinite(current)) {
                    issues.push(this.repairIssue('NON_FINITE_NUMBER', `${currentPath} must be a finite number; received ${formatValidationValue(current)}`, slideNum, currentPath, shapeName, shapeIndex, current, 'Use a finite numeric value before generating PPTX XML.'));
                }
                return;
            }
            if (!current || typeof current !== 'object')
                return;
            if (visited.has(current))
                return;
            visited.add(current);
            if (current instanceof ArrayBuffer)
                return;
            if (ArrayBuffer.isView(current))
                return;
            const entries = Array.isArray(current)
                ? current.map((item, index) => [String(index), item])
                : Object.entries(current);
            for (const [key, child] of entries) {
                if (typeof child === 'function')
                    continue;
                visit(child, Array.isArray(current) ? `${currentPath}[${key}]` : `${currentPath}.${key}`);
            }
        };
        visit(value, path);
        return issues;
    }
    validateCommonOptionsRepairRisk(options, slideNum, path, shapeName, shapeIndex, shape, marginContext = 'text') {
        if (!options || typeof options !== 'object')
            return [];
        const opts = options;
        const issues = [];
        issues.push(...this.validatePositionRepairRisk(opts, slideNum, path, shapeName, shapeIndex));
        issues.push(...this.validateFillRepairRisk(opts.fill, slideNum, `${path}.fill`, shapeName, shapeIndex));
        issues.push(...this.validateLineRepairRisk(opts.line, slideNum, `${path}.line`, shapeName, shapeIndex));
        issues.push(...this.validateHyperlinkRepairRisk(opts.hyperlink, slideNum, `${path}.hyperlink`, shapeName, shapeIndex));
        const preserveImportedMarginPrecision = opts._nativeMinimal === true && typeof opts._rawBodyPrChildXml === 'string';
        issues.push(...(marginContext === 'table'
            ? this.validateTableMarginRepairRisk(opts.margin, slideNum, `${path}.margin`, shapeName, shapeIndex)
            : this.validateMarginRepairRisk(opts.margin, slideNum, `${path}.margin`, shapeName, shapeIndex, preserveImportedMarginPrecision)));
        if (opts.valign !== undefined && opts.valign !== null && !['top', 'middle', 'bottom', 't', 'ctr', 'center', 'm', 'b'].includes(String(opts.valign).toLowerCase())) {
            issues.push(this.repairIssue('INVALID_VALIGN', `${path}.valign must be top, middle, or bottom`, slideNum, `${path}.valign`, shapeName, shapeIndex, opts.valign));
        }
        issues.push(...this.validateShadowRepairRisk(opts.shadow, slideNum, `${path}.shadow`, shapeName, shapeIndex));
        issues.push(...this.validateEffectRepairRisk(opts.glow, slideNum, `${path}.glow`, shapeName, shapeIndex));
        issues.push(...this.validateEffectRepairRisk(opts.textGlow, slideNum, `${path}.textGlow`, shapeName, shapeIndex));
        issues.push(...this.validateEffectRepairRisk(opts.reflection, slideNum, `${path}.reflection`, shapeName, shapeIndex));
        issues.push(...this.validateEffectRepairRisk(opts.textReflection, slideNum, `${path}.textReflection`, shapeName, shapeIndex));
        issues.push(...this.validateSoftEdgesRepairRisk(opts.softEdges, slideNum, `${path}.softEdges`, shapeName, shapeIndex));
        issues.push(...this.validateTextBaseRepairRisk(opts, slideNum, path, shapeName, shapeIndex));
        if (hasAuthoredValue(opts.color) && !isValidColorValue(opts.color)) {
            issues.push(this.repairIssue('INVALID_COLOR', `${path}.color must be a 6-digit RGB, scheme color, or preset color`, slideNum, `${path}.color`, shapeName, shapeIndex, opts.color));
        }
        if (hasAuthoredValue(opts.highlight) && !isValidColorValue(opts.highlight)) {
            issues.push(this.repairIssue('INVALID_COLOR', `${path}.highlight must be a 6-digit RGB, scheme color, or preset color`, slideNum, `${path}.highlight`, shapeName, shapeIndex, opts.highlight));
        }
        if (hasAuthoredValue(opts.rotate) && !isFiniteNumberInRange(opts.rotate, -360, 360)) {
            issues.push(this.repairIssue('INVALID_ROTATION', `${path}.rotate must be a finite number between -360 and 360 degrees`, slideNum, `${path}.rotate`, shapeName, shapeIndex, opts.rotate));
        }
        if (hasAuthoredValue(opts.rectRadius) && !isFiniteNumberInRange(opts.rectRadius, 0, 1)) {
            issues.push(this.repairIssue('INVALID_COORDINATE', `${path}.rectRadius must be between 0 and 1`, slideNum, `${path}.rectRadius`, shapeName, shapeIndex, opts.rectRadius));
        }
        if (hasAuthoredValue(opts.arcThicknessRatio) && !isFiniteNumberInRange(opts.arcThicknessRatio, 0, 1)) {
            issues.push(this.repairIssue('INVALID_COORDINATE', `${path}.arcThicknessRatio must be between 0 and 1`, slideNum, `${path}.arcThicknessRatio`, shapeName, shapeIndex, opts.arcThicknessRatio));
        }
        if (Array.isArray(opts.angleRange)) {
            if (opts.angleRange.length !== 2 || !opts.angleRange.every(value => isFiniteNumberInRange(value, 0, 359))) {
                issues.push(this.repairIssue('INVALID_ROTATION', `${path}.angleRange must contain two finite degree values between 0 and 359`, slideNum, `${path}.angleRange`, shapeName, shapeIndex, opts.angleRange));
            }
        }
        if (hasAuthoredValue(opts.sizing) && opts.sizing && typeof opts.sizing === 'object') {
            issues.push(...this.validatePositionRepairRisk(opts.sizing, slideNum, `${path}.sizing`, shapeName, shapeIndex));
        }
        if (shape === 'line') {
            return issues;
        }
        return issues;
    }
    validatePositionRepairRisk(options, slideNum, path, shapeName, shapeIndex) {
        const issues = [];
        for (const field of ['x', 'y', 'w', 'h']) {
            const value = options[field];
            if (value === undefined || value === null)
                continue;
            const dimension = field === 'w' || field === 'h';
            if (!isValidCoordinateValue(value, dimension)) {
                issues.push(this.repairIssue('INVALID_COORDINATE', `${path}.${field} must be a finite number or a 0-100% coordinate${dimension ? ' and must not be negative' : ''}`, slideNum, `${path}.${field}`, shapeName, shapeIndex, value));
            }
        }
        return issues;
    }
    validateFillRepairRisk(fill, slideNum, path, shapeName, shapeIndex) {
        if (!fill || typeof fill !== 'object')
            return [];
        const fillObj = fill;
        const issues = [];
        if (hasAuthoredValue(fillObj.color) && !isValidColorValue(fillObj.color)) {
            issues.push(this.repairIssue('INVALID_COLOR', `${path}.color must be a 6-digit RGB, scheme color, or preset color`, slideNum, `${path}.color`, shapeName, shapeIndex, fillObj.color));
        }
        for (const key of ['transparency', 'alpha']) {
            if (hasAuthoredValue(fillObj[key]) && !isFiniteNumberInRange(fillObj[key], 0, 100)) {
                issues.push(this.repairIssue('INVALID_TRANSPARENCY', `${path}.${key} must be a finite percent between 0 and 100`, slideNum, `${path}.${key}`, shapeName, shapeIndex, fillObj[key]));
            }
        }
        if (Array.isArray(fillObj.gradientStops)) {
            if (fillObj.gradientStops.length < 2) {
                issues.push(this.repairIssue('INVALID_GRADIENT_STOP', `${path}.gradientStops must include at least two stops`, slideNum, `${path}.gradientStops`, shapeName, shapeIndex, fillObj.gradientStops));
            }
            fillObj.gradientStops.forEach((stop, index) => {
                issues.push(...this.validateGradientStopRepairRisk(stop, slideNum, `${path}.gradientStops[${index}]`, shapeName, shapeIndex));
            });
        }
        if (hasAuthoredValue(fillObj.gradientAngle) && !isFiniteNumberInRange(fillObj.gradientAngle, 0, 360)) {
            issues.push(this.repairIssue('INVALID_ROTATION', `${path}.gradientAngle must be a finite number from 0 through 360 degrees; 360 is normalized to 0`, slideNum, `${path}.gradientAngle`, shapeName, shapeIndex, fillObj.gradientAngle));
        }
        issues.push(...this.validateGradientRectRepairRisk(fillObj.fillToRect, slideNum, `${path}.fillToRect`, shapeName, shapeIndex));
        issues.push(...this.validateGradientRectRepairRisk(fillObj.tileRect, slideNum, `${path}.tileRect`, shapeName, shapeIndex));
        return issues;
    }
    validateGradientStopRepairRisk(stop, slideNum, path, shapeName, shapeIndex) {
        var _a;
        if (!stop || typeof stop !== 'object') {
            return [this.repairIssue('INVALID_GRADIENT_STOP', `${path} must be an object`, slideNum, path, shapeName, shapeIndex, stop)];
        }
        const stopObj = stop;
        const issues = [];
        const position = (_a = stopObj.position) !== null && _a !== void 0 ? _a : stopObj.pos;
        if (!hasAuthoredValue(position) || !isFiniteNumberInRange(position, 0, 100)) {
            issues.push(this.repairIssue('INVALID_GRADIENT_STOP', `${path}.position must be a finite percent between 0 and 100`, slideNum, `${path}.position`, shapeName, shapeIndex, position));
        }
        if (!isValidColorValue(stopObj.color)) {
            issues.push(this.repairIssue('INVALID_COLOR', `${path}.color must be a 6-digit RGB, scheme color, or preset color`, slideNum, `${path}.color`, shapeName, shapeIndex, stopObj.color));
        }
        if (stopObj.color && typeof stopObj.color === 'object') {
            const color = stopObj.color;
            for (const [key, minimum, maximum] of [['tint', 0, 1], ['shade', 0, 1], ['opacity', 0, 1], ['saturation', 0, 4], ['luminance', 0, 4], ['luminanceOffset', -1, 1]]) {
                if (hasAuthoredValue(color[key]) && !isFiniteNumberInRange(color[key], minimum, maximum)) {
                    issues.push(this.repairIssue('INVALID_COLOR_TRANSFORM', `${path}.color.${key} must be a finite value between ${minimum} and ${maximum}`, slideNum, `${path}.color.${key}`, shapeName, shapeIndex, color[key]));
                }
            }
        }
        if (hasAuthoredValue(stopObj.transparency) && !isFiniteNumberInRange(stopObj.transparency, 0, 100)) {
            issues.push(this.repairIssue('INVALID_TRANSPARENCY', `${path}.transparency must be a finite percent between 0 and 100`, slideNum, `${path}.transparency`, shapeName, shapeIndex, stopObj.transparency));
        }
        return issues;
    }
    validateGradientRectRepairRisk(rect, slideNum, path, shapeName, shapeIndex) {
        if (rect === undefined || rect === null)
            return [];
        if (typeof rect !== 'object') {
            return [this.repairIssue('INVALID_COORDINATE', `${path} must be an object with l/t/r/b percent values`, slideNum, path, shapeName, shapeIndex, rect)];
        }
        const rectObj = rect;
        const issues = [];
        for (const key of ['l', 't', 'r', 'b']) {
            if (hasAuthoredValue(rectObj[key]) && !isFiniteNumberInRange(rectObj[key], 0, 100)) {
                issues.push(this.repairIssue('INVALID_COORDINATE', `${path}.${key} must be a finite percent between 0 and 100`, slideNum, `${path}.${key}`, shapeName, shapeIndex, rectObj[key]));
            }
        }
        return issues;
    }
    validateLineRepairRisk(line, slideNum, path, shapeName, shapeIndex) {
        if (!line || typeof line !== 'object')
            return [];
        const lineObj = line;
        const issues = this.validateFillRepairRisk(line, slideNum, path, shapeName, shapeIndex);
        for (const key of ['width', 'pt', 'size']) {
            if (hasAuthoredValue(lineObj[key]) && !isFiniteNumberInRange(lineObj[key], 0, 100)) {
                issues.push(this.repairIssue('INVALID_LINE_WIDTH', `${path}.${key} must be a finite point value between 0 and 100`, slideNum, `${path}.${key}`, shapeName, shapeIndex, lineObj[key]));
            }
        }
        return issues;
    }
    validateHyperlinkRepairRisk(hyperlink, slideNum, path, shapeName, shapeIndex) {
        if (hyperlink === undefined || hyperlink === null)
            return [];
        if (typeof hyperlink !== 'object') {
            return [this.repairIssue('INVALID_HYPERLINK', `${path} must be a hyperlink object`, slideNum, path, shapeName, shapeIndex, hyperlink)];
        }
        const link = hyperlink;
        const issues = [];
        const hasSlide = link.slide !== undefined && link.slide !== null;
        const hasUrl = link.url !== undefined && link.url !== null;
        if (hasSlide === hasUrl) {
            issues.push(this.repairIssue('INVALID_HYPERLINK', `${path} must specify exactly one of slide or url`, slideNum, path, shapeName, shapeIndex, hyperlink));
        }
        if (hasAuthoredValue(link._rId) && !isPositiveInteger(link._rId)) {
            issues.push(this.repairIssue('INVALID_HYPERLINK', `${path}._rId must be a positive integer`, slideNum, `${path}._rId`, shapeName, shapeIndex, link._rId));
        }
        if (hasSlide && (!isPositiveInteger(link.slide) || Number(link.slide) > this.slides.length)) {
            issues.push(this.repairIssue('INVALID_HYPERLINK', `${path}.slide must identify an existing slide from 1 to ${this.slides.length}`, slideNum, `${path}.slide`, shapeName, shapeIndex, link.slide));
        }
        if (hasUrl) {
            if (typeof link.url !== 'string' || link.url.length > 4096 || !/^(?:https:\/\/|mailto:|tel:)[^\s]+$/i.test(link.url.trim()) || hasControlChars(link.url)) {
                issues.push(this.repairIssue('INVALID_HYPERLINK', `${path}.url must use https, mailto, or tel without whitespace or control characters`, slideNum, `${path}.url`, shapeName, shapeIndex, link.url));
            }
        }
        if (hasAuthoredValue(link.tooltip) && (typeof link.tooltip !== 'string' || link.tooltip.length > 1024 || hasControlChars(link.tooltip))) {
            issues.push(this.repairIssue('INVALID_HYPERLINK', `${path}.tooltip must be a string of at most 1024 characters without control characters`, slideNum, `${path}.tooltip`, shapeName, shapeIndex, link.tooltip));
        }
        if (link.target !== undefined && link.target !== null) {
            if (!hasUrl)
                issues.push(this.repairIssue('INVALID_HYPERLINK', `${path}.target is valid only with an external url`, slideNum, `${path}.target`, shapeName, shapeIndex, link.target));
            else if (typeof link.target !== 'string' || !link.target.trim() || link.target.length > 255 || hasControlChars(link.target)) {
                issues.push(this.repairIssue('INVALID_HYPERLINK', `${path}.target must be a non-empty string of at most 255 characters without control characters`, slideNum, `${path}.target`, shapeName, shapeIndex, link.target));
            }
        }
        return issues;
    }
    validateMarginRepairRisk(margin, slideNum, path, shapeName, shapeIndex, preserveImportedPrecision = false) {
        if (margin === undefined || margin === null)
            return [];
        const isValidMarginNumber = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 && (preserveImportedPrecision || Math.abs(value * 100 - Math.round(value * 100)) < 1e-9);
        if (isValidMarginNumber(margin))
            return [];
        if (Array.isArray(margin) && margin.length === 4 && margin.every(isValidMarginNumber))
            return [];
        return [this.repairIssue('INVALID_MARGIN', `${path} must be a number or four-number array from 0 to 100 points at a 0.01-point step`, slideNum, path, shapeName, shapeIndex, margin)];
    }
    validateTableMarginRepairRisk(margin, slideNum, path, shapeName, shapeIndex) {
        if (margin === undefined || margin === null)
            return [];
        // Table cell insets accept fractional inches, unlike text-box point
        // insets. The serializer also retains the legacy first-side >= 1 point
        // convention. Neither path requires the text-box 0.01-point quantum.
        // Keep the closed table contract's range and tuple shape; do not relax
        // ordinary text/run margins or rewrite the authored table values.
        const isValidTableMargin = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 56;
        if (isValidTableMargin(margin))
            return [];
        if (Array.isArray(margin) && margin.length === 4 && margin.every(isValidTableMargin))
            return [];
        return [this.repairIssue('INVALID_MARGIN', `${path} must be a finite number or four-number array from 0 to 56 for native table-cell insets`, slideNum, path, shapeName, shapeIndex, margin)];
    }
    validateShadowRepairRisk(shadow, slideNum, path, shapeName, shapeIndex) {
        if (!shadow || typeof shadow !== 'object')
            return [];
        const shadowObj = shadow;
        const issues = [];
        if (hasAuthoredValue(shadowObj.color) && !isValidColorValue(shadowObj.color)) {
            issues.push(this.repairIssue('INVALID_COLOR', `${path}.color must be a 6-digit RGB, scheme color, or preset color`, slideNum, `${path}.color`, shapeName, shapeIndex, shadowObj.color));
        }
        if (hasAuthoredValue(shadowObj.opacity) && !isFiniteNumberInRange(shadowObj.opacity, 0, 100)) {
            issues.push(this.repairIssue('INVALID_OPACITY', `${path}.opacity must be a finite number between 0 and 1, or 0 and 100 for percent-style input`, slideNum, `${path}.opacity`, shapeName, shapeIndex, shadowObj.opacity));
        }
        for (const key of ['blur', 'offset']) {
            if (hasAuthoredValue(shadowObj[key]) && !isFiniteNumberInRange(shadowObj[key], 0, 200)) {
                issues.push(this.repairIssue('INVALID_COORDINATE', `${path}.${key} must be a finite non-negative point value`, slideNum, `${path}.${key}`, shapeName, shapeIndex, shadowObj[key]));
            }
        }
        if (hasAuthoredValue(shadowObj.angle) && !isFiniteNumberInRange(shadowObj.angle, 0, 359)) {
            issues.push(this.repairIssue('INVALID_ROTATION', `${path}.angle must be a finite number between 0 and 359 degrees`, slideNum, `${path}.angle`, shapeName, shapeIndex, shadowObj.angle));
        }
        return issues;
    }
    validateEffectRepairRisk(effect, slideNum, path, shapeName, shapeIndex) {
        if (!effect || typeof effect !== 'object')
            return [];
        const effectObj = effect;
        const issues = [];
        if (hasAuthoredValue(effectObj.color) && !isValidColorValue(effectObj.color)) {
            issues.push(this.repairIssue('INVALID_COLOR', `${path}.color must be a 6-digit RGB, scheme color, or preset color`, slideNum, `${path}.color`, shapeName, shapeIndex, effectObj.color));
        }
        if (hasAuthoredValue(effectObj.opacity) && !isFiniteNumberInRange(effectObj.opacity, 0, 100)) {
            issues.push(this.repairIssue('INVALID_OPACITY', `${path}.opacity must be a finite number between 0 and 1, or 0 and 100 for percent-style input`, slideNum, `${path}.opacity`, shapeName, shapeIndex, effectObj.opacity));
        }
        for (const key of ['size', 'blur', 'offset', 'fadeStart', 'fadeEnd', 'distance']) {
            if (hasAuthoredValue(effectObj[key]) && !isFiniteNumberInRange(effectObj[key], 0, 200)) {
                issues.push(this.repairIssue('INVALID_COORDINATE', `${path}.${key} must be a finite non-negative value`, slideNum, `${path}.${key}`, shapeName, shapeIndex, effectObj[key]));
            }
        }
        if (hasAuthoredValue(effectObj.angle) && !isFiniteNumberInRange(effectObj.angle, 0, 359)) {
            issues.push(this.repairIssue('INVALID_ROTATION', `${path}.angle must be a finite number between 0 and 359 degrees`, slideNum, `${path}.angle`, shapeName, shapeIndex, effectObj.angle));
        }
        return issues;
    }
    validateSoftEdgesRepairRisk(softEdges, slideNum, path, shapeName, shapeIndex) {
        if (!softEdges || typeof softEdges !== 'object')
            return [];
        const value = softEdges.size;
        if (hasAuthoredValue(value) && !isFiniteNumberInRange(value, 0, 100)) {
            return [this.repairIssue('INVALID_COORDINATE', `${path}.size must be a finite point value between 0 and 100`, slideNum, `${path}.size`, shapeName, shapeIndex, value)];
        }
        return [];
    }
    validateTextBaseRepairRisk(options, slideNum, path, shapeName, shapeIndex) {
        var _a;
        const issues = [];
        if (hasAuthoredValue(options.fontSize) && !isFiniteNumberInRange(options.fontSize, 1, 400)) {
            issues.push(this.repairIssue('INVALID_COORDINATE', `${path}.fontSize must be a finite point value between 1 and 400`, slideNum, `${path}.fontSize`, shapeName, shapeIndex, options.fontSize));
        }
        if (hasAuthoredValue(options.transparency) && !isFiniteNumberInRange(options.transparency, 0, 100)) {
            issues.push(this.repairIssue('INVALID_TRANSPARENCY', `${path}.transparency must be a finite percent between 0 and 100`, slideNum, `${path}.transparency`, shapeName, shapeIndex, options.transparency));
        }
        if (hasAuthoredValue(options.baseline) && !isFiniteNumberInRange(options.baseline, -100, 100)) {
            issues.push(this.repairIssue('INVALID_COORDINATE', `${path}.baseline must be a finite percent between -100 and 100`, slideNum, `${path}.baseline`, shapeName, shapeIndex, options.baseline));
        }
        if (hasAuthoredValue(options.fontFaceComplexScript) && (typeof options.fontFaceComplexScript !== 'string' || !options.fontFaceComplexScript.trim() || /[\u0000-\u001F\u007F]/.test(options.fontFaceComplexScript))) {
            issues.push(this.repairIssue('INVALID_COORDINATE', `${path}.fontFaceComplexScript must be a non-empty typeface without control characters`, slideNum, `${path}.fontFaceComplexScript`, shapeName, shapeIndex, options.fontFaceComplexScript));
        }
        for (const key of ['rtl', 'softBreakBefore']) {
            if (hasAuthoredValue(options[key]) && typeof options[key] !== 'boolean')
                issues.push(this.repairIssue('INVALID_COORDINATE', `${path}.${key} must be boolean`, slideNum, `${path}.${key}`, shapeName, shapeIndex, options[key]));
        }
        if (hasAuthoredValue(options.field)) {
            if (!options.field || typeof options.field !== 'object' || Array.isArray(options.field)) {
                issues.push(this.repairIssue('INVALID_COORDINATE', `${path}.field must be an object`, slideNum, `${path}.field`, shapeName, shapeIndex, options.field));
            }
            else {
                const field = options.field;
                if (typeof field.id !== 'string' || !/^\{[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}\}$/.test(field.id)) {
                    issues.push(this.repairIssue('INVALID_COORDINATE', `${path}.field.id must be a braced GUID`, slideNum, `${path}.field.id`, shapeName, shapeIndex, field.id));
                }
                if (typeof field.type !== 'string' || !field.type.trim() || field.type.length > 128 || /[\u0000-\u001F\u007F]/.test(field.type)) {
                    issues.push(this.repairIssue('INVALID_COORDINATE', `${path}.field.type must be a non-empty field token of at most 128 characters`, slideNum, `${path}.field.type`, shapeName, shapeIndex, field.type));
                }
            }
        }
        if (hasAuthoredValue(options.charSpacing) && !isFiniteNumberInRange(options.charSpacing, -100, 100)) {
            issues.push(this.repairIssue('INVALID_COORDINATE', `${path}.charSpacing must be a finite point value between -100 and 100`, slideNum, `${path}.charSpacing`, shapeName, shapeIndex, options.charSpacing));
        }
        for (const key of ['lineSpacing', 'paraSpaceAfter', 'paraSpaceBefore', 'indent', 'hanging']) {
            if (hasAuthoredValue(options[key]) && !isFiniteNumberInRange(options[key], 0, 400)) {
                issues.push(this.repairIssue('INVALID_COORDINATE', `${path}.${key} must be a finite non-negative point value`, slideNum, `${path}.${key}`, shapeName, shapeIndex, options[key]));
            }
            if (hasAuthoredValue(options[key]) && Math.abs(Number(options[key]) - Math.round(Number(options[key]) * 100) / 100) > 1e-9) {
                issues.push(this.repairIssue('INVALID_COORDINATE', `${path}.${key} must use a 0.01-point step`, slideNum, `${path}.${key}`, shapeName, shapeIndex, options[key]));
            }
        }
        if (hasAuthoredValue(options.lineSpacingMultiple) && !isFiniteNumberInRange(options.lineSpacingMultiple, 0, 9.99)) {
            issues.push(this.repairIssue('INVALID_COORDINATE', `${path}.lineSpacingMultiple must be a finite value between 0 and 9.99`, slideNum, `${path}.lineSpacingMultiple`, shapeName, shapeIndex, options.lineSpacingMultiple));
        }
        if (hasAuthoredValue(options.indentLevel) && (!Number.isInteger(options.indentLevel) || Number(options.indentLevel) < 0 || Number(options.indentLevel) > 8)) {
            issues.push(this.repairIssue('INVALID_COORDINATE', `${path}.indentLevel must be an integer between 0 and 8`, slideNum, `${path}.indentLevel`, shapeName, shapeIndex, options.indentLevel));
        }
        if (hasAuthoredValue(options.tabStops)) {
            if (!Array.isArray(options.tabStops) || options.tabStops.length > 32)
                issues.push(this.repairIssue('INVALID_COORDINATE', `${path}.tabStops must be an array with at most 32 entries`, slideNum, `${path}.tabStops`, shapeName, shapeIndex, options.tabStops));
            else
                options.tabStops.forEach((stop, index) => {
                    const entry = stop;
                    if (!entry || typeof entry !== 'object' || !isFiniteNumberInRange(entry.position, 0, 100) || Math.abs(Number(entry.position) - Math.round(Number(entry.position) * 100) / 100) > 1e-9)
                        issues.push(this.repairIssue('INVALID_COORDINATE', `${path}.tabStops[${index}].position must be 0..100 inches at a 0.01 step`, slideNum, `${path}.tabStops[${index}].position`, shapeName, shapeIndex, entry === null || entry === void 0 ? void 0 : entry.position));
                    if ((entry === null || entry === void 0 ? void 0 : entry.alignment) !== undefined && !['l', 'r', 'ctr', 'dec'].includes(String(entry.alignment)))
                        issues.push(this.repairIssue('INVALID_COORDINATE', `${path}.tabStops[${index}].alignment must be l, r, ctr, or dec`, slideNum, `${path}.tabStops[${index}].alignment`, shapeName, shapeIndex, entry.alignment));
                });
        }
        if (hasAuthoredValue(options.strike) && options.strike !== true && options.strike !== false && options.strike !== 'sngStrike' && options.strike !== 'dblStrike')
            issues.push(this.repairIssue('INVALID_COORDINATE', `${path}.strike must be boolean, sngStrike, or dblStrike`, slideNum, `${path}.strike`, shapeName, shapeIndex, options.strike));
        for (const key of ['superscript', 'subscript'])
            if (hasAuthoredValue(options[key]) && typeof options[key] !== 'boolean')
                issues.push(this.repairIssue('INVALID_COORDINATE', `${path}.${key} must be boolean`, slideNum, `${path}.${key}`, shapeName, shapeIndex, options[key]));
        if (options.superscript === true && options.subscript === true)
            issues.push(this.repairIssue('INVALID_COORDINATE', `${path} cannot enable superscript and subscript together`, slideNum, path, shapeName, shapeIndex, { superscript: options.superscript, subscript: options.subscript }));
        if (hasAuthoredValue(options.baseline) && (options.superscript === true || options.subscript === true))
            issues.push(this.repairIssue('INVALID_COORDINATE', `${path}.baseline cannot be combined with superscript or subscript`, slideNum, path, shapeName, shapeIndex, { baseline: options.baseline, superscript: options.superscript, subscript: options.subscript }));
        if (options.bullet && typeof options.bullet === 'object') {
            const bullet = options.bullet;
            for (const key of ['indent', 'marginPt', 'fontSize']) {
                if (hasAuthoredValue(bullet[key]) && !isFiniteNumberInRange(bullet[key], 0, 400)) {
                    issues.push(this.repairIssue('INVALID_COORDINATE', `${path}.bullet.${key} must be a finite non-negative point value`, slideNum, `${path}.bullet.${key}`, shapeName, shapeIndex, bullet[key]));
                }
                if (hasAuthoredValue(bullet[key]) && Math.abs(Number(bullet[key]) - Math.round(Number(bullet[key]) * 100) / 100) > 1e-9) {
                    issues.push(this.repairIssue('INVALID_COORDINATE', `${path}.bullet.${key} must use a 0.01-point step`, slideNum, `${path}.bullet.${key}`, shapeName, shapeIndex, bullet[key]));
                }
            }
            if (hasAuthoredValue(bullet.color) && !isValidColorValue(bullet.color)) {
                issues.push(this.repairIssue('INVALID_COLOR', `${path}.bullet.color must be a 6-digit RGB, scheme color, or preset color`, slideNum, `${path}.bullet.color`, shapeName, shapeIndex, bullet.color));
            }
            const numberStartAt = (_a = bullet.numberStartAt) !== null && _a !== void 0 ? _a : bullet.startAt;
            if (hasAuthoredValue(numberStartAt) && !isPositiveInteger(numberStartAt)) {
                issues.push(this.repairIssue('INVALID_COORDINATE', `${path}.bullet.numberStartAt must be a positive integer`, slideNum, `${path}.bullet.numberStartAt`, shapeName, shapeIndex, numberStartAt));
            }
        }
        if (options.underline && typeof options.underline === 'object') {
            const underline = options.underline;
            if (hasAuthoredValue(underline.color) && !isValidColorValue(underline.color)) {
                issues.push(this.repairIssue('INVALID_COLOR', `${path}.underline.color must be a 6-digit RGB, scheme color, or preset color`, slideNum, `${path}.underline.color`, shapeName, shapeIndex, underline.color));
            }
        }
        return issues;
    }
    validateTableRepairRisk(rows, options, slideNum, path, shapeName, shapeIndex) {
        const issues = [];
        if (rows === undefined || rows === null)
            return issues;
        if (!Array.isArray(rows) || rows.length === 0) {
            return [this.repairIssue('INVALID_TABLE_GRID', `${path} must contain at least one row`, slideNum, path, shapeName, shapeIndex, rows)];
        }
        let maxColumns = 0;
        rows.forEach((row, rowIndex) => {
            if (!Array.isArray(row) || row.length === 0) {
                issues.push(this.repairIssue('INVALID_TABLE_GRID', `${path}[${rowIndex}] must contain at least one cell`, slideNum, `${path}[${rowIndex}]`, shapeName, shapeIndex, row));
                return;
            }
            maxColumns = Math.max(maxColumns, row.length);
            row.forEach((cell, cellIndex) => {
                if (cell && typeof cell === 'object') {
                    const cellOptions = cell.options;
                    issues.push(...this.validateCommonOptionsRepairRisk(cellOptions, slideNum, `${path}[${rowIndex}][${cellIndex}].options`, shapeName, shapeIndex, undefined, 'table'));
                }
            });
        });
        if (options && typeof options === 'object') {
            const opts = options;
            if (Array.isArray(opts.colW)) {
                opts.colW.forEach((width, index) => {
                    if (!isFiniteNumberInRange(width, 0.001, 100)) {
                        issues.push(this.repairIssue('INVALID_TABLE_GRID', `${path}.options.colW[${index}] must be a positive finite width`, slideNum, `${path}.options.colW[${index}]`, shapeName, shapeIndex, width));
                    }
                });
                if (maxColumns > 0 && opts.colW.length !== maxColumns) {
                    issues.push(this.repairIssue('INVALID_TABLE_GRID', `${path}.options.colW length must match table column count`, slideNum, `${path}.options.colW`, shapeName, shapeIndex, opts.colW, 'Provide one positive column width per table column.'));
                }
            }
            if (Array.isArray(opts.rowH)) {
                opts.rowH.forEach((height, index) => {
                    if (!isFiniteNumberInRange(height, 0.001, 100)) {
                        issues.push(this.repairIssue('INVALID_TABLE_GRID', `${path}.options.rowH[${index}] must be a positive finite height`, slideNum, `${path}.options.rowH[${index}]`, shapeName, shapeIndex, height));
                    }
                });
            }
        }
        return issues;
    }
    validatePassthroughRepairRisk(obj, slideNum, path, shapeName, shapeIndex) {
        if (!obj.passthrough)
            return [];
        const xml = obj.passthrough.xml;
        if (typeof xml !== 'string' || !xml.trim()) {
            return [this.repairIssue('INVALID_PASSTHROUGH_XML', `${path}.xml must be a non-empty string`, slideNum, `${path}.xml`, shapeName, shapeIndex, xml)];
        }
        return [];
    }
    validateChartRepairRisk(options, slideNum, path) {
        if (!options || typeof options !== 'object')
            return [];
        const opts = options;
        const issues = [];
        issues.push(...this.validatePositionRepairRisk(opts, slideNum, path));
        issues.push(...this.validateFillRepairRisk(opts.fill, slideNum, `${path}.fill`));
        issues.push(...this.validateLineRepairRisk(opts.line, slideNum, `${path}.line`));
        if (Array.isArray(opts.chartColors)) {
            opts.chartColors.forEach((color, index) => {
                if (!isValidColorValue(color)) {
                    issues.push(this.repairIssue('INVALID_COLOR', `${path}.chartColors[${index}] must be a 6-digit RGB, scheme color, or preset color`, slideNum, `${path}.chartColors[${index}]`, undefined, undefined, color));
                }
            });
        }
        if (hasAuthoredValue(opts.chartColorsOpacity) && !isFiniteNumberInRange(opts.chartColorsOpacity, 0, 100)) {
            issues.push(this.repairIssue('INVALID_OPACITY', `${path}.chartColorsOpacity must be a finite percent between 0 and 100`, slideNum, `${path}.chartColorsOpacity`, undefined, undefined, opts.chartColorsOpacity));
        }
        return issues;
    }
    validateGradientFill(fill, slideNum, label, shapeName, shapeIndex) {
        if (!fill || typeof fill !== 'object')
            return [];
        const gradient = fill;
        if (gradient.type !== 'gradient' && gradient.gradientDirection == null && !Array.isArray(gradient.gradientStops))
            return [];
        if (gradient.gradientDirection == null)
            return [];
        const issue = validateGradientDirectionOption(gradient.gradientDirection, `${label}.gradientDirection`);
        if (!issue)
            return [];
        return [{
                severity: issue.code.endsWith('_ALIAS') ? 'warning' : 'error',
                code: issue.code,
                message: issue.message,
                slideNumber: slideNum,
                shapeName,
                shapeIndex,
                suggestion: issue.suggestion,
                autoFixAvailable: false,
                context: issue,
            }];
    }
    validateText3DRotations(text3D, slideNum, label, shapeName, shapeIndex) {
        if (!text3D || typeof text3D !== 'object')
            return [];
        const issues = [];
        const rotations = text3D;
        for (const key of ['rotationX', 'rotationY', 'rotationZ', 'lightDirection']) {
            const rawValue = rotations[key];
            if (rawValue == null)
                continue;
            const issue = validateText3DRotationOption(rawValue, `${label}.${key}`);
            if (!issue)
                continue;
            issues.push({
                // Equivalent modulo-360 angles are legal authored values. Preserve the
                // normalization as evidence, but never turn a lossless rewrite into a
                // strict-validation blocker.
                severity: issue.code === 'TEXT3D_ROTATION_NORMALIZED' ? 'info' : 'error',
                code: issue.code,
                message: issue.message,
                slideNumber: slideNum,
                shapeName,
                shapeIndex,
                suggestion: issue.suggestion,
                autoFixAvailable: false,
                context: issue,
            });
        }
        return issues;
    }
    validateWordArtTransform(wordArt, slideNum, label, shapeName, shapeIndex) {
        if (!wordArt || typeof wordArt !== 'object')
            return [];
        const transform = wordArt.transform;
        if (transform == null)
            return [];
        const issue = validateWordArtTransformOption(transform, `${label}.transform`);
        if (!issue)
            return [];
        return [{
                severity: issue.code.endsWith('_ALIAS') ? 'warning' : 'error',
                code: issue.code,
                message: issue.message,
                slideNumber: slideNum,
                shapeName,
                shapeIndex,
                suggestion: issue.suggestion,
                autoFixAvailable: false,
                context: issue,
            }];
    }
    // ============================================================================
    // HELPER METHODS
    // ============================================================================
    /**
     * Adjust severities based on validation mode
     */
    adjustSeverities(issues, mode) {
        return issues.map((issue) => {
            if (mode === 'strict') {
                // In strict mode, warnings become errors
                if (issue.severity === 'warning') {
                    return Object.assign(Object.assign({}, issue), { severity: 'error' });
                }
            }
            else if (mode === 'lenient') {
                // In lenient mode, only critical issues remain errors
                const criticalCodes = [
                    'MISSING_IMAGE_SOURCE',
                    'ANIMATION_ON_MISSING_SHAPE',
                    'INVALID_GRADIENT_DIRECTION',
                    'INVALID_TEXT3D_ROTATION',
                    'INVALID_WORDART_TRANSFORM',
                    ...REPAIR_RISK_ISSUE_CODES,
                ];
                if (issue.severity === 'error' && !criticalCodes.includes(issue.code)) {
                    return Object.assign(Object.assign({}, issue), { severity: 'warning' });
                }
            }
            return issue;
        });
    }
    /**
     * Apply auto-fixes to issues that support it
     */
    applyAutoFixes(issues, slides) {
        var _a;
        for (const issue of issues) {
            if (!issue.autoFixAvailable || !issue.slideNumber || issue.shapeIndex === undefined) {
                continue;
            }
            const slide = slides.find((s) => this.slides.indexOf(s) + 1 === issue.slideNumber);
            if (!slide)
                continue;
            const shape = (_a = slide._slideObjects) === null || _a === void 0 ? void 0 : _a[issue.shapeIndex];
            if (!shape || !shape.options)
                continue;
            const slideWidth = this.presLayout.width / 914400;
            const slideHeight = this.presLayout.height / 914400;
            switch (issue.code) {
                case 'ELEMENT_OFF_SLIDE_LEFT':
                case 'ELEMENT_OFF_SLIDE_RIGHT':
                case 'ELEMENT_OFF_SLIDE_TOP':
                case 'ELEMENT_OFF_SLIDE_BOTTOM':
                case 'ELEMENT_PARTIALLY_OFF_SLIDE': {
                    // Clamp element to slide bounds
                    const bounds = getElementBounds(shape, this.presLayout);
                    if (bounds.x < 0)
                        shape.options.x = 0;
                    if (bounds.y < 0)
                        shape.options.y = 0;
                    if (bounds.right > slideWidth) {
                        shape.options.x = Math.max(0, slideWidth - bounds.w);
                    }
                    if (bounds.bottom > slideHeight) {
                        shape.options.y = Math.max(0, slideHeight - bounds.h);
                    }
                    break;
                }
                case 'NEGATIVE_DIMENSION': {
                    // Make dimensions positive
                    if (typeof shape.options.w === 'number' && shape.options.w < 0) {
                        shape.options.w = Math.abs(shape.options.w);
                    }
                    if (typeof shape.options.h === 'number' && shape.options.h < 0) {
                        shape.options.h = Math.abs(shape.options.h);
                    }
                    break;
                }
                case 'OVERSIZED_ELEMENT': {
                    // Scale down to fit slide
                    const bounds = getElementBounds(shape, this.presLayout);
                    const scaleX = slideWidth / bounds.w;
                    const scaleY = slideHeight / bounds.h;
                    const scale = Math.min(scaleX, scaleY, 1) * 0.9; // 90% of slide max
                    if (scale < 1) {
                        shape.options.w = bounds.w * scale;
                        shape.options.h = bounds.h * scale;
                    }
                    break;
                }
            }
        }
    }
    /**
     * Create validation result from issues
     */
    createResult(issues) {
        const errorCount = issues.filter((i) => i.severity === 'error').length;
        const warningCount = issues.filter((i) => i.severity === 'warning').length;
        const infoCount = issues.filter((i) => i.severity === 'info').length;
        return {
            valid: errorCount === 0,
            issueCount: issues.length,
            errorCount,
            warningCount,
            infoCount,
            issues,
        };
    }
    // ============================================================================
    // STATIC FACTORY
    // ============================================================================
    /**
     * Create a ValidationEngine for a presentation
     */
    static create(presLayout, slides, mode) {
        return new ValidationEngine(presLayout, slides, mode);
    }
}
// ============================================================================
// EXPORTED HELPER FUNCTIONS
// ============================================================================
/**
 * Quick validation check - returns true if presentation is valid
 */
export function isValid(presLayout, slides, options) {
    const engine = new ValidationEngine(presLayout, slides, options === null || options === void 0 ? void 0 : options.mode);
    return engine.validate(options).valid;
}
/**
 * Get validation issues for a presentation
 */
export function getValidationIssues(presLayout, slides, options) {
    const engine = new ValidationEngine(presLayout, slides, options === null || options === void 0 ? void 0 : options.mode);
    return engine.validate(options).issues;
}
//# sourceMappingURL=validation-engine.js.map