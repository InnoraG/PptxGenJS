import * as fs from 'fs'
import * as path from 'path'

import type { BrandKit, ExpressiveValidationIssue, ExpressiveValidationResult } from '../types.js'
import { pointerJoin } from './json-pointer.js'
import { findAsset } from '../assets.js'
import { isProceduralAssetHandle } from '../procedural-assets.js'
import { normalizeNativeChartType } from '../chart-presets.js'
import { validateGradientDirectionOption, validateText3DRotationOption, validateWordArtTransformOption } from '../../option-registry.js'

const OBJECT_KINDS = new Set([
	'text',
	'shape',
	'image',
	'chart',
	'table',
	'media',
	'model3d',
	'smartart',
	'wordart',
	'connector',
	'group',
	'placeholder',
	'component',
])

const THEME_TOKENS = new Set([
	'bg/primary',
	'bg/elevated',
	'text/primary',
	'text/muted',
	'accent1',
	'accent2',
	'accent3',
	'accent4',
	'accent5',
	'accent6',
	'link',
	'link/visited',
])

function issue(pointer: string, code: string, message: string): ExpressiveValidationIssue {
	return { pointer, code, message }
}

function objectKind(object: any): string {
	const raw = String(object?.kind || object?.objectType || '').trim()
	if (raw) return raw
	if (object?.chartType || object?.data && object?.options) return 'chart'
	if (object?.shapeType) return 'shape'
	if (object?.mediaType) return 'media'
	if (object?.transform) return 'wordart'
	return ''
}

function findColorTokens(value: unknown, pointer: string, errors: ExpressiveValidationIssue[], brandKit?: BrandKit): void {
	if (typeof value === 'string') {
		if (value.startsWith('theme://')) {
			const token = value.slice('theme://'.length).split('/shade-')[0].split('/tint-')[0].split('/lumMod-')[0]
			if (!THEME_TOKENS.has(token)) {
				errors.push(issue(pointer, 'invalid-color-token', `${value} is not a valid theme token`))
			}
		}
		if (value.startsWith('brand://')) {
			const token = value.slice('brand://'.length).split('/').pop() || ''
			if (!brandKit?.palette?.[token]) {
				errors.push(issue(pointer, 'invalid-brand-token', `${value} does not resolve to a brand kit palette token`))
			}
		}
		return
	}
	if (Array.isArray(value)) {
		value.forEach((item, index) => findColorTokens(item, pointerJoin(pointer, index), errors, brandKit))
		return
	}
	if (value && typeof value === 'object') {
		for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
			findColorTokens(item, pointerJoin(pointer, key), errors, brandKit)
		}
	}
}

function validateGradientFill(value: unknown, pointer: string, errors: ExpressiveValidationIssue[], warnings: ExpressiveValidationIssue[]): void {
	if (!value || typeof value !== 'object') return
	const fill = value as { type?: unknown; gradientDirection?: unknown; gradientStops?: unknown }
	if (fill.type !== 'gradient' && fill.gradientDirection == null && !Array.isArray(fill.gradientStops)) return
	if (fill.gradientDirection == null) return
	const optionIssue = validateGradientDirectionOption(fill.gradientDirection, pointerJoin(pointer, 'gradientDirection'))
	if (!optionIssue) return
	const target = optionIssue.code.endsWith('_ALIAS') ? warnings : errors
	target.push(issue(pointerJoin(pointer, 'gradientDirection'), optionIssue.code.toLowerCase().replace(/_/g, '-'), optionIssue.message))
}

function validateText3DRotations(value: unknown, pointer: string, errors: ExpressiveValidationIssue[], warnings: ExpressiveValidationIssue[]): void {
	if (!value || typeof value !== 'object') return
	const text3D = value as Record<string, unknown>
	for (const key of ['rotationX', 'rotationY', 'rotationZ', 'lightDirection']) {
		const rawValue = text3D[key]
		if (rawValue == null) continue
		const optionIssue = validateText3DRotationOption(rawValue, pointerJoin(pointer, key))
		if (!optionIssue) continue
		const target = optionIssue.code.endsWith('_NORMALIZED') ? warnings : errors
		target.push(issue(pointerJoin(pointer, key), optionIssue.code.toLowerCase().replace(/_/g, '-'), optionIssue.message))
	}
}

function validateWordArt(value: unknown, pointer: string, errors: ExpressiveValidationIssue[], warnings: ExpressiveValidationIssue[]): void {
	if (!value || typeof value !== 'object') return
	const transform = (value as { transform?: unknown }).transform
	if (transform == null) return
	const optionIssue = validateWordArtTransformOption(transform, pointerJoin(pointer, 'transform'))
	if (!optionIssue) return
	const target = optionIssue.code.endsWith('_ALIAS') ? warnings : errors
	target.push(issue(pointerJoin(pointer, 'transform'), optionIssue.code.toLowerCase().replace(/_/g, '-'), optionIssue.message))
}

function srcPath(value: any): string | null {
	if (!value) return null
	if (typeof value === 'string') return value
	if (typeof value === 'object') return String(value.path || value.src || value.file || '')
	return null
}

