import type { FeatureBudget } from './types.js'
import { recommendChartPresets } from './chart-presets.js'

export interface BetterPptxMcpRecipe {
	id: string
	title: string
	category: string
	description: string
	featureHighlights: string[]
	requiredFeatures: string[]
	recommendedComponents: string[]
	recommendedAssets: string[]
	chartTypes?: string[]
	recommendedChartPresets?: string[]
	shapeBuiltVisuals?: string[]
	defaultBudget?: Partial<FeatureBudget>
	example?: Record<string, unknown>
}

export interface PreparedGenerativeSpec {
	spec: any
	featureBudget: FeatureBudget
	recipesApplied: string[]
	designPlan: {
		mode: string
		featureBudget: FeatureBudget
		recipesApplied: string[]
		decisions: string[]
		recommendedChartPresets?: Array<{ id: string, title: string, authoringMode: string, selectionReason: string[] }>
	}
	featureUsePlan: {
		detectedBefore: string[]
		detectedAfter: string[]
		addedFeatures: string[]
		requiredFeatures: string[]
	}
	recommendedChartPresets?: string[]
	designGate: {
		ok: boolean
		errors: Array<{ code: string; message: string }>
		warnings: Array<{ code: string; message: string }>
		requiredFeatures: string[]
		missingRequiredFeatures: string[]
	}
}

export const RECIPE_CATALOG: BetterPptxMcpRecipe[] = [
	{
		id: 'premium-cinematic-system',
		title: 'Premium cinematic deck system',
		category: 'deck',
		description: 'A rich default deck treatment with gradient surfaces, depth, shadows, accent geometry, and timed content motion.',
		featureHighlights: ['gradient', 'shadow', 'animation', 'premium-layout'],
		requiredFeatures: ['gradient', 'shadow', 'animation'],
		recommendedComponents: ['cinematic-hero', 'animated-section-opener', 'call-to-action'],
		recommendedAssets: ['stock://premium-texture-fallback'],
		defaultBudget: { visualQuality: 'premium', featureDepth: 'advanced', motionLevel: 'subtle' },
	},
	{
		id: 'native-3d-hero-scene',
		title: 'Native 3D hero scene',
		category: '3d',
		description: 'Large native GLB object with poster fallback, lighting/camera options, shadow, orbit cue, and content timing.',
		featureHighlights: ['3d', 'model3d', 'shadow', 'animation'],
		requiredFeatures: ['3d', 'shadow', 'animation'],
		recommendedComponents: ['3d-lab-scene', '3d-model-gallery'],
		recommendedAssets: ['model3d://premium-orbit-torus', 'model3d://premium-ribbon-wave', 'model3d://premium-growth-arrow', 'stock://premium-3d-orbit-torus-poster'],
		defaultBudget: { featureDepth: 'advanced' },
	},
	{
		id: 'premium-3d-object-gallery',
		title: 'Premium native 3D object gallery',
		category: '3d',
		description: 'A compact gallery of visible native GLB fixtures with real poster fallbacks, shadows, orbit cues, and premium stage composition.',
		featureHighlights: ['3d', 'model3d', 'shadow', 'gradient', 'animation'],
		requiredFeatures: ['3d', 'shadow', 'animation'],
		recommendedComponents: ['3d-model-gallery'],
		recommendedAssets: ['model3d://premium-orbit-torus', 'model3d://premium-ribbon-wave', 'model3d://premium-growth-arrow', 'model3d://premium-blue-presenter'],
		defaultBudget: { visualQuality: 'cinematic', featureDepth: 'advanced', motionLevel: 'showcase' },
	},
	{
		id: 'executive-hybrid-chart-suite',
		title: 'Executive hybrid chart suite',
		category: 'charts',
		description: 'Native charts plus shape-built analytical visuals for dashboards, gauges, funnels, waterfalls, OHLC, and KPI panels.',
		featureHighlights: ['advancedCharts', 'gradient', 'shadow', 'shape-built-chart'],
		requiredFeatures: ['advancedCharts', 'gradient', 'shadow'],
		recommendedComponents: ['executive-dashboard', 'dense-chart-wall', 'data-story'],
		recommendedAssets: [],
		chartTypes: ['bar', 'bar3D', 'line', 'area', 'pie', 'doughnut', 'scatter', 'bubble', 'radar', 'treemap', 'sunburst', 'histogram', 'pareto', 'boxWhisker', 'waterfall', 'funnel', 'regionMap', 'combo'],
		recommendedChartPresets: ['column-clustered', 'bar-clustered', 'line-trend', 'doughnut-share', 'scatter-correlation', 'bubble-portfolio', 'radar-filled-capability', 'combo-column-line-dual-axis'],
		shapeBuiltVisuals: ['funnel', 'gauge', 'segmented-pie', 'candlestick', 'waterfall', 'histogram', 'pareto', 'box-whisker', 'gantt'],
		defaultBudget: { chartRichness: 'executive-dashboard' },
	},
	{
		id: 'wordart-effects-lab',
		title: 'WordArt effects lab',
		category: 'wordart',
		description: 'Warped WordArt with fill, outline, shadow, glow, reflection, 3D bevel, extrusion, and timing on the text itself.',
		featureHighlights: ['wordart', 'wordart3d', 'shadow', 'animation'],
		requiredFeatures: ['wordart3d', 'shadow', 'animation'],
		recommendedComponents: ['wordart-effects-panel'],
		recommendedAssets: [],
	},
	{
		id: 'motion-animation-lab',
		title: 'Motion and animation lab',
		category: 'animation',
		description: 'Entrance, exit, emphasis, color, scale, spin, and motion-path effects on real slide content.',
		featureHighlights: ['animation', 'motionPath', 'colorAnimation', 'transformAnimation'],
		requiredFeatures: ['animation'],
		recommendedComponents: ['motion-lab'],
		recommendedAssets: [],
		defaultBudget: { motionLevel: 'showcase' },
	},
	{
		id: 'media-audio-voice-lab',
		title: 'Media, audio, and voice lab',
		category: 'media',
		description: 'Autoplay video, audio/voice fixture, cover poster, and media command timing.',
		featureHighlights: ['media', 'voice', 'audio', 'animation'],
		requiredFeatures: ['media', 'voice'],
		recommendedComponents: ['media-voice-lab'],
		recommendedAssets: ['video://sample-mp4', 'audio://sample-mp3', 'stock://betterpptx-mcp-logo'],
	},
	{
		id: 'shape-built-icon-analytics',
		title: 'Shape-built icons and analytics',
		category: 'shapes',
		description: 'PowerPoint shape presets used as icons, chart-like visuals, process symbols, and decorative analytical fixtures.',
		featureHighlights: ['shape-icons', 'shape-built-chart', 'gradient', 'shadow'],
		requiredFeatures: ['gradient', 'shadow', 'advancedCharts'],
		recommendedComponents: ['shape-icon-cloud', 'custom-shape-sculpture', 'process-chevrons'],
		recommendedAssets: [],
		recommendedChartPresets: ['funnel-conversion', 'waterfall-bridge', 'treemap-hierarchy', 'histogram-distribution', 'box-whisker-distribution', 'stock-ohlc', 'surface-heatmap', 'map-region-choropleth'],
		shapeBuiltVisuals: ['arc', 'blockArc', 'chord', 'pie', 'trapezoid', 'chevron', 'flowChartProcess'],
	},
	{
		id: 'transition-scene-suite',
		title: 'Applied transition scenes',
		category: 'transitions',
		description: 'Before/after transition scenes with content cues, not transition names as a list.',
		featureHighlights: ['transition', 'morph', 'animation'],
		requiredFeatures: ['animation'],
		recommendedComponents: ['transition-scene'],
		recommendedAssets: [],
	},
]

const DEFAULT_BUDGET: FeatureBudget = {
	visualQuality: 'premium',
	featureDepth: 'advanced',
	motionLevel: 'subtle',
	chartRichness: 'hybrid',
	requireFeatures: [],
}

const REFERENCE_BUDGET: FeatureBudget = {
	visualQuality: 'reference',
	featureDepth: 'exhaustive',
	motionLevel: 'showcase',
	chartRichness: 'executive-dashboard',
	requireFeatures: ['3d', 'gradient', 'shadow', 'advancedCharts', 'media', 'voice', 'animation', 'wordart3d'],
}

