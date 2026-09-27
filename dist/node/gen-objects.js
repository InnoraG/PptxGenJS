/**
 * PptxGenJS: Slide Object Generators
 */
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
import { BARCHART_COLORS, CHART_TYPE, DEF_CELL_BORDER, DEF_CELL_MARGIN_IN, DEF_CHART_BORDER, DEF_FONT_COLOR, DEF_FONT_SIZE, DEF_SHAPE_LINE_COLOR, DEF_SLIDE_MARGIN_IN, EMU, IMG_BROKEN, IMG_PLAYBTN, MASTER_OBJECTS, PIECHART_COLORS, SCHEME_COLOR_NAMES, SHAPE_TYPE, SLIDE_OBJECT_TYPES, TEXT_HALIGN, TEXT_VALIGN, } from './core-enums';
import { getSlidesForTableRows } from './gen-tables';
import { CAMEO_DEFAULT_SIZE_EMU, CAMEO_PLACEHOLDER_SVG_DATAURI } from './cameo-placeholder';
import { ZOOM_DEFAULT_W_EMU, ZOOM_DEFAULT_H_EMU, ZOOM_SLDID_BASE, ZOOM_PLACEHOLDER_PNG_DATAURI } from './zoom-placeholder';
import { getNewRelId, getSmartParseNumber, getUuid, inch2Emu, valToPts, correctShadowOptions } from './gen-utils';
import { createNativeSmartArt, SMARTART_REL_TYPES } from './gen-smartart';
import { getChartStylePresetForNativeGallery } from './chart-presets';
import { CHART_GALLERY, getChartGalleryVariant } from './chart-gallery';
import { resolveAudioVideoPackageType, resolveImagePackageType } from './media-types';
// Inline animation import removed - use slide.addAnimation() instead
/** counter for included charts (used for index in their filenames) */
let _chartCounter = 0;
let _nativeSmartArtCounter = 0;
const MIN_LINE_DIMENSION_IN = 0.001;
const MIN_LINE_DIMENSION_PERCENT = 0.01;
const SHAPE_LINE_DASH_TYPES = new Set(['solid', 'dash', 'dashDot', 'lgDash', 'lgDashDot', 'lgDashDotDot', 'sysDash', 'sysDot']);
const SHAPE_LINE_ARROW_TYPES = new Set(['none', 'arrow', 'diamond', 'oval', 'stealth', 'triangle']);
const SHAPE_LINE_ARROW_SIZES = new Set(['sm', 'med', 'lg']);
/**
 * Preserve authored non-visual accessibility state when an add* definition
 * rebuilds its internal options object. In particular, false and null are
 * meaningful lifecycle values and must not be lost through truthy fallbacks.
 */
function nonVisualAccessibilityOptions(opt) {
    if (!opt || typeof opt !== 'object')
        return {};
    const source = opt;
    const result = {};
    for (const key of ['accessibilityTitle', 'altText', 'isDecorative']) {
        if (Object.prototype.hasOwnProperty.call(source, key) && source[key] !== undefined)
            result[key] = source[key];
    }
    return result;
}
function validateShapeLineProps(line, context, allowGradient = false) {
    if (line == null || typeof line === 'string')
        return;
    if (typeof line !== 'object' || Array.isArray(line))
        throw new Error(`${context}: line must be a color string or line options object.`);
    const value = line;
    if (value.type != null && value.type !== 'none' && value.type !== 'solid' && !(allowGradient && value.type === 'gradient'))
        throw new Error(`${context}: line.type must be 'none', 'solid'${allowGradient ? ", or 'gradient'" : ''}.`);
    if (value.type === 'gradient') {
        const allowed = new Set(['type', 'gradientDirection', 'gradientAngle', 'gradientStops', 'rotateGradientWithShape', 'width', 'cap', 'dashType', 'beginArrowType', 'endArrowType', 'beginArrowWidth', 'beginArrowLength', 'endArrowWidth', 'endArrowLength']);
        for (const key of Object.keys(value))
            if (!allowed.has(key))
                throw new Error(`${context}: line.${key} is not supported for a gradient stroke.`);
        if (value.gradientDirection != null && value.gradientDirection !== 'linear')
            throw new Error(`${context}: line.gradientDirection must be 'linear'.`);
        if (value.gradientAngle != null && (!Number.isFinite(value.gradientAngle) || value.gradientAngle < 0 || value.gradientAngle >= 360))
            throw new Error(`${context}: line.gradientAngle must be between 0 and less than 360 degrees.`);
        if (value.rotateGradientWithShape != null && typeof value.rotateGradientWithShape !== 'boolean')
            throw new Error(`${context}: line.rotateGradientWithShape must be boolean.`);
        if (!Array.isArray(value.gradientStops) || value.gradientStops.length < 2 || value.gradientStops.length > 32)
            throw new Error(`${context}: line.gradientStops requires 2–32 ordered stops.`);
        let previous = -1;
        for (const stop of value.gradientStops) {
            if (!stop || typeof stop !== 'object' || Array.isArray(stop))
                throw new Error(`${context}: each gradient stop must be an object.`);
            for (const key of Object.keys(stop))
                if (!['position', 'color', 'transparency'].includes(key))
                    throw new Error(`${context}: unsupported gradient stop field '${key}'.`);
            if (typeof stop.position !== 'number' || !Number.isFinite(stop.position) || stop.position < 0 || stop.position > 100 || stop.position < previous)
                throw new Error(`${context}: gradient stop positions must be ordered percentages from 0 to 100.`);
            previous = stop.position;
            const text = typeof stop.color === 'string' ? stop.color : '';
            const hex = text.startsWith('#') ? text.slice(1) : text;
            const isHex = hex.length === 6 && Array.from(hex).every(char => '0123456789ABCDEFabcdef'.includes(char));
            const isTheme = [...Object.values(SCHEME_COLOR_NAMES), 'dk1', 'lt1', 'dk2', 'lt2', 'hlink', 'folHlink', 'phClr'].includes(text);
            if (!isHex && !isTheme)
                throw new Error(`${context}: gradient stop colors must be six-digit hexadecimal or theme colors.`);
            if (stop.transparency != null && (!Number.isFinite(stop.transparency) || stop.transparency < 0 || stop.transparency > 100))
                throw new Error(`${context}: gradient stop transparency must be between 0 and 100.`);
        }
    }
    if (value.cap != null && !['flat', 'round', 'square'].includes(value.cap))
        throw new Error(`${context}: line.cap must be 'flat', 'round', or 'square'.`);
    if (value.dashType != null && !SHAPE_LINE_DASH_TYPES.has(value.dashType))
        throw new Error(`${context}: unsupported line.dashType '${value.dashType}'.`);
    for (const [field, arrow] of [['beginArrowType', value.beginArrowType], ['endArrowType', value.endArrowType]]) {
        if (arrow != null && !SHAPE_LINE_ARROW_TYPES.has(arrow))
            throw new Error(`${context}: unsupported line.${field} '${arrow}'.`);
    }
    for (const [field, size] of [
        ['beginArrowWidth', value.beginArrowWidth], ['beginArrowLength', value.beginArrowLength],
        ['endArrowWidth', value.endArrowWidth], ['endArrowLength', value.endArrowLength],
    ]) {
        if (size != null && !SHAPE_LINE_ARROW_SIZES.has(size))
            throw new Error(`${context}: unsupported line.${field} '${size}'.`);
    }
    if (value.width != null && (!Number.isFinite(value.width) || value.width < 0 || value.width > 1584)) {
        throw new Error(`${context}: line.width must be a finite number between 0 and 1584 points.`);
    }
    if (value.transparency != null && (!Number.isFinite(value.transparency) || value.transparency < 0 || value.transparency > 100)) {
        throw new Error(`${context}: line.transparency must be a finite percentage between 0 and 100.`);
    }
}
function isLineShapeName(shapeName) {
    const value = String(shapeName);
    return value === SHAPE_TYPE.LINE || value === SHAPE_TYPE.LINE_INVERSE || value === 'line' || value === 'lineInv';
}
function getPercentCoordinate(value) {
    if (typeof value !== 'string')
        return undefined;
    const text = value.trim();
    if (!text.endsWith('%'))
        return undefined;
    const numeric = Number(text.slice(0, -1));
    return Number.isFinite(numeric) ? numeric : undefined;
}
function formatPercentCoordinate(value) {
    return `${Number(value.toFixed(6))}%`;
}
function normalizeLineShapeOptions(shapeName, opts) {
    const options = opts && typeof opts === 'object' ? Object.assign({}, opts) : {};
    if (!isLineShapeName(shapeName))
        return options;
    const normalizeDimension = (dimensionKey, originKey, flipKey) => {
        const dimension = options[dimensionKey];
        if (typeof dimension === 'number') {
            if (!Number.isFinite(dimension))
                return;
            let nextDimension = dimension;
            if (nextDimension < 0) {
                const origin = options[originKey];
                if (typeof origin === 'number' && Number.isFinite(origin))
                    options[originKey] = origin + nextDimension;
                nextDimension = Math.abs(nextDimension);
                options[flipKey] = !Boolean(options[flipKey]);
            }
            if (nextDimension === 0)
                nextDimension = MIN_LINE_DIMENSION_IN;
            options[dimensionKey] = nextDimension;
            return;
        }
        const percentDimension = getPercentCoordinate(dimension);
        if (typeof percentDimension === 'undefined')
            return;
        let nextPercent = percentDimension;
        if (nextPercent < 0) {
            const originPercent = getPercentCoordinate(options[originKey]);
            if (typeof originPercent !== 'undefined')
                options[originKey] = formatPercentCoordinate(originPercent + nextPercent);
            nextPercent = Math.abs(nextPercent);
            options[flipKey] = !Boolean(options[flipKey]);
        }
        if (nextPercent === 0)
            nextPercent = MIN_LINE_DIMENSION_PERCENT;
        options[dimensionKey] = formatPercentCoordinate(nextPercent);
    };
    normalizeDimension('w', 'x', 'flipH');
    normalizeDimension('h', 'y', 'flipV');
    return options;
}
/**
 * Transforms a slide definition to a slide object that is then passed to the XML transformation process.
 * @param {SlideMasterProps} props - slide definition
 * @param {PresSlide|SlideLayout} target - empty slide object that should be updated by the passed definition
 */
export function createSlideMaster(props, target) {
    // STEP 1: Add background if either the slide or layout has background props
    // if (props.background || target.background) addBackgroundDefinition(props.background, target)
    if (props.bkgd)
        target.bkgd = props.bkgd; // DEPRECATED: (remove in v4.0.0)
    // STEP 2: Add all Slide Master objects in the order they were given
    if (props.objects && Array.isArray(props.objects) && props.objects.length > 0) {
        props.objects.forEach((object, idx) => {
            var _a, _b, _c, _d;
            const key = Object.keys(object)[0];
            const tgt = target;
            if (MASTER_OBJECTS[key] && key === 'chart')
                addChartDefinition(tgt, object[key].type, object[key].data, object[key].opts);
            else if (MASTER_OBJECTS[key] && key === 'image')
                addImageDefinition(tgt, object[key]);
            else if (MASTER_OBJECTS[key] && key === 'line')
                addShapeDefinition(tgt, SHAPE_TYPE.LINE, object[key]);
            else if (MASTER_OBJECTS[key] && key === 'rect')
                addShapeDefinition(tgt, SHAPE_TYPE.RECTANGLE, object[key]);
            else if (MASTER_OBJECTS[key] && key === 'text')
                addTextDefinition(tgt, [{ text: object[key].text }], object[key].options, false);
            else if (MASTER_OBJECTS[key] && key === 'placeholder') {
                // TODO: 20180820: Check for existing `name`?
                const authoredPlaceholderName = object[key].options.name;
                object[key].options.placeholder = authoredPlaceholderName;
                // Keep a deterministic semantic object identity for master placeholders.
                // Without this, addTextDefinition assigns the generic `Text N` fallback;
                // that fallback is then inherited by slide content and can overwrite the
                // caller's stable objectName during placeholder-style merging.
                if (!object[key].options.objectName) {
                    object[key].options.objectName = authoredPlaceholderName
                        ? `Placeholder ${authoredPlaceholderName}`
                        : `Placeholder ${idx + 1}`;
                }
                delete object[key].options.name; // remap name for earier handling internally
                object[key].options._placeholderType = object[key].options.type;
                delete object[key].options.type; // remap name for earier handling internally
                // Preserve an authored Office placeholder index/size when supplied;
                // the historical 100+array-index value remains the deterministic
                // fallback for legacy master definitions.
                const authoredPlaceholderIdx = (_a = object[key].options.idx) !== null && _a !== void 0 ? _a : object[key].options.phIdx;
                const authoredPlaceholderSz = (_b = object[key].options.sz) !== null && _b !== void 0 ? _b : object[key].options.phSz;
                const authoredPlaceholderOrient = (_c = object[key].options.orient) !== null && _c !== void 0 ? _c : object[key].options.phOrient;
                const authoredPlaceholderHasCustomPrompt = (_d = object[key].options.hasCustomPrompt) !== null && _d !== void 0 ? _d : object[key].options.customPrompt;
                object[key].options._placeholderIdx = authoredPlaceholderIdx !== undefined && authoredPlaceholderIdx !== null ? authoredPlaceholderIdx : 100 + idx;
                if (authoredPlaceholderSz)
                    object[key].options._placeholderSz = authoredPlaceholderSz;
                if (authoredPlaceholderOrient)
                    object[key].options._placeholderOrient = authoredPlaceholderOrient;
                if (authoredPlaceholderHasCustomPrompt !== undefined && authoredPlaceholderHasCustomPrompt !== null)
                    object[key].options._placeholderHasCustomPrompt = authoredPlaceholderHasCustomPrompt;
                delete object[key].options.idx;
                delete object[key].options.phIdx;
                delete object[key].options.sz;
                delete object[key].options.phSz;
                delete object[key].options.orient;
                delete object[key].options.phOrient;
                delete object[key].options.hasCustomPrompt;
                delete object[key].options.customPrompt;
                addTextDefinition(tgt, [{ text: object[key].text }], object[key].options, true);
                // TODO: ISSUE#599 - only text is suported now (add more below)
                // else if (object[key].image) addImageDefinition(tgt, object[key].image)
                /* 20200120: So... image placeholders go into the "slideLayoutN.xml" file and addImage doesnt do this yet...
                    <p:sp>
                  <p:nvSpPr>
                    <p:cNvPr id="7" name="Picture Placeholder 6">
                      <a:extLst>
                        <a:ext uri="{FF2B5EF4-FFF2-40B4-BE49-F238E27FC236}">
                          <a16:creationId xmlns:a16="http://schemas.microsoft.com/office/drawing/2014/main" id="{CE1AE45D-8641-0F4F-BDB5-080E69CCB034}"/>
                        </a:ext>
                      </a:extLst>
                    </p:cNvPr>
                    <p:cNvSpPr>
                */
            }
        });
    }
    // STEP 3: Add Slide Numbers (NOTE: Do this last so numbers are not covered by objects!)
    if (props.slideNumber && typeof props.slideNumber === 'object')
        target._slideNumberProps = props.slideNumber;
}
/**
 * Generate the chart based on input data.
 * OOXML Chart Spec: ISO/IEC 29500-1:2016(E)
 *
 * @param {CHART_NAME | IChartMulti[]} `type` should belong to: 'column', 'pie'
 * @param {[]} `data` a JSON object with follow the following format
 * @param {IChartOptsLib} `opt` chart options
 * @param {PresSlide} `target` slide object that the chart will be added to
 * @return {object} chart object
 * {
 *    title: 'eSurvey chart',
 *    data: [
 *        {
 *            name: 'Income',
 *            labels: ['2005', '2006', '2007', '2008', '2009'],
 *            values: [23.5, 26.2, 30.1, 29.5, 24.6]
 *        },
 *        {
 *            name: 'Expense',
 *            labels: ['2005', '2006', '2007', '2008', '2009'],
 *            values: [18.1, 22.8, 23.9, 25.1, 25]
 *        }
 *    ]
 * }
 */
