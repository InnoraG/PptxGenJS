import { ChartType, ShapeType, SHAPE_TYPE } from '../core-enums.js';
import { CHART_PRESET_CATALOG } from './chart-presets.js';
import { TABLE_PRESET_CATALOG } from './table-presets.js';
export const CLAUDEPPTXMCP_CAPABILITY_LEDGER_VERSION = '2026-05-24.live-labs-v2';
const PRODUCT_TOOLS = [
    'claudepptxmcp.presentation.create',
    'claudepptxmcp.presentation.create_from_code',
    'claudepptxmcp.presentation.improve',
    'claudepptxmcp.presentation.edit',
    'claudepptxmcp.presentation.restyle',
    'claudepptxmcp.presentation.apply_brand',
    'claudepptxmcp.presentation.animate',
    'claudepptxmcp.presentation.upgrade',
    'claudepptxmcp.presentation.validate',
    'claudepptxmcp.presentation.compare',
    'claudepptxmcp.presentation.repair_check',
    'claudepptxmcp.presentation.snapshot',
    'claudepptxmcp.artifact.get',
    'claudepptxmcp.capabilities.query',
    'claudepptxmcp.slide.add_with_transition',
    'claudepptxmcp.object.insert_3d_asset',
    'claudepptxmcp.object.insert_media',
    'claudepptxmcp.object.apply_animation',
    'claudepptxmcp.object.apply_motion_path',
    'claudepptxmcp.object.insert_smartart',
    'claudepptxmcp.object.apply_wordart',
    'claudepptxmcp.object.apply_action',
    'claudepptxmcp.chart.add',
    'claudepptxmcp.table.add',
    'claudepptxmcp.table.recommend',
];
const INTERNAL_TOOLS = [
    'claudepptxmcp.internal.decypher',
    'claudepptxmcp.internal.regenerate',
    'claudepptxmcp.internal.package_snapshot',
    'claudepptxmcp.internal.visual_oracle',
];
export const WORD_ART_TRANSFORMS = [
    'textNoShape',
    'textPlain',
    'textArchUp',
    'textArchDown',
    'textCircle',
    'textButton',
    'textArchUpPour',
    'textArchDownPour',
    'textCirclePour',
    'textButtonPour',
    'textCurveUp',
    'textCurveDown',
    'textCanUp',
    'textCanDown',
    'textWave1',
    'textWave2',
    'textWave4',
    'textDoubleWave1',
    'textInflate',
    'textDeflate',
    'textInflateBottom',
    'textDeflateBottom',
    'textInflateTop',
    'textDeflateTop',
    'textDeflateInflate',
    'textDeflateInflateDeflate',
    'textFadeRight',
    'textFadeLeft',
    'textFadeUp',
    'textFadeDown',
    'textSlantUp',
    'textSlantDown',
    'textCascadeUp',
    'textCascadeDown',
    'textChevron',
    'textChevronInverted',
    'textRingInside',
    'textRingOutside',
    'textTriangle',
    'textTriangleInverted',
    'textStop',
];
export const TRANSITION_TYPES = [
    'fade',
    'cut',
    'dissolve',
    'random',
    'push',
    'wipe',
    'cover',
    'uncover',
    'split',
    'reveal',
    'shape',
    'wheel',
    'comb',
    'zoom',
    'strips',
    'checker',
    'checkerboard',
    'blinds',
    'flash',
    'morph',
    'curtains',
    'drape',
    'wind',
    'prestige',
    'fracture',
    'crush',
    'peelOff',
    'pageCurl',
    'pageCurlDouble',
    'pageCurlSingle',
    'airplane',
    'origami',
    'fallOver',
    'clock',
    'ripple',
    'honeycomb',
    'glitter',
    'shred',
    'vortex',
    'switch',
    'flip',
    'gallery',
    'prism',
    'cube',
    'box',
    'rotate',
    'orbit',
    'doors',
    'warp',
    'pan',
    'ferrisWheel',
    'conveyor',
    'window',
    'flyThrough',
    'appear',
    'disappear',
    'flyIn',
    'flyOut',
    'wipeIn',
    'wipeOut',
    'zoomOut',
    'spin',
    'pulse',
    'growShrink',
    'floatIn',
    'floatOut',
];
export const MORPH_OPTIONS = ['byObject', 'byWord', 'byChar'];
const STATIC_ANIMATION_BY_CATEGORY = {
    entrance: [
        'appear', 'blinds', 'boomerang', 'bounce', 'box', 'centerrevolve', 'checkerboard', 'circle', 'colorReveal',
        'crawl', 'credits', 'curveUp', 'diamond', 'dissolve', 'drop', 'easeIn', 'expand', 'fade', 'fadedSwivel',
        'fadedZoom', 'flashOnce', 'flip', 'float', 'floatIn', 'floatoutentrance', 'fly', 'fold', 'glide',
        'growandturn', 'lightspeed', 'peek', 'plus', 'randomBars', 'randomEffects', 'riseup', 'sling', 'spinner',
        'spiral', 'split', 'stretch', 'stretchy', 'strips', 'swish', 'swivel', 'thinLine', 'unfold', 'wedge',
        'wheel', 'whip', 'wipe', 'zip', 'zoom',
    ],
    exit: [
        'appear', 'blinds', 'boomerang', 'bounce', 'box', 'centerrevolve', 'checkerboard', 'circle', 'colorReveal',
        'crawl', 'credits', 'curveDown', 'diamond', 'dissolve', 'drop', 'easeIn', 'expand', 'fade', 'fadedSwivel',
        'fadedZoom', 'flashOnce', 'flip', 'float', 'floatOut', 'floatinexit', 'fly', 'fold', 'glide', 'growandturn',
        'lightspeed', 'peek', 'plus', 'randomBars', 'randomEffects', 'riseup', 'sling', 'spinner', 'spiral',
        'split', 'stretch', 'stretchy', 'strips', 'swish', 'swivel', 'thinLine', 'unfold', 'wedge', 'wheel',
        'whip', 'wipe', 'zip', 'zoom',
    ],
    emphasis: [
        'blast', 'boldflash', 'boldreveal', 'brushcolor', 'changefillcolor', 'changefont', 'changefontcolor',
        'changefontsize', 'changefontstyle', 'changelinecolor', 'colorwave', 'complementarycolor',
        'complementarycolor2', 'contrastingcolor', 'darken', 'desaturate', 'flicker', 'growshrink',
        'growwithcolor', 'lighten', 'objectcolor', 'pulse', 'shimmer', 'spin', 'styleemphasis', 'teeter',
        'transparency', 'underline', 'verticalgrow', 'wave',
    ],
    media: ['mediapause', 'mediaplay', 'mediastop'],
    motion: [
        '4pointstar', '5pointstar', '6pointstar', '8pointstar', 'arcdown', 'arcleft', 'arcright', 'arcup',
        'bean', 'bounceleft', 'bounceright', 'buzzsaw', 'circlepath', 'crescentmoon', 'curvedsquare',
        'curvedx', 'curvyleft', 'curvyright', 'curvystar', 'decayingwave', 'diagonaldownright',
        'diagonalupright', 'diamondpath', 'down', 'equaltriangle', 'figure8four', 'football', 'funnel',
        'heart', 'heartbeat', 'hexagon', 'horizontalfigure8', 'invertedsquare', 'invertedtriangle', 'left',
        'loopdeloop', 'neutron', 'octagon', 'parallelogram', 'peanut', 'pentagon', 'pluspath', 'pointystar',
        'right', 'righttriangle', 'scurve1', 'scurve2', 'sinewave', 'spiralleft', 'spiralright', 'spring',
        'squarepath', 'stairsdown', 'swoosh', 'teardrop', 'trapezoid', 'turndown', 'turnright', 'turnup',
        'turnupright', 'up', 'verticalfigure8', 'wavepath', 'zigzag',
    ],
};
export const MOTION_PATHS = STATIC_ANIMATION_BY_CATEGORY.motion;
const DECK_SYSTEM_FEATURES = [
    'layouts',
    'custom slide sizes',
    'slide masters',
    'multiple slide masters',
    'themes',
    'sections',
    'speaker notes',
    'slide numbers',
    'hidden slides',
    'backgrounds',
    'title metadata',
    'subject metadata',
    'author metadata',
    'company metadata',
    'revision metadata',
    'RTL mode',
    'write output',
    'writeFile output',
    'stream output',
    'package validation',
    'artifact manifests',
    'generated source export',
];
const PLACEHOLDER_TYPES = ['title', 'body', 'subtitle', 'date', 'slideNum', 'footer', 'header', 'media', 'clipArt', 'chart', 'table'];
const MASTER_TOPOLOGY_FEATURES = ['master to layout inheritance', 'layout to slide inheritance', 'style inheritance', 'geometry inheritance', 'font inheritance', 'showMasterShapes', 'showMasterBackground', 'layout relationships', 'theme inheritance'];
const SLIDE_AUTHORING_FEATURES = ['add slide', 'add text', 'add rich text runs', 'add shape', 'add image', 'add table', 'add chart', 'add media', 'add 3D model', 'add SmartArt-style diagram primitives', 'add notes', 'add placeholder', 'add hyperlink', 'add passthrough XML', 'add transition', 'add animation', 'add animation group', 'set raw timing XML'];
const TEXT_FEATURES = ['font face', 'font size', 'font color', 'bold', 'italic', 'underline', 'strike', 'subscript', 'superscript', 'character spacing', 'baseline', 'line spacing', 'paragraph spacing before', 'paragraph spacing after', 'indentation', 'bullet levels', 'bullet DEFAULT', 'bullet CHECK', 'bullet STAR', 'bullet TRIANGLE', 'horizontal align left', 'horizontal align center', 'horizontal align right', 'horizontal align justify', 'vertical align top', 'vertical align middle', 'vertical align bottom', 'margins', 'text boxes', 'auto-fit', 'shrink text', 'wrapping', 'rotation', 'RTL text', 'bidirectional text', 'complex-script flags', 'East Asian vertical eaVert', 'Mongolian vertical mongolianVert', 'line breaks', 'fields', 'soft breaks', 'non-breaking spaces', 'embedded fonts', 'font preservation', 'text fill', 'text outline', 'text glow', 'text shadow', 'text reflection', 'text 3D', 'hyperlinks'];
const SHAPE_STYLE_FEATURES = ['solid fills', 'transparency', 'gradient fills', 'gradient stops', 'gradient direction', 'gradient angle', 'preset gradients', 'line color', 'line width', 'dash styles', 'arrow heads', 'arrow tails', 'rounded rectangles', 'rotation', 'flip horizontal', 'flip vertical', 'shadows', 'glow', 'reflection', 'soft edges', '3D effects', 'custom geometry preservation'];
const GEOMETRY_FEATURES = ['custom geometry paths', 'boolean union as custom geometry', 'boolean intersect as custom geometry', 'boolean subtract as custom geometry', 'boolean combine as custom geometry', 'boolean fragment as custom geometry', 'nested group transforms', 'chOff', 'chExt', 'child coordinate mapping', 'connector routing', 'stCxn', 'endCxn', 'connection IDs and indices', 'grouped connectors', 'nested groups'];
const IMAGE_FEATURES = ['file path images', 'data/base64 images', 'SVG', 'PNG', 'JPEG', 'alt text', 'crop', 'contain sizing', 'cover sizing', 'transparency', 'rounding', 'rotation', 'flip horizontal', 'flip vertical', 'shadows', 'hyperlinks', 'placeholders', 'cNvPicPr preservation', 'blipFill preservation', 'crop metadata', 'effects preservation', 'line/fill preservation', 'picture relationship preservation'];
const TABLE_FEATURES = ['text cells', 'rich text cells', 'row heights', 'column widths', 'colspan', 'rowspan', 'borders', 'transparent borders', 'fills', 'margins', 'hyperlinks', 'auto paging', 'repeated headers', 'table-to-slides', 'complex table preservation', 'tableStyles.xml', 'native table style IDs', 'first row conditional formatting', 'last row conditional formatting', 'banded rows', 'banded columns', 'hMerge', 'vMerge', 'grid topology preservation'];
const CHART_OPTION_FEATURES = ['title', 'legend', 'category axis', 'value axis', 'series axis', 'data labels', 'data table', 'grid lines', 'fills', 'lines', 'embedded workbook', 'chart style XML', 'chart color XML', 'chart relationship preservation'];
const CHART_NATIVE_COMPOSITES = ['bar+line combo', 'clustered bar plus trend line'];
const CHART_SHAPE_BUILT_FEATURES = [
    'funnel/trapezoid chart',
    'gauge/progress ring using arc and blockArc',
    'segmented pie/wedge visuals using pie, pieWedge, chord, and arc',
    'candlestick/OHLC chart using lines, rects, and wicks',
    'waterfall chart using stacked rects and connectors',
    'histogram and pareto using bars plus cumulative line',
    'box-and-whisker using lines, boxes, median marker, and whiskers',
    'gantt/timeline using bars, milestones, and connectors',
    'KPI dashboard panels with sparklines',
];
const MEDIA_FEATURES = ['audio', 'video', 'online media', 'media cover image', 'extension handling', 'path/link sources', 'interactive playback', 'media play animation', 'media pause animation', 'media stop animation', 'media bookmarks', 'media triggers', 'native media relationship preservation'];
const MODEL3D_FEATURES = ['GLB insertion', 'raster fallback', 'model rotation', 'model camera', 'transform', 'ambient light', 'point lights', 'object viewport', 'shadow', 'native 3D model XML', 'raw 3D model effect preservation'];
const AUDIO_VOICE_FEATURES = [
    'narration audio embedding',
    'section voice cues',
    'autoplay narration timing',
    'fallback tone generation',
    'audio waveform visual fixture',
    'audio play command',
    'audio pause command',
    'audio stop command',
    'audio relationship validation',
    'voice artifact retrieval',
];
const SAMPLE_OBJECT_FEATURES = [
    'bundled sample image',
    'bundled sample SVG',
    'bundled sample audio',
    'bundled sample video',
    'bundled sample GLB',
    'extracted local sample object discovery',
    'official external sample library hook',
    'sample object manifest',
];
const SHAPE_ICON_FEATURES = [
    'shape-built home icon',
    'shape-built document icon',
    'shape-built chart icon',
    'shape-built process icon',
    'shape-built media icon',
    'shape-built 3D icon',
    'shape-built cloud icon',
    'shape-built accessibility icon',
    'shape-built security icon',
    'shape-built dashboard icon',
];
const SMARTART_SHAPE_BUILT_TYPES = ['list diagrams', 'process diagrams', 'cycle diagrams', 'hierarchy/org diagrams', 'relationship diagrams', 'matrix diagrams', 'pyramid diagrams', 'picture diagrams', 'timeline diagrams', 'meet-the-team diagrams'];
const SMARTART_NATIVE_PRESERVATION_TYPES = ['picture SmartArt preservation', 'diagram data parts', 'diagram layout parts', 'diagram quick style parts', 'diagram colors parts', 'SmartArt relationships', 'SmartArt package preservation', 'SmartArt light/dark restyle stability'];
const ANIMATION_FEATURES = ['triggers onClick', 'triggers afterPrevious', 'triggers withPrevious', 'sequence asOneObject', 'sequence allAtOnce', 'sequence byParagraph', 'node clickEffect', 'node withEffect', 'node afterEffect', 'duration', 'delay', 'repeat', 'auto reverse', 'direction', 'color', 'scale', 'rotation', 'order', 'group IDs', 'paragraph targeting', 'animation groups'];
const INTERACTIVE_FEATURES = ['click actions', 'hover actions', 'macro actions preserved but not executed', 'run program actions preserved but not executed', 'jump to slide', 'URL action', 'jump to custom show', 'end show', 'play sound actions', 'action buttons', 'custom shows', 'slide zoom', 'section zoom', 'summary zoom', 'media triggers', 'media bookmarks'];
const ACCESSIBILITY_FEATURES = ['reading order', 'object sequence', 'cNvPr order', 'alt text', 'title metadata', 'description metadata', 'decorative flags', 'isDecorative', 'screen-reader-safe hidden graphics', 'screen-reader-safe decorative graphics'];
const COLLABORATION_FEATURES = ['comments', 'threaded comments', 'people/person metadata', 'coauthoring lock zones', 'Mark as Final', 'read-only recommended state', 'digital signatures', 'encrypted/password-protected packages', 'VBA/macro package preservation', 'ActiveX preservation', 'VML drawing preservation', 'tags preservation', 'ink preservation', 'custom data preservation', 'control properties preservation', 'authors preservation', 'comment authors preservation', 'embedded object preservation'];
const DEEP_PACKAGE_PARTS = ['[Content_Types].xml', 'root _rels/.rels', 'all part-level .rels', 'docProps/core.xml', 'docProps/app.xml', 'docProps/custom.xml', 'customXml/', 'ppt/diagrams/', 'ppt/embeddings/', 'ppt/activeX/', 'ppt/comments/', 'ppt/threadedComments/', 'ppt/people/', 'ppt/persons/', 'ppt/ink/', 'ppt/tags/', 'ppt/vmlDrawings/', 'ppt/customData/', 'ppt/ctrlProps/', 'ppt/authors.xml', 'ppt/commentAuthors.xml', 'ppt/vbaProject.bin'];
const VALIDATION_FEATURES = ['package integrity validation', 'relationship validation', 'content type validation', 'metadata validation', 'comparator check', 'no-op canonical comparison', 'light/dark/light canonical comparison', 'PowerPoint repair check', 'visual screenshots', 'artifact retrieval', 'source retrieval', 'coverage report', 'failure report by slide/object/coverage row'];
function unique(values) {
    return [...new Set(values.filter(Boolean))];
}
function slug(value) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'feature';
}
function row(category, publicName, coverageMode, mcpTool, validationOracle, options = {}) {
    var _a, _b, _c;
    return {
        featureId: `claudepptxmcp.${slug(category)}.${slug(publicName)}`,
        category,
        publicName,
        coverageMode,
        mcpTool,
        showcaseSlide: options.showcaseSlide || `ledger:${slug(category)}`,
        validationOracle,
        lightDarkStable: (_a = options.lightDarkStable) !== null && _a !== void 0 ? _a : true,
        implemented: (_b = options.implemented) !== null && _b !== void 0 ? _b : true,
        requiredForCompletion: (_c = options.requiredForCompletion) !== null && _c !== void 0 ? _c : true,
    };
}
function rowsForValues(category, values, coverageMode, mcpTool, validationOracle, prefix = '') {
    return unique(values).map(value => row(category, `${prefix}${value}`, coverageMode, mcpTool, validationOracle));
}
function animationRows(capabilities) {
    var _a, _b, _c;
    const maps = ((_c = (_b = (_a = capabilities === null || capabilities === void 0 ? void 0 : capabilities.featureGroups) === null || _a === void 0 ? void 0 : _a.animationsAndTransitions) === null || _b === void 0 ? void 0 : _b.animationMaps) === null || _c === void 0 ? void 0 : _c.byCategory) || STATIC_ANIMATION_BY_CATEGORY;
    const rows = [];
    for (const [category, values] of Object.entries(maps)) {
        const mode = category === 'media' ? 'native-plus-preserve' : 'native';
        const tool = category === 'motion' ? 'claudepptxmcp.object.apply_motion_path' : 'claudepptxmcp.object.apply_animation';
        rows.push(...rowsForValues(`Animations ${category}`, values, mode, tool, ['timing-xml', 'animation-registry', 'package-xml']));
    }
    return rows;
}
export function buildCapabilityLedger(capabilities, brand = 'claudepptxmcp') {
    const shapeTypes = unique(Object.values(ShapeType));
    const legacyShapeAliases = Object.entries(SHAPE_TYPE).map(([name, value]) => `${name} -> ${value}`);
    const chartTypes = Object.entries(ChartType).map(([name, value]) => name === value ? value : `${name} / ${value}`);
    const rows = [
        ...rowsForValues('MCP Product Surface', PRODUCT_TOOLS, 'native', 'claudepptxmcp.capabilities.query', ['mcp-list-tools']),
        ...rowsForValues('MCP Internal Admin Surface', INTERNAL_TOOLS, 'validate-only', 'claudepptxmcp.capabilities.query', ['developer-tools-gate']),
        ...rowsForValues('Deck and System', DECK_SYSTEM_FEATURES, 'native', 'claudepptxmcp.presentation.create', ['package-xml', 'metadata', 'artifact-manifest']),
        ...rowsForValues('Slide Master Deep Topology Placeholders', PLACEHOLDER_TYPES, 'native-plus-preserve', 'claudepptxmcp.presentation.create', ['slide-master-xml', 'layout-xml']),
        ...rowsForValues('Slide Master Deep Topology', MASTER_TOPOLOGY_FEATURES, 'native-plus-preserve', 'claudepptxmcp.presentation.create', ['slide-master-xml', 'layout-xml', 'theme-xml']),
        ...rowsForValues('Slide Authoring', SLIDE_AUTHORING_FEATURES, 'native', 'claudepptxmcp.presentation.create', ['slide-xml', 'relationships']),
        ...rowsForValues('Text Typography Localization', TEXT_FEATURES, 'native-plus-preserve', 'claudepptxmcp.presentation.create', ['text-xml', 'font-validation', 'bidirectional-text']),
        ...rowsForValues('WordArt Text Transform', WORD_ART_TRANSFORMS, 'native', 'claudepptxmcp.object.apply_wordart', ['a:prstTxWarp', 'text-effects', 'light-dark-stability']),
        ...rowsForValues('Shapes', shapeTypes, 'native', 'claudepptxmcp.presentation.create', ['shape-xml', 'geometry-xml']),
        ...rowsForValues('Legacy Shape Aliases', legacyShapeAliases, 'native', 'claudepptxmcp.presentation.create', ['shape-alias-map']),
        ...rowsForValues('Advanced Geometry', GEOMETRY_FEATURES, 'native-plus-preserve', 'claudepptxmcp.presentation.create', ['custom-geometry-xml', 'connector-xml', 'group-transform-xml']),
        ...rowsForValues('Shape Styling', SHAPE_STYLE_FEATURES, 'native-plus-preserve', 'claudepptxmcp.presentation.create', ['shape-style-xml', 'effect-xml']),
        ...rowsForValues('Images Pictures', IMAGE_FEATURES, 'native-plus-preserve', 'claudepptxmcp.presentation.create', ['picture-xml', 'media-rels', 'alt-text']),
        ...rowsForValues('Tables', TABLE_FEATURES, 'native-plus-preserve', 'claudepptxmcp.table.add', ['table-xml', 'grid-topology', 'table-styles']),
        ...TABLE_PRESET_CATALOG.map(preset => row('Tables AI Contextual Presets', `${preset.powerPointCategory}: ${preset.powerPointPreset} -> ${preset.id}`, preset.authoringMode === 'native-table' ? 'native' : 'native-plus-preserve', 'claudepptxmcp.table.recommend', ['table-preset-catalog', 'table-xml', 'table-styles'])),
        ...rowsForValues('Charts Types', chartTypes, 'native-chart', 'claudepptxmcp.chart.add', ['chart-xml', 'chart-rels', 'embedded-workbook', 'non-empty-series']),
        ...rowsForValues('Charts Native Composite', CHART_NATIVE_COMPOSITES, 'native-composite', 'claudepptxmcp.chart.add', ['chart-xml', 'multi-chart-plot-area', 'embedded-workbook']),
        ...rowsForValues('Charts Shape Built Analytics', CHART_SHAPE_BUILT_FEATURES, 'shape-built-chart', 'claudepptxmcp.chart.add', ['shape-xml', 'analytic-fixture', 'not-visually-blank']),
        ...rowsForValues('Charts Options', CHART_OPTION_FEATURES, 'native-plus-preserve', 'claudepptxmcp.chart.add', ['chart-xml', 'chart-style-xml', 'chart-color-xml']),
        ...CHART_PRESET_CATALOG.map(preset => row('Charts AI Contextual Presets', `${preset.powerPointCategory}: ${preset.powerPointPreset} -> ${preset.id}`, preset.authoringMode === 'native' ? 'native-chart' : preset.authoringMode === 'native-composite' ? 'native-composite' : 'shape-built-chart', 'claudepptxmcp.chart.recommend', preset.authoringMode === 'shape-built' ? ['chart-preset-catalog', 'shape-xml-or-preserve-only-policy'] : ['chart-preset-catalog', 'chart-xml', 'embedded-workbook'])),
        ...rowsForValues('Media', MEDIA_FEATURES, 'native-plus-preserve', 'claudepptxmcp.object.insert_media', ['media-rels', 'timing-xml', 'content-types']),
        ...rowsForValues('3D Models', MODEL3D_FEATURES, 'native-plus-preserve', 'claudepptxmcp.object.insert_3d_asset', ['model3d-xml', 'media-rels', 'content-types']),
        ...rowsForValues('Audio Voice Narration', AUDIO_VOICE_FEATURES, 'native-plus-preserve', 'claudepptxmcp.object.insert_media', ['media-rels', 'timing-xml', 'voice-artifact']),
        ...rowsForValues('Sample Object Library', SAMPLE_OBJECT_FEATURES, 'native-plus-preserve', 'claudepptxmcp.capabilities.query', ['asset-manifest', 'sample-object-registry']),
        ...rowsForValues('Shape Based Icons', SHAPE_ICON_FEATURES, 'native', 'claudepptxmcp.presentation.create', ['shape-xml', 'icon-fixture']),
        ...rowsForValues('SmartArt Shape Built', SMARTART_SHAPE_BUILT_TYPES, 'native', 'claudepptxmcp.object.insert_smartart', ['shape-xml', 'relationships', 'not-visually-blank']),
        ...rowsForValues('SmartArt Native Package Preservation', SMARTART_NATIVE_PRESERVATION_TYPES, 'preserve-only', 'claudepptxmcp.object.insert_smartart', ['diagram-parts', 'diagram-rels', 'package-preservation']),
        ...rowsForValues('Transitions', TRANSITION_TYPES, 'native', 'claudepptxmcp.slide.add_with_transition', ['transition-xml', 'package-xml']),
        ...rowsForValues('Morph Semantics', MORPH_OPTIONS, 'native', 'claudepptxmcp.slide.add_with_transition', ['p159:morph', 'mc:AlternateContent', 'object-identity']),
        ...animationRows(capabilities),
        ...rowsForValues('Motion Paths', MOTION_PATHS, 'native', 'claudepptxmcp.object.apply_motion_path', ['p:animMotion', 'motion-path-registry']),
        ...rowsForValues('Animation Semantics', ANIMATION_FEATURES, 'native-plus-preserve', 'claudepptxmcp.object.apply_animation', ['timing-xml', 'build-list-xml']),
        ...rowsForValues('Interactive Presentation Features', INTERACTIVE_FEATURES, 'native-plus-preserve', 'claudepptxmcp.object.apply_action', ['action-xml', 'hyperlink-rels', 'runtime-safe-preservation']),
        ...rowsForValues('Accessibility', ACCESSIBILITY_FEATURES, 'native-plus-preserve', 'claudepptxmcp.presentation.validate', ['accessibility-metadata', 'cNvPr-order']),
        ...COLLABORATION_FEATURES.map(item => row('Collaboration Protection Enterprise Parts', item, item.includes('encrypted') ? 'detect-and-reject' : item.includes('coauthoring') ? 'validate-only' : 'preserve-only', 'claudepptxmcp.presentation.validate', ['package-preservation', 'security-policy'])),
        ...rowsForValues('Deep Package Manifests', DEEP_PACKAGE_PARTS, 'preserve-only', 'claudepptxmcp.presentation.snapshot', ['content-types', 'relationships', 'package-snapshot']),
        ...rowsForValues('Validation Oracle Features', VALIDATION_FEATURES, 'native', 'claudepptxmcp.presentation.validate', ['validation-report', 'artifact-manifest']),
    ];
    const deduped = uniqueRows(rows);
    return {
        brand,
        generatedAt: new Date(0).toISOString(),
        version: CLAUDEPPTXMCP_CAPABILITY_LEDGER_VERSION,
        rows: deduped,
        summary: summarizeRows(deduped),
    };
}
function uniqueRows(rows) {
    const seen = new Set();
    const out = [];
    for (const item of rows) {
        const key = item.featureId;
        if (seen.has(key))
            continue;
        seen.add(key);
        out.push(item);
    }
    return out;
}
export function summarizeRows(rows) {
    const byCategory = {};
    const byCoverageMode = {
        native: 0,
        'native-plus-preserve': 0,
        'native-chart': 0,
        'native-composite': 0,
        'shape-built-chart': 0,
        'preserve-only': 0,
        'validate-only': 0,
        'detect-and-reject': 0,
    };
    for (const item of rows) {
        byCategory[item.category] = (byCategory[item.category] || 0) + 1;
        byCoverageMode[item.coverageMode] += 1;
    }
    const requiredRows = rows.filter(item => item.requiredForCompletion).length;
    const implementedRows = rows.filter(item => item.implemented).length;
    return {
        totalRows: rows.length,
        requiredRows,
        implementedRows,
        lightDarkStableRows: rows.filter(item => item.lightDarkStable).length,
        byCategory,
        byCoverageMode,
        completionReady: rows.every(item => item.showcaseSlide && item.validationOracle.length > 0 && item.implemented),
    };
}
export function buildCoverageReport(ledger, artifacts = [], appliedSpecimens = []) {
    const missingShowcase = ledger.rows.filter(item => !item.showcaseSlide).map(item => item.featureId);
    const missingOracle = ledger.rows.filter(item => !item.validationOracle.length).map(item => item.featureId);
    const unimplemented = ledger.rows.filter(item => !item.implemented).map(item => item.featureId);
    const notLightDarkStable = ledger.rows.filter(item => !item.lightDarkStable).map(item => item.featureId);
    const appliedCoverageRequired = appliedSpecimens.length > 0;
    const appliedFeatureIds = new Set(appliedSpecimens.map(item => item.featureId));
    const missingAppliedSpecimen = appliedCoverageRequired
        ? ledger.rows.filter(item => item.requiredForCompletion && !appliedFeatureIds.has(item.featureId)).map(item => item.featureId)
        : [];
    const appliedAnimationIds = new Set(appliedSpecimens
        .filter(item => item.animationApplied !== false && ['animation-timing', 'motion-path-timing', 'media-animation-timing'].includes(item.appliedKind))
        .map(item => item.featureId));
    const missingAnimationTiming = appliedCoverageRequired
        ? ledger.rows
            .filter(item => item.requiredForCompletion && item.category.startsWith('Animations ') && item.coverageMode !== 'preserve-only' && !appliedAnimationIds.has(item.featureId))
            .map(item => item.featureId)
        : [];
    const specimenCountByCategory = appliedSpecimens.reduce((acc, item) => {
        acc[item.category] = (acc[item.category] || 0) + 1;
        return acc;
    }, {});
    return {
        brand: ledger.brand,
        ledgerVersion: ledger.version,
        summary: ledger.summary,
        artifacts,
        appliedSpecimens: {
            required: appliedCoverageRequired,
            total: appliedSpecimens.length,
            uniqueFeatureRows: appliedFeatureIds.size,
            byCategory: specimenCountByCategory,
        },
        gates: {
            allRowsHaveShowcase: missingShowcase.length === 0,
            allRowsHaveValidationOracle: missingOracle.length === 0,
            allRequiredRowsImplemented: unimplemented.length === 0,
            allRowsLightDarkStable: notLightDarkStable.length === 0,
            allRequiredRowsApplied: !appliedCoverageRequired || missingAppliedSpecimen.length === 0,
            allNativeAnimationRowsTimed: !appliedCoverageRequired || missingAnimationTiming.length === 0,
            completionReady: missingShowcase.length === 0 &&
                missingOracle.length === 0 &&
                unimplemented.length === 0 &&
                (!appliedCoverageRequired || (missingAppliedSpecimen.length === 0 && missingAnimationTiming.length === 0)),
        },
        failures: {
            missingShowcase,
            missingOracle,
            unimplemented,
            notLightDarkStable,
            missingAppliedSpecimen,
            missingAnimationTiming,
        },
    };
}
export function ledgerSemanticHash(ledger) {
    const payload = ledger.rows
        .map(item => `${item.featureId}|${item.coverageMode}|${item.mcpTool}|${item.validationOracle.join(',')}`)
        .sort()
        .join('\n');
    let hash = 0;
    for (let i = 0; i < payload.length; i++) {
        hash = ((hash << 5) - hash + payload.charCodeAt(i)) | 0;
    }
    return `claudepptxmcp-ledger-${Math.abs(hash).toString(16)}`;
}
//# sourceMappingURL=capability-ledger.js.map