const FEATURE_ALIASES: Record<string, string> = {
	'3D': '3d',
	'model3d': '3d',
	'model': '3d',
	'advancedcharts': 'advancedCharts',
	'charts': 'advancedCharts',
	'chart': 'advancedCharts',
	'dataviz': 'advancedCharts',
	'motion': 'animation',
	'animations': 'animation',
	'wordart': 'wordart3d',
	'wordart-3d': 'wordart3d',
	'audio': 'voice',
	'narration': 'voice',
	'native3d': 'native3d',
	'native-3d': 'native3d',
	'procedural3d': 'procedural3d',
	'procedural-3d': 'procedural3d',
	'generated3d': 'procedural3d',
	'customgeometry': 'customGeometry',
	'custom-geometry': 'customGeometry',
	'worldmap': 'worldMap',
	'world-map': 'worldMap',
	'map': 'worldMap',
	'autoplay': 'autoplay',
	'cinematicanimation': 'cinematicAnimation',
	'cinematic-animation': 'cinematicAnimation',
}

function clone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value ?? {}))
}

function unique(values: string[]): string[] {
	return [...new Set(values.filter(Boolean))].sort()
}

function safeId(value: string): string {
	return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'dynamic'
}

function featureKey(value: unknown): string {
	const raw = String(value || '').trim()
	const compact = raw.replace(/[^a-zA-Z0-9]+/g, '')
	return FEATURE_ALIASES[raw] || FEATURE_ALIASES[compact.toLowerCase()] || raw
}

function coerceEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
	return allowed.includes(value as T) ? value as T : fallback
}

function sourceBudget(input: any): Record<string, unknown> {
	return {
		...(input?.intent || {}),
		...(input?.spec?.intent || {}),
		...(input?.spec?.featureBudget || {}),
		...(input?.featureBudget || {}),
		visualQuality: input?.visualQuality ?? input?.featureBudget?.visualQuality ?? input?.spec?.visualQuality ?? input?.spec?.featureBudget?.visualQuality ?? input?.intent?.visualQuality ?? input?.spec?.intent?.visualQuality,
		featureDepth: input?.featureDepth ?? input?.featureBudget?.featureDepth ?? input?.spec?.featureDepth ?? input?.spec?.featureBudget?.featureDepth ?? input?.intent?.featureDepth ?? input?.spec?.intent?.featureDepth,
		motionLevel: input?.motionLevel ?? input?.featureBudget?.motionLevel ?? input?.spec?.motionLevel ?? input?.spec?.featureBudget?.motionLevel ?? input?.intent?.motionLevel ?? input?.spec?.intent?.motionLevel,
		chartRichness: input?.chartRichness ?? input?.featureBudget?.chartRichness ?? input?.spec?.chartRichness ?? input?.spec?.featureBudget?.chartRichness ?? input?.intent?.chartRichness ?? input?.spec?.intent?.chartRichness,
		requireFeatures: input?.requireFeatures ?? input?.featureBudget?.requireFeatures ?? input?.spec?.requireFeatures ?? input?.spec?.featureBudget?.requireFeatures ?? input?.spec?.mustDemonstrate ?? input?.intent?.requireFeatures ?? input?.spec?.intent?.requireFeatures,
	}
}

export function normalizeFeatureBudget(input: any = {}, fallback: Partial<FeatureBudget> = {}): FeatureBudget {
	const raw = sourceBudget(input)
	const base = { ...DEFAULT_BUDGET, ...fallback }
	const requireFeatures = unique([
		...(Array.isArray(base.requireFeatures) ? base.requireFeatures : []),
		...(Array.isArray(raw.requireFeatures) ? raw.requireFeatures.map(featureKey) : []),
	])
	return {
		visualQuality: coerceEnum(raw.visualQuality, ['standard', 'premium', 'cinematic', 'reference', 'clean', 'luxury', 'editorial'] as const, base.visualQuality || DEFAULT_BUDGET.visualQuality),
		featureDepth: coerceEnum(raw.featureDepth, ['basic', 'advanced', 'exhaustive', 'standard', 'stress-test'] as const, base.featureDepth || DEFAULT_BUDGET.featureDepth),
		motionLevel: coerceEnum(raw.motionLevel, ['none', 'subtle', 'showcase', 'dynamic', 'cinematic', 'autoplay-live'] as const, base.motionLevel || DEFAULT_BUDGET.motionLevel),
		chartRichness: coerceEnum(raw.chartRichness, ['native', 'hybrid', 'executive-dashboard'] as const, base.chartRichness || DEFAULT_BUDGET.chartRichness),
		requireFeatures,
	}
}

export function listRecipes(args: any = {}): BetterPptxMcpRecipe[] {
	const category = String(args?.category || '').toLowerCase()
	const query = String(args?.query || '').toLowerCase()
	const terms = query.split(/[^a-z0-9]+/).filter(Boolean)
	const limit = Math.max(1, Math.min(Number(args?.limit || RECIPE_CATALOG.length), RECIPE_CATALOG.length))
	return RECIPE_CATALOG
		.filter(recipe => !category || recipe.category === category)
		.map(recipe => {
			const text = JSON.stringify(recipe).toLowerCase()
			const score = terms.length ? terms.filter(term => text.includes(term)).length : 1
			return { recipe, score }
		})
		.filter(item => !terms.length || item.score > 0)
		.sort((a, b) => b.score - a.score || a.recipe.id.localeCompare(b.recipe.id))
		.map(item => item.recipe)
		.slice(0, limit)
}

export function recipeById(id: string): BetterPptxMcpRecipe | undefined {
	return RECIPE_CATALOG.find(recipe => recipe.id === id)
}

function impliedRequiredFeatures(budget: FeatureBudget): string[] {
	const required = [...budget.requireFeatures]
	if (['premium', 'cinematic', 'reference', 'luxury', 'editorial'].includes(budget.visualQuality)) required.push('gradient', 'shadow')
	if (['advanced', 'exhaustive', 'stress-test'].includes(budget.featureDepth)) required.push('advancedCharts', 'animation', '3d')
	if (['exhaustive', 'stress-test'].includes(budget.featureDepth) || budget.visualQuality === 'reference') required.push('media', 'voice', 'wordart3d')
	if (['hybrid', 'executive-dashboard'].includes(budget.chartRichness)) required.push('advancedCharts')
	if (['showcase', 'dynamic', 'cinematic', 'autoplay-live'].includes(budget.motionLevel)) required.push('animation')
	if (budget.requireFeatures.some(feature => ['procedural3d', 'native3d', 'customGeometry', 'worldMap', 'morph', 'autoplay', 'cinematicAnimation'].includes(feature))) {
		required.push(...budget.requireFeatures)
	}
	return unique(required.map(featureKey))
}

export function recommendRecipes(query = '', budget: FeatureBudget = DEFAULT_BUDGET): BetterPptxMcpRecipe[] {
	const text = query.toLowerCase()
	const required = impliedRequiredFeatures(budget)
	return RECIPE_CATALOG
		.map(recipe => {
			let score = recipe.requiredFeatures.filter(feature => required.includes(feature)).length * 4
			score += recipe.featureHighlights.filter(feature => required.includes(feature)).length * 2
			if (text && JSON.stringify(recipe).toLowerCase().includes(text)) score += 5
			if (budget.chartRichness === 'executive-dashboard' && recipe.id === 'executive-hybrid-chart-suite') score += 5
			if (budget.featureDepth !== 'basic' && recipe.id === 'native-3d-hero-scene') score += 3
			if (required.includes('3d') && recipe.id === 'premium-3d-object-gallery') score += 4
			return { recipe, score }
		})
		.filter(item => item.score > 0)
		.sort((a, b) => b.score - a.score || a.recipe.id.localeCompare(b.recipe.id))
		.map(item => item.recipe)
}