export function addChartDefinition(target, type, data, opt) {
    var _a, _b, _c;
    function correctGridLineOptions(glOpts) {
        if (!glOpts || glOpts.style === 'none')
            return;
        if (glOpts.size !== undefined && (isNaN(Number(glOpts.size)) || glOpts.size <= 0)) {
            console.warn('Warning: chart.gridLine.size must be greater than 0.');
            delete glOpts.size; // delete prop to used defaults
        }
        if (glOpts.style && !['solid', 'dash', 'dot'].includes(glOpts.style)) {
            console.warn('Warning: chart.gridLine.style options: `solid`, `dash`, `dot`.');
            delete glOpts.style;
        }
        if (glOpts.cap && !['flat', 'square', 'round'].includes(glOpts.cap)) {
            console.warn('Warning: chart.gridLine.cap options: `flat`, `square`, `round`.');
            delete glOpts.cap;
        }
    }
    function assertValidChartType(chartType) {
        if (typeof chartType === 'string' && Object.values(CHART_TYPE).includes(chartType))
            return;
        throw new Error(`Invalid chart type: ${String(chartType)}. Supported chart types: ${Object.values(CHART_TYPE).join(', ')}`);
    }
    const CHARTEX_TYPES = new Set([
        CHART_TYPE.TREEMAP,
        CHART_TYPE.SUNBURST,
        CHART_TYPE.HISTOGRAM,
        CHART_TYPE.PARETO,
        CHART_TYPE.BOX_WHISKER,
        CHART_TYPE.WATERFALL,
        CHART_TYPE.FUNNEL,
        CHART_TYPE.REGION_MAP,
    ]);
    const chartId = ++_chartCounter;
    const resultObject = {
        _type: null,
        text: null,
        options: null,
        chartRid: null,
    };
    // DESIGN: `type` can an object (ex: `pptx.charts.DOUGHNUT`) or an array of chart objects
    // EX: addChartDefinition([ { type:pptx.charts.BAR, data:{name:'', labels:[], values[]} }, {<etc>} ])
    // Multi-Type Charts
    let tmpOpt = null;
    let tmpData = [];
    if (Array.isArray(type)) {
        // For multi-type charts there needs to be data for each type,
        // as well as a single data source for non-series operations.
        // The data is indexed below to keep the data in order when segmented
        // into types.
        type.forEach(obj => {
            assertValidChartType(obj.type);
            tmpData = tmpData.concat(obj.data);
        });
        tmpOpt = data || opt;
    }
    else {
        assertValidChartType(type);
        tmpData = data;
        tmpOpt = opt;
    }
    tmpData.forEach((item, i) => {
        item._dataIndex = i;
        // Converts the 'labels' array from string[] to string[][] (or the respective primitive type), if needed
        if (item.labels !== undefined && !Array.isArray(item.labels[0])) {
            item.labels = [item.labels];
        }
    });
    const userOptions = tmpOpt && typeof tmpOpt === 'object' ? tmpOpt : {};
    const rawReplay = typeof userOptions._rawChartXml === 'string'
        && userOptions._rawChartXml.trim().length > 0
        && typeof userOptions._rawChartRelsXml === 'string'
        && userOptions._rawChartRelsXml.trim().length > 0;
    // A complete raw replay pair is the package authority. Do not let authoring
    // presets fabricate semantic appearance fields or replace raw colour parts.
    const galleryPreset = rawReplay ? undefined : getChartGalleryVariant(userOptions.chartGalleryVariant);
    // Chart Colors are a native Office resource independent of the selected
    // chart style. Resolve the native PowerPoint colorStyle id at the library
    // boundary so an AI or
    // MCP plan can request a governed color palette without hand-authoring
    // series fills.  The serializer will emit the corresponding native
    // chartColorStyle relationship for legacy and ChartEx charts.
    const requestedColorStyleId = Number(userOptions.chartColorStyleId);
    const nativeColorXml = Number.isInteger(requestedColorStyleId)
        ? CHART_GALLERY.nativeColorCatalog[requestedColorStyleId]
        : undefined;
    const nativeColorPreset = !rawReplay && nativeColorXml
        ? {
            _rawChartColorsXml: nativeColorXml,
            _rawChartColorsName: `mcp-chart-colors-native-${requestedColorStyleId}.xml`,
        }
        : {};
    const effectiveStyleModernId = (_a = userOptions.chartStyleModernId) !== null && _a !== void 0 ? _a : galleryPreset === null || galleryPreset === void 0 ? void 0 : galleryPreset.chartStyleModernId;
    const effectiveStyleId = (_b = userOptions.chartStyleId) !== null && _b !== void 0 ? _b : galleryPreset === null || galleryPreset === void 0 ? void 0 : galleryPreset.chartStyleId;
    const nativeGalleryStyle = Number.isInteger(effectiveStyleModernId)
        || (Number.isInteger(effectiveStyleId) && effectiveStyleId >= 1 && effectiveStyleId <= 48);
    // Composite charts receive their family defaults per subtype in gen-charts;
    // using the first subtype here leaks Bar-only options into Line, Area, etc.
    const presetType = (Array.isArray(type) ? null : type);
    const galleryStyleBase = !rawReplay && presetType
        ? getChartStylePresetForNativeGallery(presetType, nativeGalleryStyle)
        : {};
    const options = Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({}, galleryStyleBase), (galleryPreset || {})), userOptions), nativeColorPreset), { chartArea: Object.assign(Object.assign({}, (galleryStyleBase.chartArea || {})), (userOptions.chartArea || {})), plotArea: Object.assign(Object.assign({}, (galleryStyleBase.plotArea || {})), (userOptions.plotArea || {})) });
    // STEP 1: TODO: check for reqd fields, correct type, etc
    // `type` exists in CHART_TYPE
    // Array.isArray(data)
    /*
        if ( Array.isArray(rel.data) && rel.data.length > 0 && typeof rel.data[0] === 'object'
            && rel.data[0].labels && Array.isArray(rel.data[0].labels)
            && rel.data[0].values && Array.isArray(rel.data[0].values) ) {
            obj = rel.data[0];
        }
        else {
            console.warn("USAGE: addChart( 'pie', [ {name:'Sales', labels:['Jan','Feb'], values:[10,20]} ], {x:1, y:1} )");
            return;
        }
        */
    // STEP 2: Set default options/decode user options
    // A: Core
    options._type = type;
    options.x = typeof options.x !== 'undefined' && options.x != null && !isNaN(Number(options.x)) ? options.x : 1;
    options.y = typeof options.y !== 'undefined' && options.y != null && !isNaN(Number(options.y)) ? options.y : 1;
    options.w = options.w || '50%';
    options.h = options.h || '50%';
    options.objectName = options.objectName
        ? options.objectName
        : `Chart ${target._slideObjects.filter(obj => obj._type === SLIDE_OBJECT_TYPES.chart).length}`;
    // B: Options: misc
    if (!['bar', 'col'].includes(options.barDir || ''))
        options.barDir = 'col';
    // barGrouping: "21.2.3.17 ST_Grouping (Grouping)"
    // barGrouping must be handled before data label validation as it can affect valid label positioning
    if (options._type === CHART_TYPE.AREA) {
        if (!['stacked', 'standard', 'percentStacked'].includes(options.barGrouping || ''))
            options.barGrouping = 'standard';
    }
    if (options._type === CHART_TYPE.BAR) {
        if (!['clustered', 'stacked', 'percentStacked'].includes(options.barGrouping || ''))
            options.barGrouping = 'clustered';
    }
    if (options._type === CHART_TYPE.BAR3D) {
        if (!['clustered', 'stacked', 'standard', 'percentStacked'].includes(options.barGrouping || ''))
            options.barGrouping = 'standard';
    }
    if ((_c = options.barGrouping) === null || _c === void 0 ? void 0 : _c.includes('tacked')) {
        if (!options.barGapWidthPct)
            options.barGapWidthPct = 50;
    }
    // Clean up and validate data label positions
    // REFERENCE: https://docs.microsoft.com/en-us/openspecs/office_standards/ms-oi29500/e2b1697c-7adc-463d-9081-3daef72f656f?redirectedfrom=MSDN
    if (options.dataLabelPosition) {
        if (options._type === CHART_TYPE.AREA || options._type === CHART_TYPE.BAR3D || options._type === CHART_TYPE.DOUGHNUT || options._type === CHART_TYPE.RADAR) {
            delete options.dataLabelPosition;
        }
        if (options._type === CHART_TYPE.PIE) {
            if (!['bestFit', 'ctr', 'inEnd', 'outEnd'].includes(options.dataLabelPosition))
                delete options.dataLabelPosition;
        }
        if (options._type === CHART_TYPE.BUBBLE || options._type === CHART_TYPE.BUBBLE3D || options._type === CHART_TYPE.LINE || options._type === CHART_TYPE.SCATTER) {
            if (!['b', 'ctr', 'l', 'r', 't'].includes(options.dataLabelPosition))
                delete options.dataLabelPosition;
        }
        if (options._type === CHART_TYPE.BAR) {
            if (!['stacked', 'percentStacked'].includes(options.barGrouping || '')) {
                if (!['ctr', 'inBase', 'inEnd'].includes(options.dataLabelPosition))
                    delete options.dataLabelPosition;
            }
            if (!['clustered'].includes(options.barGrouping || '')) {
                if (!['ctr', 'inBase', 'inEnd', 'outEnd'].includes(options.dataLabelPosition))
                    delete options.dataLabelPosition;
            }
        }
    }
    options.dataLabelBkgrdColors = options.dataLabelBkgrdColors || !options.dataLabelBkgrdColors ? options.dataLabelBkgrdColors : false;
    if (!['b', 'l', 'r', 't', 'tr'].includes(options.legendPos || ''))
        options.legendPos = 'r';
    // 3D bar: ST_Shape
    if (!['cone', 'coneToMax', 'box', 'cylinder', 'pyramid', 'pyramidToMax'].includes(options.bar3DShape || ''))
        options.bar3DShape = 'box';
    // lineDataSymbol: http://www.datypic.com/sc/ooxml/a-val-32.html
    // Spec has [plus,star,x] however neither PPT2013 nor PPT-Online support them
    if (!['circle', 'dash', 'diamond', 'dot', 'none', 'square', 'triangle'].includes(options.lineDataSymbol || ''))
        options.lineDataSymbol = 'circle';
    if (!['gap', 'span'].includes(options.displayBlanksAs || ''))
        options.displayBlanksAs = 'span';
    if (!['standard', 'marker', 'filled'].includes(options.radarStyle || ''))
        options.radarStyle = 'standard';
    options.lineDataSymbolSize = options.lineDataSymbolSize && !isNaN(options.lineDataSymbolSize) ? options.lineDataSymbolSize : 6;
    options.lineDataSymbolLineSize = options.lineDataSymbolLineSize && !isNaN(options.lineDataSymbolLineSize) ? valToPts(options.lineDataSymbolLineSize) : valToPts(0.75);
    // `layout` allows the override of PPT defaults to maximize space
    if (options.layout) {
        ['x', 'y', 'w', 'h'].forEach(key => {
            const val = options.layout[key];
            if (isNaN(Number(val)) || val < 0 || val > 1) {
                console.warn('Warning: chart.layout.' + key + ' can only be 0-1');
                delete options.layout[key]; // remove invalid value so that default will be used
            }
        });
    }
    // Set gridline defaults
    options.catGridLine = options.catGridLine || (options._type === CHART_TYPE.SCATTER ? { color: 'D9D9D9', size: 1 } : { style: 'none' });
    options.valGridLine = options.valGridLine || (options._type === CHART_TYPE.SCATTER ? { color: 'D9D9D9', size: 1 } : {});
    options.serGridLine = options.serGridLine || (options._type === CHART_TYPE.SCATTER ? { color: 'D9D9D9', size: 1 } : { style: 'none' });
    correctGridLineOptions(options.catGridLine);
    correctGridLineOptions(options.valGridLine);
    correctGridLineOptions(options.serGridLine);
    correctShadowOptions(options.shadow);
    // C: Options: plotArea
    options.showDataTable = options.showDataTable || !options.showDataTable ? options.showDataTable : false;
    options.showDataTableHorzBorder = options.showDataTableHorzBorder || !options.showDataTableHorzBorder ? options.showDataTableHorzBorder : true;
    options.showDataTableVertBorder = options.showDataTableVertBorder || !options.showDataTableVertBorder ? options.showDataTableVertBorder : true;
    options.showDataTableOutline = options.showDataTableOutline || !options.showDataTableOutline ? options.showDataTableOutline : true;
    options.showDataTableKeys = options.showDataTableKeys || !options.showDataTableKeys ? options.showDataTableKeys : true;
    options.showLabel = options.showLabel || !options.showLabel ? options.showLabel : false;
    options.showLegend = options.showLegend || !options.showLegend ? options.showLegend : false;
    options.showPercent = options.showPercent || !options.showPercent ? options.showPercent : true;
    options.showTitle = options.showTitle || !options.showTitle ? options.showTitle : false;
    options.showValue = options.showValue || !options.showValue ? options.showValue : false;
    options.showLeaderLines = options.showLeaderLines || !options.showLeaderLines ? options.showLeaderLines : false;
    options.catAxisLineShow = typeof options.catAxisLineShow !== 'undefined' ? options.catAxisLineShow : true;
    options.valAxisLineShow = typeof options.valAxisLineShow !== 'undefined' ? options.valAxisLineShow : true;
    options.serAxisLineShow = typeof options.serAxisLineShow !== 'undefined' ? options.serAxisLineShow : true;
    options.v3DRotX = !isNaN(options.v3DRotX) && options.v3DRotX >= -90 && options.v3DRotX <= 90 ? options.v3DRotX : 30;
    options.v3DRotY = !isNaN(options.v3DRotY) && options.v3DRotY >= 0 && options.v3DRotY <= 360 ? options.v3DRotY : 30;
    options.v3DRAngAx = options.v3DRAngAx || !options.v3DRAngAx ? options.v3DRAngAx : true;
    options.v3DPerspective = !isNaN(options.v3DPerspective) && options.v3DPerspective >= 0 && options.v3DPerspective <= 240 ? options.v3DPerspective : 30;
    // D: Options: chart
    options.barGapWidthPct = !isNaN(options.barGapWidthPct) && options.barGapWidthPct >= 0 && options.barGapWidthPct <= 1000 ? options.barGapWidthPct : 150;
    options.barGapDepthPct = !isNaN(options.barGapDepthPct) && options.barGapDepthPct >= 0 && options.barGapDepthPct <= 1000 ? options.barGapDepthPct : 150;
    options.chartColors = Array.isArray(options.chartColors)
        ? options.chartColors
        : options._type === CHART_TYPE.PIE || options._type === CHART_TYPE.DOUGHNUT
            ? PIECHART_COLORS
            : BARCHART_COLORS;
    options.chartColorsOpacity = options.chartColorsOpacity && !isNaN(options.chartColorsOpacity) ? options.chartColorsOpacity : null;
    // DEPRECATED: v3.11.0 - use `plotArea.border` vvv
    options.border = options.border && typeof options.border === 'object' ? options.border : null;
    if (options.border && (!options.border.pt || isNaN(options.border.pt)))
        options.border.pt = DEF_CHART_BORDER.pt;
    if (options.border && (!options.border.color || typeof options.border.color !== 'string'))
        options.border.color = DEF_CHART_BORDER.color;
    // DEPRECATED: (remove above in v4.0) ^^^
    options.plotArea = options.plotArea || {};
    options.plotArea.border = options.plotArea.border && typeof options.plotArea.border === 'object' ? options.plotArea.border : null;
    if (options.plotArea.border && (!options.plotArea.border.pt || isNaN(options.plotArea.border.pt)))
        options.plotArea.border.pt = DEF_CHART_BORDER.pt;
    if (options.plotArea.border && (!options.plotArea.border.color || typeof options.plotArea.border.color !== 'string')) {
        options.plotArea.border.color = DEF_CHART_BORDER.color;
    }
    if (options.border)
        options.plotArea.border = options.border; // @deprecated [[remove in v4.0]]
    options.plotArea.fill = options.plotArea.fill || { color: null, transparency: null };
    if (options.fill)
        options.plotArea.fill.color = options.fill; // @deprecated [[remove in v4.0]]
    //
    options.chartArea = options.chartArea || {};
    options.chartArea.border = options.chartArea.border && typeof options.chartArea.border === 'object' ? options.chartArea.border : null;
    if (options.chartArea.border) {
        options.chartArea.border = {
            color: options.chartArea.border.color || DEF_CHART_BORDER.color,
            pt: options.chartArea.border.pt || DEF_CHART_BORDER.pt,
        };
    }
    options.chartArea.roundedCorners = typeof options.chartArea.roundedCorners === 'boolean' ? options.chartArea.roundedCorners : true;
    //
    options.dataBorder = options.dataBorder && typeof options.dataBorder === 'object' ? options.dataBorder : null;
    if (options.dataBorder && (!options.dataBorder.pt || isNaN(options.dataBorder.pt)))
        options.dataBorder.pt = 0.75;
    if (options.dataBorder && options.dataBorder.color) {
        const isHexColor = typeof options.dataBorder.color === 'string' && options.dataBorder.color.length === 6 && /^[0-9A-Fa-f]{6}$/.test(options.dataBorder.color);
        const isSchemeColor = Object.values(SCHEME_COLOR_NAMES).includes(options.dataBorder.color);
        if (!isHexColor && !isSchemeColor) {
            options.dataBorder.color = 'F9F9F9'; // Fallback if neither hex nor scheme color
        }
    }
    //
    if (!options.dataLabelFormatCode && options._type === CHART_TYPE.SCATTER)
        options.dataLabelFormatCode = 'General';
    if (!options.dataLabelFormatCode && (options._type === CHART_TYPE.PIE || options._type === CHART_TYPE.DOUGHNUT)) {
        options.dataLabelFormatCode = options.showPercent ? '0%' : 'General';
    }
    options.dataLabelFormatCode = options.dataLabelFormatCode && typeof options.dataLabelFormatCode === 'string' ? options.dataLabelFormatCode : '#,##0';
    //
    // Set default format for Scatter chart labels to custom string if not defined
    if (!options.dataLabelFormatScatter && options._type === CHART_TYPE.SCATTER)
        options.dataLabelFormatScatter = 'custom';
    //
    options.lineSize = typeof options.lineSize === 'number' ? options.lineSize : 2;
    options.valAxisMajorUnit = typeof options.valAxisMajorUnit === 'number' ? options.valAxisMajorUnit : null;
    if (options._type === CHART_TYPE.AREA || options._type === CHART_TYPE.BAR || options._type === CHART_TYPE.BAR3D || options._type === CHART_TYPE.LINE) {
        options.catAxisMultiLevelLabels = !!options.catAxisMultiLevelLabels;
    }
    else {
        delete options.catAxisMultiLevelLabels;
    }
    // STEP 4: Set props
    resultObject._type = 'chart';
    resultObject.options = options;
    const chartRelId = getNewRelId(target);
    resultObject.chartRid = chartRelId;
    const isChartEx = typeof options._type === 'string' && CHARTEX_TYPES.has(options._type);
    if (isChartEx)
        options._chartEx = true;
    // Generated charts may attach exact Office chartStyle/chartColorStyle
    // resources captured from a Ribbon tile. Those parts are chart-owned in
    // PowerPoint, so namespace each emitted part before content types and
    // relationships are assembled. Raw replay keeps its already-rewritten names.
    if (!options._rawChartXml) {
        for (const key of ['_rawChartStyleName', '_rawChartColorsName']) {
            const requested = options[key];
            if (typeof requested !== 'string' || !requested)
                continue;
            const lower = requested.toLowerCase();
            const extIndex = lower.lastIndexOf('.xml');
            options[key] = extIndex > 0
                ? `${requested.slice(0, extIndex)}-${chartId}${requested.slice(extIndex)}`
                : `${requested}-${chartId}.xml`;
        }
    }
    // STEP 5: Add this chart to this Slide Rels (rId/rels count spans all slides! Count all images to get next rId)
    target._relsChart.push({
        rId: chartRelId,
        data: tmpData,
        opts: options,
        type: options._type,
        chartFamily: isChartEx ? 'chartEx' : 'legacy',
        globalId: chartId,
        fileName: `${isChartEx ? 'chartEx' : 'chart'}${chartId}.xml`,
        Target: `../charts/${isChartEx ? 'chartEx' : 'chart'}${chartId}.xml`,
    });
    // ChartEx map packages include a governed picture fallback because some
    // PowerPoint builds expose the editable chart object but render its native
    // geographic layer as an empty/black frame.  Register the fallback through
    // the normal media relationship path; the XML writer decides whether to
    // place it in AlternateContent or as a compatibility overlay.
    const fallbackImageBase64 = options._rawChartFallbackImageBase64;
    if (typeof fallbackImageBase64 === 'string' && fallbackImageBase64.length > 0) {
        const fallbackContentType = String(options._rawChartFallbackImageContentType || 'image/png');
        const fallbackExt = imageExtensionFromDataUrl(fallbackImageBase64);
        const fallbackRid = getNewRelId(target);
        options._rawChartFallbackImageRid = fallbackRid;
        target._relsMedia.push({
            type: fallbackContentType,
            extn: fallbackExt,
            data: fallbackImageBase64,
            path: `chart-fallback-${target._slideNum}-${chartId}.${fallbackExt}`,
            rId: fallbackRid,
            isDuplicate: false,
            Target: `../media/chart-fallback-${target._slideNum}-${chartId}.${fallbackExt}`,
        });
    }
    target._slideObjects.push(resultObject);
    // NOTE: Inline animation removed - use slide.addAnimation() instead
    return resultObject;
}
function normalizeImageExtension(value) {
    const extension = String(value || '').trim().toLowerCase().replace(/^\./, '');
    if (extension === 'jpg' || extension === 'pjpeg')
        return 'jpeg';
    if (extension === 'svg+xml')
        return 'svg';
    if (extension === 'tif')
        return 'tiff';
    return /^[a-z0-9]+$/.test(extension) ? extension : 'png';
}
function imageExtensionFromDataHeader(data) {
    const comma = data.indexOf(',');
    const header = (comma >= 0 ? data.substring(0, comma) : data).trim().toLowerCase();
    if (header.length > 256)
        return undefined;
    const marker = 'image/';
    const markerIndex = header.indexOf(marker);
    if (markerIndex < 0)
        return undefined;
    const subtypeStart = markerIndex + marker.length;
    const semicolon = header.indexOf(';', subtypeStart);
    const subtype = header.substring(subtypeStart, semicolon >= 0 ? semicolon : header.length);
    return subtype ? normalizeImageExtension(subtype) : undefined;
}
function imageExtensionFromDataUrl(data) {
    return imageExtensionFromDataHeader(data) || 'png';
}
function imageExtensionFromPath(path) {
    const cleanPath = path.substring(path.lastIndexOf('/') + 1).split('?')[0].split('#')[0];
    const dot = cleanPath.lastIndexOf('.');
    return normalizeImageExtension(dot >= 0 ? cleanPath.slice(dot + 1) : 'png');
}
function imageMimeTypeFromExtension(extension) {
    if (extension === 'jpeg')
        return 'image/jpeg';
    if (extension === 'svg')
        return 'image/svg+xml';
    if (extension === 'tiff')
        return 'image/tiff';
    if (extension === 'emf')
        return 'image/x-emf';
    if (extension === 'wmf')
        return 'image/x-wmf';
    return `image/${extension}`;
}
/**
 * Adds a native PowerPoint equation object to a slide definition.
 * Fallback images are caller-supplied only; the library does not rasterize OMML.
 * @param {PresSlide} target - slide object that the equation should be added to
 * @param {EquationProps} opt - equation source and layout options
 */
