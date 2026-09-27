import * as fs from 'fs'
import * as path from 'path'

import { BETTERPPTX_MCP_BRAND, loadBetterPptxMcpPresentationEngine } from './showcase.js'
import { findAsset } from './assets.js'
import { solveLayout, type Rect } from './layout-solver.js'
import { isProceduralAssetHandle, materializeProceduralAssetHandle } from './procedural-assets.js'
import type { BrandKit, ExpressiveBuildResult } from './types.js'
import { validateExpressiveSpec } from './validation/expressive.js'
import { normalizeNativeChartType } from './chart-presets.js'
import { resolveChartPlan } from './chart-plan.js'

const SLIDE_WIDE = { width: 13.333, height: 7.5 }

export class ExpressiveSpecValidationError extends Error {
	public readonly result: any
	constructor(result: any) {
		super('Expressive spec validation failed')
		this.result = result
	}
}

function ensureDir(dir: string): void {
	fs.mkdirSync(dir, { recursive: true })
}

function cleanColor(value: string): string {
	return value.replace(/^#/, '').toUpperCase()
}

function themeToken(value: string): string {
	const token = value.slice('theme://'.length)
	const head = token.split('/shade-')[0].split('/tint-')[0].split('/lumMod-')[0]
	const map: Record<string, string> = {
		'bg/primary': 'bg1',
		'bg/elevated': 'bg2',
		'text/primary': 'tx1',
		'text/muted': 'tx2',
		accent1: 'accent1',
		accent2: 'accent2',
		accent3: 'accent3',
		accent4: 'accent4',
		accent5: 'accent5',
		accent6: 'accent6',
		link: 'hlink',
		'link/visited': 'folHlink',
	}
	return map[head] || 'accent1'
}

function resolveColor(value: unknown, brandKit?: BrandKit): unknown {
	if (typeof value !== 'string') return value
	if (value.startsWith('theme://')) return themeToken(value)
	if (value.startsWith('brand://')) {
		const key = value.slice('brand://'.length).split('/').pop() || ''
		return cleanColor(brandKit?.palette?.[key] || brandKit?.palette?.accent1 || '20D6E7')
	}
	if (/^#[0-9a-f]{6}$/i.test(value)) return cleanColor(value)
	return value
}

function normalizeOptions<T>(value: T, brandKit?: BrandKit): T {
	if (Array.isArray(value)) return value.map(item => normalizeOptions(item, brandKit)) as T
	if (value && typeof value === 'object') {
		const out: Record<string, unknown> = {}
		for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
			out[key] = normalizeOptions(item, brandKit)
		}
		return out as T
	}
	return resolveColor(value, brandKit) as T
}

function resolvePathLike(value: string, repoRoot: string, outputDir: string): string {
	if (/^(data:|https?:)/.test(value)) return value
	const generated = isProceduralAssetHandle(value) ? materializeProceduralAssetHandle(value, repoRoot, outputDir) : null
	if (generated) return generated.src
	const catalogAsset = findAsset(repoRoot, value)
	if (catalogAsset) return catalogAsset.src
	if (path.isAbsolute(value)) return value
	const outputRelative = path.resolve(outputDir, value)
	if (fs.existsSync(outputRelative)) return outputRelative
	return path.resolve(repoRoot, value)
}

function resolveAsset(value: any, repoRoot: string, outputDir: string): any {
	if (!value) return value
	if (typeof value === 'string') return resolvePathLike(value, repoRoot, outputDir)
	if (typeof value === 'object') {
		if (value.data) return value.data
		if (value.path) return resolvePathLike(String(value.path), repoRoot, outputDir)
		if (value.src) return resolvePathLike(String(value.src), repoRoot, outputDir)
	}
	return value
}

function dataUriForImage(filePath: string): string | undefined {
	if (!fs.existsSync(filePath)) return undefined
	const ext = path.extname(filePath).toLowerCase()
	const mime = ext === '.svg'
		? 'image/svg+xml'
		: ext === '.jpg' || ext === '.jpeg'
			? 'image/jpeg'
			: 'image/png'
	return `data:${mime};base64,${fs.readFileSync(filePath).toString('base64')}`
}

function objectName(object: any): string | undefined {
	return object?.objectName || object?.name
}

function baseOptions(object: any, rect?: Rect, brandKit?: BrandKit): any {
	const reserved = new Set(['kind', 'objectType', 'text', 'objects', 'chartType', 'charts', 'data', 'series', 'labels', 'values', 'rows', 'src', 'path', 'mediaType', 'shapeType', 'type', 'animations', 'from', 'to', 'name', 'options', 'place', 'featureBudget', 'chartPresetId', 'chartGalleryTilePresetId', 'chartStylePresetId', 'chartGalleryVariant', 'chartStyleId', 'chartStyleModernId', 'chartColorStyleId', 'chartLayoutPresetId', 'chartTreatmentPresetId', 'chartTreatmentPresetIds'])
	const options: Record<string, unknown> = {}
	for (const [key, value] of Object.entries(object || {})) {
		if (!reserved.has(key)) options[key] = value
	}
	const explicit = object?.options && typeof object.options === 'object' ? object.options : {}
	return normalizeOptions({
		...options,
		...explicit,
		x: rect?.x ?? object?.x ?? explicit.x ?? 0.7,
		y: rect?.y ?? object?.y ?? explicit.y ?? 0.7,
		w: rect?.w ?? object?.w ?? explicit.w ?? 4,
		h: rect?.h ?? object?.h ?? explicit.h ?? 1,
		...(objectName(object) ? { objectName: objectName(object) } : {}),
	}, brandKit)
}

function richText(value: any, brandKit?: BrandKit): any {
	if (!Array.isArray(value)) return value == null ? '' : String(value)
	return value.map(run => {
		if (run?.options) return { text: String(run.text || ''), options: normalizeOptions(run.options, brandKit) }
		const { text, ...options } = run || {}
		return { text: String(text || ''), options: normalizeOptions(options, brandKit) }
	})
}

function chartData(object: any): any[] {
	if (Array.isArray(object?.data)) return object.data
	if (Array.isArray(object?.series)) return object.series
	if (Array.isArray(object?.values)) {
		return [{
			name: object.name || object.seriesName || 'Series',
			labels: Array.isArray(object.labels) ? object.labels : object.values.map((_: unknown, index: number) => `P${index + 1}`),
			values: object.values,
		}]
	}
	return []
}

function objectKind(object: any): string {
	return String(object?.kind || object?.objectType || (object?.shapeType ? 'shape' : '') || '').trim()
}

function collectNamedObjects(objects: any[] = [], predicate: (object: any) => boolean): string[] {
	const names: string[] = []
	for (const object of objects) {
		if (predicate(object)) {
			const name = objectName(object)
			if (name) names.push(String(name))
		}
		if (Array.isArray(object?.objects)) names.push(...collectNamedObjects(object.objects, predicate))
	}
	return names
}

function isLiveModel3DAnimation(animation: any): boolean {
	const kind = String(animation?.kind || animation?.type || '').toLowerCase()
	const effect = String(animation?.effect || animation?.motionPath || animation?.path || '').toLowerCase()
	return kind === 'motionpath'
		|| kind === 'motion'
		|| ['spin', 'growandturn', 'centerrevolve', 'boomerang', 'teeter'].includes(effect)
}

function ensureModel3DLiveDynamics(spec: any): void {
	const budget = spec?.featureBudget || {}
	if (budget.motionLevel === 'none' || spec?.disableAutoModel3DAnimation) return
	for (const slide of Array.isArray(spec?.slides) ? spec.slides : []) {
		const modelNames = collectNamedObjects(slide?.objects, object => objectKind(object) === 'model3d')
		if (!modelNames.length) continue
		if (!Array.isArray(slide.animations)) slide.animations = []
		for (const name of modelNames) {
			const existing = slide.animations.filter((animation: any) => String(animation?.target || '') === name)
			if (existing.some(isLiveModel3DAnimation)) continue
			slide.animations.push(
				{ target: name, kind: 'emphasis', effect: 'spin', rotation: 16, duration: 1400, trigger: existing.length ? 'afterPrevious' : 'afterPrevious' },
				{ target: name, kind: 'motionPath', path: 'sineWave', duration: 1600, trigger: 'withPrevious' }
			)
			slide.notes = slide.notes
				? `${typeof slide.notes === 'string' ? slide.notes : JSON.stringify(slide.notes)}\nGenerated by ${BETTERPPTX_MCP_BRAND}: injected live 3D spin and motion-path cues for ${name}.`
				: `Generated by ${BETTERPPTX_MCP_BRAND}: injected live 3D spin and motion-path cues for ${name}.`
		}
	}
}

function center(rect: Rect): { x: number; y: number } {
	return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 }
}

