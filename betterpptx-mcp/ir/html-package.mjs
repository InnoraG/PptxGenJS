/**
 * HTML package inspection and native-lowering readback.
 * Public-safe: no filesystem paths.
 */
import JSZip from 'jszip'
import { HTML_CSS_MOTION_CONTRACT } from './html-css-motion.mjs'
import { fontFaceAvailable } from './html-representation.mjs'
import { atmosphereReadback } from './native-visual-primitives.mjs'

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg)$/i
const HTML_EXT = /\.html?$/i
const SIDECAR_JSON = /\.json$/i
const SIDECAR_CSV = /\.csv$/i

export function htmlPackageSource(spec = {}) {
	const pack = spec.htmlPackage || spec.htmlZip
	if (!pack) return null
	if (typeof pack === 'string') {
		return { source: pack, entryFile: spec.htmlEntryFile || spec.entryFile || 'index.html', viewport: spec.htmlViewport || spec.viewport || null }
	}
	if (typeof pack === 'object' && !Array.isArray(pack)) {
		return {
			source: pack.handle || pack.data || pack.url || pack.file || null,
			entryFile: pack.entryFile || spec.htmlEntryFile || 'index.html',
			viewport: pack.viewport || spec.htmlViewport || null,
		}
	}
	return null
}

export function detectHtmlViewport(html = '') {
	const text = String(html || '')
	const cssW = text.match(/--stage-w\s*:\s*(\d+)px/i)
	const cssH = text.match(/--stage-h\s*:\s*(\d+)px/i)
	const idStage = text.match(/#stage\s*\{[^}]*width\s*:\s*(\d+)px[^}]*height\s*:\s*(\d+)px/i)
	const width = Number(cssW?.[1] || idStage?.[1] || 0)
	const height = Number(cssH?.[1] || idStage?.[2] || 0)
	if (!width || !height) return null
	return { width, height }
}

export function countHtmlSlides(html = '') {
	const text = String(html || '')
	const sections = text.match(/<section\b[^>]*class=["'][^"']*\bslide\b/gi) || []
	if (sections.length) return sections.length
	const ids = text.match(/<section\b[^>]*id=["']slide-/gi) || []
	return ids.length
}

function zipNames(zip) {
	return Object.keys(zip.files).filter(name => zip.files[name] && !zip.files[name].dir).map(name => name.replace(/\\/g, '/'))
}

function findEntryFile(names, requested = 'index.html') {
	const want = String(requested || 'index.html').replace(/\\/g, '/').replace(/^\.\//, '')
	const exact = names.find(name => name === want || name.endsWith(`/${want}`))
	if (exact) return exact
	return names.find(name => /(^|\/)index\.html$/i.test(name)) || names.find(name => HTML_EXT.test(name)) || null
}

function referencedImagePaths(html = '') {
	const out = new Set()
	const re = /(?:src|href)\s*=\s*["']([^"']+)["']/gi
	let match
	while ((match = re.exec(String(html || '')))) {
		const raw = String(match[1] || '').trim().replace(/\\/g, '/')
		if (!raw || /^(data:|https?:|asset:|mailto:|#)/i.test(raw)) continue
		if (IMAGE_EXT.test(raw.split('?')[0])) out.add(raw.split('?')[0].replace(/^\.\//, ''))
	}
	return [...out]
}

export async function inspectHtmlZipBuffer(buffer, options = {}) {
	if (!buffer?.length) {
		const err = new Error('The HTML package bytes were empty.')
		err.code = 'INVALID_ZIP'
		throw err
	}
	if (!(buffer[0] === 0x50 && buffer[1] === 0x4b)) {
		const err = new Error('The uploaded file is not a zip package.')
		err.code = 'INVALID_ZIP'
		throw err
	}
	let zip
	try {
		zip = await JSZip.loadAsync(buffer)
	} catch {
		const err = new Error('The zip package could not be read.')
		err.code = 'INVALID_ZIP'
		throw err
	}
	const names = zipNames(zip)
	const entryFile = findEntryFile(names, options.entryFile)
	if (!entryFile) {
		const err = new Error('ENTRY_FILE_NOT_FOUND: the zip does not contain index.html or the requested entry file.')
		err.code = 'ENTRY_FILE_NOT_FOUND'
		throw err
	}
	const html = await zip.file(entryFile).async('string')
	const images = names.filter(name => IMAGE_EXT.test(name))
	const nameSet = new Set(names)
	const missingAssets = referencedImagePaths(html).filter(rel => {
		if (nameSet.has(rel)) return false
		const base = rel.split('/').pop()
		return !names.some(name => name === base || name.endsWith(`/${base}`) || name.endsWith(`/images/${base}`))
	})
	const sidecarNames = names.filter(name => SIDECAR_JSON.test(name) || SIDECAR_CSV.test(name) || /(^|\/)manifest\.json$/i.test(name))
	const sidecars = []
	for (const name of sidecarNames) {
		const entry = { name }
		try {
			const text = await zip.file(name).async('string')
			if (SIDECAR_JSON.test(name) && text.length <= 2_000_000) {
				entry.kind = 'json'
				try { entry.parsed = JSON.parse(text) } catch { entry.parseError = true }
			} else if (SIDECAR_CSV.test(name) && text.length <= 256_000) {
				entry.kind = 'csv'
				entry.text = text
			} else {
				entry.kind = SIDECAR_JSON.test(name) ? 'json' : 'file'
			}
		} catch {
			entry.unreadable = true
		}
		sidecars.push(entry)
	}
	return {
		entryFile,
		relativeAssetsResolved: missingAssets.length === 0,
		images: images.length,
		imageFiles: images.slice(0, 80),
		missingAssets,
		sidecars: sidecars.map(item => item.name),
		sidecarDetails: sidecars,
		htmlViewport: detectHtmlViewport(html),
		detectedSlides: countHtmlSlides(html),
		fileCount: names.length,
		packageSize: buffer.length,
		mimeType: 'application/zip',
	}
}

export function publicHtmlPackageInspect(inspect = {}, extra = {}) {
	return {
		entryFile: inspect.entryFile || extra.entryFile || 'index.html',
		relativeAssetsResolved: inspect.relativeAssetsResolved ?? true,
		images: inspect.images || 0,
		missingAssets: inspect.missingAssets || [],
		sidecars: inspect.sidecars || [],
		htmlViewport: inspect.htmlViewport || extra.htmlViewport || null,
		detectedSlides: inspect.detectedSlides || 0,
		fileCount: inspect.fileCount ?? extra.fileCount ?? null,
		packageSize: inspect.packageSize || extra.packageSize || null,
		mimeType: extra.mimeType || inspect.mimeType || 'application/zip',
		imageFiles: Array.isArray(inspect.imageFiles) ? inspect.imageFiles.slice(0, 80) : [],
		...extra,
	}
}

export function buildHtmlLoweringManifest(spec = {}) {
	const counts = {
		slideCount: 0,
		nativeBackgrounds: 0,
		nativeTextBoxes: 0,
		nativeTextShapes: 0,
		nativePresetShapes: 0,
		nativeConnectors: 0,
		nativeCharts: 0,
		nativeTables: 0,
		nativeSmartArt: 0,
		nativeIcons: 0,
		nativeEquations: 0,
		nativeImages: 0,
		nativeStats: 0,
		customGeometry: 0,
		retainedSvg: 0,
		rasterFallbacks: 0,
	}
	const customDecisions = []
	const unmappedCssMotion = []
	const fallbacks = []
	let cssMotionMapped = 0
	for (const slide of spec.slides || []) {
		counts.slideCount += 1
		if (slide?.background) counts.nativeBackgrounds += 1
		if (Array.isArray(slide?.htmlUnmappedCssMotion)) unmappedCssMotion.push(...slide.htmlUnmappedCssMotion.map(item => ({ slideId: slide.id || null, ...item })))
		if (Array.isArray(slide?.htmlFallbacks)) fallbacks.push(...slide.htmlFallbacks.map(item => ({ slideId: slide.id || item.slideId || null, ...item })))
		for (const block of slide?.content || []) {
			if (block?.animation) cssMotionMapped += 1
			const kind = String(block?.kind || '').toLowerCase()
			if (kind === 'textbox' || kind === 'title' || kind === 'body' || kind === 'quote' || kind === 'subtitle') counts.nativeTextBoxes += 1
			else if (kind === 'textshape') counts.nativeTextShapes += 1
			else if (kind === 'shape') counts.nativePresetShapes += 1
			else if (kind === 'connector') counts.nativeConnectors += 1
			else if (kind === 'chart-panel' || kind === 'chart') counts.nativeCharts += 1
			else if (kind === 'table-panel' || kind === 'table') counts.nativeTables += 1
			else if (kind === 'smartart' || kind === 'process' || kind === 'diagram') counts.nativeSmartArt += 1
			else if (kind === 'icon') counts.nativeIcons += 1
			else if (kind === 'equation') counts.nativeEquations += 1
			else if (kind === 'image' || kind === 'picture') {
				counts.nativeImages += 1
				if (block?.rasterFallback || block?.fallback === 'raster') counts.rasterFallbacks += 1
			} else if (kind === 'stat' || kind === 'kpi') counts.nativeStats += 1
			else if (kind === 'customgeometry') {
				counts.customGeometry += 1
				if (block?.svg) counts.retainedSvg += 1
			}
			if (block?.customReason || String(block?.representation || '').toLowerCase() === 'custom') {
				customDecisions.push({
					slideId: slide.id || null,
					sourceConcept: block.altText || block.name || kind,
					selectedKind: block.kind || kind,
					customReason: block.customReason || 'Custom representation selected.',
				})
			}
		}
	}
	return {
		...counts,
		customDecisions,
		cssMotionMapped,
		unmappedCssMotion,
		fallbacks,
		detectedSourceModes: spec.detectedSourceModes || [],
		selectedOutputVariants: spec.selectedOutputVariants || (spec.outputVariant ? [spec.outputVariant] : []),
	}
}

function objectNamesForSlide(slide = {}) {
	return (slide.content || []).map(block => block?.name || block?.objectName).filter(Boolean)
}

function rectForBlock(block = {}) {
	const rect = block._engineRect || block.rect || block.bbox || null
	if (!rect || typeof rect !== 'object') return null
	return {
		x: Number(rect.x),
		y: Number(rect.y),
		w: Number(rect.w),
		h: Number(rect.h),
	}
}

export function buildHtmlMotionReport(spec = {}) {
	const slides = []
	let effectCount = 0
	let missingTargets = 0
	let sourceAnimatedNodes = 0
	let supportLayersInheritingMotion = 0
	for (const [index, slide] of (spec.slides || []).entries()) {
		const names = new Set(objectNamesForSlide(slide))
		const cues = []
		sourceAnimatedNodes += Number(slide?.htmlSourceMotion?.animatedSourceNodes || 0)
		for (const block of slide?.content || []) {
			if (block?.effectOwnerId && block?.inheritsAnimation) supportLayersInheritingMotion += 1
			const animation = block?.animation
			if (!animation) continue
			effectCount += 1
			cues.push({
				target: block.name,
				type: animation.type || 'entrance',
				effect: animation.effect,
				trigger: animation.trigger || 'withPrevious',
				delay: animation.delay || 0,
				duration: animation.duration || null,
				source: animation.source || 'spec',
				mappingSource: animation.mappingSource || null,
			})
		}
		for (const cue of slide?.timeline?.cues || []) {
			if (cue?.target && !names.has(cue.target)) missingTargets += 1
		}
		const buildMs = cues.reduce((max, cue) => Math.max(max, Number(cue.delay || 0) + Number(cue.duration || 0)), 0)
		const advanceAfterTime = Number(slide?.transition?.advanceAfterTime || slide?.timeline?.advanceAfterTime || 0) || null
		slides.push({
			slideId: slide?.id || null,
			slideIndex: index,
			effectCount: cues.length,
			triggerOrder: cues.map(cue => cue.trigger),
			cues,
			buildDurationMs: buildMs || null,
			advanceAfterTime,
			missingTargets: (slide?.timeline?.cues || []).filter(cue => cue?.target && !names.has(cue.target)).map(cue => cue.target),
			unmappedCssMotion: slide?.htmlUnmappedCssMotion || [],
			sourceAnimatedNodes: Number(slide?.htmlSourceMotion?.animatedSourceNodes || 0),
		})
	}
	const unmappedCssMotionCount = slides.reduce((sum, slide) => sum + (slide.unmappedCssMotion?.length || 0), 0)
	const explained = effectCount + supportLayersInheritingMotion + unmappedCssMotionCount
	const silentlyLost = Math.max(0, sourceAnimatedNodes - explained)
	const slidesWithAuthoredMotionButNoCompiledMotion = slides
		.filter(slide => slide.sourceAnimatedNodes > 0 && slide.effectCount === 0 && !(slide.unmappedCssMotion || []).length)
		.map(slide => slide.slideId)
	const advanceCovered = slides.filter(slide => slide.advanceAfterTime).length
	return {
		effectCount,
		slideCount: slides.length,
		missingTargetCount: missingTargets,
		unmappedCssMotionCount,
		aiMustResolve: slides.some(slide => (slide.unmappedCssMotion || []).length),
		owner: 'ai-client',
		resolve: HTML_CSS_MOTION_CONTRACT.nativeObjectAnimation.unmapped.resolve,
		mcpEvolution: HTML_CSS_MOTION_CONTRACT.nativeObjectAnimation.unmapped.mcpEvolution,
		visualPlaybackPreview: false,
		sourceMotion: { animatedSourceNodes: sourceAnimatedNodes },
		compiledMotion: {
			semanticAnimatedObjects: effectCount,
			supportLayersInheritingMotion,
			collapsedIntoGroups: 0,
			unmapped: unmappedCssMotionCount,
			silentlyLost,
		},
		nativeTiming: {
			animatedSlides: slides.filter(slide => slide.effectCount > 0 || slide.advanceAfterTime).length,
			nativeTimingNodes: effectCount,
			resolvedTargets: Math.max(0, effectCount - missingTargets),
			unresolvedTargets: missingTargets,
			slidesWithAuthoredMotionButNoCompiledMotion,
			unmappedSourceEffects: slides.flatMap(slide => slide.unmappedCssMotion || []),
			advanceTimingCoverage: `${advanceCovered}/${slides.length}`,
			timingTreePersistedAfterReopen: null,
			reopenGate: 'Dry-run timeline is necessary but not sufficient. After commit and save, reopen the package in authoritative PowerPoint and confirm the timing tree persisted. GIF/MP4 playback proof is an MCP evolution request, not a current save gate.',
		},
		note: 'Static PowerPoint preview proves composition. This report proves the compiled timing tree and mapped CSS → native object effects. Unexplained animation loss must be zero. Grouping, inherited support-layer motion, and equivalent keyframe collapse are allowed. Unmapped CSS is an AI authoring finding. Animated GIF/MP4 preview is not available yet.',
		slides,
	}
}

export function buildHtmlMorphContinuityReport(spec = {}) {
	const policy = spec.morphPolicy || spec.validation?.morphPolicy || { unmatched: 'warn', fallback: 'fade' }
	const pairs = []
	const slides = spec.slides || []
	for (let index = 1; index < slides.length; index += 1) {
		const from = slides[index - 1]
		const to = slides[index]
		const transition = String(to?.transition?.type || from?.transition?.type || '').toLowerCase()
		if (transition !== 'morph') continue
		const fromNames = new Set(objectNamesForSlide(from))
		const toNames = new Set(objectNamesForSlide(to))
		const matched = [...fromNames].filter(name => toNames.has(name)).map(name => {
			const source = (from.content || []).find(block => (block?.name || block?.objectName) === name)
			const dest = (to.content || []).find(block => (block?.name || block?.objectName) === name)
			const a = rectForBlock(source)
			const b = rectForBlock(dest)
			const geometryChanged = Boolean(a && b && (a.x !== b.x || a.y !== b.y || a.w !== b.w || a.h !== b.h))
			return {
				name,
				geometryChanged,
				expectedBehavior: geometryChanged ? 'morph' : 'hold',
			}
		})
		const unmatchedSource = [...fromNames].filter(name => !toNames.has(name))
		const unmatchedDestination = [...toNames].filter(name => !fromNames.has(name))
		pairs.push({
			fromSlideId: from.id || null,
			toSlideId: to.id || null,
			matched,
			unmatchedSource,
			unmatchedDestination,
			expectedMorphBehavior: unmatchedSource.length || unmatchedDestination.length ? 'unmatched objects fade rather than morph' : 'matched names morph',
			matchingPolicy: to?.transition?.matchingPolicy || policy.unmatched || 'warn',
		})
	}
	const required = Array.isArray(policy.requiredPairs) ? policy.requiredPairs : []
	const missingRequired = []
	for (const pair of required) {
		const fromName = pair?.from || pair?.name
		const toName = pair?.to || pair?.name
		if (!fromName || !toName) continue
		const found = pairs.some(item =>
			item.matched.some(match => match.name === fromName) && item.matched.some(match => match.name === toName)
			|| item.matched.some(match => match.name === fromName && fromName === toName))
		if (!found) missingRequired.push({ from: fromName, to: toName })
	}
	const strictSlide = pairs.some((_, index) => String((slides[index + 1] || {}).transition?.matchingPolicy || '').toLowerCase() === 'strict')
	const unmatchedExists = pairs.some(item => item.unmatchedSource.length || item.unmatchedDestination.length)
	const blocksSave = Boolean(
		(policy.requiredPairFailure === 'block' && missingRequired.length)
		|| (policy.unmatched === 'block' && unmatchedExists)
		|| (strictSlide && unmatchedExists),
	)
	return {
		pairCount: pairs.length,
		unmatchedPolicy: policy.unmatched || 'warn',
		fallback: policy.fallback || 'fade',
		requiredPairs: required,
		missingRequiredPairs: missingRequired,
		blocksSave,
		pairs,
	}
}

export function buildHtmlFontReport(spec = {}) {
	const policy = spec.fontPolicy || spec.validation?.fontPolicy || { mode: 'substitute-and-warn' }
	const requestedCounts = new Map()
	for (const block of (spec.slides || []).flatMap(slide => slide?.content || [])) {
		const face = block?.style?.fontFace || block?.fontFace
		if (face) requestedCounts.set(String(face), (requestedCounts.get(String(face)) || 0) + 1)
	}
	const theme = spec.theme || {}
	for (const face of [theme.headFontFace, theme.bodyFontFace, theme.fontFace]) {
		if (face && !requestedCounts.has(String(face))) requestedCounts.set(String(face), 0)
	}
	const fonts = []
	const seen = new Set()
	for (const entry of spec.htmlFontStacks || []) {
		const stack = Array.isArray(entry?.stack) ? entry.stack : []
		const requested = stack[0]
		if (!requested || seen.has(requested)) continue
		seen.add(requested)
		const fallback = stack.find(face => face !== requested) || 'the source-declared fallback'
		const available = fontFaceAvailable(requested)
		fonts.push({
			requested,
			stack,
			selector: entry.selector || null,
			availableOnCompiler: available,
			availableOnPowerPointRenderer: available,
			embedded: false,
			fallback,
			affectedObjects: requestedCounts.get(requested) || 0,
			layoutDriftRisk: available ? 'low' : (fallback && fallback !== requested ? 'medium' : 'high'),
		})
	}
	for (const [requested, count] of requestedCounts.entries()) {
		if (seen.has(requested)) {
			const existing = fonts.find(item => item.requested === requested)
			if (existing && !existing.affectedObjects) existing.affectedObjects = count
			continue
		}
		seen.add(requested)
		fonts.push({
			requested,
			stack: [requested],
			availableOnCompiler: fontFaceAvailable(requested),
			availableOnPowerPointRenderer: fontFaceAvailable(requested),
			embedded: false,
			fallback: 'the destination default face',
			affectedObjects: count,
			layoutDriftRisk: fontFaceAvailable(requested) ? 'low' : 'medium',
		})
	}
	return {
		mode: policy.mode || 'substitute-and-warn',
		fonts,
		requested: fonts.map(item => item.requested),
		hostEmbedding: 'not-embedded',
		destinationSubstitutionRisk: fonts.some(item => item.layoutDriftRisk !== 'low'),
		blocksSave: String(policy.mode || '').toLowerCase() === 'strict-match' && fonts.some(item => item.availableOnCompiler === false),
		note: 'Unless a licensed font is embedded, PowerPoint may substitute an installed face. That can change wrapping, alignment, card height, and animation bounds. Default policy is substitute-and-warn using the source-declared fallback. strict-match blocks save.',
	}
}

export function buildHtmlFidelityReports(spec = {}) {
	const motionTimeline = buildHtmlMotionReport(spec)
	const nodes = (spec.slides || []).flatMap(slide => [
		...(slide.htmlFallbacks || []).flatMap(entry => entry.atmosphereNodes || []),
		...(slide.atmosphereReadback || []).flatMap(entry => entry.nodes || []),
	])
	return {
		motionTimeline,
		morphContinuity: buildHtmlMorphContinuityReport(spec),
		fontReport: buildHtmlFontReport(spec),
		detectedSourceModes: spec.detectedSourceModes || [],
		selectedOutputVariants: spec.selectedOutputVariants || (spec.outputVariant ? [spec.outputVariant] : []),
		representationFallbacks: (spec.slides || []).flatMap(slide => (slide.htmlFallbacks || []).map(entry => ({ slideId: slide.id || entry.slideId || null, ...entry }))),
		atmosphereReadback: atmosphereReadback(nodes),
	}
}