function pathExistsOrHandle(value: string, repoRoot: string, outputDir: string): boolean {
	if (!value) return false
	if (/^(data:|https?:|icon:|font:\/\/)/.test(value)) return true
	if (isProceduralAssetHandle(value)) return true
	if (/^(stock:\/\/|model3d:\/\/|audio:\/\/|video:\/\/|texture:\/\/)/.test(value)) return !!findAsset(repoRoot, value)
	const resolved = path.isAbsolute(value) ? value : path.resolve(outputDir, value)
	if (fs.existsSync(resolved)) return true
	return fs.existsSync(path.resolve(repoRoot, value))
}

function validateObject(object: any, pointer: string, ctx: {
	errors: ExpressiveValidationIssue[]
	warnings: ExpressiveValidationIssue[]
	names: Set<string>
	coverage: Set<string>
	repoRoot: string
	outputDir: string
	brandKit?: BrandKit
}): void {
	const kind = objectKind(object)
	if (!OBJECT_KINDS.has(kind)) {
		ctx.errors.push(issue(pointerJoin(pointer, 'kind'), 'unknown-object-kind', `Unknown object kind: ${kind || '(missing)'}`))
		return
	}
	ctx.coverage.add(kind)
	const name = object?.name || object?.objectName
	if (name) {
		const key = String(name)
		if (ctx.names.has(key)) ctx.errors.push(issue(pointerJoin(pointer, 'name'), 'duplicate-object-name', `Duplicate object name: ${key}`))
		ctx.names.add(key)
	}
	if (kind === 'text' || kind === 'wordart') {
		if (object.text == null) ctx.errors.push(issue(pointerJoin(pointer, 'text'), 'missing-text', `${kind} object requires text`))
	}
	if (kind === 'shape') {
		if (!(object.shapeType || object.type)) ctx.errors.push(issue(pointerJoin(pointer, 'shapeType'), 'missing-shape-type', 'shape object requires shapeType or type'))
		if (String(object.shapeType || object.type || '').toLowerCase() === 'custgeom') ctx.coverage.add('customGeometry')
		if (Array.isArray(object.coverageTags)) object.coverageTags.forEach((tag: unknown) => ctx.coverage.add(String(tag)))
	}
	if (kind === 'chart') {
		const data = object.data || object.series || (Array.isArray(object.values) ? [{ name: object.name || 'Series', labels: object.labels || object.values.map((_: unknown, index: number) => `P${index + 1}`), values: object.values }] : undefined)
		const composite = Array.isArray(object.charts) || Array.isArray(object.chartType)
		if (composite) {
			const charts = Array.isArray(object.charts) ? object.charts : object.chartType
			if (!Array.isArray(charts) || charts.length === 0) {
				ctx.errors.push(issue(pointerJoin(pointer, 'charts'), 'chart-empty-composite', 'composite chart requires at least one chart definition'))
			} else {
				charts.forEach((chart: any, index: number) => {
					if (!normalizeNativeChartType(chart?.type)) {
						ctx.errors.push(issue(pointerJoin(pointerJoin(pointer, 'charts'), index), 'chart-type-unsupported', `Unsupported native chart type "${String(chart?.type)}"; use one of area, bar, bar3D, bubble, bubble3D, doughnut, line, pie, radar, scatter, treemap, sunburst, histogram, pareto, boxWhisker, waterfall, funnel, or regionMap. Stock and surface still require shape-built objects or preserved reference chart parts.`))
					}
				})
			}
		} else if (!Array.isArray(data) || data.length === 0) {
			ctx.errors.push(issue(pointerJoin(pointer, 'data'), 'chart-empty-series', 'chart object requires at least one series'))
		} else {
			data.forEach((series: any, index: number) => {
				if (!Array.isArray(series?.values) || series.values.length === 0) {
					ctx.errors.push(issue(pointerJoin(pointerJoin(pointer, 'data'), index), 'chart-empty-values', 'chart series requires values'))
				}
			})
			const chartType = String(object.chartType || object.type || '').toLowerCase()
			if (!normalizeNativeChartType(object.chartType || object.type || 'bar')) {
				ctx.errors.push(issue(pointerJoin(pointer, 'chartType'), 'chart-type-unsupported', `Unsupported native chart type "${String(object.chartType || object.type)}"; use chart presets to choose a native, native-composite, or shape-built alternative.`))
			}
			if (chartType.includes('scatter') || chartType.includes('bubble')) {
				const numericSeries = data.filter((series: any) => Array.isArray(series?.values) && series.values.every((value: unknown) => typeof value === 'number' && Number.isFinite(value))).length
				if (numericSeries < 2) {
					ctx.errors.push(issue(pointerJoin(pointer, 'data'), 'chart-xy-series-required', 'scatter and bubble charts require numeric x/y series'))
				}
			}
			if (chartType.includes('bubble')) {
				const hasSizes = data.some((series: any) => Array.isArray(series?.sizes) && series.sizes.length > 0)
				if (!hasSizes) ctx.errors.push(issue(pointerJoin(pointer, 'data'), 'bubble-size-series-required', 'bubble charts require a sizes array'))
			}
		}
	}
	if (kind === 'table' && !Array.isArray(object.rows)) {
		ctx.errors.push(issue(pointerJoin(pointer, 'rows'), 'missing-table-rows', 'table object requires rows'))
	}
	if (kind === 'image' || kind === 'media' || kind === 'model3d') {
		const src = srcPath(object.src || object.path || object.glbFile)
		if (!src) {
			ctx.errors.push(issue(pointerJoin(pointer, 'src'), 'missing-asset-source', `${kind} object requires src/path`))
		} else if (!pathExistsOrHandle(src, ctx.repoRoot, ctx.outputDir)) {
			ctx.errors.push(issue(pointerJoin(pointer, 'src'), 'asset-not-found', `Asset source not found: ${src}`))
		}
		if (kind === 'model3d') {
			ctx.coverage.add('3d')
			if (src && isProceduralAssetHandle(src)) ctx.coverage.add('procedural3d')
		}
	}
	if (kind === 'connector') {
		const from = object.from
		const to = object.to
		if (!from || !to) ctx.errors.push(issue(pointer, 'connector-endpoints-required', 'connector object requires from and to endpoints'))
	}
	validateGradientFill(object.fill, pointerJoin(pointer, 'fill'), ctx.errors, ctx.warnings)
	validateGradientFill(object.options?.fill, pointerJoin(pointerJoin(pointer, 'options'), 'fill'), ctx.errors, ctx.warnings)
	validateText3DRotations(object.text3D, pointerJoin(pointer, 'text3D'), ctx.errors, ctx.warnings)
	validateText3DRotations(object.options?.text3D, pointerJoin(pointerJoin(pointer, 'options'), 'text3D'), ctx.errors, ctx.warnings)
	validateText3DRotations(object.effect3D, pointerJoin(pointer, 'effect3D'), ctx.errors, ctx.warnings)
	validateText3DRotations(object.options?.effect3D, pointerJoin(pointerJoin(pointer, 'options'), 'effect3D'), ctx.errors, ctx.warnings)
	validateWordArt(object.wordArt, pointerJoin(pointer, 'wordArt'), ctx.errors, ctx.warnings)
	validateWordArt(object.options?.wordArt, pointerJoin(pointerJoin(pointer, 'options'), 'wordArt'), ctx.errors, ctx.warnings)
	if (kind === 'group') {
		if (!Array.isArray(object.objects)) {
			ctx.errors.push(issue(pointerJoin(pointer, 'objects'), 'group-objects-required', 'group object requires objects array'))
		} else {
			object.objects.forEach((child: any, index: number) => validateObject(child, pointerJoin(pointerJoin(pointer, 'objects'), index), ctx))
		}
	}
	findColorTokens(object, pointer, ctx.errors, ctx.brandKit)
}