async function addPrimitive(slide: any, object: any, ctx: {
	repoRoot: string
	outputDir: string
	brandKit?: BrandKit
	rects: Map<string, Rect>
	coverage: Set<string>
	offset?: { x: number; y: number }
	}, rect: Rect): Promise<void> {
	const offset = ctx.offset || { x: 0, y: 0 }
	const placed = { ...rect, x: rect.x + offset.x, y: rect.y + offset.y }
	const kind = objectKind(object)
	const name = objectName(object)
	if (name) ctx.rects.set(name, placed)
	ctx.coverage.add(kind)
	if (kind === 'text' || kind === 'wordart') {
		const options = baseOptions(object, placed, ctx.brandKit)
		if (kind === 'wordart') {
			options.wordArt = object.wordArt || { transform: object.transform || 'textArchUp', adjustments: object.adjustments }
		}
		slide.addText(richText(object.text, ctx.brandKit), options)
		return
	}
	if (kind === 'shape') {
		slide.addShape(object.shapeType || object.type || 'rect', baseOptions(object, placed, ctx.brandKit))
		return
	}
	if (kind === 'image') {
		const srcHandle = object.src || object.path
		const src = resolveAsset(srcHandle, ctx.repoRoot, ctx.outputDir)
		const options = baseOptions(object, placed, ctx.brandKit)
		if (!options.altText) {
			const catalogAsset = typeof srcHandle === 'string' ? findAsset(ctx.repoRoot, srcHandle) : undefined
			options.altText = catalogAsset?.altText || `${BETTERPPTX_MCP_BRAND} image asset`
		}
		if (typeof src === 'string' && src.startsWith('data:')) slide.addImage({ ...options, data: src })
		else slide.addImage({ ...options, path: src })
		return
	}
	if (kind === 'chart') {
		const options = baseOptions(object, placed, ctx.brandKit)
		const rawChartType = object.chartType || object.type || (object?.options && object.options.chartType)
		const requestedPlan = {
			...(object?.options && typeof object.options === 'object' ? object.options : {}),
			...Object.fromEntries(['chartPresetId', 'chartType', 'chartGalleryTilePresetId', 'chartStylePresetId', 'chartGalleryVariant', 'chartStyleId', 'chartStyleModernId', 'chartColorStyleId', 'chartLayoutPresetId', 'chartTreatmentPresetId', 'chartTreatmentPresetIds'].filter(key => object?.[key] != null).map(key => [key, object[key]])),
		}
		const resolvedPlan = await resolveChartPlan(requestedPlan, ctx.repoRoot)
		Object.assign(options, resolvedPlan.plan)
		if (Array.isArray(object.charts) || Array.isArray(object.chartType)) {
			const charts = (object.charts || object.chartType).map((chart: any) => ({
				...chart,
				type: normalizeNativeChartType(chart?.type) || chart?.type,
				options: String(chart?.type || '').toLowerCase().includes('column')
					? { ...(chart?.options || {}), barDir: chart?.options?.barDir || 'col' }
					: chart?.options,
			}))
			slide.addChart(charts as any, options)
		} else {
			const selectedChartType = resolvedPlan.plan.chartType || rawChartType || 'bar'
			const chartType = normalizeNativeChartType(selectedChartType) || selectedChartType
			const lower = String(chartType).toLowerCase()
			if (/scatter|bubble|radar|doughnut|bar3d|area|line/.test(lower)) ctx.coverage.add('advancedCharts')
			if (String(rawChartType).toLowerCase().includes('column')) options.barDir = options.barDir || 'col'
			slide.addChart(chartType as any, chartData(object), options)
		}
		return
	}
	if (kind === 'table') {
		slide.addTable(object.rows || [], baseOptions(object, placed, ctx.brandKit))
		return
	}
	if (kind === 'media') {
		const srcHandle = object.src || object.path
		const src = resolveAsset(srcHandle, ctx.repoRoot, ctx.outputDir)
		const coverAsset = object.cover ? resolveAsset(object.cover, ctx.repoRoot, ctx.outputDir) : undefined
		const cover = typeof coverAsset === 'string' && !/^(data:|https?:)/.test(coverAsset)
			? dataUriForImage(coverAsset)
			: coverAsset
		const options = baseOptions(object, placed, ctx.brandKit)
		if (!options.altText) {
			const catalogAsset = typeof srcHandle === 'string' ? findAsset(ctx.repoRoot, srcHandle) : undefined
			options.altText = catalogAsset?.altText || `${BETTERPPTX_MCP_BRAND} media asset`
		}
		slide.addMedia({ ...options, type: object.mediaType || object.type || 'video', path: src, ...(cover ? { cover } : {}) } as any)
		return
	}
	if (kind === 'model3d') {
		const srcHandle = object.src || object.path || object.glbFile
		const generated = typeof srcHandle === 'string' && isProceduralAssetHandle(srcHandle) ? materializeProceduralAssetHandle(srcHandle, ctx.repoRoot, ctx.outputDir) : null
		const src = resolveAsset(srcHandle, ctx.repoRoot, ctx.outputDir)
		const fallbackHandle = object.fallbackImage || object.rasterFile
		const catalogPreview = typeof srcHandle === 'string' ? findAsset(ctx.repoRoot, srcHandle)?.preview : undefined
		const catalogAsset = typeof srcHandle === 'string' ? findAsset(ctx.repoRoot, srcHandle) : undefined
		const fallback = fallbackHandle ? resolveAsset(fallbackHandle, ctx.repoRoot, ctx.outputDir) : generated?.preview || catalogPreview
		const options = baseOptions(object, placed, ctx.brandKit)
		if (!options.altText) options.altText = catalogAsset?.altText || `${BETTERPPTX_MCP_BRAND} native 3D asset`
		ctx.coverage.add('3d')
		if (generated) ctx.coverage.add('procedural3d')
		slide.addModel3D({ ...options, glbFile: src, ...(fallback ? { rasterFile: fallback } : {}) } as any)
		return
	}
	if (kind === 'connector') {
		const from = typeof object.from === 'string' ? center(ctx.rects.get(object.from) || placed) : object.from
		const to = typeof object.to === 'string' ? center(ctx.rects.get(object.to) || { ...placed, x: placed.x + placed.w, y: placed.y }) : object.to
		const x = Number(from?.x ?? placed.x)
		const y = Number(from?.y ?? placed.y)
		const endX = Number(to?.x ?? x + placed.w)
		const endY = Number(to?.y ?? y)
		slide.addShape(object.type || 'line', { ...baseOptions(object, { x, y, w: endX - x, h: endY - y }, ctx.brandKit), x, y, w: endX - x, h: endY - y } as any)
		return
	}
	if (kind === 'placeholder') {
		slide.addText(richText(object.text || '', ctx.brandKit), { ...baseOptions(object, placed, ctx.brandKit), placeholder: object.phType || object.placeholder || 'body' } as any)
		return
	}
	if (kind === 'smartart') {
		slide.addSmartArt({
			...baseOptions(object, placed, ctx.brandKit),
			layout: object.layout || object.diagram || 'process',
			nodes: object.nodes || object.items || [object.title || object.name || 'Plan', 'Build', 'Validate'],
			title: object.title,
			palette: object.palette || ctx.brandKit.palette,
			color: object.color || 'FFFFFF',
			fontSize: object.fontSize || 10,
		} as any)
		return
	}
	if (kind === 'component') {
		const options = baseOptions(object, placed, ctx.brandKit)
		slide.addShape('roundRect', { ...options, fill: object.fill || { color: '102233' }, line: object.line || { color: '20D6E7', transparency: 25 } } as any)
		slide.addText(object.title || object.diagram || object.name || kind, { x: placed.x + 0.16, y: placed.y + 0.18, w: Math.max(0.5, placed.w - 0.32), h: 0.28, fontSize: 12, bold: true, color: 'FFFFFF', margin: 0 } as any)
		return
	}
	if (kind === 'group') {
		const childObjects = Array.isArray(object.objects) ? object.objects : []
		const childRects = solveLayout(object.componentLayout, childObjects, { width: placed.w, height: placed.h }, ctx.brandKit)
		for (let index = 0; index < childObjects.length; index += 1) {
			await addPrimitive(slide, childObjects[index], { ...ctx, offset: { x: placed.x, y: placed.y } }, childRects[index])
		}
	}
}