export function composeDynamicRecipe(args: any = {}): any {
	const brief = String(args?.brief || args?.query || args?.title || '')
	const title = String(args?.title || brief.split(/[.!?\r\n]/).find(Boolean) || 'AI-authored presentation').trim()
	const featureBudget = normalizeFeatureBudget(args, { visualQuality: 'cinematic', featureDepth: 'advanced', motionLevel: 'showcase', chartRichness: 'hybrid' })
	const requiredFeatures = impliedRequiredFeatures(featureBudget)
	const text = `${title} ${brief} ${featureBudget.requireFeatures.join(' ')}`.toLowerCase()
	const topicId = safeId(title).slice(0, 48)
	const wants3D = requiredFeatures.some(feature => ['3d', 'native3d', 'procedural3d'].includes(feature)) || /\b(3d|model|object|globe|terrain|scene|product|nature|space|earth)\b/.test(text)
	const wantsMap = requiredFeatures.some(feature => ['customGeometry', 'worldMap'].includes(feature)) || /\b(map|world|earth|country|region|route|territory|geography)\b/.test(text)
	const wantsVoice = requiredFeatures.includes('voice') || /\b(voice|audio|narration|autoplay|kiosk)\b/.test(text)
	const wantsMorph = requiredFeatures.includes('morph') || /\b(morph|transform|before|after|journey|evolution)\b/.test(text)
	const wantsCharts = requiredFeatures.includes('advancedCharts') || /\b(chart|charts|data|dashboard|metric|kpi|trend|comparison|share|funnel|waterfall|histogram|treemap|radar|surface|map)\b/.test(text)
	const explicitProcedural3D = requiredFeatures.includes('procedural3d') || /\b(procedural|generated 3d|generate 3d|on[- ]the[- ]fly|custom 3d)\b/.test(text)
	const chartRecommendations = wantsCharts ? recommendChartPresets(brief || title, featureBudget).slice(0, 6) : []
	const preferredBundledAssets = wants3D
		? ['model3d://premium-growth-arrow', 'model3d://premium-ribbon-wave', 'model3d://premium-orbit-torus', 'model3d://premium-blue-presenter']
		: []
	const assetKinds = unique([
		...(explicitProcedural3D ? ['abstract-hero'] : []),
		...(/\b(earth|world|planet|global|space)\b/.test(text) ? ['globe'] : []),
		...(/\b(terrain|land|mountain|landscape|ground|region)\b/.test(text) ? ['terrain'] : []),
		...(/\b(rainforest|forest|canopy|tree|leaf|nature|botanical)\b/.test(text) ? ['leaf', 'tree-canopy'] : []),
		...(/\b(river|flow|route|path|stream|water)\b/.test(text) ? ['river-ribbon', 'route-arc'] : []),
		...(/\b(growth|restore|increase|trend|business|kpi)\b/.test(text) ? ['growth-arrow'] : []),
		...(/\b(rainforest|biome|ecosystem|system|habitat|environment)\b/.test(text) ? ['biome-scene'] : []),
	])
	const geometryKinds = unique([
		...(wantsMap ? ['world-map', 'region-highlight'] : []),
		...(/\b(route|flow|river|path|journey)\b/.test(text) ? ['river-path'] : []),
		...(/\b(mask|risk|loss|pressure|change|before|after)\b/.test(text) ? ['deforestation-mask'] : []),
		...(/\b(rainforest|layer|canopy|network|cluster)\b/.test(text) ? ['canopy-layer'] : []),
		...(/\b(contour|terrain|elevation|topography)\b/.test(text) ? ['contour'] : []),
		...(requiredFeatures.includes('customGeometry') && !wantsMap ? ['organic-blob'] : []),
	])
	const assetRequests = assetKinds.map(kind => ({
		tool: 'betterpptx-mcp.asset.generate',
		kind,
		seed: `${topicId}-${kind}`,
		theme: safeId(String(args?.theme || title)).slice(0, 40),
		style: String(args?.style || featureBudget.visualQuality || 'cinematic'),
		useAs: kind === 'globe' ? 'hero/native 3D object' : kind.includes('ribbon') || kind.includes('arc') ? 'motion path or flow object' : 'scene object',
	}))
	const geometryRequests = geometryKinds.map(kind => ({
		tool: 'betterpptx-mcp.geometry.generate',
		kind,
		seed: `${topicId}-${kind}`,
		style: String(args?.style || featureBudget.visualQuality || 'cinematic'),
		useAs: kind === 'world-map' ? 'editable map stage' : kind === 'region-highlight' ? 'semantic focus overlay' : 'custom geometry scene object',
	}))
	const toolPlan = [
		{ step: 1, tool: 'betterpptx-mcp.capabilities.query', reason: 'confirm current capability surface and recommended recipes' },
		...(wants3D ? [{ step: 2, tool: 'betterpptx-mcp.asset.list', source: 'bundled', category: 'models3d', tag: 'premium', reason: 'prefer maintained premium 3D assets before procedural placeholders' }] : []),
		...(wantsCharts ? [{ step: 2, tool: 'betterpptx-mcp.chart.recommend', query: brief || title, reason: 'select the most context-adapted native, composite, or shape-built chart presets before authoring chart scenes' }] : []),
		...assetRequests.map((request, index) => ({ step: 3 + index, ...request })),
		...geometryRequests.map((request, index) => ({ step: 3 + assetRequests.length + index, ...request })),
		{ step: 3 + assetRequests.length + geometryRequests.length, tool: 'betterpptx-mcp.presentation.create', mode: 'expressive or design-system', reason: 'AI-authored story/spec using maintained assets, generated geometry, and optional generated assets' },
		{ step: 4 + assetRequests.length + geometryRequests.length, tool: 'betterpptx-mcp.presentation.validate', reason: 'package and metadata validation' },
	]
	return {
		brand: 'betterpptx-mcp',
		id: `dynamic-${topicId}`,
		type: 'dynamic-recipe-scaffold',
		title,
		brief,
		featureBudget,
		requiredFeatures,
		assetPolicy: {
			defaultStrategy: 'library-first',
			maintainedAssetsFirst: preferredBundledAssets,
			clientProvidedPreferredForSpecificObjects: true,
			proceduralUse: explicitProcedural3D ? 'allowed because procedural/custom 3D was explicitly requested or inferred' : 'fallback only; use maintained bundled or client-provided GLB models for premium output',
		},
		recommendedRecipes: recommendRecipes(brief, featureBudget).slice(0, 5),
		recommendedChartPresets: chartRecommendations.map(item => ({
			id: item.preset.id,
			title: item.preset.title,
			powerPointCategory: item.preset.powerPointCategory,
			powerPointPreset: item.preset.powerPointPreset,
			authoringMode: item.preset.authoringMode,
			chartType: item.preset.chartType,
			chartTypes: item.preset.chartTypes,
			shapeBuiltVisual: item.preset.shapeBuiltVisual,
			dataShape: item.preset.dataShape,
			selectionReason: item.selectionReason,
		})),
		preferredBundledAssets,
		generatedAssetRequests: assetRequests,
		generatedGeometryRequests: geometryRequests,
		toolPlan,
		authoringContract: {
			clientOwns: ['storyline', 'visual metaphors', 'scene text', 'data values', 'object placement refinements'],
			mcpOwns: ['maintained asset catalog', 'optional GLB generation', 'custom geometry generation', 'PPTX compilation', 'artifact management', 'package validation'],
			doNotUse: ['single-slide smoke-test decks for broad creative prompts', 'procedural 3D placeholders when maintained or client-provided assets fit the brief', 'frozen showcase as a substitute for bespoke creative output', 'hardcoded topic recipes when a dynamic scaffold can cover the request'],
		},
		expressiveSpecScaffold: {
			mode: 'expressive',
			title,
			brief,
			creativeSeed: topicId,
			featureBudget,
			minSlides: args?.minSlides || (featureBudget.featureDepth === 'exhaustive' ? 12 : featureBudget.visualQuality === 'cinematic' ? 8 : 6),
			slides: [
				{ intent: 'cinematic hero', mustUse: [...(preferredBundledAssets[0] ? [`maintained asset: ${preferredBundledAssets[0]}`] : []), ...(assetRequests[0] ? [`optional generated asset: ${assetRequests[0].kind}`] : []), 'gradient', 'shadow', ...(wantsVoice ? ['audio/voice cue'] : [])] },
				{ intent: 'semantic map or custom geometry scene', mustUse: geometryRequests.map(request => `generated geometry: ${request.kind}`) },
				{ intent: 'dynamic transformation scene', mustUse: [...(wantsMorph ? ['morph transition with stable object names'] : ['content-level animation']), 'motion path or emphasis animation'] },
				{ intent: 'evidence/data scene', mustUse: ['native chart or shape-built analytic visual', ...chartRecommendations.slice(0, 3).map(item => `chart preset: ${item.preset.id}`), 'animated callouts'] },
			],
		},
	}
}

function objectKind(object: any): string {
	return String(object?.kind || object?.objectType || (object?.shapeType ? 'shape' : '') || '').trim()
}

function namedObject(object: any): string {
	return String(object?.name || object?.objectName || '').trim()
}

function model3DObjectNames(objects: any[] = []): string[] {
	const names: string[] = []
	for (const object of objects) {
		if (objectKind(object) === 'model3d' && namedObject(object)) names.push(namedObject(object))
		if (Array.isArray(object?.objects)) names.push(...model3DObjectNames(object.objects))
	}
	return names
}