export function addEquationDefinition(target, opt) {
    if (opt === null || opt === void 0 ? void 0 : opt.animation) {
        throw new Error('Inline `animation` property is not supported. Use slide.addAnimation(equation, animationProps) instead.');
    }
    if (!opt || opt.source === undefined || opt.source === null) {
        throw new Error('addEquation() error: `source` is required.');
    }
    const objectName = opt.objectName || `Equation ${target._slideObjects.filter(obj => obj._type === SLIDE_OBJECT_TYPES.equation).length + 1}`;
    const newObject = {
        _type: SLIDE_OBJECT_TYPES.equation,
        shape: SHAPE_TYPE.RECTANGLE,
        equation: opt,
        options: Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({ x: opt.x || 0, y: opt.y || 0, w: opt.w || 5, h: opt.h || 0.4, objectName }, nonVisualAccessibilityOptions(opt)), (opt.rotate ? { rotate: opt.rotate } : {})), (opt.flipH !== undefined ? { flipH: opt.flipH } : {})), (opt.flipV !== undefined ? { flipV: opt.flipV } : {})), (opt.spid ? { spid: opt.spid } : {})),
    };
    const fallback = opt.fallback && typeof opt.fallback === 'object' ? opt.fallback : null;
    if (fallback) {
        const strImagePath = fallback.path || '';
        const strImageData = fallback.data || '';
        if (!strImagePath && !strImageData) {
            throw new Error('addEquation() fallback requires either `path` or `data`.');
        }
        if (strImageData && typeof strImageData === 'string' && !strImageData.toLowerCase().includes('base64,')) {
            throw new Error('addEquation() fallback `data` value lacks a base64 header.');
        }
        const strImgExtn = strImageData ? imageExtensionFromDataUrl(strImageData) : imageExtensionFromPath(strImagePath);
        const imageRelId = getNewRelId(target);
        const relType = `image/${strImgExtn}`;
        const dupeItem = target._relsMedia.filter(item => item.path && item.path === strImagePath && item.type === relType && !item.isDuplicate)[0];
        target._relsMedia.push({
            path: strImagePath || `equation-fallback.${strImgExtn}`,
            type: relType,
            extn: strImgExtn,
            data: strImageData || '',
            rId: imageRelId,
            isDuplicate: !!(dupeItem === null || dupeItem === void 0 ? void 0 : dupeItem.Target),
            Target: (dupeItem === null || dupeItem === void 0 ? void 0 : dupeItem.Target) ? dupeItem.Target : `../media/equation-${target._slideNum}-${target._relsMedia.length + 1}.${strImgExtn}`,
        });
        newObject.fallbackRid = imageRelId;
    }
    target._slideObjects.push(newObject);
}
/**
 * Adds a native PowerPoint SmartArt graphicFrame and its diagram package parts.
 * Supports full-catalog native authoring plus raw native diagram parts from
 * decypher roundtrip extraction.
 * @param {PresSlide} target - slide object that the SmartArt should be added to
 * @param {SmartArtProps} opt - native SmartArt options
 */
export function addNativeSmartArtDefinition(target, opt) {
    var _a, _b, _c, _d;
    if (opt === null || opt === void 0 ? void 0 : opt.animation) {
        throw new Error('Inline `animation` property is not supported for native SmartArt. Use slide.addAnimation(smartArt, animationProps) after native animation targeting is added.');
    }
    const startRid = getNewRelId(target);
    const ids = {
        dataRid: `rId${startRid}`,
        layoutRid: `rId${startRid + 1}`,
        quickStyleRid: `rId${startRid + 2}`,
        colorStyleRid: `rId${startRid + 3}`,
        drawingRid: `rId${startRid + 4}`,
        partIndex: ++_nativeSmartArtCounter,
    };
    const { info, parts } = createNativeSmartArt(opt, ids);
    const targetAny = target;
    targetAny._rawRels = targetAny._rawRels || [];
    targetAny._rawRels.push({ id: info.dataRid, type: SMARTART_REL_TYPES.data, target: `../diagrams/data${ids.partIndex}.xml` }, { id: info.layoutRid, type: SMARTART_REL_TYPES.layout, target: `../diagrams/layout${ids.partIndex}.xml` }, { id: info.quickStyleRid, type: SMARTART_REL_TYPES.quickStyle, target: `../diagrams/quickStyle${ids.partIndex}.xml` }, { id: info.colorStyleRid, type: SMARTART_REL_TYPES.colors, target: `../diagrams/colors${ids.partIndex}.xml` }, { id: info.drawingRid, type: SMARTART_REL_TYPES.drawing, target: `../diagrams/drawing${ids.partIndex}.xml` });
    target._nativePackageParts = [...(target._nativePackageParts || []), ...parts];
    const objectName = opt.objectName || `Native SmartArt ${target._slideObjects.filter(obj => obj._type === SLIDE_OBJECT_TYPES.smartart).length + 1}`;
    target._slideObjects.push({
        _type: SLIDE_OBJECT_TYPES.smartart,
        smartArt: info,
        options: Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({ x: (_a = opt.x) !== null && _a !== void 0 ? _a : 0.7, y: (_b = opt.y) !== null && _b !== void 0 ? _b : 1, w: (_c = opt.w) !== null && _c !== void 0 ? _c : 7, h: (_d = opt.h) !== null && _d !== void 0 ? _d : 3.8, objectName }, nonVisualAccessibilityOptions(opt)), (opt.fontFace ? { fontFace: opt.fontFace } : {})), (Number.isFinite(Number(opt.fontSize)) && Number(opt.fontSize) > 0 ? { fontSize: Number(opt.fontSize) } : {})), (opt.color ? { color: opt.color } : {})), (opt.textColors ? { textColors: JSON.parse(JSON.stringify(opt.textColors)) } : {})), (opt.palette ? { palette: JSON.parse(JSON.stringify(opt.palette)) } : {})), (opt.rightToLeft !== undefined ? { rightToLeft: opt.rightToLeft } : {})), (opt.title !== undefined ? { title: opt.title } : {})), (opt.altText !== undefined ? { altText: opt.altText } : {})), (opt.nodes ? { _smartArtAuthoredNodes: JSON.parse(JSON.stringify(opt.nodes)), nodes: JSON.parse(JSON.stringify(opt.nodes)) } : {})), (opt.layout !== undefined ? { layout: opt.layout } : {})), (opt.layoutId !== undefined ? { layoutId: opt.layoutId } : {})), (opt.layoutName !== undefined ? { layoutName: opt.layoutName } : {})), (opt.quickStyleId !== undefined ? { quickStyleId: opt.quickStyleId } : {})), (opt.quickStyleName !== undefined ? { quickStyleName: opt.quickStyleName } : {})), (opt.colorStyleId !== undefined ? { colorStyleId: opt.colorStyleId } : {})), (opt.colorStyleName !== undefined ? { colorStyleName: opt.colorStyleName } : {})), (opt.presetFallback !== undefined ? { presetFallback: opt.presetFallback } : {})), (opt.spid ? { spid: opt.spid } : {})),
    });
}
/**
 * Adds an image object to a slide definition.
 * This method can be called with only two args (opt, target) - this is supposed to be the only way in future.
 * @param {ImageProps} `opt` - object containing `path`/`data`, `x`, `y`, etc.
 * @param {PresSlide} `target` - slide that the image should be added to (if not specified as the 2nd arg)
 * @note: Remote images (eg: "http://whatev.com/blah"/from web and/or remote server arent supported yet - we'd need to create an <img>, load it, then send to canvas
 * @see: https://stackoverflow.com/questions/164181/how-to-fetch-a-remote-image-to-display-in-a-canvas)
 */
export function addImageDefinition(target, opt) {
    var _a;
    // VALIDATION: Inline animation property is not supported - use slide.addAnimation() instead
    if (opt === null || opt === void 0 ? void 0 : opt.animation) {
        throw new Error('Inline `animation` property is not supported. Use slide.addAnimation(image, animationProps) instead. See: https://gitbrent.github.io/PptxGenJS/docs/animations/');
    }
    const newObject = {
        _type: null,
        text: null,
        options: null,
        image: null,
        imageRid: null,
        hyperlink: null,
    };
    // FIRST: Set vars for this image (object param replaces positional args in 1.1.0)
    const intPosX = opt.x || 0;
    const intPosY = opt.y || 0;
    const intWidth = opt.w || 0;
    const intHeight = opt.h || 0;
    const sizing = opt.sizing || null;
    const objHyperlink = opt.hyperlink || '';
    const strImageData = opt.data || '';
    const strImagePath = opt.path || '';
    const pictureAdjustments = opt.imageAdjustments;
    const artisticEffectInput = pictureAdjustments === null || pictureAdjustments === void 0 ? void 0 : pictureAdjustments.artisticEffect;
    const artisticEffectType = typeof artisticEffectInput === 'string'
        ? artisticEffectInput
        : String((artisticEffectInput === null || artisticEffectInput === void 0 ? void 0 : artisticEffectInput.type) || (artisticEffectInput === null || artisticEffectInput === void 0 ? void 0 : artisticEffectInput.id) || '');
    const artisticEffectKey = artisticEffectType.replace(/^artistic\./i, '').replace(/[-_\s]/g, '').toLowerCase();
    const hasLayeredPictureCorrection = ['temperature', 'saturation', 'sharpness']
        .some(key => pictureAdjustments && Object.prototype.hasOwnProperty.call(pictureAdjustments, key) && Number.isFinite(Number(pictureAdjustments[key])));
    const needsArtisticEffectWdp = Boolean(artisticEffectKey) || hasLayeredPictureCorrection;
    const nativeArtisticImage = (pictureAdjustments === null || pictureAdjustments === void 0 ? void 0 : pictureAdjustments.nativeImage) || (artisticEffectInput && typeof artisticEffectInput === 'object'
        ? artisticEffectInput.nativeImage
        : undefined);
    const artisticEffectPreviewImage = (pictureAdjustments === null || pictureAdjustments === void 0 ? void 0 : pictureAdjustments.previewImage) || (artisticEffectInput && typeof artisticEffectInput === 'object'
        ? artisticEffectInput.previewImage
        : undefined);
    let storedImageAdjustments = opt.imageAdjustments;
    if (nativeArtisticImage || artisticEffectPreviewImage) {
        const _b = pictureAdjustments || {}, { nativeImage: _nativeImage, previewImage: _previewImage } = _b, storedAdjustments = __rest(_b, ["nativeImage", "previewImage"]);
        if (storedAdjustments.artisticEffect && typeof storedAdjustments.artisticEffect === 'object') {
            const _c = storedAdjustments.artisticEffect, { nativeImage: _nestedNativeImage, previewImage: _nestedPreviewImage } = _c, storedArtisticEffect = __rest(_c, ["nativeImage", "previewImage"]);
            storedAdjustments.artisticEffect = storedArtisticEffect;
        }
        storedImageAdjustments = storedAdjustments;
    }
    let imageRelId = getNewRelId(target);
    const objectName = opt.objectName || `Image ${target._slideObjects.filter(obj => obj._type === SLIDE_OBJECT_TYPES.image).length}`;
    // REALITY-CHECK:
    if (!strImagePath && !strImageData) {
        console.error('ERROR: addImage() requires either \'data\' or \'path\' parameter!');
        return null;
    }
    else if (strImagePath && typeof strImagePath !== 'string') {
        console.error(`ERROR: addImage() 'path' should be a string, ex: {path:'/img/sample.png'} - you sent ${String(strImagePath)}`);
        return null;
    }
    else if (strImageData && typeof strImageData !== 'string') {
        console.error(`ERROR: addImage() 'data' should be a string, ex: {data:'image/png;base64,NMP[...]'} - you sent ${String(strImageData)}`);
        return null;
    }
    else if (strImageData && typeof strImageData === 'string' && !strImageData.toLowerCase().includes('base64,')) {
        console.error('ERROR: Image `data` value lacks a base64 header! Ex: \'image/png;base64,NMP[...]\')');
        return null;
    }
    // STEP 1: Resolve one canonical package type and verify inline bytes agree.
    const imagePackageType = resolveImagePackageType(strImageData, strImagePath);
    const strImgExtn = imagePackageType.extn;
    if (needsArtisticEffectWdp && strImgExtn === 'svg' && !(nativeArtisticImage === null || nativeArtisticImage === void 0 ? void 0 : nativeArtisticImage.path) && !(nativeArtisticImage === null || nativeArtisticImage === void 0 ? void 0 : nativeArtisticImage.data)) {
        throw new Error('Native Picture Format layered adjustments require raster image pixels. Supply PNG/JPEG data or an advanced pre-encoded imageAdjustments.nativeImage HD Photo layer for SVG input.');
    }
    if ((nativeArtisticImage === null || nativeArtisticImage === void 0 ? void 0 : nativeArtisticImage.path) && typeof nativeArtisticImage.path !== 'string') {
        throw new Error('imageAdjustments.nativeImage.path must be a string when provided.');
    }
    if ((nativeArtisticImage === null || nativeArtisticImage === void 0 ? void 0 : nativeArtisticImage.data) && typeof nativeArtisticImage.data !== 'string') {
        throw new Error('imageAdjustments.nativeImage.data must be a base64 string when provided.');
    }
    if ((artisticEffectPreviewImage === null || artisticEffectPreviewImage === void 0 ? void 0 : artisticEffectPreviewImage.path) && typeof artisticEffectPreviewImage.path !== 'string') {
        throw new Error('imageAdjustments.previewImage.path must be a string when provided.');
    }
    if ((artisticEffectPreviewImage === null || artisticEffectPreviewImage === void 0 ? void 0 : artisticEffectPreviewImage.data) && typeof artisticEffectPreviewImage.data !== 'string') {
        throw new Error('imageAdjustments.previewImage.data must be a base64 string when provided.');
    }
    // STEP 2: Set type/path
    newObject._type = SLIDE_OBJECT_TYPES.image;
    newObject.image = strImagePath || 'preencoded.png';
    // STEP 3: Set image properties & options
    // FIXME: Measure actual image when no intWidth/intHeight params passed
    // ....: This is an async process: we need to make getSizeFromImage use callback, then set H/W...
    // if ( !intWidth || !intHeight ) { var imgObj = getSizeFromImage(strImagePath);
    // Picture transparency is one PowerPoint control. Accept both the legacy
    // top-level ImageProps field and the Picture Format grouping so JSON-spec
    // authors do not get a silently inert nested value.
    const pictureTransparency = typeof opt.transparency === 'number'
        ? opt.transparency
        : (typeof ((_a = opt.imageAdjustments) === null || _a === void 0 ? void 0 : _a.transparency) === 'number' ? opt.imageAdjustments.transparency : 0);
    // Engine-measured source dimensions support semantic cover/contain/crop
    // framing. Clients still author only the sizing type; the Director owns the
    // target geometry. Raw fields below are narrow imported-picture passthrough.
    newObject.options = Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({ x: intPosX || 0, y: intPosY || 0, w: intWidth || 1, h: intHeight || 1 }, (strImageData ? { data: strImageData } : {})), (strImagePath ? { path: strImagePath } : {})), (opt._authoredImageSource ? { _authoredImageSource: opt._authoredImageSource } : {})), nonVisualAccessibilityOptions(opt)), { rounding: typeof opt.rounding === 'boolean' ? opt.rounding : false, sizing, placeholder: opt.placeholder }), (opt.phType ? { phType: opt.phType } : {})), (opt.phIdx !== undefined && opt.phIdx !== null ? { phIdx: opt.phIdx } : {})), (opt.phSz ? { phSz: opt.phSz } : {})), (opt.phOrient ? { phOrient: opt.phOrient } : {})), (opt.phHasCustomPrompt !== undefined && opt.phHasCustomPrompt !== null ? { phHasCustomPrompt: Boolean(opt.phHasCustomPrompt) } : {})), (opt.hasBarePh ? { hasBarePh: true } : {})), (opt._rawHlinkClickXml ? { _rawHlinkClickXml: opt._rawHlinkClickXml } : {})), (opt._rawCNvPicPrXml ? { _rawCNvPicPrXml: opt._rawCNvPicPrXml } : {})), (opt._rawPicSpPrXml ? { _rawPicSpPrXml: opt._rawPicSpPrXml } : {})), (opt._rawPicPrstGeomXml ? { _rawPicPrstGeomXml: opt._rawPicPrstGeomXml } : {})), (opt.pictureStyle ? { pictureStyle: opt.pictureStyle } : {})), (opt._rawFillXml ? { _rawFillXml: opt._rawFillXml } : {})), (opt._rawEffectLstXml ? { _rawEffectLstXml: opt._rawEffectLstXml } : {})), (opt._rawSpPrScene3dXml ? { _rawSpPrScene3dXml: opt._rawSpPrScene3dXml } : {})), (opt._rawSpPrExtLstXml ? { _rawSpPrExtLstXml: opt._rawSpPrExtLstXml } : {})), (opt._rawLineXml ? { _rawLineXml: opt._rawLineXml } : {})), (opt._emptySpPr ? { _emptySpPr: true } : {})), (opt._rawBlipAttrs ? { _rawBlipAttrs: opt._rawBlipAttrs } : {})), (Object.prototype.hasOwnProperty.call(opt, '_rawBlipFillAttrs') ? { _rawBlipFillAttrs: opt._rawBlipFillAttrs } : {})), (opt._rawBlipInnerXml ? { _rawBlipInnerXml: opt._rawBlipInnerXml } : {})), (opt._rawBlipExtLstXml ? { _rawBlipExtLstXml: opt._rawBlipExtLstXml } : {})), (opt._rawBlipTailXml ? { _rawBlipTailXml: opt._rawBlipTailXml } : {})), (opt._omitPicPrstGeom ? { _omitPicPrstGeom: true } : {})), (opt._picPrstGeom ? { _picPrstGeom: opt._picPrstGeom } : {})), { rotate: opt.rotate || 0, flipV: opt.flipV || false, flipH: opt.flipH || false, transparency: pictureTransparency }), (opt._imageSourceW ? { _imageSourceW: Number(opt._imageSourceW) } : {})), (opt._imageSourceH ? { _imageSourceH: Number(opt._imageSourceH) } : {})), (opt._semanticSizing ? { _semanticSizing: true } : {})), { objectName, shadow: correctShadowOptions(opt.shadow) }), (opt.line ? { line: opt.line } : {})), (opt.glow ? { glow: opt.glow } : {})), (opt.reflection ? { reflection: opt.reflection } : {})), (opt.softEdges ? { softEdges: opt.softEdges } : {})), (opt.blur ? { blur: opt.blur } : {})), (opt.fillOverlay ? { fillOverlay: opt.fillOverlay } : {})), (opt.effect3D ? { effect3D: opt.effect3D } : {})), (storedImageAdjustments ? { imageAdjustments: storedImageAdjustments } : {})), (opt.interactiveActions !== undefined ? { interactiveActions: opt.interactiveActions } : {})), (opt.spid ? { spid: opt.spid } : {}));
    // STEP 4: Add this image to this Slide Rels (rId/rels count spans all slides! Count all images to get next rId)
    if (strImgExtn === 'svg') {
        // SVG files consume *TWO* rId's: (a png version and the svg image)
        // <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/>
        // <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image2.svg"/>
        target._relsMedia.push({
            path: strImagePath || strImageData + 'png',
            type: 'image/png',
            extn: 'png',
            data: strImageData || '',
            rId: imageRelId,
            Target: `../media/image-${target._slideNum}-${target._relsMedia.length + 1}.png`,
            isSvgPng: true,
            svgSize: { w: getSmartParseNumber(newObject.options.w, 'X', target._presLayout), h: getSmartParseNumber(newObject.options.h, 'Y', target._presLayout) },
        });
        newObject.imageRid = imageRelId;
        target._relsMedia.push({
            path: strImagePath || strImageData,
            type: 'image/svg+xml',
            extn: strImgExtn,
            data: strImageData || '',
            rId: imageRelId + 1,
            Target: `../media/image-${target._slideNum}-${target._relsMedia.length + 1}.${strImgExtn}`,
        });
        newObject.imageRid = imageRelId + 1;
    }
    else {
        // PERF: Duplicate media should reuse existing `Target` value and not create an additional copy
        const dupeItem = target._relsMedia.filter(item => item.path && item.path === strImagePath && item.type === imagePackageType.mimeType && !item.isDuplicate)[0];
        target._relsMedia.push({
            path: strImagePath || 'preencoded.' + strImgExtn,
            type: imagePackageType.mimeType,
            extn: strImgExtn,
            data: strImageData || '',
            rId: imageRelId,
            isDuplicate: !!(dupeItem === null || dupeItem === void 0 ? void 0 : dupeItem.Target),
            Target: (dupeItem === null || dupeItem === void 0 ? void 0 : dupeItem.Target) ? dupeItem.Target : `../media/image-${target._slideNum}-${target._relsMedia.length + 1}.${strImgExtn}`,
        });
        newObject.imageRid = imageRelId;
    }
    // Native Picture Format Artistic Effects are not backed by the visible PNG/JPEG
    // relationship. PowerPoint authors a second HD Photo (WDP) package part and the
    // a14:imgLayer points at that relationship. The media encoder creates this layer
    // from the already-loaded visible raster on supported Windows runtimes, or uses
    // the optional advanced pre-encoded nativeImage override.
    if (needsArtisticEffectWdp) {
        const visibleEffectRel = target._relsMedia.find(rel => rel.rId === newObject.imageRid);
        // Ordinary duplicate pictures may share one target. This picture's visible
        // payload becomes an effect-rendered preview, so it must own a distinct part.
        if (visibleEffectRel === null || visibleEffectRel === void 0 ? void 0 : visibleEffectRel.isDuplicate) {
            visibleEffectRel.isDuplicate = false;
            visibleEffectRel.Target = `../media/image-${target._slideNum}-${target._relsMedia.length + 1}.${visibleEffectRel.extn || strImgExtn}`;
        }
        const artisticEffectRelId = getNewRelId(target);
        target._relsMedia.push({
            path: (nativeArtisticImage === null || nativeArtisticImage === void 0 ? void 0 : nativeArtisticImage.path) || 'preencoded.wdp',
            type: 'image/vnd.ms-photo',
            extn: 'wdp',
            data: (nativeArtisticImage === null || nativeArtisticImage === void 0 ? void 0 : nativeArtisticImage.data) || '',
            rId: artisticEffectRelId,
            Target: `../media/hdphoto-${target._slideNum}-${target._relsMedia.length + 1}.wdp`,
            isArtisticEffectWdp: true,
            artisticEffectSourceRid: newObject.imageRid,
            artisticEffectSpec: artisticEffectInput && typeof artisticEffectInput === 'object'
                ? Object.assign(Object.assign({}, artisticEffectInput), { nativeImage: undefined, previewImage: undefined }) : { type: artisticEffectType },
            pictureAdjustmentSpec: storedImageAdjustments ? Object.assign({}, storedImageAdjustments) : {},
            artisticEffectPreviewPath: artisticEffectPreviewImage === null || artisticEffectPreviewImage === void 0 ? void 0 : artisticEffectPreviewImage.path,
            artisticEffectPreviewData: artisticEffectPreviewImage === null || artisticEffectPreviewImage === void 0 ? void 0 : artisticEffectPreviewImage.data,
        });
        newObject.artisticEffectRid = artisticEffectRelId;
    }
    // STEP 5: Hyperlink support
    if (typeof objHyperlink === 'object') {
        if (!objHyperlink.url && !objHyperlink.slide)
            throw new Error('ERROR: `hyperlink` option requires either: `url` or `slide`');
        else {
            const hyperlinkRelId = getNewRelId(target);
            target._rels.push({
                type: SLIDE_OBJECT_TYPES.hyperlink,
                data: objHyperlink.slide ? 'slide' : 'dummy',
                rId: hyperlinkRelId,
                Target: objHyperlink.url || objHyperlink.slide.toString(),
            });
            objHyperlink._rId = hyperlinkRelId;
            newObject.hyperlink = objHyperlink;
        }
    }
    // STEP 6: Add object to slide
    target._slideObjects.push(newObject);
    // NOTE: Inline animation removed - use slide.addAnimation() instead
}
/**
 * Adds a Cameo (live camera feed) object to a slide definition.
 * Native PowerPoint 2021+/2024 cameo: a picture marked with `alf:liveFeedProps`, shown as the
 * camera-glyph placeholder until a live show binds the camera. Uses a SINGLE svg media rel
 * (no PNG fallback, unlike the addImage svg path). @see plans/cameo-ooxml-ground-truth.md
 * @param {PresSlide} target - slide the cameo is added to
 * @param {CameoProps} opt - cameo options
 */
