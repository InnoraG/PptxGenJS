export interface ReferenceGate {
	minSlides?: number
	minTimingNodes?: number
	minMotionNodes?: number
	minMediaCommands?: number
	minWordArtWarps?: number
	minText3DNodes?: number
	minShape3DNodes?: number
	minGradients?: number
	minShadows?: number
	minCharts?: number
	minChartSeries?: number
	minMediaParts?: number
	minModel3DParts?: number
}

export interface ReferenceTarget {
	id: string
	title: string
	category: string
	summary: string
	privateReferencePath?: string
	slideCount?: number
	requiredFeatures: string[]
	recommendedRecipes: string[]
	recommendedChartPresets?: string[]
	recommendedTools: string[]
	brief: string[]
	acceptance: string[]
	gates: ReferenceGate
}

export const REFERENCE_TARGETS: ReferenceTarget[] = [
	{
		id: 'animation-entrance-exit-batch1',
		title: 'Entrance and exit animation gallery, batch 1',
		category: 'animation',
		summary: 'Large applied animation gallery covering core entrance and exit effects with direction/subtype variations.',
		privateReferencePath: 'tmp_autonomous_test/Focused_EntranceExit_Showcase_BATCH1_MANUALLYFROZEN.pptx',
		slideCount: 27,
		requiredFeatures: ['animation', 'entrance', 'exit', 'timing', 'direction'],
		recommendedRecipes: ['motion-animation-lab'],
		recommendedTools: ['betterpptx-mcp.capabilities.query', 'betterpptx-mcp.recipe.apply', 'betterpptx-mcp.presentation.create', 'betterpptx-mcp.object.apply_animation'],
		brief: [
			'Create an applied animation reference deck, not a list.',
			'Each slide should demonstrate one animation family with real target objects, clear before/after spatial cues, and visible playback timing.',
			'Use multiple colored specimens per slide to show directions/subtypes. Add notes metadata for every effect represented.',
			'All demo animations must be authored as content-level timing, not slide transitions only.',
		],
		acceptance: [
			'PowerPoint opens repair-free.',
			'The animation pane should show real entrance and exit effects on target objects.',
			'Comparator differences against the frozen reference should be attributable and shrinking after iteration.',
		],
		gates: { minSlides: 24, minTimingNodes: 80 },
	},
	{
		id: 'animation-entrance-exit-batch2',
		title: 'Entrance and exit animation gallery, batch 2',
		category: 'animation',
		summary: 'Additional entrance/exit effects and fallback-sensitive variants.',
		privateReferencePath: 'tmp_autonomous_test/Focused_EntranceExit_Showcase_BATCH2_FINAL_MANUALLYFROZENREFERENCE.pptx',
		slideCount: 9,
		requiredFeatures: ['animation', 'entrance', 'exit', 'timing', 'fallback'],
		recommendedRecipes: ['motion-animation-lab'],
		recommendedTools: ['betterpptx-mcp.presentation.create', 'betterpptx-mcp.object.apply_animation'],
		brief: [
			'Create a compact applied deck covering the secondary entrance/exit effects.',
			'Each effect must visibly animate a named object with deterministic trigger/timing metadata.',
		],
		acceptance: ['Repair-free package.', 'Real timing XML exists for each effect family.', 'Comparator deltas are actionable.'],
		gates: { minSlides: 8, minTimingNodes: 24 },
	},
	{
		id: 'animation-entrance-exit-batch3',
		title: 'Entrance and exit animation gallery, batch 3',
		category: 'animation',
		summary: 'Additional entrance/exit effect coverage including zoom/fly style variants.',
		privateReferencePath: 'tmp_autonomous_test/Focused_EntranceExit_Showcase_BATCH3_MANUALLYFROZEN.pptx',
		slideCount: 15,
		requiredFeatures: ['animation', 'entrance', 'exit', 'zoom', 'fly'],
		recommendedRecipes: ['motion-animation-lab'],
		recommendedTools: ['betterpptx-mcp.presentation.create', 'betterpptx-mcp.object.apply_animation'],
		brief: [
			'Build a slide-by-slide applied gallery for the remaining entrance and exit effects.',
			'Make motion obvious through ghosted start/end markers and specimen labels.',
		],
		acceptance: ['Repair-free package.', 'Content animation is visible and not transition-only.', 'Comparator deltas are actionable.'],
		gates: { minSlides: 13, minTimingNodes: 40 },
	},
	{
		id: 'animation-emphasis-batch4',
		title: 'Emphasis animation gallery, batch 4',
		category: 'animation',
		summary: 'Applied emphasis animation reference covering color, scale, spin, transparency, and related effects.',
		privateReferencePath: 'tmp_autonomous_test/Focused_Emphasis_Showcase_BATCH4_BASE_MANUALLYFROZEN.pptx',
		slideCount: 29,
		requiredFeatures: ['animation', 'emphasis', 'color', 'scale', 'rotation', 'transparency'],
		recommendedRecipes: ['motion-animation-lab', 'premium-cinematic-system'],
		recommendedTools: ['betterpptx-mcp.presentation.create', 'betterpptx-mcp.object.apply_animation'],
		brief: [
			'Create an applied emphasis animation deck where each specimen changes visibly on the slide.',
			'Use color, scale, rotation, transparency, line, and fill emphasis effects on real shapes and text.',
		],
		acceptance: ['Repair-free package.', 'Color/scale/rotation emphasis timing XML is present.', 'Visual oracle should catch non-changing specimens.'],
		gates: { minSlides: 24, minTimingNodes: 70, minShadows: 8 },
	},
	{
		id: 'animation-motion-path-batch5',
		title: 'Motion path gallery, batch 5',
		category: 'motion-path',
		summary: 'Exhaustive motion-path reference with a real moving object per path and visible path cues.',
		privateReferencePath: 'tmp_autonomous_test/Focused_MotionPath_Showcase_BATCH5_BASE_MANUALLYFROZEN.pptx',
		slideCount: 64,
		requiredFeatures: ['motionPath', 'animation', 'timing'],
		recommendedRecipes: ['motion-animation-lab'],
		recommendedTools: ['betterpptx-mcp.presentation.create', 'betterpptx-mcp.object.apply_motion_path'],
		brief: [
			'Create an applied motion-path deck covering every available motion path.',
			'Each slide should include a moving target, start ghost, end ghost, and path guide.',
		],
		acceptance: ['Repair-free package.', 'Every motion-path specimen has p:animMotion timing XML.', 'No slide is static-only.'],
		gates: { minSlides: 60, minTimingNodes: 60, minMotionNodes: 60 },
	},
	{
		id: 'animation-missing-effects-batch6',
		title: 'Missing/edge animation effects, batch 6',
		category: 'animation',
		summary: 'Small targeted reference for effects that were historically missed or fallback-sensitive.',
		privateReferencePath: 'tmp_autonomous_test/Focused_EntranceExit_Showcase_BATCH6_MISSING_MANUALLYFROZEN.pptx',
		slideCount: 2,
		requiredFeatures: ['animation', 'edgeCase', 'fallback'],
		recommendedRecipes: ['motion-animation-lab'],
		recommendedTools: ['betterpptx-mcp.presentation.create', 'betterpptx-mcp.object.apply_animation'],
		brief: [
			'Create two dense applied slides for historically missing animation effects.',
			'Make each missing/fallback behavior visible with a named object and notes metadata.',
		],
		acceptance: ['Repair-free package.', 'Target effects exist as content timing, not placeholders.'],
		gates: { minSlides: 2, minTimingNodes: 8 },
	},
	{
		id: 'media-animation-batch7',
		title: 'Media animation and playback gallery, batch 7',
		category: 'media',
		summary: 'Applied media playback reference showing play, pause, stop, resume, seek, and synchronized visual timing.',
		privateReferencePath: 'tmp_autonomous_test/Focused_Media_Showcase_BATCH7_MANUALLYFROZEN.pptx',
		slideCount: 3,
		requiredFeatures: ['media', 'audio', 'video', 'mediaCommands', 'timing', 'animation'],
		recommendedRecipes: ['media-audio-voice-lab', 'motion-animation-lab'],
		recommendedTools: ['betterpptx-mcp.presentation.create', 'betterpptx-mcp.object.insert_media', 'betterpptx-mcp.object.apply_animation'],
		brief: [
			'Create a live media reference deck with actual embedded video/audio objects.',
			'Demonstrate play, pause, stop, resume/seek, and synchronized progress indicators.',
			'The user should see media behavior, not only labels.',
		],
		acceptance: ['Repair-free package.', 'Media relationships and command timing exist.', 'Video/audio specimens are embedded or clearly linked.'],
		gates: { minSlides: 3, minTimingNodes: 12, minMediaCommands: 4, minMediaParts: 2 },
	},
	{
		id: 'animation-object-api-batch9',
		title: 'Animation object API coverage, batch 9',
		category: 'animation',
		summary: 'Reference proving animation support across text, shapes, images, tables, charts, and media.',
		privateReferencePath: 'tmp_autonomous_test/batch9_api_assessment_GENERATED_MANUALLYFROZEN.pptx',
		slideCount: 7,
		requiredFeatures: ['animation', 'text', 'shape', 'image', 'table', 'chart', 'media'],
		recommendedRecipes: ['motion-animation-lab', 'executive-hybrid-chart-suite', 'media-audio-voice-lab'],
		recommendedTools: ['betterpptx-mcp.presentation.create', 'betterpptx-mcp.object.apply_animation', 'betterpptx-mcp.chart.add', 'betterpptx-mcp.table.add'],
		brief: [
			'Create an applied object-animation support deck.',
			'Animate text, shapes, images, tables, charts, and media objects using both inline-like spec fields and explicit animation instructions where possible.',
		],
		acceptance: ['Repair-free package.', 'Every major object family has a real animated specimen.', 'Charts and media are not blank.'],
		gates: { minSlides: 6, minTimingNodes: 18, minCharts: 1, minMediaParts: 1 },
	},
	{
		id: 'shape-style-batch10',
		title: 'Shape style frozen reference, batch 10',
		category: 'shape-style',
		summary: 'Exhaustive shape styling reference for shadows, gradients, glows, reflections, soft edges, lines, arrows, 3D bevels, and extrusion.',
		privateReferencePath: 'tmp_autonomous_test/Focused_ShapeStyles_Showcase_BATCH10_CURRENT_MANUALLY_FROZENREFERENCE.pptx',
		slideCount: 99,
		requiredFeatures: ['shape', 'gradient', 'shadow', 'glow', 'reflection', 'softEdge', 'shape3d', 'line', 'arrow'],
		recommendedRecipes: ['shape-built-icon-analytics', 'premium-cinematic-system'],
		recommendedTools: ['betterpptx-mcp.presentation.create', 'betterpptx-mcp.object.apply_animation'],
		brief: [
			'Create a self-applied shape style reference deck.',
			'Every slide must show the style on a large specimen shape, with a nearby control specimen only when useful.',
			'Cover shadows, gradients, glows, reflections, soft edges, line/dash/arrow styles, bevels, extrusion, materials, and rotations.',
		],
		acceptance: ['Repair-free package.', 'Shape effects are visible on the shapes themselves.', 'Frozen visual richness is matched before calling the capability complete.'],
		gates: { minSlides: 80, minGradients: 8, minShadows: 20, minShape3DNodes: 8 },
	},
	{
		id: 'wordart-style-batch11',
		title: 'WordArt style frozen reference, batch 11',
		category: 'wordart',
		summary: 'Exhaustive WordArt transform reference with text warp, fill, outline, reflection, bevel, extrusion, and 3D scene styling.',
		privateReferencePath: 'tmp_autonomous_test/Focused_WordArtStyles_Showcase_BATCH11_FROZENREFERENCE.pptx',
		slideCount: 133,
		requiredFeatures: ['wordart', 'wordart3d', 'gradient', 'shadow', 'reflection', 'text3d', 'bevel', 'extrusion'],
		recommendedRecipes: ['wordart-effects-lab', 'premium-cinematic-system'],
		recommendedTools: ['betterpptx-mcp.presentation.create', 'betterpptx-mcp.object.apply_wordart', 'betterpptx-mcp.object.apply_animation'],
		brief: [
			'Create a self-applied WordArt reference deck.',
			'Every transform must be applied to the displayed word itself. Do not use repeated plain text samples.',
			'Use varied sample words sized to make arch, circle, wave, inflate, deflate, ring, cascade, and slant transforms obvious.',
			'Apply visible fill, outline, shadow, reflection, bevel, extrusion/depth, lighting, and motion to the letters.',
		],
		acceptance: ['Repair-free package.', 'Every WordArt specimen has a real a:prstTxWarp where expected.', '3D/effect XML and visible styling are present.'],
		gates: { minSlides: 100, minWordArtWarps: 30, minText3DNodes: 20, minGradients: 20, minShadows: 20 },
	},
	{
		id: 'sequence-trigger-batch12',
		title: 'Sequence and trigger matrix, batch 12',
		category: 'animation',
		summary: 'Timing structure reference for sequence modes, trigger modes, paragraph targeting, and edge cases.',
		privateReferencePath: 'tmp_autonomous_test/Focused_SEQUENCE_TRIGGER_MATRIX_BATCH12_MANUALLYFROZEN.pptx',
		slideCount: 5,
		requiredFeatures: ['animation', 'sequence', 'trigger', 'paragraphTargeting', 'timing'],
		recommendedRecipes: ['motion-animation-lab'],
		recommendedTools: ['betterpptx-mcp.presentation.create', 'betterpptx-mcp.object.apply_animation'],
		brief: [
			'Create a matrix deck showing sequence and trigger behavior with real animated text boxes.',
			'Cover onClick, afterPrevious, withPrevious, byParagraph, allAtOnce, and asOneObject behavior.',
		],
		acceptance: ['Repair-free package.', 'Timing XML expresses the sequence/trigger matrix.', 'Paragraph targeting is visible and inspectable.'],
		gates: { minSlides: 5, minTimingNodes: 40 },
	},
	{
		id: 'edge-case-batch13',
		title: 'Animation edge-case matrix, batch 13',
		category: 'animation',
		summary: 'Manually frozen edge-case target for sequence/trigger oddities and validation-only behavior.',
		privateReferencePath: 'tmp_autonomous_test/Focused_EdgeCase_Showcase_BATCH13_MANUALLYFROZEN.pptx',
		slideCount: 1,
		requiredFeatures: ['animation', 'sequence', 'trigger', 'edgeCase'],
		recommendedRecipes: ['motion-animation-lab'],
		recommendedTools: ['betterpptx-mcp.presentation.create', 'betterpptx-mcp.object.apply_animation'],
		brief: [
			'Create a dense edge-case animation matrix.',
			'Use explicit visual markers for standard and unusual trigger/sequence behavior.',
		],
		acceptance: ['Repair-free package.', 'Edge cases are represented explicitly, not silently omitted.'],
		gates: { minSlides: 1, minTimingNodes: 8 },
	},
	{
		id: 'chart-definitive-quality-reference',
		title: 'Definitive chart quality reference',
		category: 'charts',
		summary: 'External quality target for rich non-empty native charts and shape-built analytical visuals.',
		privateReferencePath: 'C:/Users/SafeUser/Downloads/The_Definitive_Chart_Showcase.pptx',
		requiredFeatures: ['chart', 'advancedCharts', 'gradient', 'shadow', 'dashboard', 'shapeBuiltChart'],
		recommendedRecipes: ['executive-hybrid-chart-suite', 'shape-built-icon-analytics'],
		recommendedChartPresets: ['column-clustered', 'line-trend', 'doughnut-share', 'scatter-correlation', 'bubble-portfolio', 'radar-filled-capability', 'combo-column-line-dual-axis', 'funnel-conversion', 'waterfall-bridge', 'histogram-distribution', 'box-whisker-distribution', 'stock-ohlc', 'map-region-choropleth'],
		recommendedTools: ['betterpptx-mcp.capabilities.query', 'betterpptx-mcp.chart.recommend', 'betterpptx-mcp.presentation.create', 'betterpptx-mcp.chart.add'],
		brief: [
			'Create a beautiful chart capability deck, not a simple chart listing.',
			'Use readable data, meaningful titles, annotations, dashboards, hybrid native charts, and shape-built analytics.',
			'Include native clustered/stacked bar, line, area, pie, doughnut, scatter, bubble, radar, combo-style scenes, plus funnel, gauge, waterfall, histogram/pareto, candlestick, box-and-whisker, Gantt, sparklines, and KPI cards.',
		],
		acceptance: ['No chart is blank.', 'Native charts have series and workbook relationships.', 'Shape-built analytics use real PowerPoint primitives.'],
		gates: { minSlides: 10, minCharts: 8, minChartSeries: 14, minGradients: 8, minShadows: 8 },
	},
]

export function listReferenceTargets(): ReferenceTarget[] {
	return REFERENCE_TARGETS
}

export function referenceTargetById(id: string): ReferenceTarget | undefined {
	return REFERENCE_TARGETS.find(target => target.id === id)
}

export function publicReferenceTarget(target: ReferenceTarget): any {
	const { privateReferencePath, ...publicTarget } = target
	return publicTarget
}