export function validateExpressiveSpec(spec: any, context: { repoRoot: string; outputDir: string; brandKit?: BrandKit }): ExpressiveValidationResult {
	const errors: ExpressiveValidationIssue[] = []
	const warnings: ExpressiveValidationIssue[] = []
	if (!spec || typeof spec !== 'object') {
		return { ok: false, errors: [issue('/spec', 'spec-required', 'spec must be an object')], warnings, objectNames: [], coverage: [] }
	}
	const slides = Array.isArray(spec.slides) ? spec.slides : []
	if (!slides.length) errors.push(issue('/slides', 'slides-required', 'expressive mode requires at least one slide'))
	const names = new Set<string>()
	const coverage = new Set<string>(['deck', 'metadata'])
	slides.forEach((slide, slideIndex) => {
		const slidePointer = pointerJoin('/slides', slideIndex)
		const objects = Array.isArray(slide?.objects) ? slide.objects : []
		const slideNames = new Set<string>()
		validateGradientFill(slide?.background, pointerJoin(slidePointer, 'background'), errors, warnings)
		if (!objects.length) warnings.push(issue(pointerJoin(slidePointer, 'objects'), 'empty-slide-objects', 'slide has no objects'))
		objects.forEach((object: any, objectIndex: number) => validateObject(object, pointerJoin(pointerJoin(slidePointer, 'objects'), objectIndex), {
			errors,
			warnings,
			names: slideNames,
			coverage,
			repoRoot: context.repoRoot,
			outputDir: context.outputDir,
			brandKit: context.brandKit,
		}))
		slideNames.forEach(name => names.add(name))
		if (Array.isArray(slide?.animations)) {
			slide.animations.forEach((animation: any, animationIndex: number) => {
				coverage.add('animation')
				const target = animation?.target
				if (!target) {
					errors.push(issue(pointerJoin(pointerJoin(slidePointer, 'animations'), animationIndex), 'animation-target-required', 'animation requires target'))
				} else if (!slideNames.has(String(target))) {
					errors.push(issue(pointerJoin(pointerJoin(pointerJoin(slidePointer, 'animations'), animationIndex), 'target'), 'animation-target-not-found', `Animation target not found: ${target}`))
				}
			})
		}
	})
	return { ok: errors.length === 0, errors, warnings, objectNames: [...names].sort(), coverage: [...coverage].sort() }
}