export function addCameoDefinition(target, opt) {
    var _a, _b;
    if (opt === null || opt === void 0 ? void 0 : opt.animation) {
        throw new Error('Inline `animation` property is not supported. Use slide.addAnimation(cameo, animationProps) instead.');
    }
    const defSizeInch = CAMEO_DEFAULT_SIZE_EMU / EMU;
    const slideWInch = (((_a = target._presLayout) === null || _a === void 0 ? void 0 : _a._sizeW) || 0) / EMU;
    const slideHInch = (((_b = target._presLayout) === null || _b === void 0 ? void 0 : _b._sizeH) || 0) / EMU;
    const w = opt.w !== undefined && opt.w !== null ? opt.w : defSizeInch;
    const h = opt.h !== undefined && opt.h !== null ? opt.h : defSizeInch;
    const x = opt.x !== undefined && opt.x !== null ? opt.x : slideWInch ? Math.max(0, (slideWInch - defSizeInch) / 2) : 1;
    const y = opt.y !== undefined && opt.y !== null ? opt.y : slideHInch ? Math.max(0, (slideHInch - defSizeInch) / 2) : 1;
    const objectName = opt.objectName
        ? opt.objectName
        : `Camera ${target._slideObjects.filter(o => o._type === SLIDE_OBJECT_TYPES.cameo).length + 1}`;
    const dataUri = opt.posterSvgDataUri || CAMEO_PLACEHOLDER_SVG_DATAURI;
    const imageRelId = getNewRelId(target);
    const newObject = {
        _type: SLIDE_OBJECT_TYPES.cameo,
        image: 'preencoded.svg',
        imageRid: imageRelId,
        options: Object.assign(Object.assign({ x, y, w, h, objectName }, nonVisualAccessibilityOptions(opt)), { _cameoShape: opt.shape || 'ellipse' }),
    };
    target._relsMedia.push({
        path: 'preencoded.svg',
        type: 'image/svg+xml',
        extn: 'svg',
        data: dataUri,
        rId: imageRelId,
        Target: `../media/image-${target._slideNum}-${target._relsMedia.length + 1}.svg`,
    });
    target._slideObjects.push(newObject);
}
/**
 * Adds a Slide Zoom (zoom navigation) object to a slide definition.
 * Native PowerPoint 2019+/2024 Slide Zoom: a clickable thumbnail that jumps to a target slide.
 * Emitted as mc:AlternateContent (pslz:sldZm Choice + hyperlinked picture Fallback) with a single
 * png thumbnail rel and a .../slide rel to the target. @see plans/zoom-ooxml-ground-truth.md
 * @param {PresSlide} target - slide the zoom is added to
 * @param {ZoomProps} opt - zoom options
 */
export function addZoomDefinition(target, opt) {
    var _a, _b;
    if (opt === null || opt === void 0 ? void 0 : opt.animation) {
        throw new Error('Inline `animation` property is not supported. Use slide.addAnimation(zoom, animationProps) instead.');
    }
    const targetSlide = Number(opt.targetSlide);
    if (!Number.isInteger(targetSlide) || targetSlide < 1) {
        throw new Error('slide.addZoom requires `targetSlide` as a 1-based slide index');
    }
    const defWInch = ZOOM_DEFAULT_W_EMU / EMU;
    const defHInch = ZOOM_DEFAULT_H_EMU / EMU;
    const slideWInch = (((_a = target._presLayout) === null || _a === void 0 ? void 0 : _a._sizeW) || 0) / EMU;
    const slideHInch = (((_b = target._presLayout) === null || _b === void 0 ? void 0 : _b._sizeH) || 0) / EMU;
    const w = opt.w !== undefined && opt.w !== null ? opt.w : defWInch;
    const h = opt.h !== undefined && opt.h !== null ? opt.h : defHInch;
    const x = opt.x !== undefined && opt.x !== null ? opt.x : slideWInch ? Math.max(0, (slideWInch - defWInch) / 2) : 1;
    const y = opt.y !== undefined && opt.y !== null ? opt.y : slideHInch ? Math.max(0, (slideHInch - defHInch) / 2) : 1;
    const objectName = opt.objectName
        ? opt.objectName
        : `Slide Zoom ${target._slideObjects.filter(o => o._type === SLIDE_OBJECT_TYPES.zoom).length + 1}`;
    const dataUri = opt.thumbnailDataUri || ZOOM_PLACEHOLDER_PNG_DATAURI;
    if (opt.returnToParent !== undefined && opt.returnToParent !== null && typeof opt.returnToParent !== 'boolean') {
        throw new Error('slide.addZoom `returnToParent` must be a boolean');
    }
    const transitionDur = opt.transitionDur !== undefined && opt.transitionDur !== null ? Number(opt.transitionDur) : 1000;
    if (!Number.isInteger(transitionDur) || transitionDur < 0 || transitionDur > 600000) {
        throw new Error('slide.addZoom `transitionDur` must be an integer from 0 through 600000 milliseconds');
    }
    if (typeof dataUri !== 'string' || !/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(dataUri)) {
        throw new Error('slide.addZoom `thumbnailDataUri` must be a PNG/JPEG base64 data URI');
    }
    const thumbnailIsJpeg = dataUri.startsWith('data:image/jpeg;base64,');
    const thumbnailExtn = thumbnailIsJpeg ? 'jpg' : 'png';
    const thumbnailMimeType = thumbnailIsJpeg ? 'image/jpeg' : 'image/png';
    // Thumbnail image rel, then the target-slide rel (used by the fallback hyperlink).
    const imageRelId = getNewRelId(target);
    target._relsMedia.push({
        path: `preencoded.${thumbnailExtn}`,
        type: thumbnailMimeType,
        extn: thumbnailExtn,
        data: dataUri,
        rId: imageRelId,
        Target: `../media/image-${target._slideNum}-${target._relsMedia.length + 1}.${thumbnailExtn}`,
    });
    const slideRelId = getNewRelId(target);
    target._rels.push({ type: SLIDE_OBJECT_TYPES.hyperlink, data: 'slide', rId: slideRelId, Target: String(targetSlide) });
    const newObject = {
        _type: SLIDE_OBJECT_TYPES.zoom,
        image: `preencoded.${thumbnailExtn}`,
        imageRid: imageRelId,
        options: Object.assign(Object.assign({ x, y, w, h, objectName }, nonVisualAccessibilityOptions(opt)), { _zoomSldId: ZOOM_SLDID_BASE + targetSlide, _zoomSlideRid: slideRelId, _zoomReturnToParent: opt.returnToParent ? 1 : 0, _zoomTransitionDur: transitionDur, _zoomGuid: '{' + getUuid('xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx').toUpperCase() + '}' }),
    };
    target._slideObjects.push(newObject);
}
/**
 * Adds a Section Zoom (zoom navigation to a section) object to a slide definition.
 * Native PowerPoint 2019+/2024 Section Zoom: a clickable thumbnail that jumps to a section.
 * Emitted as mc:AlternateContent (psez:sectionZm Choice + picture Fallback hyperlinked to the
 * section's first slide), with a png thumbnail rel and a .../slide rel. The zoom references the
 * target section by its stable GUID (shared with presentation.xml's sectionLst).
 * @see plans/section-zoom-ooxml-ground-truth.md
 * @param {PresSlide} target - slide the zoom is added to
 * @param {SectionZoomProps} opt - section zoom options
 */
export function addSectionZoomDefinition(target, opt) {
    var _a, _b;
    if (opt === null || opt === void 0 ? void 0 : opt.animation) {
        throw new Error('Inline `animation` property is not supported. Use slide.addAnimation(zoom, animationProps) instead.');
    }
    // Resolve the target section (by title or 1-based index) from the presentation.
    const sections = typeof target.getSections === 'function' ? target.getSections() : [];
    if (!sections.length) {
        throw new Error('slide.addSectionZoom requires the presentation to have sections (use pptx.addSection({ title }))');
    }
    let section;
    if (typeof opt.targetSection === 'number') {
        if (!Number.isInteger(opt.targetSection) || opt.targetSection < 1 || opt.targetSection > sections.length) {
            throw new Error(`slide.addSectionZoom: targetSection index ${opt.targetSection} out of range (1..${sections.length})`);
        }
        section = sections[opt.targetSection - 1];
    }
    else if (typeof opt.targetSection === 'string' && opt.targetSection.trim()) {
        section = sections.filter(s => s.title === opt.targetSection)[0];
        if (!section)
            throw new Error(`slide.addSectionZoom: no section titled "${opt.targetSection}"`);
    }
    else {
        throw new Error('slide.addSectionZoom requires `targetSection` (section title or 1-based index)');
    }
    const firstSlide = section._slides && section._slides[0];
    if (!firstSlide)
        throw new Error(`slide.addSectionZoom: section "${section.title}" has no slides`);
    // Stable section GUID shared with presentation.xml's sectionLst (assigned lazily, persisted).
    if (!section._id)
        section._id = '{' + getUuid('xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx').toUpperCase() + '}';
    const defWInch = ZOOM_DEFAULT_W_EMU / EMU;
    const defHInch = ZOOM_DEFAULT_H_EMU / EMU;
    const slideWInch = (((_a = target._presLayout) === null || _a === void 0 ? void 0 : _a._sizeW) || 0) / EMU;
    const slideHInch = (((_b = target._presLayout) === null || _b === void 0 ? void 0 : _b._sizeH) || 0) / EMU;
    const w = opt.w !== undefined && opt.w !== null ? opt.w : defWInch;
    const h = opt.h !== undefined && opt.h !== null ? opt.h : defHInch;
    const x = opt.x !== undefined && opt.x !== null ? opt.x : slideWInch ? Math.max(0, (slideWInch - defWInch) / 2) : 1;
    const y = opt.y !== undefined && opt.y !== null ? opt.y : slideHInch ? Math.max(0, (slideHInch - defHInch) / 2) : 1;
    const objectName = opt.objectName
        ? opt.objectName
        : `Section Zoom ${target._slideObjects.filter(o => o._type === SLIDE_OBJECT_TYPES.sectionZoom).length + 1}`;
    const dataUri = opt.thumbnailDataUri || ZOOM_PLACEHOLDER_PNG_DATAURI;
    const transitionDur = opt.transitionDur !== undefined && opt.transitionDur !== null ? Number(opt.transitionDur) : 1000;
    if (!Number.isInteger(transitionDur) || transitionDur < 0 || transitionDur > 600000) {
        throw new Error('slide.addSectionZoom `transitionDur` must be an integer from 0 through 600000 milliseconds');
    }
    if (typeof dataUri !== 'string' || !/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(dataUri)) {
        throw new Error('slide.addSectionZoom `thumbnailDataUri` must be a PNG/JPEG base64 data URI');
    }
    const thumbnailIsJpeg = dataUri.startsWith('data:image/jpeg;base64,');
    const thumbnailExtn = thumbnailIsJpeg ? 'jpg' : 'png';
    const thumbnailMimeType = thumbnailIsJpeg ? 'image/jpeg' : 'image/png';
    // Thumbnail image rel, then the target-slide rel (used by the fallback hyperlink).
    const imageRelId = getNewRelId(target);
    target._relsMedia.push({
        path: `preencoded.${thumbnailExtn}`,
        type: thumbnailMimeType,
        extn: thumbnailExtn,
        data: dataUri,
        rId: imageRelId,
        Target: `../media/image-${target._slideNum}-${target._relsMedia.length + 1}.${thumbnailExtn}`,
    });
    const slideRelId = getNewRelId(target);
    target._rels.push({ type: SLIDE_OBJECT_TYPES.hyperlink, data: 'slide', rId: slideRelId, Target: String(firstSlide._slideNum) });
    const newObject = {
        _type: SLIDE_OBJECT_TYPES.sectionZoom,
        image: `preencoded.${thumbnailExtn}`,
        imageRid: imageRelId,
        options: Object.assign(Object.assign({ x, y, w, h, objectName }, nonVisualAccessibilityOptions(opt)), { _zoomSectionId: section._id, _zoomSlideRid: slideRelId, _zoomTransitionDur: transitionDur, _zoomGuid: '{' + getUuid('xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx').toUpperCase() + '}' }),
    };
    target._slideObjects.push(newObject);
}
/**
 * Adds a Summary Zoom graphic to the (already-created) summary slide.
 * Native PowerPoint 2019+/2024 Summary Zoom: one clickable thumbnail per content section, laid out
 * in a grid. Emitted as mc:AlternateContent (psuz:summaryZm Choice with one summaryZmObj per section
 * + a locked grpSp picture Fallback hyperlinked to each section's first slide). The summary slide's
 * own section is excluded. Uses a deterministic grid; PowerPoint refreshes positions/previews on edit.
 * @see plans/summary-zoom-ooxml-ground-truth.md
 * @param {PresSlide} target - the generated summary slide
 * @param {SummaryZoomProps} opt - summary zoom options
 */