function animationTargetsLive3D(animation: any): boolean {
	const kind = String(animation?.kind || animation?.type || '').toLowerCase()
	const effect = String(animation?.effect || animation?.motionPath || animation?.path || '').toLowerCase()
	return kind === 'motionpath'
		|| kind === 'motion'
		|| ['spin', 'growandturn', 'centerrevolve', 'boomerang', 'teeter'].includes(effect)
}

function ensureModel3DAnimations(slide: any): boolean {
	const modelNames = model3DObjectNames(Array.isArray(slide?.objects) ? slide.objects : [])
	if (!modelNames.length) return false
	if (!Array.isArray(slide.animations)) slide.animations = []
	let changed = false
	for (const name of modelNames) {
		const existing = slide.animations.filter((animation: any) => String(animation?.target || '') === name)
		if (existing.some(animationTargetsLive3D)) continue
		slide.animations.push(
			{ target: name, kind: 'emphasis', effect: 'spin', rotation: 16, duration: 1400, trigger: existing.length ? 'afterPrevious' : 'afterPrevious' },
			{ target: name, kind: 'motionPath', path: 'sineWave', duration: 1600, trigger: 'withPrevious' }
		)
		changed = true
	}
	return changed
}

function scanFeature(value: unknown, features: Set<string>): void {
	if (!value || typeof value !== 'object') return
	if (Array.isArray(value)) {
		value.forEach(item => scanFeature(item, features))
		return
	}
	const object = value as Record<string, any>
	const kind = objectKind(object)
	if (kind) features.add(kind)
	if (object.transition) {
		features.add('transition')
		if (String(object.transition.type || '').toLowerCase() === 'morph') features.add('morph')
		if (object.transition.advanceOnClick === false || object.transition.advanceAfterTime || object.transition.advTm) features.add('autoplay')
	}
	if (kind === 'model3d') {
		features.add('3d')
		features.add('native3d')
		if (String(object.src || object.path || object.glbFile || '').startsWith('procedural3d://')) features.add('procedural3d')
	}
	if (kind === 'media') {
		features.add('media')
		const mediaType = String(object.mediaType || object.type || '').toLowerCase()
		if (mediaType === 'audio' || String(object.src || object.path || '').startsWith('audio://')) features.add('voice')
	}
	if (kind === 'wordart') {
		features.add('wordart')
		if (object.text3D || object.shadow || object.glow || object.reflection || object.wordArt || object.transform) features.add('wordart3d')
	}
	if (kind === 'chart') {
		features.add('chart')
		const chartType = JSON.stringify(object.chartType || object.type || '').toLowerCase()
		if (/scatter|bubble|radar|doughnut|bar3d|area|combo|line/.test(chartType)) features.add('advancedCharts')
	}
	if (kind === 'shape') {
		const shapeType = String(object.shapeType || object.type || '').toLowerCase()
		if (/trapezoid|arc|blockarc|chord|pie|wedge|candlestick|waterfall/.test(shapeType)) features.add('advancedCharts')
		if (shapeType === 'custgeom') features.add('customGeometry')
		if (Array.isArray(object.coverageTags)) object.coverageTags.forEach((tag: unknown) => features.add(featureKey(tag)))
		if (/map|world|focus-region|region-highlight/.test(String(object.geometryKind || object.name || '').toLowerCase())) features.add('worldMap')
	}
	if (object.fill?.type === 'gradient' || object.background?.type === 'gradient') features.add('gradient')
	if (object.shadow) features.add('shadow')
	if (object.effect3D || object.text3D || object.scene3d || object.sp3d) features.add('3d')
	if (Array.isArray(object.animations) && object.animations.length) features.add('animation')
	if (Array.isArray(object.animations) && object.animations.some((animation: any) => String(animation.kind || '').toLowerCase() === 'motionpath')) features.add('cinematicAnimation')
	for (const item of Object.values(object)) scanFeature(item, features)
}

export function detectSpecFeatures(spec: any): string[] {
	const features = new Set<string>(['deck', 'metadata'])
	scanFeature(spec, features)
	return [...features].sort()
}

function gradientFill(a = '20D6E7', b = '8B5CF6', c = 'FFB84D', angle = 25): any {
	return {
		type: 'gradient',
		gradientDirection: 'linear',
		gradientAngle: angle,
		gradientStops: [
			{ position: 0, color: a, transparency: 4 },
			{ position: 55, color: b, transparency: 8 },
			{ position: 100, color: c, transparency: 2 },
		],
	}
}

function premiumShadow(opacity = 0.28): any {
	return { type: 'outer', color: '000000', opacity, blur: 8, offset: 1.4, angle: 45 }
}

function premiumLine(color = 'FFFFFF', transparency = 42): any {
	return { color, transparency, width: 0.8 }
}

function sampleNativeChartData(type: string): any[] {
	const lower = type.toLowerCase()
	if (lower.includes('scatter')) {
		return [
			{ name: 'X', values: [1, 2, 3, 4, 5, 6, 7, 8] },
			{ name: 'Signal', values: [2, 5, 4, 9, 7, 11, 10, 13] },
			{ name: 'Control', values: [1, 3, 6, 7, 10, 9, 11, 12] },
		]
	}
	if (lower.includes('bubble')) {
		return [
			{ name: 'X', values: [1, 2, 3, 4, 5, 6] },
			{ name: 'Portfolio', values: [3, 5, 8, 6, 9, 11], sizes: [12, 22, 8, 30, 18, 26] },
			{ name: 'Market', values: [2, 4, 5, 7, 8, 10], sizes: [8, 14, 18, 12, 24, 20] },
		]
	}
	if (lower.includes('pie') || lower.includes('doughnut')) {
		return [{ name: 'Share', labels: ['Create', 'Edit', 'Animate', 'Validate', 'Publish'], values: [28, 22, 20, 18, 12] }]
	}
	if (lower.includes('radar')) {
		return [
			{ name: 'Current', labels: ['Design', 'Charts', 'Motion', 'Media', '3D'], values: [9, 8.5, 9, 8, 7.5] },
			{ name: 'Target', labels: ['Design', 'Charts', 'Motion', 'Media', '3D'], values: [8, 8, 8, 8, 8] },
		]
	}
	const labels = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5']
	return [
		{ name: 'North', labels, values: [18, 24, 31, 39, 45] },
		{ name: 'South', labels, values: [14, 20, 25, 32, 38] },
	]
}

function premiumChartOptions(title: string): any {
	return {
		showTitle: true,
		title,
		showLegend: true,
		legendPos: 'b',
		legendFontSize: 7,
		showValue: /pie|doughnut/i.test(title),
		showLabel: /pie/i.test(title),
		chartColors: ['20D6E7', '8B5CF6', 'FFB84D', '2FE6A6', 'FF5C8A'],
		catAxisLabelColor: '9FB2C3',
		valAxisLabelColor: '9FB2C3',
		catAxisLabelFontSize: 6,
		valAxisLabelFontSize: 6,
		valGridLine: { color: '2D4C63', style: 'dash', size: 0.3 },
		chartArea: { fill: { color: '102233' }, border: { color: '20D6E7', pt: 0.5 } },
		plotArea: { fill: { color: '071018' }, border: { color: '2D4C63', pt: 0.35 } },
	}
}

function ensureSlide(spec: any, slide: any): void {
	if (!Array.isArray(spec.slides)) spec.slides = []
	ensureUniqueSlideObjectNames(spec, slide)
	spec.slides.push(slide)
}

function collectObjectNames(object: any, names: Set<string>): void {
	const name = object?.name || object?.objectName
	if (name) names.add(String(name))
	if (Array.isArray(object?.objects)) object.objects.forEach((child: any) => collectObjectNames(child, names))
}

function collectExistingObjectNames(spec: any): Set<string> {
	const names = new Set<string>()
	for (const slide of Array.isArray(spec?.slides) ? spec.slides : []) {
		for (const object of Array.isArray(slide?.objects) ? slide.objects : []) collectObjectNames(object, names)
	}
	return names
}

function makeUniqueName(base: string, existing: Set<string>, slideOrdinal: number): string {
	const root = safeId(base || 'object').slice(0, 52) || 'object'
	let candidate = `${root}-s${slideOrdinal}`
	let counter = 2
	while (existing.has(candidate)) {
		candidate = `${root}-s${slideOrdinal}-${counter}`
		counter++
	}
	return candidate
}

function ensureUniqueObjectNames(object: any, existing: Set<string>, renamed: Map<string, string>, slideOrdinal: number): void {
	const current = object?.name || object?.objectName
	if (current) {
		const key = String(current)
		if (existing.has(key)) {
			const next = makeUniqueName(key, existing, slideOrdinal)
			if (object.name) object.name = next
			if (object.objectName) object.objectName = next
			if (!object.name && !object.objectName) object.name = next
			renamed.set(key, next)
			existing.add(next)
		} else {
			existing.add(key)
		}
	}
	if (Array.isArray(object?.objects)) {
		object.objects.forEach((child: any) => ensureUniqueObjectNames(child, existing, renamed, slideOrdinal))
	}
}