function addAnimation(slide: any, animation: any, coverage: Set<string>): void {
	const kind = String(animation?.kind || animation?.type || 'entrance')
	const props: Record<string, unknown> = { ...animation }
	delete props.kind
	delete props.target
	if (kind === 'motionPath') {
		props.type = 'motion'
		props.motionPath = animation.path || animation.motionPath || 'right'
	} else {
		props.type = kind === 'media' ? 'media' : kind
	}
	if (animation.effect) props.effect = animation.effect
	if (animation.trigger) props.trigger = animation.trigger
	if (!props.trigger) props.trigger = 'afterPrevious'
	coverage.add(kind === 'motionPath' ? 'motionPath' : 'animation')
	slide.addAnimation(String(animation.target), props as any)
}

function sourceForSpec(title: string, spec: any, mode: string): string {
	return `#!/usr/bin/env node
/**
 * ${BETTERPPTX_MCP_BRAND} deterministic public source.
 * Replays the original MCP deck specification.
 */
const deck = await betterpptx-mcp.presentation.create(${JSON.stringify({ title, mode, spec }, null, 2)})
await deck.writeFile(${JSON.stringify(`${title.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'betterpptx-mcp-deck'}.pptx`)})
`
}

export async function buildExpressiveDeck(args: any, outputPath: string, sourcePath: string, repoRoot: string): Promise<ExpressiveBuildResult> {
	const spec = args?.spec || {}
	ensureModel3DLiveDynamics(spec)
	const outputDir = path.dirname(outputPath)
	const brandKit: BrandKit | undefined = spec.brandKit?.inline || args?.brandKit?.inline || args?.brandKit
	const expressiveValidation = validateExpressiveSpec(spec, { repoRoot, outputDir, brandKit })
	if (!expressiveValidation.ok) {
		throw new ExpressiveSpecValidationError({
			success: false,
			ok: false,
			mode: 'expressive',
			errors: expressiveValidation.errors,
			warnings: expressiveValidation.warnings,
		})
	}
	const PresentationEngine = await loadBetterPptxMcpPresentationEngine()
	const pptx: any = new PresentationEngine()
	const title = String(args?.title || spec.title || `${BETTERPPTX_MCP_BRAND} expressive deck`)
	pptx.layout = spec.size?.name || 'LAYOUT_WIDE'
	pptx.author = BETTERPPTX_MCP_BRAND
	pptx.company = BETTERPPTX_MCP_BRAND
	pptx.subject = spec.meta?.subject || `${BETTERPPTX_MCP_BRAND} expressive presentation`
	pptx.title = title
	pptx.lang = spec.rtl ? 'ar-SA' : 'en-US'
	if (spec.theme || brandKit) {
		pptx.theme = {
			headFontFace: brandKit?.fonts?.majorLatin || spec.theme?.headFontFace || 'Aptos Display',
			bodyFontFace: brandKit?.fonts?.minorLatin || spec.theme?.bodyFontFace || 'Aptos',
			lang: pptx.lang,
		}
	}
	const coverage = new Set<string>(expressiveValidation.coverage)
	for (const section of Array.isArray(spec.sections) ? spec.sections : []) {
		if (section?.title && typeof pptx.addSection === 'function') pptx.addSection({ title: String(section.title) })
	}
	for (const slideSpec of spec.slides || []) {
		const slide = pptx.addSlide(slideSpec.layout || undefined)
		if (slideSpec.background) {
			if (typeof slideSpec.background === 'string') slide.background = { color: resolveColor(slideSpec.background, brandKit) }
			else slide.background = normalizeOptions(slideSpec.background, brandKit)
		}
		if (slideSpec.transition) slide.transition = normalizeOptions(slideSpec.transition, brandKit)
		if (slideSpec.hidden) slide.hidden = true
		const objects = Array.isArray(slideSpec.objects) ? slideSpec.objects : []
		const rects = solveLayout(slideSpec.componentLayout, objects, SLIDE_WIDE, brandKit)
		const objectRects = new Map<string, Rect>()
		for (let index = 0; index < objects.length; index += 1) {
			await addPrimitive(slide, objects[index], { repoRoot, outputDir, brandKit, rects: objectRects, coverage }, rects[index])
		}
		for (const animation of Array.isArray(slideSpec.animations) ? slideSpec.animations : []) {
			addAnimation(slide, animation, coverage)
		}
		if (slideSpec.notes) slide.addNotes(typeof slideSpec.notes === 'string' ? slideSpec.notes : JSON.stringify(slideSpec.notes, null, 2))
		else slide.addNotes(`Generated by ${BETTERPPTX_MCP_BRAND}. Expressive MCP deck.`)
	}
	await pptx.writeFile({ fileName: outputPath, compression: true })
	ensureDir(path.dirname(sourcePath))
	fs.writeFileSync(sourcePath, sourceForSpec(title, spec, 'expressive'))
	const coverageReport = {
		brand: BETTERPPTX_MCP_BRAND,
		mode: 'expressive',
		slideCount: pptx.slides.length,
		features: [...coverage].sort(),
		objectNames: expressiveValidation.objectNames,
		warnings: expressiveValidation.warnings,
	}
	return {
		mode: 'expressive',
		slideCount: pptx.slides.length,
		features: [...coverage].sort(),
		coverageReport,
		validation: expressiveValidation,
		designPlan: spec.designPlan,
		featureUsePlan: spec.featureUsePlan,
		designGate: spec.designGate,
		recipesApplied: spec.recipesApplied,
		featureBudget: spec.featureBudget,
	}
}