export function addSummaryZoomDefinition(target, opt) {
    var _a, _b;
    const allSections = typeof target.getSections === 'function' ? target.getSections() : [];
    // Exclude the summary slide's own section (the generated "Summary Section").
    const ownSection = allSections.filter(s => (s._slides || []).indexOf(target) !== -1)[0];
    let contentSections = allSections.filter(s => s !== ownSection && (s._slides || []).length > 0);
    // Optional explicit subset / ordering.
    if (Array.isArray(opt.sections) && opt.sections.length) {
        const picked = [];
        opt.sections.forEach(ref => {
            const sec = typeof ref === 'number' ? contentSections[ref - 1] : contentSections.filter(s => s.title === ref)[0];
            if (!sec)
                throw new Error(`addSummaryZoom: section "${ref}" not found among content sections`);
            if (picked.indexOf(sec) === -1)
                picked.push(sec);
        });
        contentSections = picked;
    }
    if (!contentSections.length)
        throw new Error('addSummaryZoom requires at least one content section (with slides) to summarize');
    const dataUri = opt.thumbnailDataUri || ZOOM_PLACEHOLDER_PNG_DATAURI;
    const transitionDur = opt.transitionDur !== undefined && opt.transitionDur !== null ? Number(opt.transitionDur) : 1000;
    if (!Number.isInteger(transitionDur) || transitionDur < 0 || transitionDur > 600000) {
        throw new Error('addSummaryZoom `transitionDur` must be an integer from 0 through 600000 milliseconds');
    }
    if (typeof dataUri !== 'string' || !/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(dataUri)) {
        throw new Error('addSummaryZoom `thumbnailDataUri` must be a PNG/JPEG base64 data URI');
    }
    const thumbnailIsJpeg = dataUri.startsWith('data:image/jpeg;base64,');
    const thumbnailExtn = thumbnailIsJpeg ? 'jpg' : 'png';
    const thumbnailMimeType = thumbnailIsJpeg ? 'image/jpeg' : 'image/png';
    const objectName = opt.objectName || 'Summary Zoom 1';
    // Deterministic grid frame (centered, leaving a title band up top). PowerPoint re-layouts on edit.
    const slideW = ((_a = target._presLayout) === null || _a === void 0 ? void 0 : _a._sizeW) || Math.round(13.333 * EMU);
    const slideH = ((_b = target._presLayout) === null || _b === void 0 ? void 0 : _b._sizeH) || Math.round(7.5 * EMU);
    const frameX = Math.round(slideW * 0.06);
    const frameW = slideW - frameX * 2;
    const frameY = Math.round(slideH * 0.24);
    const frameH = slideH - frameY - Math.round(slideH * 0.06);
    const n = contentSections.length;
    const cols = Math.min(n, 4);
    const rows = Math.ceil(n / cols);
    const gap = Math.round(slideW * 0.012);
    const tileW = Math.floor((frameW - gap * (cols - 1)) / cols);
    const tileH = Math.floor((frameH - gap * (rows - 1)) / rows);
    const objs = [];
    contentSections.forEach((sec, i) => {
        const firstSlide = sec._slides && sec._slides[0];
        if (!firstSlide)
            throw new Error(`addSummaryZoom: section "${sec.title}" has no slides`);
        if (!sec._id)
            sec._id = '{' + getUuid('xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx').toUpperCase() + '}';
        // Per-section thumbnail rel + hyperlink-to-first-slide rel (used by the Fallback pics).
        const imageRelId = getNewRelId(target);
        target._relsMedia.push({
            path: `preencoded.${thumbnailExtn}`,
            type: thumbnailMimeType,
            extn: thumbnailExtn,
            data: dataUri,
            rId: imageRelId,
            Target: `../media/image-${target._slideNum}-${target._relsMedia.length + 1}.${thumbnailExtn}`,
        });
        const slideRelId = getNewRelId(target);
        target._rels.push({ type: SLIDE_OBJECT_TYPES.hyperlink, data: 'slide', rId: slideRelId, Target: String(firstSlide._slideNum) });
        const col = i % cols;
        const row = Math.floor(i / cols);
        objs.push({
            sectionId: sec._id,
            thumbRid: imageRelId,
            slideRid: slideRelId,
            guid: '{' + getUuid('xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx').toUpperCase() + '}',
            x: frameX + col * (tileW + gap),
            y: frameY + row * (tileH + gap),
            w: tileW,
            h: tileH,
        });
    });
    const summaryOptions = {
        objectName,
        // Expose the engine-computed frame through the ordinary geometry
        // contract as well as the native summary payload.  This keeps Director
        // validation, visual-balance checks, and edit inspection aligned with
        // the actual centered grid instead of treating the object as zero-sized.
        x: frameX / EMU,
        y: frameY / EMU,
        w: frameW / EMU,
        h: frameH / EMU,
        _zoomTransitionDur: transitionDur,
        _summaryFrame: { x: frameX, y: frameY, w: frameW, h: frameH },
        _summaryObjs: objs,
    };
    Object.assign(summaryOptions, nonVisualAccessibilityOptions(opt));
    const newObject = {
        _type: SLIDE_OBJECT_TYPES.summaryZoom,
        image: `preencoded.${thumbnailExtn}`,
        imageRid: objs[0].thumbRid,
        options: summaryOptions,
    };
    target._slideObjects.push(newObject);
}
/**
 * Adds a 3D model object to a slide definition.
 * @param {PresSlide} target - slide object that the model will be added to
 * @param {Model3DProps} opt - model options
 */
export function addModel3DDefinition(target, opt) {
    // VALIDATION: Inline animation property is not supported
    if (opt === null || opt === void 0 ? void 0 : opt.animation) {
        throw new Error('Inline `animation` property is not supported. Use slide.addAnimation(model3d, animationProps) instead.');
    }
    const slideData = { _type: SLIDE_OBJECT_TYPES.model3d };
    const intPosX = opt.x || 0;
    const intPosY = opt.y || 0;
    const intSizeX = opt.w || 1;
    const intSizeY = opt.h || 1;
    const strGlbPath = opt.glbFile || '';
    const strRasterPath = opt.rasterFile || '';
    const nativeOnly = opt.nativeOnly === true || !strRasterPath;
    const objectName = opt.objectName || `3D Model ${target._slideObjects.filter(obj => obj._type === SLIDE_OBJECT_TYPES.model3d).length + 1}`;
    // REALITY-CHECK
    if (!strGlbPath) {
        throw new Error('addModel3D() error: `glbFile` parameter is required!');
    }
    // Set options
    slideData.options = Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({ x: intPosX, y: intPosY, w: intSizeX, h: intSizeY, objectName }, nonVisualAccessibilityOptions(opt)), { rotate: opt.rotate || 0, flipH: opt.flipH || false, shadow: correctShadowOptions(opt.shadow), camera: opt.camera, trans: opt.trans, ambientLight: opt.ambientLight, ptLights: opt.ptLights, objViewport: opt.objViewport, _model3dViewPresetId: opt._model3dViewPresetId, _model3dAuthoredOverrides: opt._model3dAuthoredOverrides }), (opt.scene && typeof opt.scene === 'object' ? { scene: opt.scene } : {})), { nativeOnly, _model3dXml: opt._model3dXml, _originalGlbRid: opt._originalGlbRid, _originalRasterRid: opt._originalRasterRid, _nativeMinimal: opt._nativeMinimal }), (opt._rawFallbackEffectLstXml ? { _rawFallbackEffectLstXml: opt._rawFallbackEffectLstXml } : {})), (opt._rawModel3dEffectLstXml ? { _rawModel3dEffectLstXml: opt._rawModel3dEffectLstXml } : {})), (opt._rawFallbackSpPrScene3dXml ? { _rawFallbackSpPrScene3dXml: opt._rawFallbackSpPrScene3dXml } : {})), (opt.spid ? { spid: opt.spid } : {}));
    // Add GLB model file to media rels
    const glbExtn = 'glb';
    const glbRelId = getNewRelId(target);
    target._relsMedia.push({
        path: strGlbPath,
        type: 'model/gltf.binary',
        extn: glbExtn,
        data: '',
        rId: glbRelId,
        model3dAsset: 'glb',
        Target: `../media/model-${target._slideNum}-${target._relsMedia.length + 1}.${glbExtn}`,
    });
    slideData.model3dRid = glbRelId;
    if (!nativeOnly) {
        const rasterExtn = 'png';
        const rasterRelId = getNewRelId(target);
        target._relsMedia.push({
            path: strRasterPath || 'preencoded.png',
            type: 'image/png',
            extn: rasterExtn,
            data: strRasterPath ? '' : IMG_BROKEN,
            rId: rasterRelId,
            model3dAsset: 'poster',
            Target: `../media/image-${target._slideNum}-${target._relsMedia.length + 1}.${rasterExtn}`,
        });
        slideData.rasterRid = rasterRelId;
    }
    // Add to slide objects
    target._slideObjects.push(slideData);
}
function newClosedCaptionTrackId() {
    const uuid = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now().toString(16).padStart(8, '0')}-4${Math.floor(Math.random() * 0x1000).toString(16).padStart(3, '0')}-8${Math.floor(Math.random() * 0x1000).toString(16).padStart(3, '0')}-${Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0')}${Math.floor(Math.random() * 0x100000000000).toString(16).padStart(12, '0').slice(0, 12)}`;
    return `{${String(uuid).toUpperCase()}}`;
}
function utf8ToBase64(text) {
    if (typeof Buffer !== 'undefined')
        return Buffer.from(text, 'utf8').toString('base64');
    return btoa(unescape(encodeURIComponent(text)));
}
export function attachShapeFillImage(target, fill) {
    var _a;
    if (!fill || typeof fill !== 'object')
        return;
    const kind = String(fill.type || '').toLowerCase();
    if (kind !== 'texture' && kind !== 'picture')
        return;
    if (Number(fill._blipRid) > 0)
        return;
    const tex = fill.texture || fill.picture || {};
    let data = String(tex.data || fill.data || '');
    const imgPath = String(tex.path || fill.path || tex.asset || ((_a = tex.source) === null || _a === void 0 ? void 0 : _a.asset) || '');
    if (!data && !imgPath)
        return;
    if (data && !data.includes(',') && !/^data:|^image\//i.test(data)) {
        const sourceType = resolveImagePackageType('', imgPath);
        data = `${sourceType.mimeType};base64,${data}`;
    }
    const { extn, mimeType } = resolveImagePackageType(data, imgPath);
    const relId = getNewRelId(target);
    const duplicate = data
        ? target._relsMedia.find(item => !item.isBackground && item.data === data && String(item.type || '').startsWith('image/'))
        : target._relsMedia.find(item => !item.isBackground && item.path && item.path === imgPath && String(item.type || '').startsWith('image/'));
    if (duplicate === null || duplicate === void 0 ? void 0 : duplicate.rId) {
        fill._blipRid = duplicate.rId;
        return;
    }
    target._relsMedia.push({
        path: imgPath || `preencoded.${extn}`,
        type: mimeType,
        extn,
        data,
        rId: relId,
        Target: `../media/texture-${target._slideNum}-${relId}.${extn}`,
    });
    fill._blipRid = relId;
}
/**
 * Adds a media object to a slide definition.
 * @param {PresSlide} `target` - slide object that the media will be added to
 * @param {MediaProps} `opt` - media options
 */
export function addMediaDefinition(target, opt) {
    var _a, _b;
    // VALIDATION: Inline animation property is not supported - use slide.addAnimation() instead
    if (opt === null || opt === void 0 ? void 0 : opt.animation) {
        throw new Error('Inline `animation` property is not supported. Use slide.addAnimation(media, animationProps) instead. See: https://gitbrent.github.io/PptxGenJS/docs/animations/');
    }
    const intPosX = opt.x || 0;
    const intPosY = opt.y || 0;
    const intSizeX = opt.w || 2;
    const intSizeY = opt.h || 2;
    const strData = opt.data || '';
    const strLink = opt.link || '';
    const strPath = opt.path || '';
    const strType = opt.type || 'audio';
    let strExtn = '';
    const strCover = opt.cover || IMG_PLAYBTN;
    const objectName = opt.objectName || `Media ${target._slideObjects.filter(obj => obj._type === SLIDE_OBJECT_TYPES.media).length}`;
    const slideData = { _type: SLIDE_OBJECT_TYPES.media };
    // STEP 1: REALITY-CHECK
    if (!strPath && !strData && strType !== 'online') {
        throw new Error('addMedia() error: either `data` or `path` are required!');
    }
    else if (strData && !strData.toLowerCase().includes('base64,')) {
        throw new Error('addMedia() error: `data` value lacks a base64 header! Ex: \'video/mpeg;base64,NMP[...]\')');
    }
    else if (strCover && !strCover.toLowerCase().includes('base64,')) {
        throw new Error('addMedia() error: `cover` value lacks a base64 header! Ex: \'data:image/png;base64,iV[...]\')');
    }
    // Online Video: requires `link`
    if (strType === 'online' && !strLink) {
        throw new Error('addMedia() error: online videos require `link` value');
    }
    // FIXME: 20190707
    // strType = strData ? strData.split(';')[0].split('/')[0] : strType
    const mediaPackageType = strType === 'online'
        ? { extn: 'mp4', mimeType: 'video/mp4' }
        : resolveAudioVideoPackageType(strType, opt.extn, strData, strPath);
    strExtn = mediaPackageType.extn;
    const mediaContentType = mediaPackageType.mimeType;
    const coverPackageType = resolveImagePackageType(strCover, '');
    // STEP 2: Set type, media
    slideData.mtype = strType;
    slideData.media = strPath || 'preencoded.mov';
    slideData.options = {};
    // STEP 3: Set media properties & options
    slideData.options.x = intPosX;
    slideData.options.y = intPosY;
    slideData.options.w = intSizeX;
    slideData.options.h = intSizeY;
    slideData.options.objectName = objectName;
    Object.assign(slideData.options, nonVisualAccessibilityOptions(opt));
    // Media placeholders live on the picture-shaped media carrier's p:nvPr.
    // Retain both canonical and native aliases so export/recompile reaches the
    // existing gen-xml media serializer without losing idx=0 or explicit false.
    if (opt.placeholder !== undefined)
        slideData.options.placeholder = opt.placeholder;
    if (opt.phType !== undefined)
        slideData.options.phType = opt.phType;
    if (opt.phIdx !== undefined && opt.phIdx !== null)
        slideData.options.phIdx = opt.phIdx;
    if (opt.phSz !== undefined)
        slideData.options.phSz = opt.phSz;
    if (opt.phOrient !== undefined)
        slideData.options.phOrient = opt.phOrient;
    const phHasCustomPrompt = (_a = opt.phHasCustomPrompt) !== null && _a !== void 0 ? _a : opt.hasCustomPrompt;
    if (phHasCustomPrompt !== undefined && phHasCustomPrompt !== null)
        slideData.options.phHasCustomPrompt = phHasCustomPrompt;
    if (opt.hasBarePh === true)
        slideData.options.hasBarePh = true;
    slideData.options.type = strType;
    slideData.options.extn = strExtn;
    if (Number.isFinite(Number(opt.durationMs)))
        slideData.options.durationMs = Number(opt.durationMs);
    if (strData)
        slideData.options.data = strData;
    if (strPath)
        slideData.options.path = strPath;
    if (strLink)
        slideData.options.link = strLink;
    if (strCover)
        slideData.options.cover = strCover;
    if (opt._authoredMediaSource)
        slideData.options._authoredMediaSource = opt._authoredMediaSource;
    if (opt._authoredMediaCover)
        slideData.options._authoredMediaCover = opt._authoredMediaCover;
    if (Array.isArray(opt._authoredMediaCommands))
        slideData.options._authoredMediaCommands = opt._authoredMediaCommands;
    if (typeof opt.transparency === 'number')
        slideData.options.transparency = opt.transparency;
    if (opt.spid)
        slideData.options.spid = opt.spid;
    if (typeof opt.mediaVolume === 'number')
        slideData.options.mediaVolume = opt.mediaVolume;
    if (typeof opt.isNarration === 'boolean')
        slideData.options.isNarration = opt.isNarration;
    if (typeof opt.showWhenStopped === 'boolean')
        slideData.options.showWhenStopped = opt.showWhenStopped;
    if (typeof opt.endOnStopAudio === 'boolean')
        slideData.options.endOnStopAudio = opt.endOnStopAudio;
    if (opt.sizing)
        slideData.options.sizing = opt.sizing;
    if (typeof opt.rounding === 'boolean')
        slideData.options.rounding = opt.rounding;
    if (opt._picPrstGeom)
        slideData.options._picPrstGeom = opt._picPrstGeom;
    if (Number.isFinite(Number(opt._sizingSourceW)))
        slideData.options._sizingSourceW = Number(opt._sizingSourceW);
    if (Number.isFinite(Number(opt._sizingSourceH)))
        slideData.options._sizingSourceH = Number(opt._sizingSourceH);
    if (opt._rawBlipAttrs)
        slideData.options._rawBlipAttrs = opt._rawBlipAttrs;
    if (Object.prototype.hasOwnProperty.call(opt, '_rawBlipFillAttrs'))
        slideData.options._rawBlipFillAttrs = opt._rawBlipFillAttrs;
    if (opt._rawBlipInnerXml)
        slideData.options._rawBlipInnerXml = opt._rawBlipInnerXml;
    if (opt._rawBlipExtLstXml)
        slideData.options._rawBlipExtLstXml = opt._rawBlipExtLstXml;
    if (opt._rawBlipTailXml)
        slideData.options._rawBlipTailXml = opt._rawBlipTailXml;
    if (opt._rawSourceShapeXml)
        slideData.options._rawSourceShapeXml = opt._rawSourceShapeXml;
    if (Array.isArray(opt._rawSourceRels))
        slideData.options._rawSourceRels = opt._rawSourceRels;
    // Store interactivePlayback for animation generation (controls interactiveSeq generation).
    // PowerPoint's audio-only narration recording uses no click-to-pause sequence by default.
    slideData.options.interactivePlayback = (_b = opt.interactivePlayback) !== null && _b !== void 0 ? _b : (opt.isNarration === true && strType === 'audio' ? false : undefined);
    // STEP 4: Add this media to this Slide Rels (rId/rels count spans all slides! Count all media to get next rId)
    /**
     * NOTE:
     * - rId starts at 2 (hence the intRels+1 below) as slideLayout.xml is rId=1!
     *
     * NOTE:
     * - Audio/Video files consume *TWO* rId's:
     * <Relationship Id="rId2" Target="../media/media1.mov" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/video"/>
     * <Relationship Id="rId3" Target="../media/media1.mov" Type="http://schemas.microsoft.com/office/2007/relationships/media"/>
     */
    if (strType === 'online') {
        const relId1 = getNewRelId(target);
        // A: Add video
        target._relsMedia.push({
            path: strPath || 'preencoded' + strExtn,
            data: 'dummy',
            type: 'online',
            extn: strExtn,
            rId: relId1,
            Target: strLink,
            mediaRelationshipRole: 'online',
        });
        slideData.mediaRid = relId1;
        // B: Add cover (preview/overlay) image
        target._relsMedia.push({
            path: `preencoded.${coverPackageType.extn}`,
            data: strCover,
            type: coverPackageType.mimeType,
            extn: coverPackageType.extn,
            rId: getNewRelId(target),
            Target: `../media/image-${target._slideNum}-${target._relsMedia.length + 1}.${coverPackageType.extn}`,
            mediaRelationshipRole: 'cover',
        });
        slideData.mediaCoverRid = target._relsMedia[target._relsMedia.length - 1].rId;
    }
    else {
        // PERF: Duplicate media should reuse existing `Target` value and not create an additional copy
        const dupeItem = target._relsMedia.filter(item => item.path && item.path === strPath && item.type === mediaContentType && !item.isDuplicate)[0];
        // A: "relationships/video"
        const relId1 = getNewRelId(target);
        target._relsMedia.push({
            path: strPath || 'preencoded' + strExtn,
            type: mediaContentType,
            extn: strExtn,
            data: strData || '',
            rId: relId1,
            isDuplicate: !!(dupeItem === null || dupeItem === void 0 ? void 0 : dupeItem.Target),
            Target: (dupeItem === null || dupeItem === void 0 ? void 0 : dupeItem.Target) ? dupeItem.Target : `../media/media-${target._slideNum}-${target._relsMedia.length + 1}.${strExtn}`,
            mediaRelationshipRole: 'primary',
        });
        slideData.mediaRid = relId1;
        // B: "relationships/media"
        const companionRid = getNewRelId(target);
        target._relsMedia.push({
            path: strPath || 'preencoded' + strExtn,
            type: mediaContentType,
            extn: strExtn,
            data: strData || '',
            rId: companionRid,
            isDuplicate: !!(dupeItem === null || dupeItem === void 0 ? void 0 : dupeItem.Target),
            Target: (dupeItem === null || dupeItem === void 0 ? void 0 : dupeItem.Target) ? dupeItem.Target : `../media/media-${target._slideNum}-${target._relsMedia.length + 0}.${strExtn}`,
            mediaRelationshipRole: 'companion',
        });
        slideData.mediaCompanionRid = companionRid;
        // C: Add cover (preview/overlay) image
        target._relsMedia.push({
            path: `preencoded.${coverPackageType.extn}`,
            type: coverPackageType.mimeType,
            extn: coverPackageType.extn,
            data: strCover,
            rId: getNewRelId(target),
            Target: `../media/image-${target._slideNum}-${target._relsMedia.length + 1}.${coverPackageType.extn}`,
            mediaRelationshipRole: 'cover',
        });
        slideData.mediaCoverRid = target._relsMedia[target._relsMedia.length - 1].rId;
    }
    const captionTracks = Array.isArray(opt.closedCaptionTracks) ? opt.closedCaptionTracks : [];
    const serializedCaptionTracks = [];
    for (const track of captionTracks) {
        if (!track)
            continue;
        const language = String(track.language || track.lang || 'en-US');
        const label = String(track.label || language);
        const vttText = String(track.vtt || track.text || '');
        let data = String(track.data || '');
        if (vttText && !data)
            data = `text/vtt;base64,${utf8ToBase64(vttText)}`;
        else if (data && !data.includes(','))
            data = `text/vtt;base64,${data}`;
        else if (data && !/^data:|^text\/vtt/i.test(data) && data.includes(',')) {
            /* already prefixed */
        }
        const relId = getNewRelId(target);
        target._relsMedia.push({
            path: track.path || 'preencoded.vtt',
            type: 'text/vtt',
            extn: 'vtt',
            data,
            rId: relId,
            Target: `../media/caption-${target._slideNum}-${relId}.vtt`,
            isCaptionTrack: true,
        });
        serializedCaptionTracks.push({ rId: relId, language, label, isDefault: track.default === true, id: String(track.id || newClosedCaptionTrackId()) });
    }
    if (serializedCaptionTracks.length)
        slideData.options.closedCaptionTracks = serializedCaptionTracks;
    // LAST
    target._slideObjects.push(slideData);
    // NOTE: Inline animation removed - use slide.addAnimation() instead
}
/**
 * Add the recorded-video object for a native PowerPoint Record Studio session.
 *
 * The object is deliberately created through a dedicated API so ordinary
 * media cannot acquire Record Studio identity merely by copying geometry or
 * setting a narration marker. The caller must still author the slide-level
 * notes and timing/session structures.
 */