function ensureUniqueSlideObjectNames(spec: any, slide: any): void {
	const existing = collectExistingObjectNames(spec)
	const renamed = new Map<string, string>()
	const slideOrdinal = (Array.isArray(spec?.slides) ? spec.slides.length : 0) + 1
	for (const object of Array.isArray(slide?.objects) ? slide.objects : []) {
		ensureUniqueObjectNames(object, existing, renamed, slideOrdinal)
	}
	if (!renamed.size || !Array.isArray(slide?.animations)) return
	for (const animation of slide.animations) {
		const target = animation?.target || animation?.objectName
		if (target && renamed.has(String(target))) {
			const next = renamed.get(String(target))
			if (animation.target) animation.target = next
			if (animation.objectName) animation.objectName = next
		}
	}
}

function explicitSingleSlideRequest(args: any, spec: any): boolean {
	if (args?.allowSingleSlide === true || spec?.allowSingleSlide === true) return true
	if (Number(args?.minSlides || spec?.minSlides || 0) === 1) return true
	const scope = String(args?.deckScope || spec?.deckScope || args?.intent?.deckScope || spec?.intent?.deckScope || '').toLowerCase()
	if (['single-slide', 'one-slide', 'slide-only'].includes(scope)) return true
	const text = `${args?.title || ''} ${args?.brief || ''} ${args?.query || ''} ${spec?.title || ''} ${spec?.brief || ''}`.toLowerCase()
	return /\b(single|one|1)[ -]?slide\b/.test(text) || /\b(title|cover)[ -]?slide only\b/.test(text) || /\bminimal smoke\b|\bsmoke test\b/.test(text)
}

function requestedMinSlides(args: any, spec: any, budget: FeatureBudget): number {
	if (explicitSingleSlideRequest(args, spec)) return 1
	const raw = Number(args?.minSlides ?? spec?.minSlides ?? args?.intent?.minSlides ?? spec?.intent?.minSlides)
	if (Number.isFinite(raw) && raw > 1) return Math.max(2, Math.min(80, Math.floor(raw)))
	if (budget.featureDepth === 'exhaustive' || budget.featureDepth === 'stress-test' || budget.visualQuality === 'reference') return 12
	if (budget.visualQuality === 'cinematic' || ['showcase', 'dynamic', 'cinematic', 'autoplay-live'].includes(budget.motionLevel) || budget.chartRichness === 'executive-dashboard') return 8
	if (budget.visualQuality === 'premium' || budget.featureDepth === 'advanced' || budget.chartRichness === 'hybrid') return 6
	return 3
}

function ensureMinimumCreativeDepth(spec: any, args: any, budget: FeatureBudget, decisions: string[]): void {
	if (!Array.isArray(spec.slides)) spec.slides = []
	const minSlides = requestedMinSlides(args, spec, budget)
	if (spec.slides.length >= minSlides) return
	if (minSlides === 1) {
		decisions.push('Allowed a single-slide deck because the request explicitly requested a single-slide/minimal output.')
		return
	}
	const title = String(args?.title || spec.title || 'betterpptx-mcp premium presentation')
	const startCount = spec.slides.length
	const adders: Array<() => void> = [
		() => addPremiumHero(spec, title),
		() => add3DScene(spec),
		() => addExecutiveCharts(spec),
		() => addCustomGeometryScene(spec, 'Generated custom geometry and map scene'),
		() => addMotionScene(spec),
		() => addWordArtScene(spec),
		() => addMediaVoiceScene(spec),
	]
	let i = 0
	while (spec.slides.length < minSlides) {
		adders[i % adders.length]()
		i++
	}
	decisions.push(`Expanded creative deck from ${startCount} to ${spec.slides.length} slides. Broad creative requests must be substantial and dense unless allowSingleSlide/minSlides=1 is explicit.`)
}

function ensurePremiumOnExistingSlides(spec: any, budget: FeatureBudget, decisions: string[]): void {
	if (!Array.isArray(spec.slides)) spec.slides = []
	for (const [slideIndex, slide] of spec.slides.entries()) {
		if (!slide.background && ['premium', 'cinematic', 'reference', 'luxury', 'editorial'].includes(budget.visualQuality)) {
			slide.background = { color: '071018' }
		}
		if (!slide.transition && budget.motionLevel !== 'none') {
			slide.transition = { type: 'fade', speed: 'fast', advanceOnClick: false, advanceAfterTime: 7200 }
		}
		const objects = Array.isArray(slide.objects) ? slide.objects : []
		for (const [objectIndex, object] of objects.entries()) {
			const kind = objectKind(object)
			if (kind === 'shape') {
				if (!object.fill && budget.visualQuality !== 'standard') object.fill = gradientFill('20D6E7', '102233', '8B5CF6', 20 + objectIndex * 9)
				if (!object.shadow && budget.visualQuality !== 'standard') object.shadow = premiumShadow(0.24)
				if (!object.line) object.line = premiumLine('FFFFFF', 55)
				if (!object.effect3D && ['cinematic', 'reference'].includes(budget.visualQuality)) {
					object.effect3D = { bevel: { type: 'circle', width: 5, height: 5 }, extrusion: 2, material: 'warmMatte', lightRig: 'threePt', rotationX: 8, rotationY: 10, perspective: 35 }
				}
			}
			if ((kind === 'text' || kind === 'wordart') && !object.shadow && budget.visualQuality !== 'standard') {
				object.shadow = { type: 'outer', color: '000000', opacity: 0.22, blur: 3, offset: 0.8, angle: 45 }
			}
			if (kind === 'chart') {
				object.data = object.data || object.series || (Array.isArray(object.values) ? [{ name: object.name || 'Series', labels: object.labels || object.values.map((_: unknown, i: number) => `P${i + 1}`), values: object.values }] : sampleNativeChartData(String(object.chartType || object.type || 'bar')))
				object.showTitle = object.showTitle ?? true
				object.showLegend = object.showLegend ?? true
				object.chartColors = object.chartColors || ['20D6E7', '8B5CF6', 'FFB84D', '2FE6A6']
				object.chartArea = object.chartArea || { fill: { color: '102233' }, border: { color: '20D6E7', pt: 0.5 } }
				object.plotArea = object.plotArea || { fill: { color: '071018' }, border: { color: '2D4C63', pt: 0.35 } }
			}
		}
		if (budget.motionLevel !== 'none' && ensureModel3DAnimations(slide) && slideIndex === 0) {
			decisions.push('Injected live 3D spin and motion-path cues for model3d objects that only had static or entrance timing.')
		}
		if (budget.motionLevel !== 'none' && !Array.isArray(slide.animations)) {
			const target = objects.find((object: any) => object?.name || object?.objectName)
			if (target) {
				const name = target.name || target.objectName
				slide.animations = [{ target: name, kind: 'entrance', effect: 'fade', duration: 650, trigger: 'afterPrevious' }]
			}
		}
		if (slideIndex === 0 && objects.length && budget.visualQuality !== 'standard') decisions.push('Applied premium defaults to existing objects: gradient fills, shadows, chart styling, and content timing where missing.')
	}
}

function addPremiumHero(spec: any, title: string): void {
	ensureSlide(spec, {
		transition: { type: 'fade', speed: 'fast', advanceOnClick: false, advanceAfterTime: 7800 },
		background: { color: '071018' },
		objects: [
			{ kind: 'shape', name: 'recipe-hero-bg', shapeType: 'rect', x: 0, y: 0, w: 13.333, h: 7.5, fill: gradientFill('071018', '13283A', '102233', 22), line: { color: '071018', transparency: 100 } },
			{ kind: 'shape', name: 'recipe-hero-orbit', shapeType: 'arc', x: 8.4, y: 0.9, w: 3.4, h: 3.4, line: { color: '20D6E7', width: 2.2, beginArrowType: 'triangle', endArrowType: 'triangle', transparency: 12 } },
			{ kind: 'text', name: 'recipe-hero-title', text: title, x: 0.72, y: 1.32, w: 7.8, h: 0.86, fontFace: 'Aptos Display', fontSize: 34, bold: true, color: 'F7FAFC', margin: 0, fit: 'shrink', shadow: premiumShadow(0.35) },
			{ kind: 'text', name: 'recipe-hero-subtitle', text: 'Premium betterpptx-mcp recipe expansion: gradients, shadows, advanced charts, 3D, and motion are applied by default.', x: 0.78, y: 2.48, w: 7.4, h: 0.8, fontSize: 14, color: 'CBD5E1', margin: 0.03, fit: 'shrink' },
			{ kind: 'wordart', name: 'recipe-hero-wordart', text: 'LIVE', x: 8.75, y: 2.05, w: 2.5, h: 0.85, fontFace: 'Aptos Display', fontSize: 34, bold: true, color: '20D6E7', wordArt: { transform: 'textArchUp' }, text3D: { bevel: { type: 'circle', width: 5, height: 5 }, extrusion: 3, extrusionColor: '8B5CF6', material: 'warmMatte', lightRig: 'threePt', rotationX: 8, rotationY: 12 }, shadow: premiumShadow(0.28), glow: { color: '20D6E7', size: 4, opacity: 0.32 }, reflection: { type: 'tight', opacity: 0.16, blur: 1, distance: 1.4 } },
		],
		animations: [
			{ target: 'recipe-hero-title', kind: 'entrance', effect: 'fade', duration: 750, trigger: 'afterPrevious' },
			{ target: 'recipe-hero-wordart', kind: 'emphasis', effect: 'spin', rotation: 8, duration: 900, trigger: 'afterPrevious' },
			{ target: 'recipe-hero-orbit', kind: 'motionPath', path: 'circle', duration: 1200, trigger: 'withPrevious' },
		],
		notes: 'betterpptx-mcp recipe: premium-cinematic-system',
	})
}

function addExecutiveCharts(spec: any): void {
	ensureSlide(spec, {
		transition: { type: 'wipe', direction: 'left', speed: 'fast', advanceOnClick: false, advanceAfterTime: 9800 },
		background: { color: '071018' },
		objects: [
			{ kind: 'text', name: 'recipe-chart-title', text: 'Executive data cockpit', x: 0.72, y: 0.52, w: 8.8, h: 0.42, fontFace: 'Aptos Display', fontSize: 24, bold: true, color: 'F7FAFC', margin: 0, shadow: premiumShadow(0.25) },
			{ kind: 'shape', name: 'recipe-chart-panel-a', shapeType: 'roundRect', x: 0.7, y: 1.2, w: 5.6, h: 3.15, fill: { color: '102233', transparency: 2 }, line: { color: '20D6E7', transparency: 35 }, shadow: premiumShadow(0.22) },
			{ kind: 'chart', name: 'recipe-chart-bar', chartType: 'bar', data: sampleNativeChartData('bar'), x: 0.92, y: 1.45, w: 5.15, h: 2.62, ...premiumChartOptions('Regional growth') },
			{ kind: 'shape', name: 'recipe-chart-panel-b', shapeType: 'roundRect', x: 6.58, y: 1.2, w: 5.55, h: 3.15, fill: { color: '102233', transparency: 2 }, line: { color: '8B5CF6', transparency: 35 }, shadow: premiumShadow(0.22) },
			{ kind: 'chart', name: 'recipe-chart-scatter', chartType: 'scatter', data: sampleNativeChartData('scatter'), x: 6.8, y: 1.45, w: 5.08, h: 2.62, ...premiumChartOptions('Signal scatter') },
			{ kind: 'shape', name: 'recipe-gauge-arc', shapeType: 'blockArc', x: 1.08, y: 4.7, w: 1.05, h: 1.05, fill: gradientFill('20D6E7', '2FE6A6', '20D6E7', 0), line: { color: '20D6E7', transparency: 100 }, shadow: premiumShadow(0.18) },
			{ kind: 'shape', name: 'recipe-funnel-top', shapeType: 'trapezoid', x: 3.0, y: 4.72, w: 1.45, h: 0.58, fill: gradientFill('FFB84D', '8B5CF6', 'FF5C8A', 30), line: premiumLine('FFFFFF', 65), shadow: premiumShadow(0.2) },
			{ kind: 'shape', name: 'recipe-pie-wedge', shapeType: 'pie', x: 5.1, y: 4.65, w: 1.05, h: 1.05, fill: { color: '8B5CF6', transparency: 8 }, line: premiumLine('FFFFFF', 55), shadow: premiumShadow(0.18) },
			{ kind: 'shape', name: 'recipe-candlestick-body', shapeType: 'rect', x: 7.45, y: 4.78, w: 0.22, h: 0.76, fill: { color: '2FE6A6' }, line: { color: '2FE6A6' }, shadow: premiumShadow(0.16) },
			{ kind: 'connector', name: 'recipe-candlestick-wick', from: { x: 7.56, y: 4.54 }, to: { x: 7.56, y: 5.78 }, line: { color: 'F7FAFC', width: 1.1 } },
			{ kind: 'shape', name: 'recipe-waterfall-pos', shapeType: 'rect', x: 9.0, y: 5.05, w: 0.62, h: 0.5, fill: { color: '20D6E7' }, line: premiumLine('FFFFFF', 70) },
			{ kind: 'shape', name: 'recipe-waterfall-neg', shapeType: 'rect', x: 9.72, y: 5.28, w: 0.62, h: 0.27, fill: { color: 'FF5C8A' }, line: premiumLine('FFFFFF', 70) },
		],
		animations: [
			{ target: 'recipe-chart-panel-a', kind: 'entrance', effect: 'wipe', direction: 'fromLeft', duration: 620, trigger: 'afterPrevious' },
			{ target: 'recipe-chart-panel-b', kind: 'entrance', effect: 'wipe', direction: 'fromRight', duration: 620, trigger: 'withPrevious' },
			{ target: 'recipe-gauge-arc', kind: 'emphasis', effect: 'spin', rotation: 18, duration: 900, trigger: 'afterPrevious' },
			{ target: 'recipe-funnel-top', kind: 'emphasis', effect: 'changefillcolor', color: '2FE6A6', duration: 760, trigger: 'withPrevious' },
		],
		notes: 'betterpptx-mcp recipe: executive-hybrid-chart-suite',
	})
}

function add3DScene(spec: any): void {
	ensureSlide(spec, {
		transition: { type: 'fade', speed: 'fast', advanceOnClick: false, advanceAfterTime: 10500 },
		background: { color: '071018' },
		objects: [
			{ kind: 'text', name: 'recipe-3d-title', text: 'Native 3D model scene', x: 0.72, y: 0.52, w: 8.4, h: 0.42, fontFace: 'Aptos Display', fontSize: 24, bold: true, color: 'F7FAFC', margin: 0, shadow: premiumShadow(0.25) },
			{ kind: 'shape', name: 'recipe-3d-stage', shapeType: 'roundRect', x: 0.85, y: 1.18, w: 11.25, h: 4.85, fill: gradientFill('102233', '071018', '162E42', 18), line: { color: '20D6E7', transparency: 35 }, shadow: premiumShadow(0.34) },
			{ kind: 'model3d', name: 'recipe-model3d', src: 'model3d://premium-orbit-torus', fallbackImage: 'stock://premium-3d-orbit-torus-poster', x: 6.55, y: 1.42, w: 4.85, h: 3.65, rotate: 5, shadow: premiumShadow(0.28), camera: { fov: 2700000, pos: { x: 0, y: 0, z: 78408333 } }, trans: { rot: { ay: 10800000 } }, objViewport: 3160014, ambientLight: { color: { r: 50000, g: 50000, b: 50000 }, illuminance: 0.5 } },
			{ kind: 'model3d', name: 'recipe-model3d-wave', src: 'model3d://premium-ribbon-wave', fallbackImage: 'stock://premium-3d-ribbon-wave-poster', x: 1.25, y: 3.62, w: 2.62, h: 1.35, rotate: -6, shadow: premiumShadow(0.22), camera: { fov: 2700000, pos: { x: 0, y: 0, z: 63605604 } }, objViewport: 2851667 },
			{ kind: 'model3d', name: 'recipe-model3d-arrow', src: 'model3d://premium-growth-arrow', fallbackImage: 'stock://premium-3d-growth-arrow-poster', x: 3.98, y: 3.58, w: 2.35, h: 1.26, rotate: 4, shadow: premiumShadow(0.22), camera: { fov: 2700000, pos: { x: 0, y: 0, z: 63605604 } }, objViewport: 2851667 },
			{ kind: 'shape', name: 'recipe-3d-orbit', shapeType: 'arc', x: 6.25, y: 1.06, w: 5.25, h: 4.05, line: { color: '2FE6A6', width: 1.6, beginArrowType: 'triangle', endArrowType: 'triangle' }, shadow: premiumShadow(0.16) },
			{ kind: 'text', name: 'recipe-3d-copy', text: 'Premium 3D should use native GLB fixtures plus strong poster fallbacks, camera/light metadata, shadows, and live motion cues. The asset catalog now exposes richer model choices by handle.', x: 1.3, y: 1.85, w: 4.82, h: 1.25, fontSize: 15, color: 'CBD5E1', margin: 0.04, fit: 'shrink' },
		],
		animations: [
			{ target: 'recipe-model3d', kind: 'emphasis', effect: 'pulse', scale: 1.06, duration: 1000, trigger: 'afterPrevious' },
			{ target: 'recipe-3d-orbit', kind: 'motionPath', path: 'circle', duration: 1300, trigger: 'withPrevious' },
			{ target: 'recipe-model3d-wave', kind: 'motionPath', path: 'sineWave', duration: 1000, trigger: 'afterPrevious' },
			{ target: 'recipe-model3d-arrow', kind: 'entrance', effect: 'zoom', duration: 820, trigger: 'withPrevious' },
		],
		notes: 'betterpptx-mcp recipe: native-3d-hero-scene',
	})
}