export function addRecordStudioCaptureDefinition(target, opt) {
    var _a;
    if (opt.type && opt.type !== 'video') {
        throw new Error('addRecordStudioCapture() requires a video payload.');
    }
    if (!opt.cover) {
        throw new Error('addRecordStudioCapture() requires the native video poster image.');
    }
    addMediaDefinition(target, Object.assign(Object.assign({}, opt), { type: 'video', isNarration: true, showWhenStopped: true, endOnStopAudio: true, interactivePlayback: (_a = opt.interactivePlayback) !== null && _a !== void 0 ? _a : true }));
    const capture = target._slideObjects[target._slideObjects.length - 1];
    if (capture === null || capture === void 0 ? void 0 : capture.options) {
        ;
        capture.options._nativeRecordStudioCapture = true;
        capture.options._nativeRecordStudioOrigin = opt._nativeRecordStudioOrigin || 'ai-generated';
    }
}
/**
 * Adds Notes to a slide.
 * @param {PresSlide} `target` slide object
 * @param {string} `notes`
 * @since 2.3.0
 */
export function addNotesDefinition(target, notes) {
    target._slideObjects.push({
        _type: SLIDE_OBJECT_TYPES.notes,
        text: [{ text: notes }],
    });
}
/**
 * Adds a shape object to a slide definition.
 * @param {PresSlide} target slide object that the shape should be added to
 * @param {SHAPE_NAME} shapeName shape name
 * @param {ShapeProps} opts shape options
 */
export function addShapeDefinition(target, shapeName, opts) {
    var _a, _b, _c, _d;
    const options = normalizeLineShapeOptions(shapeName, opts);
    const explicitNoLine = Object.prototype.hasOwnProperty.call(options, 'line')
        && (options.line === null || (typeof options.line === 'object' && ((_a = options.line) === null || _a === void 0 ? void 0 : _a.type) === 'none'));
    // VALIDATION: Inline animation property is not supported - use slide.addAnimation() instead
    if (options.animation) {
        throw new Error('Inline `animation` property is not supported. Use slide.addAnimation(shape, animationProps) instead. See: https://gitbrent.github.io/PptxGenJS/docs/animations/');
    }
    options.line = options.line || { type: 'none' };
    if (explicitNoLine)
        options._explicitNoLine = true;
    // Determine object type: use 'shape' for pure shapes, 'text' for text boxes
    // This allows shapes without text to skip txBody generation
    const objectType = options._isPureShape ? SLIDE_OBJECT_TYPES.shape : SLIDE_OBJECT_TYPES.text;
    const newObject = {
        _type: objectType,
        shape: shapeName || SHAPE_TYPE.RECTANGLE,
        options,
        text: null,
    };
    // Reality check
    if (!shapeName)
        throw new Error('Missing/Invalid shape parameter! Example: `addShape(pptxgen.shapes.LINE, {x:1, y:1, w:1, h:1});`');
    // Validate shape effect properties
    if (options.glow) {
        if (typeof options.glow !== 'object') {
            throw new Error('addShape: `glow` must be an object. Example: `{ size: 10, color: "FF0000", opacity: 0.5 }`');
        }
        if (options.glow.size !== undefined && (typeof options.glow.size !== 'number' || options.glow.size < 0 || options.glow.size > 150)) {
            throw new Error('addShape: `glow.size` must be a number between 0 and 150 (points). Example: `glow: { size: 10 }`');
        }
        if (options.glow.opacity !== undefined && (typeof options.glow.opacity !== 'number' || options.glow.opacity < 0 || options.glow.opacity > 1)) {
            throw new Error('addShape: `glow.opacity` must be a number between 0 and 1. Example: `glow: { opacity: 0.5 }`');
        }
    }
    if (options.reflection) {
        if (typeof options.reflection !== 'object') {
            throw new Error('addShape: `reflection` must be an object. Example: `{ blur: 3, offset: 3, opacity: 0.5 }`');
        }
        if (options.reflection.opacity !== undefined && (typeof options.reflection.opacity !== 'number' || options.reflection.opacity < 0 || options.reflection.opacity > 1)) {
            throw new Error('addShape: `reflection.opacity` must be a number between 0 and 1. Example: `reflection: { opacity: 0.5 }`');
        }
        if (options.reflection.blur !== undefined && (typeof options.reflection.blur !== 'number' || options.reflection.blur < 0)) {
            throw new Error('addShape: `reflection.blur` must be a non-negative number (points). Example: `reflection: { blur: 3 }`');
        }
    }
    if (options.softEdges) {
        if (typeof options.softEdges !== 'object') {
            throw new Error('addShape: `softEdges` must be an object. Example: `{ size: 10 }`');
        }
        if (options.softEdges.size === undefined || typeof options.softEdges.size !== 'number' || options.softEdges.size < 0) {
            throw new Error('addShape: `softEdges.size` is required and must be a non-negative number (points). Example: `softEdges: { size: 10 }`');
        }
    }
    if (options.effect3D) {
        if (typeof options.effect3D !== 'object') {
            throw new Error('addShape: `effect3D` must be an object. Example: `{ bevel: { type: "circle", width: 10, height: 10 }, material: "warmMatte" }`');
        }
        const validBevelTypes = ['angle', 'artDeco', 'circle', 'convex', 'coolSlant', 'cross', 'divot', 'hardEdge', 'relaxedInset', 'riblet', 'slope', 'softRound'];
        if (options.effect3D.bevel && options.effect3D.bevel.type && !validBevelTypes.includes(options.effect3D.bevel.type)) {
            throw new Error(`addShape: \`effect3D.bevel.type\` must be one of: ${validBevelTypes.join(', ')}. Example: \`effect3D: { bevel: { type: "circle" } }\``);
        }
        const validMaterials = ['dkEdge', 'flat', 'legacyMatte', 'legacyMetal', 'legacyPlastic', 'legacyWireframe', 'matte', 'metal', 'plastic', 'powder', 'softEdge', 'softmetal', 'translucentPowder', 'warmMatte', 'clear'];
        if (options.effect3D.material && !validMaterials.includes(options.effect3D.material)) {
            throw new Error(`addShape: \`effect3D.material\` must be one of: ${validMaterials.join(', ')}. Example: \`effect3D: { material: "warmMatte" }\``);
        }
    }
    // 1: ShapeLineProps defaults
    if (!Object.prototype.hasOwnProperty.call(options, '_rawLineXml'))
        validateShapeLineProps(options.line, 'addShape()', true);
    const newLineOpts = Object.assign(Object.assign(Object.assign(Object.assign({ type: options.line.type || 'solid' }, (options.line.type === 'gradient' ? Object.assign({ gradientDirection: options.line.gradientDirection || 'linear', gradientAngle: (_b = options.line.gradientAngle) !== null && _b !== void 0 ? _b : 0, gradientStops: options.line.gradientStops.map(stop => (Object.assign({}, stop))) }, (options.line.rotateGradientWithShape !== undefined ? { rotateGradientWithShape: options.line.rotateGradientWithShape } : {})) : { color: options.line.color || DEF_SHAPE_LINE_COLOR, transparency: (_c = options.line.transparency) !== null && _c !== void 0 ? _c : 0 })), { width: (_d = options.line.width) !== null && _d !== void 0 ? _d : 1 }), (options.line.cap != null ? { cap: options.line.cap } : {})), { dashType: options.line.dashType || 'solid', beginArrowType: options.line.beginArrowType || null, endArrowType: options.line.endArrowType || null, beginArrowWidth: options.line.beginArrowWidth || null, beginArrowLength: options.line.beginArrowLength || null, endArrowWidth: options.line.endArrowWidth || null, endArrowLength: options.line.endArrowLength || null });
    if (typeof options.line === 'object' && options.line.type !== 'none')
        options.line = newLineOpts;
    // 2: Set options defaults
    options.x = options.x || (options.x === 0 ? 0 : 1);
    options.y = options.y || (options.y === 0 ? 0 : 1);
    options.w = options.w || (options.w === 0 ? 0 : 1);
    options.h = options.h || (options.h === 0 ? 0 : 1);
    options.objectName = options.objectName
        ? options.objectName
        : `Shape ${target._slideObjects.filter(obj => obj._type === SLIDE_OBJECT_TYPES.text).length}`;
    // 3: Handle line (lots of deprecated opts)
    if (typeof options.line === 'string') {
        const tmpOpts = newLineOpts;
        tmpOpts.color = String(options.line); // @deprecated `options.line` string (was line color)
        options.line = tmpOpts;
    }
    if (typeof options.lineSize === 'number')
        options.line.width = options.lineSize; // @deprecated (part of `ShapeLineProps` now)
    if (typeof options.lineDash === 'string')
        options.line.dashType = options.lineDash; // @deprecated (part of `ShapeLineProps` now)
    if (typeof options.lineHead === 'string')
        options.line.beginArrowType = options.lineHead; // @deprecated (part of `ShapeLineProps` now)
    if (typeof options.lineTail === 'string')
        options.line.endArrowType = options.lineTail; // @deprecated (part of `ShapeLineProps` now)
    if (!Object.prototype.hasOwnProperty.call(options, '_rawLineXml'))
        validateShapeLineProps(options.line, 'addShape()', true);
    attachShapeFillImage(target, options.fill);
    // 4: Create hyperlink rels
    createHyperlinkRels(target, newObject);
    // 5: Add object to slide
    target._slideObjects.push(newObject);
    // NOTE: Inline animation removed - use slide.addAnimation() instead
}
/**
 * Adds a native, editable PowerPoint connector (`p:cxnSp`). This is kept
 * separate from addShapeDefinition because a line shape (`p:sp`) does not
 * retain endpoint binding in PowerPoint.
 */
export function addConnectorDefinition(target, opts = {}) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const options = Object.assign({}, opts);
    options.x = (_a = options.x) !== null && _a !== void 0 ? _a : 1;
    options.y = (_b = options.y) !== null && _b !== void 0 ? _b : 1;
    options.w = (_c = options.w) !== null && _c !== void 0 ? _c : 1;
    options.h = (_d = options.h) !== null && _d !== void 0 ? _d : 0;
    options.connectorType = options.connectorType || 'straightConnector1';
    options.objectName = options.objectName
        ? options.objectName
        : `Connector ${target._slideObjects.filter(obj => obj._type === SLIDE_OBJECT_TYPES.connector).length + 1}`;
    const line = options.line || {};
    const typedState = ((_e = options._connectorStyleState) === null || _e === void 0 ? void 0 : _e.schemaVersion) === 'betterpptx.connector-style-state.v1';
    if (typedState) {
        const effectiveLine = ((_f = options._connectorStyleState) === null || _f === void 0 ? void 0 : _f.effectiveLine) || line;
        validateShapeLineProps(effectiveLine, 'addConnector()');
        // Typed connector composition deliberately stays sparse. Theme-gallery
        // lines with no authored/default leaves must omit a:ln so p:style remains
        // the native source of width, color, and effects.
        options.line = Object.assign({}, effectiveLine);
    }
    else {
        if (!Object.prototype.hasOwnProperty.call(options, '_rawConnectorLineXml'))
            validateShapeLineProps(line, 'addConnector()');
        options.line = Object.assign(Object.assign({ type: line.type === 'none' ? 'none' : (line.type || 'solid'), color: line.color || DEF_SHAPE_LINE_COLOR, transparency: (_g = line.transparency) !== null && _g !== void 0 ? _g : 0, width: (_h = line.width) !== null && _h !== void 0 ? _h : 1 }, (line.cap != null ? { cap: line.cap } : {})), { dashType: line.dashType || 'solid', beginArrowType: line.beginArrowType || null, endArrowType: line.endArrowType || null, beginArrowWidth: line.beginArrowWidth || null, beginArrowLength: line.beginArrowLength || null, endArrowWidth: line.endArrowWidth || null, endArrowLength: line.endArrowLength || null });
    }
    const connector = { _type: SLIDE_OBJECT_TYPES.connector, connector: options, options: options };
    createHyperlinkRels(target, connector);
    target._slideObjects.push(connector);
}
/** Adds a native editable PowerPoint group with engine-laid-out child primitives. */
export function addGroupDefinition(target, opts) {
    var _a, _b, _c, _d;
    const options = Object.assign(Object.assign({}, opts), { children: Array.isArray(opts === null || opts === void 0 ? void 0 : opts.children) ? opts.children.map(child => (Object.assign({}, child))) : [] });
    if (!options.children.length)
        throw new Error('A native group requires at least one child.');
    options.x = (_a = options.x) !== null && _a !== void 0 ? _a : 1;
    options.y = (_b = options.y) !== null && _b !== void 0 ? _b : 1;
    options.w = (_c = options.w) !== null && _c !== void 0 ? _c : 2;
    options.h = (_d = options.h) !== null && _d !== void 0 ? _d : 1;
    options.objectName = options.objectName || `Group ${target._slideObjects.filter(obj => obj._type === SLIDE_OBJECT_TYPES.group).length + 1}`;
    // Prepare child objects through the same native paths used for ordinary
    // slide objects. Relationships belong to the real slide; only the object
    // list is isolated, so embedded media is not duplicated on the slide.
    const childTarget = Object.create(target);
    childTarget._slideObjects = [];
    const prepareChild = (source, index, parentName) => {
        var _a, _b, _c, _d, _e;
        const child = Object.assign(Object.assign({}, source), { style: source.style ? Object.assign({}, source.style) : undefined });
        child.objectName = child.objectName || `${parentName} child ${index + 1}`;
        if (child.kind === 'group') {
            if (!Array.isArray(child.children) || !child.children.length)
                throw new Error('A nested native group requires at least one child.');
            child.children = child.children.map((nested, nestedIndex) => prepareChild(nested, nestedIndex, child.objectName));
            // A stable object identity is needed for a named animation target, but
            // its slide-wide ID is assigned only at serialization. Keep the wrapper
            // separate from its descriptor to avoid a self-referential child tree.
            const { _nativeObject: ignoredNativeObject, children: ignoredChildren } = child, nestedOptions = __rest(child, ["_nativeObject", "children"]);
            child._nativeObject = { _type: SLIDE_OBJECT_TYPES.group, options: nestedOptions };
            return child;
        }
        if (child._nativeObject)
            return child;
        const childOptions = Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({}, child.style), { x: (_a = child.x) !== null && _a !== void 0 ? _a : 0, y: (_b = child.y) !== null && _b !== void 0 ? _b : 0, w: (_c = child.w) !== null && _c !== void 0 ? _c : 1, h: (_d = child.h) !== null && _d !== void 0 ? _d : 1, objectName: child.objectName }), (child.rotate !== undefined || child.rotation !== undefined ? { rotate: (_e = child.rotate) !== null && _e !== void 0 ? _e : child.rotation } : {})), (child.flipH !== undefined ? { flipH: child.flipH } : {})), (child.flipV !== undefined ? { flipV: child.flipV } : {})), (child.fill !== undefined ? { fill: child.fill } : {})), (child.line !== undefined ? { line: child.line } : {}));
        if (child.kind === 'text' || child.kind === 'textBox' || child.kind === 'textShape') {
            if (typeof child.text !== 'string' && !Array.isArray(child.text))
                throw new Error('A native group text child requires text.');
            const textOptions = Object.assign(Object.assign({}, childOptions), { isTextBox: child.kind !== 'textShape', shape: child.kind === 'textShape' ? (child.shape || child.shapeName || SHAPE_TYPE.RECTANGLE) : SHAPE_TYPE.RECTANGLE });
            const textRuns = typeof child.text === 'string'
                ? [{ text: child.text, options: Object.fromEntries(Object.entries(textOptions).filter(([key]) => key !== 'hyperlink')) }]
                : JSON.parse(JSON.stringify(child.text));
            addTextDefinition(childTarget, textRuns, textOptions, false);
        }
        else if (child.kind === 'image' || child.kind === 'image-feature') {
            const imageOptions = Object.assign(Object.assign(Object.assign(Object.assign({}, childOptions), child.imageOptions), (child.data ? { data: child.data } : {})), (child.path ? { path: child.path } : {}));
            if (!imageOptions.data && !imageOptions.path)
                throw new Error('A native group image child requires resolved image data or path.');
            addImageDefinition(childTarget, imageOptions);
        }
        else if (child.kind === 'connector') {
            addConnectorDefinition(childTarget, Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({}, childOptions), (child.glow !== undefined ? { glow: child.glow } : {})), (child.shadow !== undefined ? { shadow: child.shadow } : {})), (child.reflection !== undefined ? { reflection: child.reflection } : {})), (child.softEdges !== undefined ? { softEdges: child.softEdges } : {})), { connectorType: child.connectorType, routing: child.routing, startShapeId: child.startShapeId, startConnectionIndex: child.startConnectionIndex, endShapeId: child.endShapeId, endConnectionIndex: child.endConnectionIndex }));
        }
        else if (!child.kind || ['shape', 'freeform', 'customGeometry', 'custom-geometry'].includes(child.kind)) {
            const custom = ['freeform', 'customGeometry', 'custom-geometry'].includes(child.kind);
            addShapeDefinition(childTarget, custom ? 'custGeom' : (child.shape || child.shapeName || SHAPE_TYPE.RECTANGLE), Object.assign(Object.assign(Object.assign({}, childOptions), { _isPureShape: true }), (child.points ? { points: child.points } : {})));
        }
        else {
            throw new Error(`Unsupported native group child kind: ${String(child.kind)}`);
        }
        child._nativeObject = childTarget._slideObjects.pop();
        if (!child._nativeObject)
            throw new Error(`Unable to prepare native group child ${child.objectName}.`);
        return child;
    };
    options.children = options.children.map((child, index) => prepareChild(child, index, options.objectName));
    const group = { _type: SLIDE_OBJECT_TYPES.group, group: options, options: options };
    createHyperlinkRels(target, group);
    target._slideObjects.push(group);
}
/**
 * Adds a table object to a slide definition.
 * @param {PresSlide} target - slide object that the table should be added to
 * @param {TableRow[]} tableRows - table data
 * @param {TableProps} options - table options
 * @param {SlideLayout} slideLayout - Slide layout
 * @param {PresLayout} presLayout - Presentation layout
 * @param {Function} addSlide - method
 * @param {Function} getSlide - method
 */