function addMediaVoiceScene(spec: any): void {
	ensureSlide(spec, {
		transition: { type: 'fade', speed: 'fast', advanceOnClick: false, advanceAfterTime: 9300 },
		background: { color: '071018' },
		objects: [
			{ kind: 'text', name: 'recipe-media-title', text: 'Media and voice lab', x: 0.72, y: 0.52, w: 8.6, h: 0.42, fontFace: 'Aptos Display', fontSize: 24, bold: true, color: 'F7FAFC', margin: 0, shadow: premiumShadow(0.25) },
			{ kind: 'shape', name: 'recipe-media-frame', shapeType: 'roundRect', x: 0.9, y: 1.25, w: 5.55, h: 3.55, fill: { color: '102233' }, line: { color: '20D6E7', transparency: 30 }, shadow: premiumShadow(0.28) },
			{ kind: 'media', name: 'recipe-video', mediaType: 'video', src: 'video://sample-mp4', cover: 'stock://betterpptx-mcp-logo', x: 1.2, y: 1.55, w: 4.95, h: 2.8 },
			{ kind: 'shape', name: 'recipe-voice-frame', shapeType: 'roundRect', x: 7.0, y: 1.25, w: 4.9, h: 3.55, fill: gradientFill('102233', '162E42', '8B5CF6', 35), line: { color: '8B5CF6', transparency: 30 }, shadow: premiumShadow(0.28) },
			{ kind: 'media', name: 'recipe-audio', mediaType: 'audio', src: 'audio://sample-mp3', x: 7.38, y: 4.24, w: 0.32, h: 0.32 },
			{ kind: 'shape', name: 'recipe-voice-wave', shapeType: 'wave', x: 7.55, y: 2.4, w: 3.65, h: 0.8, fill: { color: '20D6E7', transparency: 18 }, line: { color: '20D6E7', transparency: 30 }, shadow: premiumShadow(0.18) },
			{ kind: 'text', name: 'recipe-voice-label', text: 'Narration-ready audio object', x: 7.45, y: 3.55, w: 3.7, h: 0.25, fontSize: 12, bold: true, color: 'F7FAFC', align: 'center', margin: 0 },
		],
		animations: [
			{ target: 'recipe-video', kind: 'media', command: 'play', duration: 1000, trigger: 'afterPrevious' },
			{ target: 'recipe-audio', kind: 'media', command: 'play', duration: 1000, trigger: 'withPrevious' },
			{ target: 'recipe-voice-wave', kind: 'emphasis', effect: 'growshrink', scale: 1.16, duration: 850, trigger: 'withPrevious' },
		],
		notes: 'betterpptx-mcp recipe: media-audio-voice-lab',
	})
}

function addMotionScene(spec: any): void {
	ensureSlide(spec, {
		transition: { type: 'push', direction: 'left', speed: 'fast', advanceOnClick: false, advanceAfterTime: 8400 },
		background: { color: '071018' },
		objects: [
			{ kind: 'text', name: 'recipe-motion-title', text: 'Content-level animation lab', x: 0.72, y: 0.52, w: 8.6, h: 0.42, fontFace: 'Aptos Display', fontSize: 24, bold: true, color: 'F7FAFC', margin: 0, shadow: premiumShadow(0.25) },
			...['entry', 'exit', 'color', 'scale', 'spin', 'path'].map((label, index) => ({
				kind: 'shape',
				name: `recipe-motion-${label}`,
				shapeType: index % 2 ? 'hexagon' : 'roundRect',
				x: 0.95 + (index % 3) * 3.95,
				y: 1.48 + Math.floor(index / 3) * 2.05,
				w: 2.75,
				h: 1.0,
				fill: gradientFill(['20D6E7', '8B5CF6', 'FFB84D'][index % 3], '102233', '2FE6A6', 20 + index * 12),
				line: premiumLine('FFFFFF', 54),
				shadow: premiumShadow(0.24),
			})),
		],
		animations: [
			{ target: 'recipe-motion-entry', kind: 'entrance', effect: 'zoom', duration: 700, trigger: 'afterPrevious' },
			{ target: 'recipe-motion-exit', kind: 'exit', effect: 'fade', duration: 700, trigger: 'afterPrevious' },
			{ target: 'recipe-motion-color', kind: 'emphasis', effect: 'changefillcolor', color: 'FF5C8A', duration: 760, trigger: 'afterPrevious' },
			{ target: 'recipe-motion-scale', kind: 'emphasis', effect: 'growshrink', scale: 1.2, duration: 780, trigger: 'afterPrevious' },
			{ target: 'recipe-motion-spin', kind: 'emphasis', effect: 'spin', rotation: 18, duration: 820, trigger: 'afterPrevious' },
			{ target: 'recipe-motion-path', kind: 'motionPath', path: 'sineWave', duration: 1050, trigger: 'afterPrevious' },
		],
		notes: 'betterpptx-mcp recipe: motion-animation-lab',
	})
}

function addWordArtScene(spec: any): void {
	ensureSlide(spec, {
		transition: { type: 'morph', speed: 'fast', advanceOnClick: false, advanceAfterTime: 8800 },
		background: { color: '071018' },
		objects: [
			{ kind: 'text', name: 'recipe-wordart-title', text: 'WordArt transforms are self-applied', x: 0.72, y: 0.52, w: 9.4, h: 0.42, fontFace: 'Aptos Display', fontSize: 24, bold: true, color: 'F7FAFC', margin: 0, shadow: premiumShadow(0.25) },
			...['CURVE', 'ORBIT', 'WAVE', 'DEPTH'].map((word, index) => ({
				kind: 'wordart',
				name: `recipe-wordart-${index}`,
				text: word,
				x: 0.95 + index * 2.95,
				y: 2.05,
				w: 2.5,
				h: 0.95,
				fontFace: 'Aptos Display',
				fontSize: 27,
				bold: true,
				color: ['20D6E7', '8B5CF6', 'FFB84D', '2FE6A6'][index],
				wordArt: { transform: ['textArchUp', 'textCircle', 'textWave1', 'textInflate'][index] },
				text3D: { bevel: { type: 'circle', width: 5, height: 5 }, extrusion: 3 + index, extrusionColor: ['8B5CF6', '20D6E7', 'FF5C8A', 'FFB84D'][index], material: 'warmMatte', lightRig: 'threePt', rotationX: 8 + index, rotationY: 9 + index },
				shadow: premiumShadow(0.28),
				glow: { color: ['20D6E7', '8B5CF6', 'FFB84D', '2FE6A6'][index], size: 4, opacity: 0.3 },
				reflection: { type: 'tight', opacity: 0.18, blur: 1, distance: 1.5 },
			})),
		],
		animations: [0, 1, 2, 3].map(index => ({ target: `recipe-wordart-${index}`, kind: 'emphasis', effect: index % 2 ? 'spin' : 'growshrink', rotation: 8, scale: 1.12, duration: 760, trigger: index === 0 ? 'afterPrevious' : 'withPrevious' })),
		notes: 'betterpptx-mcp recipe: wordart-effects-lab',
	})
}