export function addTableDefinition(target, tableRows, options, slideLayout, presLayout, addSlide, getSlide) {
    var _a;
    const slides = [target]; // Create array of Slides as more may be added by auto-paging
    const opt = options && typeof options === 'object' ? options : {};
    opt.objectName = opt.objectName || `Table ${target._slideObjects.filter(obj => obj._type === SLIDE_OBJECT_TYPES.table).length}`;
    // STEP 1: REALITY-CHECK
    {
        // A: check for empty
        if (tableRows === null || tableRows.length === 0 || !Array.isArray(tableRows)) {
            throw new Error('addTable: Array expected! EX: \'slide.addTable( [rows], {options} );\' (https://gitbrent.github.io/PptxGenJS/docs/api-tables.html)');
        }
        // B: check for non-well-formatted array (ex: rows=['a','b'] instead of [['a','b']])
        if (!tableRows[0] || !Array.isArray(tableRows[0])) {
            throw new Error('addTable: \'rows\' should be an array of cells! EX: \'slide.addTable( [ [\'A\'], [\'B\'], {text:\'C\',options:{align:\'center\'}} ] );\' (https://gitbrent.github.io/PptxGenJS/docs/api-tables.html)');
        }
        // TODO: FUTURE: This is wacky and wont function right (shows .w value when there is none from demo.js?!) 20191219
        /*
        if (opt.w && opt.colW) {
            console.warn('addTable: please use either `colW` or `w` - not both (table will use `colW` and ignore `w`)')
            console.log(`${opt.w} ${opt.colW}`)
        }
        */
    }
    // STEP 2: Transform `tableRows` into well-formatted TableCell's
    // tableRows can be object or plain text array: `[{text:'cell 1'}, {text:'cell 2', options:{color:'ff0000'}}]` | `["cell 1", "cell 2"]`
    const arrRows = [];
    tableRows.forEach(row => {
        const newRow = [];
        if (Array.isArray(row)) {
            row.forEach((cell) => {
                // A:
                const newCell = {
                    _type: SLIDE_OBJECT_TYPES.tablecell,
                    text: '',
                    options: typeof cell === 'object' && cell.options ? cell.options : {},
                };
                // B:
                if (typeof cell === 'string' || typeof cell === 'number') {
                    newCell.text = cell.toString();
                }
                else {
                    // Cell can contain complex text type, string/number, or empty string.
                    // IMPORTANT: always preserve cell.options even when text is empty,
                    // otherwise raw txBody / preserved formatting is lost for blank-looking cells.
                    if (cell.text !== undefined && cell.text !== null) {
                        if (typeof cell.text === 'string' || typeof cell.text === 'number')
                            newCell.text = cell.text.toString();
                        else
                            newCell.text = cell.text;
                    }
                    if (cell.options && typeof cell.options === 'object')
                        newCell.options = cell.options;
                }
                // C: Set cell borders. Native PowerPoint table styles own the border
                // treatment; injecting a per-cell `noFill` line would override the
                // style's horizontal/vertical rules. Explicit cell/table borders still
                // win, as they are author intent.
                const hasNativeTableStyle = Boolean(opt.tableStyleId || opt.tableStylePresetId || opt._nativeMinimal);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const nativeNoLineBorder = opt._nativeMinimal
                    ? [
                        { type: 'none', _nativeTableBorder: true, _hasLineElement: false },
                        { type: 'none', _nativeTableBorder: true, _hasLineElement: false },
                        { type: 'none', _nativeTableBorder: true, _hasLineElement: false },
                        { type: 'none', _nativeTableBorder: true, _hasLineElement: false },
                    ]
                    : null;
                if (!newCell.options.border && !opt.border && hasNativeTableStyle) {
                    // Leave the border unset so <a:tblStyle> can supply it.
                    newCell.options.border = undefined;
                }
                else {
                    newCell.options.border = newCell.options.border || opt.border || nativeNoLineBorder || [{ type: 'none' }, { type: 'none' }, { type: 'none' }, { type: 'none' }];
                }
                const cellBorder = newCell.options.border;
                // CASE 1: border interface is: BorderOptions | [BorderOptions, BorderOptions, BorderOptions, BorderOptions]
                if (cellBorder && !Array.isArray(cellBorder) && typeof cellBorder === 'object')
                    newCell.options.border = [cellBorder, cellBorder, cellBorder, cellBorder];
                // Handle: [null, null, {type:'solid'}, null]
                if (newCell.options.border) {
                    if (!newCell.options.border[0])
                        newCell.options.border[0] = { type: 'none' };
                    if (!newCell.options.border[1])
                        newCell.options.border[1] = { type: 'none' };
                    if (!newCell.options.border[2])
                        newCell.options.border[2] = { type: 'none' };
                    if (!newCell.options.border[3])
                        newCell.options.border[3] = { type: 'none' };
                }
                // set complete BorderOptions for all sides
                if (newCell.options.border) {
                    const arrSides = [0, 1, 2, 3];
                    arrSides.forEach(idx => {
                        const borderSide = newCell.options.border[idx];
                        newCell.options.border[idx] = Object.assign(Object.assign(Object.assign({}, borderSide), { type: borderSide.type || DEF_CELL_BORDER.type, color: borderSide.color || DEF_CELL_BORDER.color, pt: typeof borderSide.pt === 'number' ? borderSide.pt : DEF_CELL_BORDER.pt }), (typeof borderSide.transparency === 'number' ? { transparency: borderSide.transparency } : {}));
                    });
                }
                // LAST:
                newRow.push(newCell);
            });
        }
        else {
            console.log('addTable: tableRows has a bad row. A row should be an array of cells. You provided:');
            console.log(row);
        }
        arrRows.push(newRow);
    });
    // STEP 3: Set options
    opt.x = getSmartParseNumber(opt.x || (opt.x === 0 ? 0 : EMU / 2), 'X', presLayout);
    opt.y = getSmartParseNumber(opt.y || (opt.y === 0 ? 0 : EMU / 2), 'Y', presLayout);
    if (opt.h)
        opt.h = getSmartParseNumber(opt.h, 'Y', presLayout); // NOTE: Dont set default `h` - leaving it null triggers auto-rowH in `makeXMLSlide()`
    opt.fontSize = opt.fontSize || DEF_FONT_SIZE;
    opt.margin = opt.margin === 0 || opt.margin ? opt.margin : DEF_CELL_MARGIN_IN;
    if (typeof opt.margin === 'number')
        opt.margin = [Number(opt.margin), Number(opt.margin), Number(opt.margin), Number(opt.margin)];
    // NOTE: dont add default color on tables with hyperlinks! (it causes any textObj's with hyperlinks to have subsequent words to be black)
    if (JSON.stringify({ arrRows: arrRows }).indexOf('hyperlink') === -1) {
        // Native PowerPoint table styles own the text treatment (especially the
        // first-row contrast color). Do not inject the library's default black
        // into every cell when a native style is selected; an explicit author
        // color still wins and is preserved below.
        const hasNativeTableStyle = Boolean(opt.tableStyleId || opt.tableStylePresetId || opt._nativeMinimal);
        if (!opt.color && !hasNativeTableStyle)
            opt.color = opt.color || DEF_FONT_COLOR; // Set default color if needed (table option > inherit from Slide > default to black)
    }
    if (typeof opt.border === 'string') {
        console.warn('addTable `border` option must be an object. Ex: `{border: {type:\'none\'}}`');
        opt.border = null;
    }
    else if (Array.isArray(opt.border)) {
        [0, 1, 2, 3].forEach(idx => {
            const borderSide = opt.border[idx];
            opt.border[idx] = opt.border[idx]
                ? Object.assign(Object.assign({}, borderSide), { type: borderSide.type || DEF_CELL_BORDER.type, color: borderSide.color || DEF_CELL_BORDER.color, pt: borderSide.pt || DEF_CELL_BORDER.pt }) : { type: 'none' };
        });
    }
    opt.autoPage = typeof opt.autoPage === 'boolean' ? opt.autoPage : false;
    opt.autoPageRepeatHeader = typeof opt.autoPageRepeatHeader === 'boolean' ? opt.autoPageRepeatHeader : false;
    opt.autoPageHeaderRows = typeof opt.autoPageHeaderRows !== 'undefined' && !isNaN(Number(opt.autoPageHeaderRows)) ? Number(opt.autoPageHeaderRows) : 1;
    opt.autoPageLineWeight = typeof opt.autoPageLineWeight !== 'undefined' && !isNaN(Number(opt.autoPageLineWeight)) ? Number(opt.autoPageLineWeight) : 0;
    if (opt.autoPageLineWeight) {
        if (opt.autoPageLineWeight > 1)
            opt.autoPageLineWeight = 1;
        else if (opt.autoPageLineWeight < -1)
            opt.autoPageLineWeight = -1;
    }
    // autoPage ^^^
    // Set/Calc table width
    // Get slide margins - start with default values, then adjust if master or slide margins exist
    let arrTableMargin = DEF_SLIDE_MARGIN_IN;
    // Case 1: Master margins
    if (slideLayout && typeof slideLayout._margin !== 'undefined') {
        if (Array.isArray(slideLayout._margin))
            arrTableMargin = slideLayout._margin;
        else if (!isNaN(Number(slideLayout._margin))) {
            arrTableMargin = [Number(slideLayout._margin), Number(slideLayout._margin), Number(slideLayout._margin), Number(slideLayout._margin)];
        }
    }
    // Case 2: Table margins
    /* FIXME: add `_margin` option to slide options
        else if ( addNewSlide._margin ) {
            if ( Array.isArray(addNewSlide._margin) ) arrTableMargin = addNewSlide._margin;
            else if ( !isNaN(Number(addNewSlide._margin)) ) arrTableMargin = [Number(addNewSlide._margin), Number(addNewSlide._margin), Number(addNewSlide._margin), Number(addNewSlide._margin)];
        }
    */
    /**
     * Calc table width depending upon what data we have - several scenarios exist (including bad data, eg: colW doesnt match col count)
     * The API does not require a `w` value, but XML generation does, hence, code to calc a width below using colW value(s)
     */
    if (opt.colW) {
        const firstRowColCnt = arrRows[0].reduce((totalLen, c) => {
            var _a;
            if (((_a = c === null || c === void 0 ? void 0 : c.options) === null || _a === void 0 ? void 0 : _a.colspan) && typeof c.options.colspan === 'number') {
                totalLen += c.options.colspan;
            }
            else {
                totalLen += 1;
            }
            return totalLen;
        }, 0);
        if (typeof opt.colW === 'string' || typeof opt.colW === 'number') {
            // Ex: `colW = 3` or `colW = '3'`
            opt.w = Math.floor(Number(opt.colW) * firstRowColCnt);
            opt.colW = null; // IMPORTANT: Unset `colW` so table is created using `opt.w`, which will evenly divide cols
        }
        else if (opt.colW && Array.isArray(opt.colW) && opt.colW.length === 1 && firstRowColCnt > 1) {
            // Ex: `colW=[3]` but with >1 cols (same as above, user is saying "use this width for all")
            opt.w = Math.floor(Number(opt.colW) * firstRowColCnt);
            opt.colW = null; // IMPORTANT: Unset `colW` so table is created using `opt.w`, which will evenly divide cols
        }
        else if (opt.colW && Array.isArray(opt.colW) && opt.colW.length !== firstRowColCnt) {
            // Err: Mismatched colW and cols count
            console.warn('addTable: mismatch: (colW.length != data.length) Therefore, defaulting to evenly distributed col widths.');
            opt.colW = null;
        }
    }
    else if (opt.w) {
        opt.w = getSmartParseNumber(opt.w, 'X', presLayout);
    }
    else {
        opt.w = Math.floor(presLayout._sizeW / EMU - arrTableMargin[1] - arrTableMargin[3]);
    }
    // STEP 4: Convert units to EMU now (we use different logic in makeSlide->table - smartCalc is not used)
    if (opt.x && opt.x < 20)
        opt.x = inch2Emu(opt.x);
    if (opt.y && opt.y < 20)
        opt.y = inch2Emu(opt.y);
    if (opt.w && typeof opt.w === 'number' && opt.w < 20)
        opt.w = inch2Emu(opt.w);
    if (opt.h && typeof opt.h === 'number' && opt.h < 20)
        opt.h = inch2Emu(opt.h);
    // STEP 5: Loop over cells: transform each to ITableCell; check to see whether to unset `autoPage` while here
    arrRows.forEach(row => {
        row.forEach((cell, idy) => {
            // A: Transform cell data if needed
            /* Table rows can be an object or plain text - transform into object when needed
                // EX:
                var arrTabRows1 = [
                    [ { text:'A1\nA2', options:{rowspan:2, fill:'99FFCC'} } ]
                    ,[ 'B2', 'C2', 'D2', 'E2' ]
                ]
            */
            if (typeof cell === 'number' || typeof cell === 'string') {
                // Grab table formatting `opts` to use here so text style/format inherits as it should
                row[idy] = { _type: SLIDE_OBJECT_TYPES.tablecell, text: String(row[idy]), options: opt };
            }
            else if (typeof cell === 'object') {
                // ARG0: `text`
                if (typeof cell.text === 'number')
                    row[idy].text = row[idy].text.toString();
                else if (typeof cell.text === 'undefined' || cell.text === null)
                    row[idy].text = '';
                // ARG1: `options`: ensure options exists
                row[idy].options = cell.options || {};
                // Set type to tabelcell
                row[idy]._type = SLIDE_OBJECT_TYPES.tablecell;
            }
            // B: Check for fine-grained formatting, disable auto-page when found
            // Since genXmlTextBody already checks for text array ( text:[{},..{}] ) we're done!
            // Text in individual cells will be formatted as they are added by calls to genXmlTextBody within table builder
            // if (cell.text && Array.isArray(cell.text)) opt.autoPage = false
            // TODO: FIXME: WIP: 20210807: We cant do this anymore
        });
    });
    // If autoPage = true, we need to return references to newly created slides if any
    const newAutoPagedSlides = [];
    // STEP 6: Auto-Paging: (via {options} and used internally)
    // (used internally by `tableToSlides()` to not engage recursion - we've already paged the table data, just add this one)
    if (opt && !opt.autoPage) {
        // Create hyperlink rels (IMPORTANT: Wait until table has been shredded across Slides or all rels will end-up on Slide 1!)
        createHyperlinkRels(target, arrRows);
        // Raw table image rel passthrough (for tcPr/blipFill image backgrounds)
        if (opt._rawTableImageMap && Array.isArray(opt._rawTableImageMap)) {
            const ridMap = {};
            for (const img of opt._rawTableImageMap) {
                if (!img || !img.origRid || !img.path)
                    continue;
                if (ridMap[img.origRid])
                    continue;
                const imageRelId = getNewRelId(target);
                const ext = ((_a = String(img.path).split('.').pop()) === null || _a === void 0 ? void 0 : _a.toLowerCase()) || 'png';
                target._relsMedia.push({ type: 'image/' + ext, path: img.path, extn: ext, rId: imageRelId, isDuplicate: false, Target: `../media/image-${target._slideNum}-${target._relsMedia.length + 1}.${ext}` });
                ridMap[img.origRid] = imageRelId;
            }
            ;
            opt._rawTableRidMap = ridMap;
        }
        // Add slideObjects (NOTE: Use `extend` to avoid mutation)
        target._slideObjects.push({
            _type: SLIDE_OBJECT_TYPES.table,
            arrTabRows: arrRows,
            options: Object.assign({}, opt),
        });
    }
    else {
        if (opt.autoPageRepeatHeader)
            opt._arrObjTabHeadRows = arrRows.filter((_row, idx) => idx < opt.autoPageHeaderRows);
        // Loop over rows and create 1-N tables as needed (ISSUE#21)
        const tableRowSlides = getSlidesForTableRows(arrRows, opt, presLayout, slideLayout);
        tableRowSlides.forEach((slide, idx) => {
            // A: Create new Slide when needed, otherwise, use existing (NOTE: More than 1 table can be on a Slide, so we will go up AND down the Slide chain)
            if (!getSlide(target._slideNum + idx))
                slides.push(addSlide({ masterName: (slideLayout === null || slideLayout === void 0 ? void 0 : slideLayout._name) || null }));
            // B: Reset opt.y to `option`/`margin` after first Slide (ISSUE#43, ISSUE#47, ISSUE#48)
            if (idx > 0)
                opt.y = inch2Emu(opt.autoPageSlideStartY || opt.newSlideStartY || arrTableMargin[0]);
            // C: Add this table to new Slide
            {
                const newSlide = getSlide(target._slideNum + idx);
                const pageOpt = Object.assign({}, opt, {
                    autoPage: false,
                    _autoPageFragmentIndex: idx,
                    _autoPageFragmentCount: tableRowSlides.length,
                });
                if (idx > 0 && pageOpt.objectName)
                    pageOpt.objectName = `${pageOpt.objectName}.page-${idx + 1}`;
                // Create hyperlink rels (IMPORTANT: Wait until table has been shredded across Slides or all rels will end-up on Slide 1!)
                createHyperlinkRels(newSlide, slide.rows);
                // Add rows to new slide
                newSlide.addTable(slide.rows, pageOpt);
                // Add reference to the new slide so it can be returned, but don't add the first one because the user already has a reference to that one.
                if (idx > 0)
                    newAutoPagedSlides.push(newSlide);
            }
        });
    }
    return newAutoPagedSlides;
}
/**
 * Count paragraphs in text array
 * Each breakLine creates a new paragraph
 * @param {TextProps[]} text - text array
 * @returns {number} number of paragraphs
 */
export function countParagraphs(text) {
    if (!text || text.length === 0)
        return 1;
    let lineCount = 0;
    let arrTexts = [];
    const arrTextObjects = [];
    // 1. Flatten text objects (handling newlines)
    text.forEach(textItem => {
        const item = Object.assign(Object.assign({}, textItem), { options: Object.assign({}, (textItem.options || {})) });
        if (typeof item.text === 'string' || typeof item.text === 'number') {
            const strText = item.text.toString().replace(/\r*\n/g, '\n');
            if (strText.includes('\n') && strText.match(/\n$/g) === null) {
                strText.split('\n').forEach(line => {
                    arrTextObjects.push({ text: line, options: Object.assign(Object.assign({}, item.options), { breakLine: true }) });
                });
            }
            else {
                arrTextObjects.push(item);
            }
        }
        else {
            arrTextObjects.push(item);
        }
    });
    if (arrTextObjects.length === 0)
        return 1;
    // 2. Count paragraphs using grouping logic
    arrTextObjects.forEach((textObj, idx) => {
        var _a, _b, _c, _d;
        // A: Align change or Bullet triggers new line
        if (arrTexts.length > 0 && ((_a = textObj.options) === null || _a === void 0 ? void 0 : _a.align) && textObj.options.align !== ((_b = arrTextObjects[idx - 1].options) === null || _b === void 0 ? void 0 : _b.align)) {
            lineCount++;
            arrTexts = [];
        }
        else if (arrTexts.length > 0 && ((_c = textObj.options) === null || _c === void 0 ? void 0 : _c.bullet)) {
            lineCount++;
            arrTexts = [];
        }
        arrTexts.push(textObj);
        // C: BreakLine
        if (arrTexts.length > 0 && ((_d = textObj.options) === null || _d === void 0 ? void 0 : _d.breakLine)) {
            if (idx + 1 < arrTextObjects.length) {
                lineCount++;
                arrTexts = [];
            }
        }
    });
    // Flush buffer
    if (arrTexts.length > 0)
        lineCount++;
    return lineCount;
}
/**
 * Adds a text object to a slide definition.
 * @param {PresSlide} target - slide object that the text should be added to
 * @param {string|TextProps[]} text text string or object
 * @param {TextPropsOptions} opts text options
 * @param {boolean} isPlaceholder whether this a placeholder object
 * @since: 1.0.0
 */
export function addTextDefinition(target, text, opts, isPlaceholder) {
    var _a, _b;
    // VALIDATION: Inline animation property is not supported - use slide.addAnimation() instead
    if (opts === null || opts === void 0 ? void 0 : opts.animation) {
        throw new Error('Inline `animation` property is not supported. Use slide.addAnimation(text, animationProps) instead. See: https://gitbrent.github.io/PptxGenJS/docs/animations/');
    }
    const newObject = {
        _type: isPlaceholder ? SLIDE_OBJECT_TYPES.placeholder : SLIDE_OBJECT_TYPES.text,
        shape: (opts === null || opts === void 0 ? void 0 : opts.shape) || SHAPE_TYPE.RECTANGLE,
        text: !text || text.length === 0 ? [{ text: '', options: null }] : text,
        options: opts || {},
    };
    function cleanOpts(itemOpts) {
        // STEP 1: Set some options
        {
            // A.1: Color (placeholders should inherit their colors or override them, so don't default them)
            if (!itemOpts.placeholder) {
                itemOpts.color = itemOpts.color || newObject.options.color || target.color || DEF_FONT_COLOR;
            }
            // A.2: Placeholder should inherit their bullets or override them, so don't default them
            if (itemOpts.placeholder || isPlaceholder) {
                itemOpts.bullet = itemOpts.bullet || false;
            }
            // A.3: Text targeting a placeholder need to inherit the placeholders options (eg: margin, valign, etc.) (Issue #640)
            if (itemOpts.placeholder && !itemOpts._nativePlaceholderInheritance && target._slideLayout && target._slideLayout._slideObjects) {
                const placeHold = target._slideLayout._slideObjects.filter(item => item._type === 'placeholder' && item.options && item.options.placeholder && item.options.placeholder === itemOpts.placeholder)[0];
                if (placeHold === null || placeHold === void 0 ? void 0 : placeHold.options) {
                    // Inherit visual/text defaults from the layout placeholder, but never
                    // replace authored edit identity with the placeholder's generated name.
                    const authoredObjectName = itemOpts.objectName;
                    const authoredEditHandle = itemOpts.editHandle;
                    itemOpts = Object.assign(Object.assign({}, itemOpts), placeHold.options);
                    if (authoredObjectName)
                        itemOpts.objectName = authoredObjectName;
                    if (authoredEditHandle)
                        itemOpts.editHandle = authoredEditHandle;
                }
            }
            // A.4: Other options
            itemOpts.objectName = itemOpts.objectName
                ? itemOpts.objectName
                : `Text ${target._slideObjects.filter(obj => obj._type === SLIDE_OBJECT_TYPES.text).length}`;
            // B:
            if (itemOpts.shape === SHAPE_TYPE.LINE) {
                // ShapeLineProps defaults
                const newLineOpts = Object.assign(Object.assign({ type: itemOpts.line.type || 'solid', color: itemOpts.line.color || DEF_SHAPE_LINE_COLOR, transparency: itemOpts.line.transparency || 0, width: itemOpts.line.width || 1 }, (itemOpts.line.cap != null ? { cap: itemOpts.line.cap } : {})), { dashType: itemOpts.line.dashType || 'solid', beginArrowType: itemOpts.line.beginArrowType || null, endArrowType: itemOpts.line.endArrowType || null, beginArrowWidth: itemOpts.line.beginArrowWidth || null, beginArrowLength: itemOpts.line.beginArrowLength || null, endArrowWidth: itemOpts.line.endArrowWidth || null, endArrowLength: itemOpts.line.endArrowLength || null });
                if (typeof itemOpts.line === 'object')
                    itemOpts.line = newLineOpts;
                // 3: Handle line (lots of deprecated opts)
                if (typeof itemOpts.line === 'string') {
                    const tmpOpts = newLineOpts;
                    if (typeof itemOpts.line === 'string')
                        tmpOpts.color = itemOpts.line; // @deprecated [remove in v4.0]
                    // tmpOpts.color = itemOpts.line!.toString() // @deprecated `itemOpts.line`:[string] (was line color)
                    itemOpts.line = tmpOpts;
                }
                if (typeof itemOpts.lineSize === 'number')
                    itemOpts.line.width = itemOpts.lineSize; // @deprecated (part of `ShapeLineProps` now)
                if (typeof itemOpts.lineDash === 'string')
                    itemOpts.line.dashType = itemOpts.lineDash; // @deprecated (part of `ShapeLineProps` now)
                if (typeof itemOpts.lineHead === 'string')
                    itemOpts.line.beginArrowType = itemOpts.lineHead; // @deprecated (part of `ShapeLineProps` now)
                if (typeof itemOpts.lineTail === 'string')
                    itemOpts.line.endArrowType = itemOpts.lineTail; // @deprecated (part of `ShapeLineProps` now)
            }
            // C: Line opts
            itemOpts.line = itemOpts.line || {};
            itemOpts.lineSpacing = itemOpts.lineSpacing && !isNaN(itemOpts.lineSpacing) ? itemOpts.lineSpacing : null;
            itemOpts.lineSpacingMultiple = itemOpts.lineSpacingMultiple && !isNaN(itemOpts.lineSpacingMultiple) ? itemOpts.lineSpacingMultiple : null;
            // D: Transform text options to bodyProperties as thats how we build XML
            itemOpts._bodyProp = itemOpts._bodyProp || {};
            itemOpts._bodyProp.autoFit = itemOpts.autoFit || false; // DEPRECATED: (3.3.0) If true, shape will collapse to text size (Fit To shape)
            itemOpts._bodyProp.anchor = !itemOpts.placeholder && !itemOpts._nativeMinimal ? TEXT_VALIGN.ctr : null; // VALS: [t,ctr,b]
            itemOpts._bodyProp.vert = itemOpts.vert || null; // VALS: [eaVert,horz,mongolianVert,vert,vert270,wordArtVert,wordArtVertRtl]
            // Preserve an explicit null as a real reset.  The ordinary authoring
            // default is square wrapping, but a patch/spec that sets wrap:null must
            // remove the authored bodyPr@wrap instead of being silently rewritten to
            // square here.  Native-minimal imports already omit the default.
            if (itemOpts.wrap === null)
                itemOpts._bodyProp.wrap = undefined;
            else
                itemOpts._bodyProp.wrap = typeof itemOpts.wrap === 'boolean' ? itemOpts.wrap : (itemOpts._nativeMinimal ? undefined : true);
            // E: Inset
            // @deprecated 3.10.0 (`inset` - use `margin`)
            if ((itemOpts.inset && !isNaN(Number(itemOpts.inset))) || itemOpts.inset === 0) {
                itemOpts._bodyProp.lIns = inch2Emu(itemOpts.inset);
                itemOpts._bodyProp.rIns = inch2Emu(itemOpts.inset);
                itemOpts._bodyProp.tIns = inch2Emu(itemOpts.inset);
                itemOpts._bodyProp.bIns = inch2Emu(itemOpts.inset);
            }
            // F: Transform @deprecated props
            if (typeof itemOpts.underline === 'boolean' && itemOpts.underline === true)
                itemOpts.underline = { style: 'sng' };
        }
        // STEP 2: Transform `align`/`valign` to XML values, store in _bodyProp for XML gen
        {
            if ((itemOpts.align || '').toLowerCase().indexOf('c') === 0)
                itemOpts._bodyProp.align = TEXT_HALIGN.center;
            else if ((itemOpts.align || '').toLowerCase().indexOf('l') === 0)
                itemOpts._bodyProp.align = TEXT_HALIGN.left;
            else if ((itemOpts.align || '').toLowerCase().indexOf('r') === 0)
                itemOpts._bodyProp.align = TEXT_HALIGN.right;
            else if ((itemOpts.align || '').toLowerCase().indexOf('j') === 0)
                itemOpts._bodyProp.align = TEXT_HALIGN.justify;
            if ((itemOpts.valign || '').toLowerCase().indexOf('b') === 0)
                itemOpts._bodyProp.anchor = TEXT_VALIGN.b;
            else if ((itemOpts.valign || '').toLowerCase().indexOf('m') === 0)
                itemOpts._bodyProp.anchor = TEXT_VALIGN.ctr;
            else if ((itemOpts.valign || '').toLowerCase().indexOf('t') === 0)
                itemOpts._bodyProp.anchor = TEXT_VALIGN.t;
        }
        // STEP 3: ROBUST: Set rational values for some shadow props if needed
        correctShadowOptions(itemOpts.shadow);
        return itemOpts;
    }
    // STEP 1: Create/Clean object options
    newObject.options = cleanOpts(newObject.options);
    // STEP 2: Create/Clean text options
    newObject.text.forEach(item => (item.options = cleanOpts(item.options || {})));
    if (newObject.options.hyperlink && !newObject.options.hyperlink._rId) {
        if (typeof newObject.options.hyperlink !== 'object') {
            console.log('ERROR: text object `hyperlink` option should be an object. Ex: `hyperlink: {url:\'https://github.com\'}` ');
        }
        else if (!newObject.options.hyperlink.url && !newObject.options.hyperlink.slide) {
            console.log('ERROR: text object `hyperlink` requires either: `url` or `slide`');
        }
        else {
            const relId = getNewRelId(target);
            target._rels.push({
                type: SLIDE_OBJECT_TYPES.hyperlink,
                data: newObject.options.hyperlink.slide ? 'slide' : 'dummy',
                rId: relId,
                Target: newObject.options.hyperlink.url || newObject.options.hyperlink.slide.toString(),
            });
            newObject.options.hyperlink._rId = relId;
        }
    }
    if ((_a = newObject.options.hyperlink) === null || _a === void 0 ? void 0 : _a._rId) {
        const objectHyperlink = newObject.options.hyperlink;
        const sameHyperlinkTarget = (hyperlink) => !!hyperlink && hyperlink.url === objectHyperlink.url && hyperlink.slide === objectHyperlink.slide;
        const applyObjectHyperlinkRid = (items) => {
            items.forEach(item => {
                var _a;
                if (Array.isArray(item)) {
                    applyObjectHyperlinkRid(item);
                }
                else if (Array.isArray(item.text)) {
                    applyObjectHyperlinkRid(item.text);
                }
                else if (((_a = item.options) === null || _a === void 0 ? void 0 : _a.hyperlink) && !item.options.hyperlink._rId && sameHyperlinkTarget(item.options.hyperlink)) {
                    item.options.hyperlink._rId = objectHyperlink._rId;
                }
            });
        };
        applyObjectHyperlinkRid(newObject.text);
    }
    // STEP 3: Create hyperlinks
    createHyperlinkRels(target, newObject.text || '');
    attachShapeFillImage(target, (_b = newObject.options) === null || _b === void 0 ? void 0 : _b.fill);
    // LAST: Add object to Slide
    target._slideObjects.push(newObject);
    // NOTE: Inline animation removed - use slide.addAnimation() instead
}
/**
 * Builds the slide object list used for serialization, including empty layout
 * placeholders that have not been populated on the slide. The authored slide
 * model must remain unchanged: repeated writes and readback/export operations
 * are allowed to observe only user-authored objects.
 * @param {PresSlide} slide - slide object containing layouts
 * @return {ISlideObject[]} serialization-only object list
 */
export function addPlaceholdersToSlideLayouts(slide) {
    const serializationSlide = Object.assign(Object.create(Object.getPrototypeOf(slide)), slide, {
        _slideObjects: [...slide._slideObjects],
        _rels: [...(slide._rels || [])],
        _relsChart: [...(slide._relsChart || [])],
        _relsMedia: [...(slide._relsMedia || [])],
    });
    // Add all placeholders on this Slide that dont already exist
    (slide._slideLayout._slideObjects || []).forEach(slideLayoutObj => {
        var _a, _b;
        if (slideLayoutObj._type === SLIDE_OBJECT_TYPES.placeholder) {
            // A: Search for this placeholder on Slide before we add
            // NOTE: Check to ensure a placeholder does not already exist on the Slide
            // They are created when they have been populated with text (ex: `slide.addText('Hi', { placeholder:'title' });`)
            const layoutOptions = slideLayoutObj.options;
            const layoutType = (_a = layoutOptions._placeholderType) !== null && _a !== void 0 ? _a : layoutOptions.phType;
            const layoutIdx = (_b = layoutOptions._placeholderIdx) !== null && _b !== void 0 ? _b : layoutOptions.phIdx;
            const alreadyPopulated = serializationSlide._slideObjects.some(slideObj => {
                var _a, _b;
                const slideOptions = slideObj.options;
                if (!slideOptions)
                    return false;
                if (slideOptions.placeholder && slideOptions.placeholder === layoutOptions.placeholder)
                    return true;
                const slideType = (_a = slideOptions._placeholderType) !== null && _a !== void 0 ? _a : slideOptions.phType;
                const slideIdx = (_b = slideOptions._placeholderIdx) !== null && _b !== void 0 ? _b : slideOptions.phIdx;
                return Boolean(layoutType && slideType === layoutType && slideIdx !== undefined && layoutIdx !== undefined && String(slideIdx) === String(layoutIdx));
            });
            if (!alreadyPopulated) {
                addTextDefinition(serializationSlide, [{ text: '' }], Object.assign({}, slideLayoutObj.options), false);
            }
        }
    });
    return serializationSlide._slideObjects;
}
/* -------------------------------------------------------------------------------- */
/**
 * Adds a background image or color to a slide definition.
 * @param {BackgroundProps} props - color string or an object with image definition
 * @param {PresSlide} target - slide object that the background is set to
 */
export function addBackgroundDefinition(props, target) {
    var _a;
    target._relsMedia = target._relsMedia || [];
    const previousBackgroundRid = target._bkgdImgRid;
    if (previousBackgroundRid) {
        // Background relationships are deliberately not shared with shape fills,
        // so replacement/clear can remove only the lifecycle-owned media safely.
        target._relsMedia = target._relsMedia.filter(rel => !(rel.isBackground && rel.rId === previousBackgroundRid));
        target._bkgdImgRid = undefined;
    }
    // A: @deprecated
    if (target.bkgd) {
        if (!target.background)
            target.background = {};
        if (typeof target.bkgd === 'string')
            target.background.color = target.bkgd;
        else {
            if (target.bkgd.data)
                target.background.data = target.bkgd.data;
            if (target.bkgd.path)
                target.background.path = target.bkgd.path;
            if (target.bkgd.src)
                target.background.path = target.bkgd.src; // @deprecated (drop in 4.x)
        }
        props = target.background;
    }
    if (!props)
        return;
    if ((_a = target.background) === null || _a === void 0 ? void 0 : _a.fill)
        target.background.color = target.background.fill;
    // B: Handle media
    const texture = props.texture && typeof props.texture === 'object' ? props.texture : undefined;
    const data = String(props.data || (texture === null || texture === void 0 ? void 0 : texture.data) || '');
    const imagePath = String(props.path || (texture === null || texture === void 0 ? void 0 : texture.path) || '');
    if (imagePath || data) {
        const { extn, mimeType } = resolveImagePackageType(data, imagePath);
        const intRels = getNewRelId(target);
        // NOTE: `Target` cannot have spaces (eg:"Slide 1-image-1.jpg") or a "presentation is corrupt" warning comes up
        target._relsMedia.push({
            path: imagePath || `preencoded.${extn}`,
            type: mimeType,
            extn,
            data: data || null,
            rId: intRels,
            Target: `../media/${(target._name || '').replace(/\s+/gi, '-')}-image-${intRels}.${extn}`,
            isBackground: true,
        });
        target._bkgdImgRid = intRels;
    }
}
/**
 * Parses text/text-objects from `addText()` and `addTable()` methods; creates 'hyperlink'-type Slide Rels for each hyperlink found
 * @param {PresSlide} target - slide object that any hyperlinks will be be added to
 * @param {number | string | TextProps | TextProps[] | ITableCell[][]} text - text to parse
 */
function createHyperlinkRels(target, text, options) {
    let textObjs = [];
    // Only text objects can have hyperlinks, bail when text param is plain text
    if (typeof text === 'string' || typeof text === 'number')
        return;
    // IMPORTANT: "else if" Array.isArray must come before typeof===object! Otherwise, code will exhaust recursion!
    else if (Array.isArray(text))
        textObjs = text;
    else if (typeof text === 'object')
        textObjs = [text];
    textObjs.forEach((text, idx) => {
        // IMPORTANT: `options` are lost due to recursion/copy!
        if (options && options[idx] && options[idx].hyperlink)
            text.options = Object.assign(Object.assign({}, text.options), options[idx]);
        // NOTE: `text` can be an array of other `text` objects (table cell word-level formatting), continue parsing using recursion
        if (Array.isArray(text)) {
            const cellOpts = [];
            text.forEach((tablecell) => {
                if (tablecell.options && !tablecell.text.options) {
                    cellOpts.push(tablecell.options);
                }
            });
            createHyperlinkRels(target, text, cellOpts);
        }
        else if (Array.isArray(text.text)) {
            createHyperlinkRels(target, text.text, options && options[idx] ? [options[idx]] : undefined);
        }
        else if (text && typeof text === 'object' && text.options && text.options.hyperlink && !text.options.hyperlink._rId) {
            if (typeof text.options.hyperlink !== 'object') {
                console.log('ERROR: text `hyperlink` option should be an object. Ex: `hyperlink: {url:\'https://github.com\'}` ');
            }
            else if (!text.options.hyperlink.url && !text.options.hyperlink.slide) {
                console.log('ERROR: \'hyperlink requires either: `url` or `slide`\'');
            }
            else {
                const relId = getNewRelId(target);
                target._rels.push({
                    type: SLIDE_OBJECT_TYPES.hyperlink,
                    data: text.options.hyperlink.slide ? 'slide' : 'dummy',
                    rId: relId,
                    Target: text.options.hyperlink.url || text.options.hyperlink.slide.toString(),
                });
                text.options.hyperlink._rId = relId;
            }
        }
        else if (text && typeof text === 'object' && text.options && text.options.hyperlink && text.options.hyperlink._rId) {
            // NOTE: auto-paging will create new slides, but skip above as _rId exists, BUT this is a new slide, so add rels!
            if (target._rels.filter(rel => rel.rId === text.options.hyperlink._rId).length === 0) {
                target._rels.push({
                    type: SLIDE_OBJECT_TYPES.hyperlink,
                    data: text.options.hyperlink.slide ? 'slide' : 'dummy',
                    rId: text.options.hyperlink._rId,
                    Target: text.options.hyperlink.url || text.options.hyperlink.slide.toString(),
                });
            }
        }
    });
}
//# sourceMappingURL=gen-objects.js.map