function genericWorldMapObjects(prefix = 'generated-map', x = 0.85, y = 1.12, w = 11.35, h = 4.35): any[] {
	const polygon = (name: string, points: Array<[number, number]>, fill: string, tags = ['customGeometry', 'worldMap']) => ({
		kind: 'shape',
		name: `${prefix}-${name}`,
		shapeType: 'custGeom',
		x,
		y,
		w,
		h,
		fill: { color: fill, transparency: name.includes('focus') ? 6 : 13 },
		line: { color: name.includes('focus') ? 'ECFCCB' : '99F6E4', transparency: 22, width: 0.8 },
		points: [...points.map(([px, py], index) => ({ x: px * w, y: py * h, ...(index === 0 ? { moveTo: true } : {}) })), { close: true }],
		shadow: premiumShadow(0.13),
		geometryKind: name.includes('focus') ? 'region-highlight' : 'world-map',
		coverageTags: tags,
	})
	return [
		polygon('north-america', [[0.04, 0.12], [0.2, 0.1], [0.35, 0.24], [0.28, 0.42], [0.16, 0.38], [0.04, 0.12]], '134E4A'),
		polygon('south-america', [[0.28, 0.45], [0.38, 0.48], [0.43, 0.63], [0.37, 0.95], [0.28, 0.78], [0.28, 0.45]], '166534'),
		polygon('africa', [[0.47, 0.32], [0.58, 0.34], [0.64, 0.53], [0.59, 0.82], [0.49, 0.67], [0.47, 0.32]], '14532D'),
		polygon('eurasia', [[0.52, 0.12], [0.78, 0.13], [0.93, 0.31], [0.79, 0.45], [0.6, 0.37], [0.52, 0.12]], '134E4A'),
		polygon('australia', [[0.79, 0.68], [0.93, 0.7], [0.9, 0.84], [0.8, 0.83], [0.79, 0.68]], '134E4A'),
		polygon('focus-a', [[0.3, 0.49], [0.4, 0.5], [0.41, 0.59], [0.34, 0.65], [0.29, 0.57], [0.3, 0.49]], '22C55E', ['customGeometry', 'worldMap', 'region-highlight']),
		polygon('focus-b', [[0.52, 0.48], [0.59, 0.49], [0.6, 0.58], [0.54, 0.61], [0.51, 0.55], [0.52, 0.48]], '22C55E', ['customGeometry', 'worldMap', 'region-highlight']),
		polygon('focus-c', [[0.77, 0.48], [0.88, 0.49], [0.88, 0.61], [0.8, 0.64], [0.77, 0.48]], '22C55E', ['customGeometry', 'worldMap', 'region-highlight']),
	]
}

function addCustomGeometryScene(spec: any, title = 'Native custom geometry'): void {
	ensureSlide(spec, {
		transition: { type: 'fade', speed: 'fast', advanceOnClick: false, advanceAfterTime: 7800 },
		background: { color: '071018' },
		objects: [
			{ kind: 'text', name: 'recipe-custom-geometry-title', text: title, x: 0.72, y: 0.52, w: 8.5, h: 0.42, fontFace: 'Aptos Display', fontSize: 24, bold: true, color: 'F7FAFC', margin: 0, shadow: premiumShadow(0.25) },
			...genericWorldMapObjects('recipe-custom-world', 1.0, 1.25, 10.7, 4.0),
		],
		animations: [
			{ target: 'recipe-custom-world-focus-a', kind: 'emphasis', effect: 'pulse', scale: 1.08, duration: 780, trigger: 'afterPrevious' },
			{ target: 'recipe-custom-world-focus-b', kind: 'emphasis', effect: 'pulse', scale: 1.08, duration: 780, trigger: 'withPrevious' },
			{ target: 'recipe-custom-world-focus-c', kind: 'emphasis', effect: 'pulse', scale: 1.08, duration: 780, trigger: 'withPrevious' },
		],
		notes: 'betterpptx-mcp recipe: generated native custom geometry and world map objects.',
	})
}

export function prepareGenerativeSpec(args: any, mode: string): PreparedGenerativeSpec {
	const fallback = String(args?.deckProfile || args?.verificationFocus || '').includes('showcase') ? REFERENCE_BUDGET : DEFAULT_BUDGET
	const featureBudget = normalizeFeatureBudget(args, fallback)
	const spec = clone(args?.spec || {})
	spec.title = spec.title || args?.title || 'betterpptx-mcp premium presentation'
	spec.featureBudget = featureBudget
	if (!Array.isArray(spec.slides)) spec.slides = []
	const decisions: string[] = []
	const requestedRecipeIds = Array.isArray(args?.recipeIds) ? args.recipeIds : args?.recipeId ? [args.recipeId] : []
	const before = detectSpecFeatures(spec)
	ensurePremiumOnExistingSlides(spec, featureBudget, decisions)
	if (!spec.slides.length) {
		addPremiumHero(spec, String(args?.title || spec.title))
		decisions.push('Created a premium hero scene because the request did not include slides.')
	}
	const required = impliedRequiredFeatures(featureBudget)
	let features = detectSpecFeatures(spec)
	const addIfMissing = (feature: string, recipeId: string, add: () => void) => {
		if (required.includes(feature) && !features.includes(feature)) {
			add()
			decisions.push(`Applied ${recipeId} to satisfy required feature: ${feature}.`)
			features = detectSpecFeatures(spec)
		}
	}
	addIfMissing('gradient', 'premium-cinematic-system', () => addPremiumHero(spec, String(args?.title || spec.title)))
	addIfMissing('shadow', 'premium-cinematic-system', () => addPremiumHero(spec, String(args?.title || spec.title)))
	addIfMissing('advancedCharts', 'executive-hybrid-chart-suite', () => addExecutiveCharts(spec))
	addIfMissing('3d', 'native-3d-hero-scene', () => add3DScene(spec))
	addIfMissing('native3d', 'native-3d-hero-scene', () => add3DScene(spec))
	addIfMissing('procedural3d', 'native-3d-hero-scene', () => add3DScene(spec))
	addIfMissing('customGeometry', 'shape-built-icon-analytics', () => addCustomGeometryScene(spec))
	addIfMissing('worldMap', 'shape-built-icon-analytics', () => addCustomGeometryScene(spec, 'Generated world map geometry'))
	addIfMissing('morph', 'transition-scene-suite', () => addWordArtScene(spec))
	addIfMissing('autoplay', 'premium-cinematic-system', () => addPremiumHero(spec, String(args?.title || spec.title)))
	addIfMissing('animation', 'motion-animation-lab', () => addMotionScene(spec))
	addIfMissing('cinematicAnimation', 'motion-animation-lab', () => addMotionScene(spec))
	addIfMissing('media', 'media-audio-voice-lab', () => addMediaVoiceScene(spec))
	addIfMissing('voice', 'media-audio-voice-lab', () => addMediaVoiceScene(spec))
	addIfMissing('wordart3d', 'wordart-effects-lab', () => addWordArtScene(spec))
	ensureMinimumCreativeDepth(spec, args, featureBudget, decisions)
	const recommended = recommendRecipes(String(args?.title || spec.title || '') + ' ' + JSON.stringify(spec.brief || spec.designDirection || {}), featureBudget)
	const recommendedChartPresets = recommendChartPresets(String(args?.title || spec.title || '') + ' ' + String(spec.brief || args?.brief || '') + ' ' + JSON.stringify(spec.designDirection || {}), featureBudget).slice(0, 6)
	const recipesApplied = unique([
		...requestedRecipeIds,
		...recommended.slice(0, 5).map(recipe => recipe.id),
		...decisions.map(decision => RECIPE_CATALOG.find(recipe => decision.includes(recipe.id))?.id || '').filter(Boolean),
	])
	const after = detectSpecFeatures(spec)
	const missingRequiredFeatures = required.filter(feature => !after.includes(feature))
	const designGate = {
		ok: missingRequiredFeatures.length === 0,
		errors: missingRequiredFeatures.map(feature => ({ code: 'required-feature-missing', message: `${feature} was required by the feature budget but was not detected after enrichment.` })),
		warnings: [
			...(mode === 'structured' && featureBudget.visualQuality !== 'standard' ? [{ code: 'structured-mode-limited', message: 'Structured mode is intentionally simpler; use design-system or expressive for full recipe expansion.' }] : []),
		],
		requiredFeatures: required,
		missingRequiredFeatures,
	}
	return {
		spec,
		featureBudget,
		recipesApplied,
		recommendedChartPresets: recommendedChartPresets.map(item => item.preset.id),
		designPlan: { mode, featureBudget, recipesApplied, decisions, recommendedChartPresets: recommendedChartPresets.map(item => ({ id: item.preset.id, title: item.preset.title, authoringMode: item.preset.authoringMode, selectionReason: item.selectionReason })) },
		featureUsePlan: {
			detectedBefore: before,
			detectedAfter: after,
			addedFeatures: after.filter(feature => !before.includes(feature)),
			requiredFeatures: required,
		},
		designGate,
	}
}
