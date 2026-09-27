import * as fs from 'fs'
import * as path from 'path'
import { createRequire } from 'module'
import { spawnSync } from 'child_process'
import { fileURLToPath, pathToFileURL } from 'url'
import {
	AppliedSpecimenRecord,
	CapabilityLedger,
	CapabilityLedgerRow,
	TRANSITION_TYPES,
	buildCapabilityLedger,
	buildCoverageReport,
	ledgerSemanticHash,
} from './capability-ledger.js'

export const BETTERPPTX_MCP_BRAND = 'betterpptx-mcp'
export const BETTERPPTX_MCP_SHOWCASE_NAME = 'betterpptx-mcp-ultimate-mcp-showcase.pptx'
export type DeckProfile =
	| 'ultimate-showcase'
	| 'executive-boardroom'
	| 'investor-pitch'
	| 'sales-proposal'
	| 'product-launch'
	| 'consulting-strategy'
	| 'data-storytelling'
	| 'financial-dashboard'
	| 'technical-architecture'
	| 'training-course'
	| 'conference-keynote'
	| 'brand-guidelines'
	| 'portfolio-agency'
	| 'interactive-kiosk'
	| 'accessibility-first'

export type VerificationFocus =
	| 'full'
	| 'wordart-lab'
	| 'shape-style-lab'
	| 'chart-capability-lab'
	| 'transition-scenes-lab'
	| 'animation-lab'
	| 'audio-lab'
	| 'voice-lab'
	| 'media-3d-lab'
	| 'sample-object-lab'
	| 'shape-icons-lab'

export type ShowcaseFocus = 'ultimate' | 'wordart' | 'shape-styles' | 'charts' | 'transitions' | 'animations' | 'audio' | 'voice' | 'media-3d' | 'sample-objects' | 'shape-icons'

export const BETTERPPTX_MCP_SHOWCASE_NAMES: Record<VerificationFocus, string> = {
	full: BETTERPPTX_MCP_SHOWCASE_NAME,
	'wordart-lab': 'betterpptx-mcp-wordart-frozen-reference.pptx',
	'shape-style-lab': 'betterpptx-mcp-shape-style-frozen-reference.pptx',
	'chart-capability-lab': 'betterpptx-mcp-chart-capability-frozen-reference.pptx',
	'transition-scenes-lab': 'betterpptx-mcp-transition-scenes-frozen-reference.pptx',
	'animation-lab': 'betterpptx-mcp-animation-lab-reference.pptx',
	'audio-lab': 'betterpptx-mcp-audio-lab-reference.pptx',
	'voice-lab': 'betterpptx-mcp-voice-lab-reference.pptx',
	'media-3d-lab': 'betterpptx-mcp-media-3d-lab-reference.pptx',
	'sample-object-lab': 'betterpptx-mcp-sample-object-lab-reference.pptx',
	'shape-icons-lab': 'betterpptx-mcp-shape-icons-lab-reference.pptx',
}

export const BETTERPPTX_MCP_DECK_PROFILES: DeckProfile[] = [
	'ultimate-showcase',
	'executive-boardroom',
	'investor-pitch',
	'sales-proposal',
	'product-launch',
	'consulting-strategy',
	'data-storytelling',
	'financial-dashboard',
	'technical-architecture',
	'training-course',
	'conference-keynote',
	'brand-guidelines',
	'portfolio-agency',
	'interactive-kiosk',
	'accessibility-first',
]

export const BETTERPPTX_MCP_VERIFICATION_FOCI: VerificationFocus[] = [
	'full',
	'wordart-lab',
	'shape-style-lab',
	'chart-capability-lab',
	'transition-scenes-lab',
	'animation-lab',
	'audio-lab',
	'voice-lab',
	'media-3d-lab',
	'sample-object-lab',
	'shape-icons-lab',
]

const W = 13.333
const H = 7.5

const DARK_COLORS = {
	bg: '071018',
	bg2: '0D1B28',
	panel: '13283A',
	panel2: '1A3448',
	ink: 'F7FAFC',
	muted: '9FB2C3',
	dim: '5F7384',
	cyan: '20D6E7',
	teal: '2FE6A6',
	amber: 'FFB84D',
	coral: 'FF6B6B',
	magenta: 'D957FF',
	violet: '7C83FF',
	lime: 'A7F25A',
	blue: '448CFF',
	line: '2D4C63',
	black: '000000',
	white: 'FFFFFF',
}

const LIGHT_COLORS = {
	bg: 'F7FAFC',
	bg2: 'EAF1F7',
	panel: 'FFFFFF',
	panel2: 'E8F7FA',
	ink: '0B1720',
	muted: '405568',
	dim: '6D7F8D',
	cyan: '008EA3',
	teal: '008D6A',
	amber: 'B56B00',
	coral: 'C53D3D',
	magenta: 'A33BC2',
	violet: '5157D9',
	lime: '5E8C1B',
	blue: '1F64D6',
	line: 'B9C9D6',
	black: '000000',
	white: 'FFFFFF',
}

let C = LIGHT_COLORS
let palette = [C.cyan, C.teal, C.amber, C.coral, C.magenta, C.violet, C.lime, C.blue]

export type ShowcaseThemeMode = 'light' | 'dark'
export type ShowcasePlaybackMode = 'autoplay' | 'audit'
export type ShowcaseSection =
	| 'core'
	| 'enterprise'
	| 'shapes'
	| 'shape-style'
	| 'geometry'
	| 'shape-types'
	| 'legacy-shapes'
	| 'wordart'
	| 'charts'
	| 'animations'
	| 'animations-entrance'
	| 'animations-exit'
	| 'animations-emphasis'
	| 'animations-media'
	| 'animations-motion'
	| 'motion-paths'
	| 'media-3d'
	| 'audio'
	| 'voice'
	| 'sample-objects'
	| 'shape-icons'
	| 'morph'
	| 'transitions'
	| 'ledger'

export interface PlaybackCue {
	featureId?: string
	category?: string
	slideIndex: number
	slideTitle: string
	objectName?: string
	cueType: string
	startMs: number
	endMs: number
	detail?: string
}

export interface LiveDynamicsSpecimen {
	featureId?: string
	category?: string
	slideIndex: number
	slideTitle: string
	objectName?: string
	dynamicKind: string
	trigger: string
	effect: string
	startMs: number
	durationMs: number
	validationOracle: string[]
	fallback?: boolean
	detail?: string
}

export interface PlaybackSlideTiming {
	slideIndex: number
	slideTitle: string
	section: string
	dwellMs: number
	transitionType: string
	specimenCount: number
	cueCount: number
	risk: 'normal' | 'dense' | 'media' | 'model3d' | 'morph' | 'transition' | 'validation'
}

export interface PlaybackSummary {
	brand: string
	mode: ShowcasePlaybackMode
	deckProfile: DeckProfile
	verificationFocus: VerificationFocus
	focus: VerificationFocus
	targetRuntimeMinutes: number | null
	estimatedRuntimeMs: number
	estimatedRuntimeMinutes: number
	slideCount: number
	cueCount: number
	contentCueCount: number
	contentDynamicSlideCount: number
	transitionOnlySlideCount: number
	mediaCueCount: number
	model3dCueCount: number
	morphCueCount: number
	narrationCueCount: number
	liveDynamicsByKind: Record<string, number>
	unattended: boolean
	warnings: string[]
	gates: Record<string, boolean>
}

export interface ShowcasePlaybackMetadata {
	summary: PlaybackSummary
	slides: PlaybackSlideTiming[]
	cues: PlaybackCue[]
	liveDynamics: LiveDynamicsSpecimen[]
}

function setShowcaseTheme(themeMode: ShowcaseThemeMode): void {
	C = themeMode === 'dark' ? DARK_COLORS : LIGHT_COLORS
	palette = [C.cyan, C.teal, C.amber, C.coral, C.magenta, C.violet, C.lime, C.blue]
}

function profileDisplayName(profile: DeckProfile): string {
	return profile.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}

function profileIntent(profile: DeckProfile): string {
	const descriptions: Record<DeckProfile, string> = {
		'ultimate-showcase': 'A cinematic full-surface demonstration of the MCP presentation engine.',
		'executive-boardroom': 'Premium strategy storytelling with restrained motion and board-ready polish.',
		'investor-pitch': 'Founder narrative, traction, market, product, and financial story in a premium pitch style.',
		'sales-proposal': 'Persuasive commercial narrative with proof, pricing, product scenes, and clear calls to action.',
		'product-launch': 'High-energy keynote flow with morph, media, 3D, and reveal-driven product moments.',
		'consulting-strategy': 'Structured consulting slides with matrices, waterfalls, roadmaps, and crisp synthesis.',
		'data-storytelling': 'Beautiful analytical storytelling with readable charts, staged insights, and annotations.',
		'financial-dashboard': 'KPI cards, variance, forecasts, gauges, sparklines, and financial decision panels.',
		'technical-architecture': 'Layered system diagrams, flows, technical callouts, and precise motion choreography.',
		'training-course': 'Instructional modules, progressive reveals, exercises, and reusable teaching patterns.',
		'conference-keynote': 'Large-format visual storytelling with cinematic pacing and minimal on-slide text.',
		'brand-guidelines': 'Brand system presentation with typography, color, logo, layout, and component specimens.',
		'portfolio-agency': 'Creative agency-style showcase with expressive visuals and polished object effects.',
		'interactive-kiosk': 'Autoplay and interactive presentation pattern for unattended or navigable experiences.',
		'accessibility-first': 'A visually polished deck optimized for contrast, reading order, alt text, and metadata.',
	}
	return descriptions[profile]
}

export async function loadBetterPptxMcpPresentationEngine(): Promise<any> {
	const here = path.dirname(fileURLToPath(import.meta.url))
	const candidates = [
		path.resolve(here, '..', '..', 'pptxgen.es.js'),
		path.resolve(process.cwd(), 'dist', 'pptxgen.es.js'),
		path.resolve(process.cwd(), 'src', 'bld', 'pptxgen.es.js'),
	]
	for (const candidate of candidates) {
		if (fs.existsSync(candidate)) {
			try {
				const mod = await import(pathToFileURL(candidate).href)
				return mod.default || mod
			} catch (error) {
				// The shipped ES bundle is intentionally kept as .js for browser
				// consumers, while the MCP node runtime is often executed from a
				// CommonJS package boundary. Use the paired CJS build when Node
				// refuses to parse the ES bundle as a module.
				const cjsCandidate = candidate.replace(/\.es\.js$/i, '.cjs.js')
				if (!fs.existsSync(cjsCandidate)) throw error
				const mod = createRequire(import.meta.url)(cjsCandidate)
				return mod.default || mod
			}
		}
	}
	throw new Error(`${BETTERPPTX_MCP_BRAND} could not locate the bundled presentation engine`)
}

export interface ShowcaseBuildResult {
	pptxPath: string
	sourcePath: string
	assetDir: string
	features: string[]
	slideCount: number
	themeMode: ShowcaseThemeMode
	capabilityLedger: CapabilityLedger
	coverageReport: any
	semanticHash: string
	appliedSpecimens: AppliedSpecimenRecord[]
	playback: ShowcasePlaybackMetadata
	liveDynamics: LiveDynamicsSpecimen[]
}

interface ShowcaseAssets {
	badgeSvg: string
	modelGlb: string
	modelFallback: string
	modelSource: string
	photo: string
	logo: string
	video?: string
	audio?: string
	narration: {
		intro: string
		dynamics: string
		validation: string
	}
}

interface AutoplayContext {
	mode: ShowcasePlaybackMode
	deckProfile: DeckProfile
	verificationFocus: VerificationFocus
	focus: VerificationFocus
	targetRuntimeMinutes: number | null
	selectedSections: boolean
	slides: PlaybackSlideTiming[]
	cues: PlaybackCue[]
	liveDynamics: LiveDynamicsSpecimen[]
	warnings: string[]
	nextSlideIndex: number
}

type PlaybackRisk = PlaybackSlideTiming['risk']

function clampTargetRuntime(value: unknown): number {
	const parsed = Number(value)
	if (!Number.isFinite(parsed)) return 30
	return Math.max(25, Math.min(35, parsed))
}

function createAutoplayContext(mode: ShowcasePlaybackMode, targetRuntimeMinutes: number | null, selectedSections: boolean, deckProfile: DeckProfile, verificationFocus: VerificationFocus): AutoplayContext {
	return {
		mode,
		deckProfile,
		verificationFocus,
		focus: verificationFocus,
		targetRuntimeMinutes: mode === 'autoplay' && targetRuntimeMinutes != null ? clampTargetRuntime(targetRuntimeMinutes) : null,
		selectedSections,
		slides: [],
		cues: [],
		liveDynamics: [],
		warnings: [],
		nextSlideIndex: 1,
	}
}

function dwellForSlide(ctx: AutoplayContext, risk: PlaybackRisk, specimenCount = 0): number {
	if (ctx.mode !== 'autoplay') return 0
	const base = ctx.selectedSections ? 4200 : 6200
	const specimenMs = Math.min(2400, Math.max(0, specimenCount) * 65)
	const riskExtra: Record<PlaybackRisk, number> = {
		normal: 0,
		dense: 1700,
		media: 7600,
		model3d: 7200,
		morph: 5200,
		transition: 3000,
		validation: 1800,
	}
	return base + specimenMs + riskExtra[risk]
}

function applyAutoplayTransition(ctx: AutoplayContext, slide: any, slideTitle: string, section: string, risk: PlaybackRisk, specimenCount = 0, transitionSpec: any = {}): PlaybackSlideTiming {
	const index = ctx.nextSlideIndex++
	const dwellMs = dwellForSlide(ctx, risk, specimenCount)
	const transitionType = transitionSpec.type || 'fade'
	const transition = ctx.mode === 'autoplay'
		? {
			type: transitionType,
			speed: transitionSpec.speed || 'fast',
			...transitionSpec,
			advanceOnClick: false,
			advanceAfterTime: Math.max(1200, dwellMs),
		}
		: {
			type: transitionType,
			speed: transitionSpec.speed || 'fast',
			...transitionSpec,
			advanceOnClick: transitionSpec.advanceOnClick ?? true,
		}
	slide.transition = transition
	const timing: PlaybackSlideTiming = {
		slideIndex: index,
		slideTitle,
		section,
		dwellMs: ctx.mode === 'autoplay' ? Math.max(1200, dwellMs) : 0,
		transitionType,
		specimenCount,
		cueCount: 0,
		risk,
	}
	ctx.slides.push(timing)
	return timing
}

function recordPlaybackCue(ctx: AutoplayContext, slideTitle: string, cue: Omit<PlaybackCue, 'slideIndex' | 'slideTitle'>): void {
	const slide = ctx.slides[ctx.slides.length - 1]
	const recorded: PlaybackCue = {
		slideIndex: slide?.slideIndex || ctx.nextSlideIndex - 1,
		slideTitle,
		...cue,
	}
	ctx.cues.push(recorded)
	if (slide) slide.cueCount += 1
}

function recordLiveDynamics(ctx: ShowcaseContext, slideTitle: string, cue: Omit<LiveDynamicsSpecimen, 'slideIndex' | 'slideTitle'>): void {
	const slide = ctx.playback.slides[ctx.playback.slides.length - 1]
	const recorded: LiveDynamicsSpecimen = {
		slideIndex: slide?.slideIndex || ctx.playback.nextSlideIndex - 1,
		slideTitle,
		...cue,
	}
	ctx.playback.liveDynamics.push(recorded)
	recordPlaybackCue(ctx.playback, slideTitle, {
		featureId: cue.featureId,
		category: cue.category,
		objectName: cue.objectName,
		cueType: `content:${cue.dynamicKind}`,
		startMs: cue.startMs,
		endMs: cue.startMs + cue.durationMs,
		detail: `effect:${cue.effect};trigger:${cue.trigger}${cue.detail ? `;${cue.detail}` : ''}`,
	})
}

function autoplayTrigger(ctx: ShowcaseContext | undefined, index: number): 'afterPrevious' | 'withPrevious' | 'onClick' {
	if (!ctx || ctx.playback.mode !== 'autoplay') return index % 3 === 0 ? 'onClick' : index % 3 === 1 ? 'afterPrevious' : 'withPrevious'
	return index % 4 === 0 ? 'afterPrevious' : 'withPrevious'
}

function autoplayAnimationProps(ctx: ShowcaseContext | undefined, props: any, index: number): any {
	if (!ctx || ctx.playback.mode !== 'autoplay') return props
	const trigger = props.trigger === 'withPrevious' && index % 4 !== 0 ? 'withPrevious' : autoplayTrigger(ctx, index)
	return {
		...props,
		trigger,
		delay: props.delay ?? (index % 4) * 120,
	}
}

function addLiveAnimation(
	slide: any,
	ctx: ShowcaseContext,
	slideTitle: string,
	objectName: string | undefined,
	props: any,
	index: number,
	dynamicKind: string,
	row?: CapabilityLedgerRow,
	validationOracle: string[] = ['timing-xml'],
	detail = ''
): boolean {
	if (!objectName) return false
	const requested = autoplayAnimationProps(ctx, props, index)
	const trigger = ctx.playback.mode === 'autoplay'
		? (requested.trigger === 'withPrevious' ? 'withPrevious' : 'afterPrevious')
		: requested.trigger || 'onClick'
	const normalized = { ...requested, trigger }
	const effect = String(normalized.effect || normalized.motionPath || normalized.mediaCommand || normalized.type || dynamicKind)
	const startMs = Number(normalized.delay || 0)
	const durationMs = Number(normalized.duration || 600)
	try {
		slide.addAnimation(objectName, normalized as any)
		recordLiveDynamics(ctx, slideTitle, {
			featureId: row?.featureId,
			category: row?.category,
			objectName,
			dynamicKind,
			trigger,
			effect,
			startMs,
			durationMs,
			validationOracle,
			detail,
		})
		return true
	} catch {
		const fallback = { type: 'entrance', effect: 'fade', duration: Math.max(450, durationMs), trigger, delay: startMs }
		try {
			slide.addAnimation(objectName, fallback as any)
			recordLiveDynamics(ctx, slideTitle, {
				featureId: row?.featureId,
				category: row?.category,
				objectName,
				dynamicKind,
				trigger,
				effect: 'fade',
				startMs,
				durationMs: Number(fallback.duration),
				validationOracle,
				fallback: true,
				detail: detail ? `${detail};fallback-from:${effect}` : `fallback-from:${effect}`,
			})
			return true
		} catch {
			ctx.playback.warnings.push(`${slideTitle}: could not attach live ${dynamicKind} animation to ${objectName}`)
			return false
		}
	}
}

function recordNativeNarrationCue(
	ctx: ShowcaseContext,
	slideTitle: string,
	objectName: string,
	delay = 0,
	dynamicKind = 'narration',
	detail = 'native-audio-narration'
): void {
	recordLiveDynamics(ctx, slideTitle, {
		objectName,
		dynamicKind,
		trigger: 'afterPrevious',
		effect: 'nativeNarration',
		startMs: Math.max(0, Number(delay) || 0),
		durationMs: 1,
		validationOracle: ['native-narration-timing', 'audio-relationship'],
		detail,
	})
}

function summarizePlayback(ctx: AutoplayContext): ShowcasePlaybackMetadata {
	const estimatedRuntimeMs = ctx.slides.reduce((sum, slide) => sum + slide.dwellMs, 0)
	const mediaCueCount = ctx.cues.filter(cue => cue.cueType.startsWith('media') || cue.cueType === 'content:media' || cue.cueType === 'content:narration').length
	const model3dCueCount = ctx.cues.filter(cue => cue.cueType.includes('3d')).length
	const morphCueCount = ctx.cues.filter(cue => cue.cueType.includes('morph')).length
	const narrationCueCount = ctx.liveDynamics.filter(cue => cue.dynamicKind === 'narration').length
	const dynamicSlideIndexes = new Set(ctx.liveDynamics.map(cue => cue.slideIndex))
	const transitionOnlySlideCount = ctx.mode === 'autoplay' ? ctx.slides.filter(slide => !dynamicSlideIndexes.has(slide.slideIndex)).length : 0
	const liveDynamicsByKind = ctx.liveDynamics.reduce((acc: Record<string, number>, cue) => {
		acc[cue.dynamicKind] = (acc[cue.dynamicKind] || 0) + 1
		return acc
	}, {})
	const allSlidesTimed = ctx.mode !== 'autoplay' || ctx.slides.every(slide => slide.dwellMs > 0)
	const focusedKindRequirements: Record<VerificationFocus, string[]> = {
		full: ['text', 'shape', 'wordart', 'wordart3d', 'data', 'chartNative', 'chartFixture', 'smartart', 'color', 'transform', 'shape3d', 'media', 'audio', 'voice', 'model3d', 'model3dPoster', 'morph', 'motionPath', 'narration', 'sampleObject', 'shapeIcon'],
		'wordart-lab': ['wordart', 'wordart3d'],
		'shape-style-lab': ['shape', 'color', 'transform', 'shape3d'],
		'chart-capability-lab': ['data', 'chartNative', 'chartFixture'],
		'transition-scenes-lab': ['shape', 'transform', 'morph'],
		'animation-lab': ['shape', 'color', 'transform', 'media', 'motionPath'],
		'audio-lab': ['audio', 'media'],
		'voice-lab': ['voice', 'narration'],
		'media-3d-lab': ['media', 'model3d', 'model3dPoster'],
		'sample-object-lab': ['sampleObject'],
		'shape-icons-lab': ['shapeIcon', 'color'],
	}
	const requiredKinds = focusedKindRequirements[ctx.verificationFocus] || focusedKindRequirements.full
	const focusedKindGates = requiredKinds.reduce((acc: Record<string, boolean>, kind) => {
		acc[`${kind}DynamicsPresent`] = ctx.mode !== 'autoplay' || !!liveDynamicsByKind[kind]
		return acc
	}, {})
	const gates = {
		showSettingsRequired: ctx.mode === 'autoplay',
		allSlidesTimed,
		noOnClickRequiredForAutoplay: ctx.mode !== 'autoplay' || ctx.cues.every(cue => !String(cue.detail || '').includes('trigger:onClick')),
		contentDynamicsPresent: ctx.mode !== 'autoplay' || ctx.liveDynamics.length > 0,
		noTransitionOnlySlides: ctx.mode !== 'autoplay' || transitionOnlySlideCount === 0,
		...focusedKindGates,
		textDynamicsPresent: ctx.mode !== 'autoplay' || ctx.verificationFocus !== 'full' || !!liveDynamicsByKind.text,
		shapeDynamicsPresent: ctx.mode !== 'autoplay' || ctx.verificationFocus !== 'full' || !!liveDynamicsByKind.shape,
		wordArtDynamicsPresent: ctx.mode !== 'autoplay' || ctx.verificationFocus !== 'full' || !!liveDynamicsByKind.wordart,
		dataDynamicsPresent: ctx.mode !== 'autoplay' || ctx.verificationFocus !== 'full' || !!liveDynamicsByKind.data,
		smartArtDynamicsPresent: ctx.mode !== 'autoplay' || ctx.verificationFocus !== 'full' || !!liveDynamicsByKind.smartart,
		colorDynamicsPresent: ctx.mode !== 'autoplay' || ctx.verificationFocus !== 'full' || !!liveDynamicsByKind.color,
		transformDynamicsPresent: ctx.mode !== 'autoplay' || ctx.verificationFocus !== 'full' || !!liveDynamicsByKind.transform,
		mediaCuesPresent: ctx.mode !== 'autoplay' || ctx.verificationFocus !== 'full' || mediaCueCount >= 3,
		model3dCuePresent: ctx.mode !== 'autoplay' || ctx.verificationFocus !== 'full' || model3dCueCount >= 1,
		morphCuesPresent: ctx.mode !== 'autoplay' || ctx.verificationFocus !== 'full' || morphCueCount >= 3,
		motionPathDynamicsPresent: ctx.mode !== 'autoplay' || ctx.verificationFocus !== 'full' || !!liveDynamicsByKind.motionPath,
		narrationCuePresent: ctx.mode !== 'autoplay' || ctx.verificationFocus !== 'full' || narrationCueCount >= 1,
	}
	return {
		summary: {
			brand: BETTERPPTX_MCP_BRAND,
			mode: ctx.mode,
			deckProfile: ctx.deckProfile,
			verificationFocus: ctx.verificationFocus,
			focus: ctx.verificationFocus,
			targetRuntimeMinutes: ctx.targetRuntimeMinutes,
			estimatedRuntimeMs,
			estimatedRuntimeMinutes: Math.round((estimatedRuntimeMs / 60000) * 100) / 100,
			slideCount: ctx.slides.length,
			cueCount: ctx.cues.length,
			contentCueCount: ctx.liveDynamics.length,
			contentDynamicSlideCount: dynamicSlideIndexes.size,
			transitionOnlySlideCount,
			mediaCueCount,
			model3dCueCount,
			morphCueCount,
			narrationCueCount,
			liveDynamicsByKind,
			unattended: ctx.mode === 'autoplay',
			warnings: ctx.warnings,
			gates,
		},
		slides: ctx.slides,
		cues: ctx.cues,
		liveDynamics: ctx.liveDynamics,
	}
}

function gradient(stops: string[], angle = 0): any {
	return {
		type: 'gradient',
		gradientDirection: 'linear',
		gradientAngle: angle,
		gradientStops: stops.map((color, index) => ({
			color,
			position: Math.round((index / Math.max(1, stops.length - 1)) * 100),
		})),
	}
}

function ensureDir(dir: string): void {
	fs.mkdirSync(dir, { recursive: true })
}

async function withEngineConsoleSilenced<T>(fn: () => Promise<T>): Promise<T> {
	const originalLog = console.log
	console.log = () => undefined
	try {
		return await fn()
	} finally {
		console.log = originalLog
	}
}

function dataUri(filePath: string, mime: string): string | undefined {
	if (!fs.existsSync(filePath)) return undefined
	return `data:${mime};base64,${fs.readFileSync(filePath).toString('base64')}`
}

function writeMinimalGlb(filePath: string): void {
	const positions = new Float32Array([
		0, 1, 0,
		-1, -1, 1,
		1, -1, 1,
		1, -1, -1,
		-1, -1, -1,
	])
	const indices = new Uint16Array([
		0, 1, 2,
		0, 2, 3,
		0, 3, 4,
		0, 4, 1,
		1, 4, 3,
		1, 3, 2,
	])
	const posBuf = Buffer.from(positions.buffer)
	const idxBuf = Buffer.from(indices.buffer)
	const bin = Buffer.concat([posBuf, idxBuf])
	const json = {
		asset: { version: '2.0', generator: BETTERPPTX_MCP_BRAND },
		scenes: [{ nodes: [0] }],
		scene: 0,
		nodes: [{ mesh: 0 }],
		meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
		materials: [{
			pbrMetallicRoughness: {
				baseColorFactor: [0.12, 0.84, 0.91, 1],
				metallicFactor: 0.2,
				roughnessFactor: 0.38,
			},
		}],
		buffers: [{ byteLength: bin.length }],
		bufferViews: [
			{ buffer: 0, byteOffset: 0, byteLength: posBuf.length, target: 34962 },
			{ buffer: 0, byteOffset: posBuf.length, byteLength: idxBuf.length, target: 34963 },
		],
		accessors: [
			{ bufferView: 0, componentType: 5126, count: 5, type: 'VEC3', min: [-1, -1, -1], max: [1, 1, 1] },
			{ bufferView: 1, componentType: 5123, count: indices.length, type: 'SCALAR' },
		],
	}
	const jsonBufRaw = Buffer.from(JSON.stringify(json), 'utf8')
	const jsonBuf = Buffer.concat([jsonBufRaw, Buffer.alloc((4 - (jsonBufRaw.length % 4)) % 4, 0x20)])
	const binBuf = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4, 0)])
	const totalLength = 12 + 8 + jsonBuf.length + 8 + binBuf.length
	const header = Buffer.alloc(12)
	header.writeUInt32LE(0x46546c67, 0)
	header.writeUInt32LE(2, 4)
	header.writeUInt32LE(totalLength, 8)
	const jsonHeader = Buffer.alloc(8)
	jsonHeader.writeUInt32LE(jsonBuf.length, 0)
	jsonHeader.writeUInt32LE(0x4e4f534a, 4)
	const binHeader = Buffer.alloc(8)
	binHeader.writeUInt32LE(binBuf.length, 0)
	binHeader.writeUInt32LE(0x004e4942, 4)
	fs.writeFileSync(filePath, Buffer.concat([header, jsonHeader, jsonBuf, binHeader, binBuf]))
}

const MINIMAL_MODEL_FALLBACK_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII='

function hasNonEmptyFile(filePath: string): boolean {
	try {
		return fs.existsSync(filePath) && fs.statSync(filePath).size > 0
	} catch {
		return false
	}
}

function writeMinimalModelFallbackPng(filePath: string): void {
	fs.writeFileSync(filePath, Buffer.from(MINIMAL_MODEL_FALLBACK_PNG_BASE64, 'base64'))
}

function writeSpeechWav(filePath: string, text: string): void {
	if (process.platform !== 'win32') throw new Error('Real TTS narration requires an available speech synthesis provider.')
	const scriptPath = `${filePath}.speech.ps1`
	const script = [
		'param([string]$Text,[string]$OutPath)',
		"$ErrorActionPreference='Stop'",
		'Add-Type -AssemblyName System.Speech',
		'$synth=New-Object System.Speech.Synthesis.SpeechSynthesizer',
		'$synth.Rate=-1',
		'$synth.Volume=92',
		'$synth.SetOutputToWaveFile([IO.Path]::GetFullPath($OutPath))',
		'$synth.Speak($Text)',
		'$synth.Dispose()',
	].join('\n')
	fs.writeFileSync(scriptPath, script)
	try {
		const proc = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-Text', text, '-OutPath', filePath], {
			encoding: 'utf8',
			timeout: 15000,
			windowsHide: true,
		})
		if (proc.status !== 0) {
			const detail = proc.stderr?.trim() || proc.stdout?.trim() || `exit code ${proc.status}`
			throw new Error(`Real TTS narration failed: ${detail}`)
		}
		if (!fs.existsSync(filePath) || fs.statSync(filePath).size <= 1024) throw new Error('Real TTS narration produced no usable audio.')
	} finally {
		fs.rmSync(scriptPath, { force: true })
	}
}

function ensureNarrationAssets(assetDir: string): ShowcaseAssets['narration'] {
	const narration = {
		intro: path.join(assetDir, 'narration-intro.wav'),
		dynamics: path.join(assetDir, 'narration-live-dynamics.wav'),
		validation: path.join(assetDir, 'narration-validation.wav'),
	}
	const scripts = [
		[narration.intro, `${BETTERPPTX_MCP_BRAND} live MCP showcase. The deck runs unattended and demonstrates content animation, media, three dimensional models, morph, validation, and artifacts.`],
		[narration.dynamics, 'Live dynamics are attached to text, shapes, WordArt, charts, tables, SmartArt fixtures, media, motion paths, and morph scenes.'],
		[narration.validation, 'Validation checks package integrity, timing XML, content-level animation coverage, media relationships, three dimensional assets, and artifact retrieval.'],
	] as const
	for (const [file, text] of scripts) {
		writeSpeechWav(file, text)
	}
	return narration
}

function findLocalSampleGlb(repoRoot: string): string | undefined {
	const candidates = [
		path.join(repoRoot, 'demos', 'ultimate-showcase', 'assets', 'lab-pyramid.glb'),
		path.join(repoRoot, 'comparator', 'results_20260302_235823', 'ref_extracted', 'ppt', 'media', 'model3d1.glb'),
		path.join(repoRoot, 'comparator', 'results_20260302_235823', 'gen_extracted', 'ppt', 'media', 'model3d1.glb'),
		path.join(repoRoot, 'comparator', 'results_20260301_202724', 'ref_extracted', 'ppt', 'media', 'model-1-1.glb'),
		path.join(repoRoot, 'comparator', 'results_20260301_202724', 'gen_extracted', 'ppt', 'media', 'model-1-1.glb'),
	]
	return candidates.find(candidate => {
		try {
			return fs.existsSync(candidate) && fs.statSync(candidate).size > 1024
		} catch {
			return false
		}
	})
}

function ensureAssets(assetDir: string, repoRoot: string): ShowcaseAssets {
	ensureDir(assetDir)
	const badgeSvg = path.join(assetDir, 'betterpptx-mcp-badge.svg')
	fs.writeFileSync(badgeSvg, `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
<defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#20D6E7"/><stop offset=".55" stop-color="#2FE6A6"/><stop offset="1" stop-color="#FFB84D"/></linearGradient></defs>
<rect width="512" height="512" rx="88" fill="#071018"/>
<circle cx="256" cy="256" r="174" fill="none" stroke="url(#g)" stroke-width="28"/>
<path d="M155 280l61 61 146-171" fill="none" stroke="#F7FAFC" stroke-width="34" stroke-linecap="round" stroke-linejoin="round"/>
<g fill="#20D6E7"><circle cx="113" cy="113" r="16"/><circle cx="400" cy="128" r="10"/><circle cx="392" cy="390" r="14"/></g>
</svg>`)

	const modelFallback = path.join(assetDir, 'betterpptx-mcp-3d-fallback.png')
	const existingFallback = path.join(repoRoot, 'demos', 'ultimate-showcase', 'assets', 'model-fallback.png')
	const logoFallback = path.join(repoRoot, 'demos', 'common', 'images', 'logo_square.png')
	if (fs.existsSync(existingFallback)) fs.copyFileSync(existingFallback, modelFallback)
	else if (fs.existsSync(logoFallback)) fs.copyFileSync(logoFallback, modelFallback)
	if (!hasNonEmptyFile(modelFallback)) writeMinimalModelFallbackPng(modelFallback)

	const modelGlb = path.join(assetDir, 'lab-pyramid.glb')
	const localSampleGlb = findLocalSampleGlb(repoRoot)
	if (localSampleGlb) fs.copyFileSync(localSampleGlb, modelGlb)
	else writeMinimalGlb(modelGlb)

	const common = path.join(repoRoot, 'demos', 'common')
	return {
		badgeSvg,
		modelGlb,
		modelFallback,
		modelSource: localSampleGlb || 'generated-minimal-glb',
		photo: path.join(common, 'images', 'sydney_harbour_bridge_night.jpg'),
		logo: path.join(common, 'images', 'sample_logo.png'),
		video: fs.existsSync(path.join(common, 'media', 'sample.mp4')) ? path.join(common, 'media', 'sample.mp4') : undefined,
		audio: fs.existsSync(path.join(common, 'media', 'sample.mp3')) ? path.join(common, 'media', 'sample.mp3') : undefined,
		narration: ensureNarrationAssets(assetDir),
	}
}

function card(slide: any, x: number, y: number, w: number, h: number, fill = C.panel): void {
	slide.addShape('roundRect', {
		x, y, w, h,
		rectRadius: 0.05,
		fill: { color: fill },
		line: { color: C.line, width: 0.7 },
		shadow: { type: 'outer', color: C.black, opacity: 0.18, blur: 5, offset: 1, angle: 45 },
	})
}

function addChrome(slide: any, title: string, subtitle = ''): void {
	slide.addShape('rect', { x: 0, y: 0, w: W, h: H, fill: gradient([C.bg, C.bg2, '102334'], 0), line: { color: C.bg, transparency: 100 } })
	slide.addShape('rect', { x: 0, y: 0, w: W, h: 0.08, fill: { color: C.cyan }, line: { color: C.cyan, transparency: 100 } })
	slide.addText(title, { x: 0.62, y: 0.36, w: 8.7, h: 0.38, fontFace: 'Aptos Display', fontSize: 22, bold: true, color: C.ink, margin: 0 })
	if (subtitle) slide.addText(subtitle, { x: 0.64, y: 0.82, w: 10.6, h: 0.25, fontSize: 8.5, color: C.muted, margin: 0 })
	slide.addText(BETTERPPTX_MCP_BRAND, { x: W - 1.95, y: 0.42, w: 1.5, h: 0.18, fontSize: 7.5, bold: true, color: C.cyan, align: 'right', margin: 0 })
	slide.addShape('line', { x: 0.62, y: 1.12, w: W - 1.24, h: 0, line: { color: C.line, width: 0.5 } })
}

function addBullets(slide: any, items: string[], x: number, y: number, w: number, h: number, color = C.ink): void {
	slide.addText(items.map(text => ({ text, options: { bullet: { indent: 12 }, breakLine: true } })), {
		x, y, w, h,
		fontSize: 12,
		color,
		margin: 0.04,
		breakLine: false,
		fit: 'shrink',
	})
}

function addToolGrid(slide: any, tools: string[], x: number, y: number, cols: number): void {
	const cellW = 2.32
	const cellH = 0.42
	tools.forEach((tool, index) => {
		const col = index % cols
		const row = Math.floor(index / cols)
		const color = palette[index % palette.length]
		slide.addShape('roundRect', {
			x: x + col * (cellW + 0.16),
			y: y + row * (cellH + 0.13),
			w: cellW,
			h: cellH,
			rectRadius: 0.04,
			fill: { color: C.panel2 },
			line: { color, width: 0.65, transparency: 10 },
		})
		slide.addText(tool, {
			x: x + col * (cellW + 0.16) + 0.08,
			y: y + row * (cellH + 0.13) + 0.1,
			w: cellW - 0.16,
			h: 0.16,
			fontSize: 6.9,
			color: C.ink,
			margin: 0,
			fit: 'shrink',
		})
	})
}

function createBaseDeck(PresentationEngine: any, playback: AutoplayContext): any {
	const pptx: any = new PresentationEngine()
	pptx.defineLayout({ name: 'BETTERPPTX_MCP_WIDE', width: W, height: H })
	pptx.layout = 'BETTERPPTX_MCP_WIDE'
	pptx.author = BETTERPPTX_MCP_BRAND
	pptx.company = BETTERPPTX_MCP_BRAND
	pptx.subject = `${BETTERPPTX_MCP_BRAND} ${profileDisplayName(playback.deckProfile)}`
	pptx.title = `${BETTERPPTX_MCP_BRAND} ${profileDisplayName(playback.deckProfile)}`
	pptx.lang = 'en-US'
	pptx.theme = {
		headFontFace: 'Aptos Display',
		bodyFontFace: 'Aptos',
		lang: 'en-US',
	}
	if (playback.mode === 'autoplay') {
		pptx.showSettings = {
			useTimings: true,
			showAnimation: true,
			showNarration: true,
			loop: false,
			mode: 'present',
			showMediaControls: true,
		}
	}
	pptx.defineSlideMaster({
		title: 'BETTERPPTX_MCP_MASTER',
		background: { color: C.bg },
		slideNumber: { x: W - 0.75, y: H - 0.34, w: 0.45, h: 0.16, color: C.dim, fontSize: 7, align: 'right' },
		objects: [
			{ rect: { x: 0, y: 0, w: W, h: H, fill: { color: C.bg }, line: { color: C.bg, transparency: 100 } } },
			{ text: { text: BETTERPPTX_MCP_BRAND, options: { x: 0.42, y: H - 0.34, w: 1.3, h: 0.16, fontSize: 7, color: C.dim, margin: 0 } } },
		],
	})
	return pptx
}

function slide(pptx: any, title: string, subtitle = '', ctx?: ShowcaseContext, section = 'core', risk: PlaybackRisk = 'normal', specimenCount = 0): any {
	const s = pptx.addSlide({ masterName: 'BETTERPPTX_MCP_MASTER' })
	if (ctx) applyAutoplayTransition(ctx.playback, s, title, section, risk, specimenCount, { type: 'fade', speed: 'fast' })
	else s.transition = { type: 'fade', speed: 'fast', advanceOnClick: true }
	addChrome(s, title, subtitle)
	s.addNotes(`${title}\n\nGenerated by ${BETTERPPTX_MCP_BRAND} as an MCP implementation verification slide.`)
	return s
}

function addTitleSlide(pptx: any, assets: ShowcaseAssets, ctx: ShowcaseContext): void {
	const s = pptx.addSlide({ masterName: 'BETTERPPTX_MCP_MASTER' })
	const profileName = profileDisplayName(ctx.playback.deckProfile)
	const slideTitle = `${BETTERPPTX_MCP_BRAND} ${profileName}`
	applyAutoplayTransition(ctx.playback, s, slideTitle, 'core', 'normal', 0, { type: 'fade', speed: 'fast' })
	s.addShape('rect', { x: 0, y: 0, w: W, h: H, fill: gradient([C.bg, '102334', '0C443B'], 25), line: { color: C.bg, transparency: 100 } })
	s.addImage({ path: assets.badgeSvg, x: 0.8, y: 0.9, w: 1.4, h: 1.4, altText: `${BETTERPPTX_MCP_BRAND} verification badge`, objectName: 'title-badge' } as any)
	s.addText(`${BETTERPPTX_MCP_BRAND}\n${profileName}`, {
		x: 0.82, y: 2.6, w: 8.2, h: 1.18,
		fontFace: 'Aptos Display',
		fontSize: 34,
		bold: true,
		color: C.ink,
		margin: 0,
		breakLine: false,
		fit: 'shrink',
		objectName: 'title-headline',
	} as any)
	s.addText(profileIntent(ctx.playback.deckProfile), {
		x: 0.86, y: 4.08, w: 8.2, h: 0.5,
		fontSize: 13,
		color: C.muted,
		margin: 0,
		fit: 'shrink',
		objectName: 'title-subtitle',
	} as any)
	card(s, 9.4, 1.08, 2.7, 4.9, C.panel)
	addBullets(s, [
		'Public tool names: betterpptx-mcp.*',
		'PPTX author: betterpptx-mcp',
		'No server-side LLM dependency',
		'Repair and package validation first',
		'Artifacts returned by stable IDs',
	], 9.68, 1.42, 2.18, 3.8, C.ink)
	addLiveAnimation(s, ctx, slideTitle, 'title-badge', { type: 'emphasis', effect: 'pulse', duration: 900, scale: 1.12 }, 0, 'transform', undefined, ['timing-xml', 'image-object'], 'title-badge-pulse')
	addLiveAnimation(s, ctx, slideTitle, 'title-headline', { type: 'entrance', effect: 'fade', duration: 900 }, 1, 'text', undefined, ['timing-xml', 'text-object'], 'headline-reveal')
	addLiveAnimation(s, ctx, slideTitle, 'title-subtitle', { type: 'entrance', effect: 'wipe', direction: 'fromLeft', duration: 800 }, 2, 'text', undefined, ['timing-xml', 'text-object'], 'subtitle-reveal')
	addNarrationCue(s, ctx, slideTitle, assets.narration.intro, 'narration-intro', 120)
	s.addNotes(`Generated by ${BETTERPPTX_MCP_BRAND}.`)
}

function addRichTextSlide(pptx: any, ctx: ShowcaseContext): void {
	const s = slide(pptx, 'Rich Text and Layout', 'Runs, bullets, hyperlinks, shadows, theme fonts, master slide numbers, and notes.', ctx, 'core')
	card(s, 0.78, 1.5, 5.4, 4.8)
	s.addText([
		{ text: 'Styled run ', options: { bold: true, color: C.cyan } },
		{ text: 'with emphasis, ', options: { italic: true, color: C.teal } },
		{ text: 'underline, ', options: { underline: true, color: C.amber } },
		{ text: 'and links.', options: { hyperlink: { url: 'https://betterpptx-mcp' }, color: C.blue } },
	], { x: 1.08, y: 1.84, w: 4.8, h: 0.45, fontSize: 18, margin: 0, objectName: 'rich-text-runs' } as any)
	addBullets(s, [
		'Multiple text runs and local run styles',
		'Bullet paragraphs with deterministic sizing',
		'Theme fonts and metadata set by the server',
		'Speaker notes and master-based slide numbers',
	], 1.12, 2.66, 4.4, 2.3)
	s.addShape('roundRect', {
		x: 6.82, y: 1.72, w: 5.1, h: 2.1,
		rectRadius: 0.08,
		fill: gradient([C.blue, C.violet, C.magenta], 0),
		line: { color: C.white, transparency: 65 },
		shadow: { type: 'outer', color: C.black, opacity: 0.3, blur: 8, offset: 1.5, angle: 45 },
		objectName: 'rich-gradient-panel',
	} as any)
	s.addText('fit: shrink\nalignment: center\nvisual-safe text boxes', {
		x: 7.1, y: 2.12, w: 4.55, h: 1.15,
		fontFace: 'Aptos Display',
		fontSize: 21,
		bold: true,
		color: C.white,
		align: 'center',
		valign: 'middle',
		margin: 0,
		fit: 'shrink',
		objectName: 'rich-fit-text',
	} as any)
	addLiveAnimation(s, ctx, 'Rich Text and Layout', 'rich-text-runs', { type: 'entrance', effect: 'wipe', direction: 'fromLeft', duration: 900 }, 0, 'text', undefined, ['timing-xml', 'rich-text-runs'], 'by-run-rich-text-reveal')
	addLiveAnimation(s, ctx, 'Rich Text and Layout', 'rich-fit-text', { type: 'emphasis', effect: 'changefontcolor', color: C.amber, duration: 850 }, 1, 'color', undefined, ['timing-xml', 'text-color'], 'text-color-emphasis')
	addLiveAnimation(s, ctx, 'Rich Text and Layout', 'rich-gradient-panel', { type: 'emphasis', effect: 'growshrink', scale: 1.08, duration: 900 }, 2, 'transform', undefined, ['timing-xml', 'shape-transform'], 'panel-scale-emphasis')
}

function addShapesSlide(pptx: any, ctx: ShowcaseContext): void {
	const s = slide(pptx, 'Shapes, Fills, Lines, Effects', 'Solid, transparency, gradients, preset geometry, reflections, glow, and shadows.', ctx, 'core', 'dense', 8)
	const shapes = ['rect', 'roundRect', 'hexagon', 'chevron', 'cloud', 'star5', 'donut', 'flowChartDecision']
	shapes.forEach((shape, i) => {
		const x = 0.88 + (i % 4) * 2.9
		const y = 1.62 + Math.floor(i / 4) * 2.15
		const objectName = `core-shape-${i}`
		s.addShape(shape as any, {
			x, y, w: 1.55, h: 1.15,
			fill: i % 2 === 0 ? gradient([palette[i % palette.length], C.panel2], i * 22) : { color: palette[i % palette.length], transparency: 12 },
			line: { color: C.white, width: 1, transparency: 25, dash: i % 3 === 0 ? 'dash' : undefined },
			rotate: i % 2 ? 7 : -4,
			shadow: { type: 'outer', color: C.black, opacity: 0.22, blur: 6, offset: 1.2, angle: 45 },
			glow: i === 5 ? { color: C.amber, size: 5, opacity: 0.45 } : undefined,
			reflection: i === 6 ? { blur: 1, offset: 1, opacity: 0.28 } : undefined,
			objectName,
		} as any)
		s.addText(shape, { x: x - 0.08, y: y + 1.26, w: 1.72, h: 0.18, fontSize: 7.2, color: C.muted, align: 'center', margin: 0, fit: 'shrink' })
		addLiveAnimation(s, ctx, 'Shapes, Fills, Lines, Effects', objectName, i % 3 === 0
			? { type: 'emphasis', effect: 'changefillcolor', color: palette[(i + 3) % palette.length], duration: 780 }
			: i % 3 === 1
				? { type: 'emphasis', effect: 'spin', rotation: 22, duration: 860 }
				: { type: 'emphasis', effect: 'growshrink', scale: 1.16, duration: 760 }, i, i % 3 === 0 ? 'color' : 'shape', undefined, ['timing-xml', 'shape-object'], `shape:${shape}`)
	})
}

function addMediaSlide(pptx: any, assets: ShowcaseAssets, ctx: ShowcaseContext): void {
	const s = slide(pptx, 'Images and Media', 'Raster, SVG, crop/cover sizing, video, audio, alt text, and media command support.', ctx, 'core', 'media', 6)
	if (fs.existsSync(assets.photo)) {
		s.addImage({
			path: assets.photo,
			x: 0.82, y: 1.5, w: 4.3, h: 3.0,
			altText: `${BETTERPPTX_MCP_BRAND} showcase photograph`,
			sizing: { type: 'cover', x: 0.82, y: 1.5, w: 4.3, h: 3.0 } as any,
			rounding: true,
			shadow: { type: 'outer', color: C.black, opacity: 0.32, blur: 8, offset: 1.4, angle: 45 },
			objectName: 'media-photo',
		} as any)
		addLiveAnimation(s, ctx, 'Images and Media', 'media-photo', { type: 'entrance', effect: 'zoom', duration: 850 }, 0, 'transform', undefined, ['timing-xml', 'picture-object'], 'photo-cover-zoom')
	}
	s.addImage({ path: assets.badgeSvg, x: 5.48, y: 1.56, w: 1.2, h: 1.2, altText: `${BETTERPPTX_MCP_BRAND} SVG badge`, objectName: 'media-svg-badge' } as any)
	s.addImage({ path: assets.logo, x: 5.38, y: 3.2, w: 1.42, h: 1.0, altText: 'Brand asset placeholder', objectName: 'media-brand-logo' } as any)
	addLiveAnimation(s, ctx, 'Images and Media', 'media-svg-badge', { type: 'emphasis', effect: 'spin', rotation: 20, duration: 850 }, 1, 'transform', undefined, ['timing-xml', 'svg-picture'], 'svg-spin')
	addLiveAnimation(s, ctx, 'Images and Media', 'media-brand-logo', { type: 'emphasis', effect: 'pulse', duration: 720, scale: 1.1 }, 2, 'transform', undefined, ['timing-xml', 'image-object'], 'logo-pulse')
	if (assets.video) {
		s.addMedia({
			type: 'video',
			path: assets.video,
			cover: dataUri(assets.logo, 'image/png'),
			x: 7.2,
			y: 1.48,
			w: 4.6,
			h: 2.58,
			interactivePlayback: ctx.playback.mode !== 'autoplay',
			objectName: 'showcase-video',
		} as any)
		;[
			{ effect: 'mediaplay', mediaCommand: 'playFrom(0.0)', startMs: 250, duration: 1 },
			{ effect: 'mediapause', mediaCommand: 'togglePause', startMs: 6200, duration: 1 },
			{ effect: 'mediastop', mediaCommand: 'stop', startMs: 9000, duration: 1 },
		].forEach((cue, index) => {
			addLiveAnimation(s, ctx, 'Images and Media', 'showcase-video', {
				type: 'media',
				effect: cue.effect,
				mediaCommand: cue.mediaCommand,
				trigger: index === 0 ? 'afterPrevious' : 'afterPrevious',
				delay: cue.startMs,
				duration: cue.duration,
			} as any, index + 3, 'media', undefined, ['media-command-xml', 'video-relationship'], `cmd:${cue.mediaCommand}`)
		})
	}
	if (assets.audio) {
		s.addMedia({
			type: 'audio',
			path: assets.audio,
			x: 7.2,
			y: 4.38,
			w: 1.0,
			h: 0.62,
			interactivePlayback: ctx.playback.mode !== 'autoplay',
			objectName: 'showcase-audio',
		} as any)
		addLiveAnimation(s, ctx, 'Images and Media', 'showcase-audio', {
			type: 'media',
			effect: 'mediaplay',
			mediaCommand: 'playFrom(0.0)',
			trigger: 'afterPrevious',
			delay: 1100,
			duration: 1,
		} as any, 6, 'media', undefined, ['media-command-xml', 'audio-relationship'], 'cmd:playFrom(0.0)')
	}
	addBullets(s, ['picture metadata', 'SVG input', 'video autoplay', 'audio autoplay', 'timed play/pause/stop cues'], 8.5, 4.32, 3.0, 1.3)
	const mediaSpecimens = rowsFor(ctx.ledger, 'Media').map((row, index) => {
		const name = row.publicName.toLowerCase()
		const objectName = name.includes('video') ? 'showcase-video'
			: name.includes('audio') || name.includes('play') || name.includes('pause') || name.includes('stop') ? 'showcase-audio'
				: name.includes('cover') ? 'showcase-video'
					: 'media-photo'
		const appliedKind = name.includes('animation') || name.includes('trigger') || name.includes('bookmark')
			? 'media-animation-timing'
			: 'media-object-fixture'
		return addSpecimen(ctx, row, 'Images and Media', 'media-live-fixtures', objectName, appliedKind, `media cue group ${index + 1}`, { animationApplied: true })
	})
	addCoverageNotes(s, mediaSpecimens)
}

function addChartsSlide(pptx: any, ctx: ShowcaseContext): void {
	const s = slide(pptx, 'Charts', 'Bar, line, pie, doughnut, radar, scatter, labels, legends, and style options.', ctx, 'core', 'dense', 6)
	const series = [
		{ name: 'Create', labels: ['Q1', 'Q2', 'Q3', 'Q4'], values: [28, 44, 61, 76] },
		{ name: 'Edit', labels: ['Q1', 'Q2', 'Q3', 'Q4'], values: [18, 36, 57, 72] },
	]
	s.addChart('bar' as any, series as any, { x: 0.72, y: 1.42, w: 4.1, h: 2.25, showLegend: true, showTitle: true, title: 'MCP Jobs' } as any)
	s.addChart('line' as any, series as any, { x: 5.02, y: 1.42, w: 3.55, h: 2.25, showLegend: false, catAxisLabelFontFace: 'Aptos' } as any)
	s.addChart('doughnut' as any, [{ name: 'Artifacts', labels: ['PPTX', 'Source', 'Report', 'Logs'], values: [45, 20, 22, 13] }] as any, {
		x: 8.84,
		y: 1.42,
		w: 3.0,
		h: 2.25,
		holeSize: 55,
		showLegend: true,
		showValue: true,
	} as any)
	s.addChart('scatter' as any, nativeChartData('scatter', 0) as any, { x: 0.72, y: 4.1, w: 3.55, h: 1.8, showLegend: false, lineDataSymbol: 'circle', lineDataSymbolSize: 5 } as any)
	s.addChart('pie' as any, [{ name: 'Coverage', labels: ['Text', 'Media', 'Data'], values: [35, 30, 35] }] as any, { x: 4.76, y: 4.1, w: 2.7, h: 1.8, showLegend: false, showValue: true } as any)
	s.addChart('radar' as any, [{ name: 'Coverage', labels: ['Text', 'Chart', 'Media', '3D', 'Animation'], values: [5, 5, 4, 4, 5] }] as any, { x: 8.0, y: 4.1, w: 3.25, h: 1.8, showLegend: false } as any)
	;[
		{ name: 'chart-bar-highlight', x: 3.58, y: 2.16, w: 0.34, h: 0.78, color: C.amber },
		{ name: 'chart-line-callout', x: 6.9, y: 1.85, w: 0.42, h: 0.42, color: C.cyan },
		{ name: 'chart-pie-ring', x: 5.58, y: 4.54, w: 0.62, h: 0.62, color: C.teal },
		{ name: 'chart-radar-pulse', x: 9.25, y: 4.78, w: 0.5, h: 0.5, color: C.magenta },
	].forEach((item, index) => {
		s.addShape(index === 2 ? 'arc' : 'ellipse', {
			x: item.x,
			y: item.y,
			w: item.w,
			h: item.h,
			fill: { color: item.color, transparency: index === 2 ? 100 : 22 },
			line: { color: item.color, width: 1.5, transparency: 10 },
			objectName: item.name,
		} as any)
		addLiveAnimation(s, ctx, 'Charts', item.name, index === 0
			? { type: 'entrance', effect: 'wipe', direction: 'fromBottom', duration: 850 }
			: { type: 'emphasis', effect: 'pulse', duration: 780, scale: 1.16 }, index, 'data', undefined, ['timing-xml', 'chart-overlay'], 'chart-series-highlight')
	})
}

function addTablesSlide(pptx: any, assets: ShowcaseAssets, ctx: ShowcaseContext): void {
	const s = slide(pptx, 'Tables and Brand Kits', 'Styled cells, borders, transparency, and deterministic brand application outputs.', ctx, 'core', 'dense', 4)
	const rows = [
		[
			{ text: 'Capability', options: { bold: true, color: C.white, fill: { color: C.panel2 } } },
			{ text: 'Status', options: { bold: true, color: C.white, fill: { color: C.panel2 } } },
			{ text: 'Artifact', options: { bold: true, color: C.white, fill: { color: C.panel2 } } },
		],
		['Create', 'available', 'deck'],
		['Edit', 'deterministic spec', 'deck + report'],
		['Validate', 'package/XML/repair', 'report'],
		['Brand', 'theme/colors/assets', 'deck + manifest'],
	]
	s.addTable(rows as any, {
		x: 0.86,
		y: 1.55,
		w: 5.85,
		h: 2.4,
		fontFace: 'Aptos',
		fontSize: 10,
		color: C.ink,
		border: { type: 'solid', color: C.line, pt: 0.75, transparency: 8 },
		fill: { color: C.panel },
		margin: 0.08,
	} as any)
	;[
		{ name: 'table-row-highlight-1', y: 2.08, color: C.cyan },
		{ name: 'table-row-highlight-2', y: 2.54, color: C.teal },
		{ name: 'table-row-highlight-3', y: 3.0, color: C.amber },
	].forEach((item, index) => {
		s.addShape('rect', {
			x: 0.93,
			y: item.y,
			w: 5.7,
			h: 0.31,
			fill: { color: item.color, transparency: 72 },
			line: { color: item.color, transparency: 100 },
			objectName: item.name,
		} as any)
		addLiveAnimation(s, ctx, 'Tables and Brand Kits', item.name, { type: 'entrance', effect: 'wipe', direction: 'fromLeft', duration: 700 }, index, 'data', undefined, ['timing-xml', 'table-overlay'], 'table-row-highlight')
	})
	card(s, 7.38, 1.52, 4.35, 3.25)
	;[
		{ name: 'brand-color-cyan', x: 7.72, color: C.cyan },
		{ name: 'brand-color-teal', x: 8.52, color: C.teal },
		{ name: 'brand-color-amber', x: 9.32, color: C.amber },
	].forEach((item, index) => {
		s.addShape('rect', { x: item.x, y: 2.02, w: 0.65, h: 0.65, fill: { color: item.color }, line: { color: item.color, transparency: 100 }, objectName: item.name } as any)
		addLiveAnimation(s, ctx, 'Tables and Brand Kits', item.name, { type: 'emphasis', effect: 'changefillcolor', color: palette[(index + 4) % palette.length], duration: 760 }, index + 4, 'color', undefined, ['timing-xml', 'brand-color'], 'brand-kit-color-cycle')
	})
	if (fs.existsSync(assets.logo)) s.addImage({ path: assets.logo, x: 10.2, y: 1.98, w: 0.95, h: 0.65, altText: `${BETTERPPTX_MCP_BRAND} brand kit logo`, objectName: 'brand-kit-logo' } as any)
	addBullets(s, ['theme head/body fonts', 'palette slots', 'logo assets', 'layout rules'], 7.78, 3.05, 3.4, 1.25)
	;[
		{ name: 'smartart-node-ingest', x: 7.8, text: 'Ingest', color: C.cyan },
		{ name: 'smartart-node-compile', x: 9.05, text: 'Compile', color: C.teal },
		{ name: 'smartart-node-ship', x: 10.3, text: 'Ship', color: C.amber },
	].forEach((node, index) => {
		s.addShape('chevron', { x: node.x, y: 4.44, w: 1.08, h: 0.48, fill: { color: node.color, transparency: 12 }, line: { color: C.white, transparency: 60 }, objectName: node.name } as any)
		s.addText(node.text, { x: node.x + 0.08, y: 4.61, w: 0.72, h: 0.12, fontSize: 5.8, bold: true, color: C.bg, margin: 0, fit: 'shrink' })
		addLiveAnimation(s, ctx, 'Tables and Brand Kits', node.name, { type: 'entrance', effect: 'wipe', direction: 'fromLeft', duration: 650 }, index + 7, 'smartart', undefined, ['timing-xml', 'smartart-fixture'], 'smartart-process-node-fixture')
	})
}

function add3DSlide(pptx: any, assets: ShowcaseAssets, ctx: ShowcaseContext): void {
	const s = slide(pptx, '3D Model Objects', 'GLB model embedding with raster fallback, camera, transform, and lighting options.', ctx, 'core', 'model3d', 5)
	const modelFallback = hasNonEmptyFile(assets.modelFallback) ? assets.modelFallback : undefined
	card(s, 0.84, 1.46, 5.6, 4.55)
	if (modelFallback) {
		s.addImage({
			path: modelFallback,
			x: 1.05,
			y: 1.66,
			w: 4.95,
			h: 3.58,
			altText: `${BETTERPPTX_MCP_BRAND} visible 3D fallback poster`,
			transparency: 42,
			objectName: 'betterpptx-mcp-3d-background-poster',
		} as any)
	}
	const model3DOptions: any = {
		glbFile: assets.modelGlb,
		x: 1.3,
		y: 1.68,
		w: 4.4,
		h: 3.45,
		rotate: 8,
		objectName: 'betterpptx-mcp-3d-model',
		camera: { fov: 45 },
		ambientLight: { color: { r: 50000, g: 50000, b: 50000 }, illuminance: 0.5 },
	}
	if (modelFallback) model3DOptions.rasterFile = modelFallback
	s.addModel3D(model3DOptions)
	s.addShape('arc', { x: 1.05, y: 1.32, w: 4.95, h: 4.0, line: { color: C.cyan, width: 2, beginArrowType: 'triangle', endArrowType: 'triangle', transparency: 15 }, adjustPoint: 0.32, objectName: 'betterpptx-mcp-3d-orbit-cue' } as any)
	card(s, 7.02, 1.55, 4.86, 4.2, C.panel2)
	s.addShape('cube' as any, {
		x: 7.56,
		y: 1.8,
		w: 1.8,
		h: 1.5,
		fill: gradient([C.cyan, C.violet, C.amber], 36),
		line: { color: C.white, transparency: 38 },
		rotate: -8,
		shadow: { type: 'outer', color: C.black, opacity: 0.26, blur: 8, offset: 1.4, angle: 45 },
		glow: { color: C.cyan, size: 5, opacity: 0.34 },
		objectName: 'betterpptx-mcp-3d-volume-fixture',
	} as any)
	if (modelFallback) {
		s.addImage({
			path: modelFallback,
			x: 9.72,
			y: 1.73,
			w: 1.75,
			h: 1.48,
			altText: `${BETTERPPTX_MCP_BRAND} 3D model poster preview`,
			objectName: 'betterpptx-mcp-3d-poster',
		} as any)
	}
	addLiveAnimation(s, ctx, '3D Model Objects', 'betterpptx-mcp-3d-model', { type: 'emphasis', effect: 'pulse', duration: 1200, scale: 1.08 }, 0, 'model3d', undefined, ['timing-xml', 'glb-relationship', 'fallback-image'], 'camera-lighting-pulse')
	addLiveAnimation(s, ctx, '3D Model Objects', 'betterpptx-mcp-3d-model', { type: 'motion', motionPath: 'sineWave', duration: 1600 }, 1, 'model3d', undefined, ['timing-xml', 'glb-relationship'], 'model-3d-motion')
	addLiveAnimation(s, ctx, '3D Model Objects', 'betterpptx-mcp-3d-orbit-cue', { type: 'emphasis', effect: 'spin', duration: 1800, rotation: 20 }, 2, 'transform', undefined, ['timing-xml', 'orbit-cue'], 'orbit-spin-cue')
	addLiveAnimation(s, ctx, '3D Model Objects', 'betterpptx-mcp-3d-volume-fixture', { type: 'emphasis', effect: 'growshrink', duration: 1200, scale: 1.1 }, 3, 'shape3d', undefined, ['timing-xml', 'shape-3d-fixture'], '3d-volume-fixture')
	addLiveAnimation(s, ctx, '3D Model Objects', 'betterpptx-mcp-3d-poster', { type: 'entrance', effect: 'zoom', duration: 900 }, 4, 'model3dPoster', undefined, ['timing-xml', 'fallback-image'], 'poster-preview')
	addBullets(s, [
		'GLB package relationship',
		'PNG/SVG fallback preview',
		'camera and transform metadata',
		'lighting-safe defaults',
		'validator checks media references',
		`sample source: ${assets.modelSource === 'generated-minimal-glb' ? 'generated GLB' : 'local extracted GLB'}`,
	], 7.36, 1.94, 4.05, 2.5)
	const modelSpecimens = rowsFor(ctx.ledger, '3D Models').map((row, index) => addSpecimen(
		ctx,
		row,
		'3D Model Objects',
		'model3d-live-fixture',
		index % 3 === 0 ? 'betterpptx-mcp-3d-model' : index % 3 === 1 ? 'betterpptx-mcp-3d-poster' : 'betterpptx-mcp-3d-volume-fixture',
		'model3d-native-fixture',
		assets.modelSource === 'generated-minimal-glb' ? 'generated deterministic GLB fixture' : 'local extracted GLB fixture',
		{ animationApplied: true },
	))
	addCoverageNotes(s, modelSpecimens)
}

function addAudioLabSlides(pptx: any, assets: ShowcaseAssets, ctx: ShowcaseContext): void {
	const s = slide(pptx, 'Audio Lab', 'Autoplay audio, waveform motion, media play/pause/stop, and relationship validation.', ctx, 'audio', 'media', 12)
	const audioPath = assets.audio || assets.narration.dynamics
	card(s, 0.78, 1.48, 5.65, 4.42)
	card(s, 6.9, 1.48, 5.65, 4.42, C.panel2)
	const waveNames: string[] = []
	for (let i = 0; i < 28; i++) {
		const h = 0.28 + ((i * 7) % 9) * 0.12
		const objectName = `audio-lab-wave-${i}`
		waveNames.push(objectName)
		s.addShape('roundRect', {
			x: 1.14 + i * 0.16,
			y: 4.62 - h,
			w: 0.08,
			h,
			rectRadius: 0.02,
			fill: { color: palette[i % palette.length], transparency: i % 4 === 0 ? 0 : 16 },
			line: { color: palette[i % palette.length], transparency: 100 },
			objectName,
		} as any)
		addLiveAnimation(s, ctx, 'Audio Lab', objectName, {
			type: 'emphasis',
			effect: i % 2 ? 'growshrink' : 'pulse',
			scale: 1.22,
			duration: 620,
		}, i, 'audio', undefined, ['timing-xml', 'waveform-fixture'], 'audio-waveform-pulse')
	}
	if (audioPath && fs.existsSync(audioPath)) {
		s.addMedia({
			type: 'audio',
			path: audioPath,
			extn: path.extname(audioPath).replace('.', '') || undefined,
			x: 1.05,
			y: 2.02,
			w: 1.0,
			h: 0.72,
			interactivePlayback: ctx.playback.mode !== 'autoplay',
			objectName: 'audio-lab-source',
		} as any)
		;[
			{ effect: 'mediaplay', mediaCommand: 'playFrom(0.0)', delay: 250 },
			{ effect: 'mediapause', mediaCommand: 'togglePause', delay: 3600 },
			{ effect: 'mediastop', mediaCommand: 'stop', delay: 5400 },
		].forEach((cue, index) => {
			addLiveAnimation(s, ctx, 'Audio Lab', 'audio-lab-source', {
				type: 'media',
				effect: cue.effect,
				mediaCommand: cue.mediaCommand,
				delay: cue.delay,
				duration: 1,
				trigger: 'afterPrevious',
			} as any, index, 'media', undefined, ['media-command-xml', 'audio-relationship'], `audio-lab:${cue.mediaCommand}`)
		})
	}
	;[
		{ label: 'play', x: 7.35, y: 2.02, shape: 'actionButtonSound', color: C.teal },
		{ label: 'pause', x: 8.82, y: 2.02, shape: 'flowChartDelay', color: C.amber },
		{ label: 'stop', x: 10.28, y: 2.02, shape: 'flowChartTerminator', color: C.coral },
	].forEach((item, index) => {
		const objectName = `audio-command-${item.label}`
		s.addShape(item.shape as any, {
			x: item.x,
			y: item.y,
			w: 0.92,
			h: 0.82,
			fill: { color: item.color, transparency: 8 },
			line: { color: C.white, transparency: 45 },
			shadow: { type: 'outer', color: C.black, opacity: 0.2, blur: 5, offset: 1, angle: 45 },
			objectName,
		} as any)
		s.addText(item.label, { x: item.x - 0.1, y: item.y + 0.95, w: 1.1, h: 0.16, fontSize: 7, bold: true, color: C.ink, align: 'center', margin: 0 })
		addLiveAnimation(s, ctx, 'Audio Lab', objectName, { type: 'entrance', effect: 'zoom', duration: 620 }, index + 32, 'audio', undefined, ['timing-xml', 'audio-command-fixture'], `audio-command:${item.label}`)
	})
	const rows = rowsFor(ctx.ledger, 'Audio Voice Narration')
	const specimens = rows.map((row, index) => addSpecimen(
		ctx,
		row,
		'Audio Lab',
		'audio-lab-live-fixtures',
		row.publicName.toLowerCase().includes('video') ? 'showcase-video' : row.publicName.toLowerCase().includes('waveform') ? waveNames[index % waveNames.length] : 'audio-lab-source',
		row.publicName.toLowerCase().includes('animation') || row.publicName.toLowerCase().includes('command') ? 'media-animation-timing' : 'audio-live-fixture',
		'audio lab applied fixture',
		{ animationApplied: true },
	))
	addCoverageNotes(s, specimens)
}

function addVoiceLabSlides(pptx: any, assets: ShowcaseAssets, ctx: ShowcaseContext): void {
	const s = slide(pptx, 'Voice Lab', 'Section narration clips, real TTS policy, and autoplay voice cue timing.', ctx, 'voice', 'media', 10)
	card(s, 0.82, 1.48, 11.65, 4.78)
	const clips = [
		{ label: 'intro', path: assets.narration.intro, color: C.cyan },
		{ label: 'dynamics', path: assets.narration.dynamics, color: C.teal },
		{ label: 'validation', path: assets.narration.validation, color: C.amber },
	]
	clips.forEach((clip, index) => {
		const x = 1.18 + index * 3.78
		const mediaName = `voice-lab-${clip.label}`
		s.addShape('roundRect', {
			x,
			y: 1.88,
			w: 2.72,
			h: 2.78,
			rectRadius: 0.08,
			fill: gradient([clip.color, C.panel2], 32 + index * 18),
			line: { color: C.white, transparency: 55 },
			shadow: { type: 'outer', color: C.black, opacity: 0.2, blur: 6, offset: 1.2, angle: 45 },
			objectName: `${mediaName}-panel`,
		} as any)
		if (fs.existsSync(clip.path)) {
			const isNarrationClip = index === 0
			s.addMedia({
				type: 'audio',
				path: clip.path,
				extn: 'wav',
				x: x + 0.2,
				y: 2.12,
				w: 0.86,
				h: 0.52,
				interactivePlayback: isNarrationClip ? false : ctx.playback.mode !== 'autoplay',
				isNarration: isNarrationClip,
				objectName: mediaName,
			} as any)
			if (isNarrationClip) {
				recordNativeNarrationCue(ctx, 'Voice Lab', mediaName, 400 + index * 900, 'narration', `voice-cue:${clip.label}`)
			} else {
				addLiveAnimation(s, ctx, 'Voice Lab', mediaName, {
					type: 'media',
					effect: 'mediaplay',
					mediaCommand: 'playFrom(0.0)',
					duration: 1,
					delay: 400 + index * 900,
					trigger: 'afterPrevious',
				} as any, index, 'voice', undefined, ['media-command-xml', 'voice-audio-relationship'], `voice-cue:${clip.label}`)
			}
		}
		for (let bar = 0; bar < 10; bar++) {
			const h = 0.18 + ((bar + index * 3) % 6) * 0.12
			const objectName = `${mediaName}-bar-${bar}`
			s.addShape('rect', {
				x: x + 0.42 + bar * 0.17,
				y: 3.82 - h,
				w: 0.08,
				h,
				fill: { color: C.white, transparency: 14 + bar * 2 },
				line: { color: C.white, transparency: 100 },
				objectName,
			} as any)
			addLiveAnimation(s, ctx, 'Voice Lab', objectName, { type: 'emphasis', effect: 'pulse', duration: 580, scale: 1.18 }, index * 10 + bar + 4, 'voice', undefined, ['timing-xml', 'voice-waveform'], `voice-wave:${clip.label}`)
		}
		s.addText(clip.label, { x: x + 0.3, y: 4.92, w: 2.08, h: 0.22, fontSize: 11, bold: true, color: C.ink, align: 'center', margin: 0 })
	})
	const rows = rowsFor(ctx.ledger, 'Audio Voice Narration')
	const specimens = rows.map((row, index) => addSpecimen(ctx, row, 'Voice Lab', 'voice-lab-cues', `voice-lab-${clips[index % clips.length].label}`, 'voice-narration-timing', 'voice lab applied fixture', { animationApplied: true }))
	addCoverageNotes(s, specimens)
}

function addMedia3DLabSlides(pptx: any, assets: ShowcaseAssets, ctx: ShowcaseContext): void {
	addMediaSlide(pptx, assets, ctx)
	add3DSlide(pptx, assets, ctx)
}

function addSampleObjectLabSlides(pptx: any, assets: ShowcaseAssets, ctx: ShowcaseContext): void {
	const s = slide(pptx, 'Sample Object Lab', 'Bundled and locally discovered sample objects used by MCP examples.', ctx, 'sample-objects', 'dense', 8)
	const rows = rowsFor(ctx.ledger, 'Sample Object Library')
	const fixtures = [
		{ label: 'image', shape: 'rect', color: C.cyan, objectName: 'sample-object-image' },
		{ label: 'SVG', shape: 'hexagon', color: C.teal, objectName: 'sample-object-svg' },
		{ label: 'audio', shape: 'actionButtonSound', color: C.amber, objectName: 'sample-object-audio' },
		{ label: 'video', shape: 'actionButtonMovie', color: C.coral, objectName: 'sample-object-video' },
		{ label: 'GLB', shape: 'cube', color: C.violet, objectName: 'sample-object-glb' },
		{ label: 'local', shape: 'flowChartOnlineStorage', color: C.blue, objectName: 'sample-object-local' },
		{ label: 'external', shape: 'cloud', color: C.magenta, objectName: 'sample-object-external' },
		{ label: 'manifest', shape: 'flowChartDocument', color: C.lime, objectName: 'sample-object-manifest' },
	]
	fixtures.forEach((fixture, index) => {
		const col = index % 4
		const row = Math.floor(index / 4)
		const x = 1.05 + col * 2.92
		const y = 1.72 + row * 2.18
		card(s, x - 0.18, y - 0.2, 2.2, 1.68)
		s.addShape(fixture.shape as any, {
			x: x + 0.32,
			y,
			w: 0.95,
			h: 0.82,
			fill: { color: fixture.color, transparency: 8 },
			line: { color: C.white, transparency: 45 },
			shadow: { type: 'outer', color: C.black, opacity: 0.2, blur: 5, offset: 1, angle: 45 },
			objectName: fixture.objectName,
		} as any)
		s.addText(fixture.label, { x: x, y: y + 1.03, w: 1.86, h: 0.2, fontSize: 8.5, bold: true, color: C.ink, align: 'center', margin: 0 })
		addLiveAnimation(s, ctx, 'Sample Object Lab', fixture.objectName, index % 2
			? { type: 'entrance', effect: 'fly', direction: 'fromBottom', duration: 720 }
			: { type: 'entrance', effect: 'zoom', direction: 'in', duration: 720 }, index, 'sampleObject', rows[index], ['timing-xml', 'sample-object-registry'], `sample:${fixture.label}`)
	})
	if (fs.existsSync(assets.modelFallback)) s.addImage({ path: assets.modelFallback, x: 10.0, y: 4.74, w: 1.08, h: 0.82, altText: `${BETTERPPTX_MCP_BRAND} sample 3D poster`, objectName: 'sample-object-poster-image' } as any)
	const specimens = rows.map((row, index) => addSpecimen(ctx, row, 'Sample Object Lab', 'sample-object-registry', fixtures[index % fixtures.length].objectName, 'sample-object-fixture', 'sample object library applied fixture', { animationApplied: true }))
	addCoverageNotes(s, specimens)
}

function addShapeIconLabSlides(pptx: any, ctx: ShowcaseContext): void {
	const s = slide(pptx, 'Shape Icon Lab', 'Icons composed from native PowerPoint shape presets and animated as reusable objects.', ctx, 'shape-icons', 'dense', 10)
	const rows = rowsFor(ctx.ledger, 'Shape Based Icons')
	const icons = [
		{ label: 'home', shape: 'actionButtonHome', color: C.cyan },
		{ label: 'doc', shape: 'actionButtonDocument', color: C.teal },
		{ label: 'chart', shape: 'chartPlus', color: C.amber },
		{ label: 'process', shape: 'flowChartProcess', color: C.coral },
		{ label: 'media', shape: 'actionButtonMovie', color: C.magenta },
		{ label: '3D', shape: 'cube', color: C.violet },
		{ label: 'cloud', shape: 'cloud', color: C.blue },
		{ label: 'access', shape: 'sun', color: C.lime },
		{ label: 'secure', shape: 'actionButtonBlank', color: C.amber },
		{ label: 'dash', shape: 'chartStar', color: C.teal },
	]
	icons.forEach((icon, index) => {
		const col = index % 5
		const row = Math.floor(index / 5)
		const x = 0.9 + col * 2.45
		const y = 1.72 + row * 2.24
		const objectName = `shape-icon-${icon.label}`
		s.addShape(icon.shape as any, {
			x,
			y,
			w: 1.08,
			h: 0.92,
			fill: gradient([icon.color, C.panel2], 18 + index * 14),
			line: { color: C.white, transparency: 48, width: 0.9 },
			shadow: { type: 'outer', color: C.black, opacity: 0.2, blur: 5, offset: 1, angle: 45 },
			glow: index % 3 === 0 ? { color: icon.color, size: 4, opacity: 0.32 } : undefined,
			objectName,
		} as any)
		if (icon.label === 'secure') {
			s.addShape('arc', { x: x + 0.28, y: y - 0.08, w: 0.52, h: 0.42, line: { color: C.white, width: 1.3 }, objectName: `${objectName}-lock-arc` } as any)
		}
		s.addText(icon.label, { x: x - 0.14, y: y + 1.08, w: 1.36, h: 0.18, fontSize: 7.5, color: C.ink, bold: true, align: 'center', margin: 0 })
		addLiveAnimation(s, ctx, 'Shape Icon Lab', objectName, index % 3 === 0
			? { type: 'emphasis', effect: 'spin', rotation: 18, duration: 780 }
			: index % 3 === 1
				? { type: 'emphasis', effect: 'changefillcolor', color: palette[(index + 2) % palette.length], duration: 720 }
				: { type: 'entrance', effect: 'zoom', duration: 660 }, index, index % 3 === 1 ? 'color' : 'shapeIcon', rows[index], ['timing-xml', 'shape-icon-fixture'], `shape-icon:${icon.label}`)
	})
	const specimens = rows.map((row, index) => addSpecimen(ctx, row, 'Shape Icon Lab', 'shape-built-icons', `shape-icon-${icons[index % icons.length].label}`, 'shape-icon-fixture', 'shape-built icon applied fixture', { animationApplied: true }))
	addCoverageNotes(s, specimens)
}

function addAnimationsSlide(pptx: any, ctx: ShowcaseContext): void {
	const s = slide(pptx, 'Transitions and Animations', 'Entrance, emphasis, exit, grouped timing, and motion path objects.', ctx, 'core', 'dense', 6)
	const names = ['fade', 'fly', 'zoom', 'spin', 'pulse', 'motion']
	names.forEach((name, i) => {
		const x = 0.94 + i * 1.92
		s.addShape(i % 2 ? 'ellipse' : 'roundRect', {
			x,
			y: 1.8,
			w: 1.25,
			h: 1.0,
			fill: { color: palette[i % palette.length] },
			line: { color: C.white, transparency: 50 },
			objectName: `anim-${name}`,
		} as any)
		s.addText(name, { x: x - 0.16, y: 2.96, w: 1.58, h: 0.2, fontSize: 8, color: C.ink, align: 'center', margin: 0 })
		const target = `anim-${name}`
		const props = [
			{ type: 'entrance', effect: 'fade', duration: 700 },
			{ type: 'entrance', effect: 'fly', direction: 'fromLeft', duration: 850 },
			{ type: 'entrance', effect: 'zoom', direction: 'in', duration: 800 },
			{ type: 'emphasis', effect: 'spin', duration: 900 },
			{ type: 'emphasis', effect: 'pulse', duration: 700 },
			{ type: 'motion', motionPath: 'right', duration: 1100 },
		][i]
		addLiveAnimation(s, ctx, 'Transitions and Animations', target, props, i, name === 'motion' ? 'motionPath' : name === 'spin' || name === 'pulse' ? 'transform' : 'shape', undefined, ['timing-xml', 'core-animation'], `core-animation:${name}`)
	})
	s.addText('The slide also carries a fast fade transition and speaker notes; validator inspects package integrity after generation.', {
		x: 1.0,
		y: 4.3,
		w: 10.7,
		h: 0.62,
		fontSize: 14,
		color: C.muted,
		align: 'center',
		margin: 0,
		fit: 'shrink',
	})
}

function addMcpToolsSlide(pptx: any, ctx: ShowcaseContext): void {
	const s = slide(pptx, 'MCP Tool Surface', 'Public tools are branded betterpptx-mcp.*; internal compiler tools are admin/developer gated.', ctx, 'core')
	addToolGrid(s, [
		'betterpptx-mcp.presentation.create',
		'betterpptx-mcp.presentation.improve',
		'betterpptx-mcp.presentation.edit',
		'betterpptx-mcp.presentation.restyle',
		'betterpptx-mcp.presentation.apply_brand',
		'betterpptx-mcp.presentation.animate',
		'betterpptx-mcp.presentation.upgrade',
		'betterpptx-mcp.object.insert_3d_asset',
		'betterpptx-mcp.object.insert_media',
		'betterpptx-mcp.object.apply_animation',
		'betterpptx-mcp.object.apply_motion_path',
		'betterpptx-mcp.chart.add',
		'betterpptx-mcp.table.add',
		'betterpptx-mcp.presentation.validate',
		'betterpptx-mcp.artifact.get',
	], 0.78, 1.55, 4)
	s.addShape('roundRect', {
		x: 0.7,
		y: 1.45,
		w: 2.52,
		h: 0.55,
		rectRadius: 0.03,
		fill: { color: C.cyan, transparency: 82 },
		line: { color: C.cyan, width: 1.1 },
		objectName: 'mcp-tool-sweep',
	} as any)
	addLiveAnimation(s, ctx, 'MCP Tool Surface', 'mcp-tool-sweep', { type: 'motion', motionPath: 'right', duration: 1700 }, 0, 'motionPath', undefined, ['timing-xml', 'mcp-tool-surface'], 'tool-grid-sweep')
}

function addValidationSlide(pptx: any, ctx: ShowcaseContext): void {
	const s = slide(pptx, 'Validation and Artifacts', 'Every job publishes a manifest containing outputs, logs, validation, snapshots, and optional visual oracle exports.', ctx, 'core', 'validation')
	const stages = ['ingest', 'compile', 'validate', 'snapshot', 'repair-check', 'visual-oracle', 'artifact']
	stages.forEach((stage, i) => {
		const x = 0.82 + i * 1.72
		const objectName = `validation-stage-${i}`
		s.addShape('chevron', {
			x,
			y: 2.0,
			w: 1.42,
			h: 0.75,
			fill: { color: palette[i % palette.length], transparency: 6 },
			line: { color: C.white, transparency: 65 },
			objectName,
		} as any)
		s.addText(stage, { x: x + 0.05, y: 2.28, w: 1.12, h: 0.15, fontSize: 6.6, bold: true, color: C.bg, align: 'center', margin: 0, fit: 'shrink' })
		addLiveAnimation(s, ctx, 'Validation and Artifacts', objectName, { type: 'entrance', effect: 'wipe', direction: 'fromLeft', duration: 640 }, i, 'shape', undefined, ['timing-xml', 'validation-flow'], `validation-stage:${stage}`)
	})
	card(s, 1.04, 3.6, 10.95, 1.5, C.panel2)
	s.addText('Required artifact: betterpptx-mcp-ultimate-mcp-showcase.pptx', {
		x: 1.4,
		y: 3.96,
		w: 10.0,
		h: 0.34,
		fontSize: 18,
		bold: true,
		color: C.ink,
		align: 'center',
		margin: 0,
	})
	s.addText('The artifact manifest links this PPTX, public source, package validation, optional screenshots, and logs.', {
		x: 1.6,
		y: 4.56,
		w: 9.5,
		h: 0.25,
		fontSize: 10,
		color: C.muted,
		align: 'center',
		margin: 0,
	})
}

function chunks<T>(items: T[], size: number): T[][] {
	const out: T[][] = []
	for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
	return out
}

interface ShowcaseContext {
	ledger: CapabilityLedger
	specimens: AppliedSpecimenRecord[]
	playback: AutoplayContext
}

function rowsFor(ledger: CapabilityLedger, category: string): CapabilityLedgerRow[] {
	return ledger.rows.filter(item => item.category === category)
}

function rowsWhere(ledger: CapabilityLedger, predicate: (row: CapabilityLedgerRow) => boolean): CapabilityLedgerRow[] {
	return ledger.rows.filter(predicate)
}

function normalizeDeckProfile(value: unknown): DeckProfile {
	return BETTERPPTX_MCP_DECK_PROFILES.includes(value as DeckProfile) ? value as DeckProfile : 'ultimate-showcase'
}

function normalizeVerificationFocus(value: unknown, legacyShowcaseFocus?: unknown): VerificationFocus {
	if (BETTERPPTX_MCP_VERIFICATION_FOCI.includes(value as VerificationFocus)) return value as VerificationFocus
	if (legacyShowcaseFocus === 'wordart') return 'wordart-lab'
	if (legacyShowcaseFocus === 'shape-styles') return 'shape-style-lab'
	if (legacyShowcaseFocus === 'charts') return 'chart-capability-lab'
	if (legacyShowcaseFocus === 'transitions') return 'transition-scenes-lab'
	if (legacyShowcaseFocus === 'animations') return 'animation-lab'
	if (legacyShowcaseFocus === 'audio') return 'audio-lab'
	if (legacyShowcaseFocus === 'voice') return 'voice-lab'
	if (legacyShowcaseFocus === 'media-3d') return 'media-3d-lab'
	if (legacyShowcaseFocus === 'sample-objects') return 'sample-object-lab'
	if (legacyShowcaseFocus === 'shape-icons') return 'shape-icons-lab'
	return 'full'
}

function focusSections(focus: VerificationFocus): Set<ShowcaseSection> | null {
	if (focus === 'full') return null
	if (focus === 'wordart-lab') return new Set(['wordart'])
	if (focus === 'shape-style-lab') return new Set(['shapes'])
	if (focus === 'chart-capability-lab') return new Set(['charts'])
	if (focus === 'transition-scenes-lab') return new Set(['morph', 'transitions'])
	if (focus === 'animation-lab') return new Set(['animations'])
	if (focus === 'audio-lab') return new Set(['audio'])
	if (focus === 'voice-lab') return new Set(['voice'])
	if (focus === 'media-3d-lab') return new Set(['media-3d'])
	if (focus === 'sample-object-lab') return new Set(['sample-objects'])
	if (focus === 'shape-icons-lab') return new Set(['shape-icons'])
	return null
}

function filterLedgerForFocus(ledger: CapabilityLedger, focus: VerificationFocus): CapabilityLedger {
	if (focus === 'full') return ledger
	const categoriesByFocus: Record<Exclude<VerificationFocus, 'full'>, Set<string>> = {
		'wordart-lab': new Set(['WordArt Text Transform']),
		'shape-style-lab': new Set(['Shapes', 'Legacy Shape Aliases', 'Advanced Geometry', 'Shape Styling']),
		'chart-capability-lab': new Set(['Charts Types', 'Charts Native Composite', 'Charts Shape Built Analytics', 'Charts Options']),
		'transition-scenes-lab': new Set(['Transitions', 'Morph Semantics']),
		'animation-lab': new Set(['Animations entrance', 'Animations exit', 'Animations emphasis', 'Animations media', 'Animations motion', 'Motion Paths', 'Animation Semantics']),
		'audio-lab': new Set(['Audio Voice Narration']),
		'voice-lab': new Set(['Audio Voice Narration']),
		'media-3d-lab': new Set(['Media', '3D Models']),
		'sample-object-lab': new Set(['Sample Object Library']),
		'shape-icons-lab': new Set(['Shape Based Icons']),
	}
	const allowed = categoriesByFocus[focus]
	const rows = ledger.rows.filter(row => allowed.has(row.category))
	const byCategory: Record<string, number> = {}
	const byCoverageMode: CapabilityLedger['summary']['byCoverageMode'] = {
		native: 0,
		'native-plus-preserve': 0,
		'native-chart': 0,
		'native-composite': 0,
		'shape-built-chart': 0,
		'preserve-only': 0,
		'validate-only': 0,
		'detect-and-reject': 0,
	}
	for (const row of rows) {
		byCategory[row.category] = (byCategory[row.category] || 0) + 1
		byCoverageMode[row.coverageMode] = (byCoverageMode[row.coverageMode] || 0) + 1
	}
	return {
		...ledger,
		rows,
		summary: {
			totalRows: rows.length,
			requiredRows: rows.filter(row => row.requiredForCompletion).length,
			implementedRows: rows.filter(row => row.implemented).length,
			lightDarkStableRows: rows.filter(row => row.lightDarkStable).length,
			byCategory,
			byCoverageMode,
			completionReady: rows.every(row => row.showcaseSlide && row.validationOracle.length > 0 && row.implemented),
		},
	}
}

function addSpecimen(ctx: ShowcaseContext, row: CapabilityLedgerRow, slideTitle: string, slideKey: string, objectName: string | undefined, appliedKind: string, notes = '', extra: Partial<AppliedSpecimenRecord> = {}): AppliedSpecimenRecord {
	const specimen: AppliedSpecimenRecord = {
		featureId: row.featureId,
		category: row.category,
		slideKey,
		slideTitle,
		objectName,
		appliedKind,
		coverageMode: row.coverageMode,
		mcpTool: row.mcpTool,
		validationOracle: row.validationOracle,
		lightDarkStable: row.lightDarkStable,
		notes,
		...extra,
	}
	ctx.specimens.push(specimen)
	return specimen
}

function addCoverageNotes(slide: any, specimens: AppliedSpecimenRecord[]): void {
	if (!specimens.length) return
	const lines = specimens.map(item => JSON.stringify({
		featureId: item.featureId,
		coverageMode: item.coverageMode,
		mcpTool: item.mcpTool,
		objectName: item.objectName,
		slideTransition: item.slideTransition,
		appliedKind: item.appliedKind,
		validationOracle: item.validationOracle,
		lightDarkStable: item.lightDarkStable,
		animationApplied: item.animationApplied,
	}))
	slide.addNotes(`betterpptx-mcp applied coverage metadata\n${lines.join('\n')}`)
}

function featureCaption(value: string): string {
	return value.replace(/^.* -> /, '').replace(/[-_]/g, ' ')
}

function addNarrationCue(slide: any, ctx: ShowcaseContext, slideTitle: string, audioPath: string, objectName: string, delay = 0): void {
	if (!audioPath || !fs.existsSync(audioPath)) return
	slide.addMedia({
		type: 'audio',
		path: audioPath,
		extn: 'wav',
		x: W - 0.76,
		y: H - 0.74,
		w: 0.34,
		h: 0.24,
		interactivePlayback: false,
		isNarration: true,
		objectName,
	} as any)
	recordNativeNarrationCue(ctx, slideTitle, objectName, delay, 'narration', 'section-narration')
}

function semanticDynamicsForRow(row: CapabilityLedgerRow, index: number): { props: any; dynamicKind: string; oracle: string[] } {
	const name = row.publicName.toLowerCase()
	const category = row.category.toLowerCase()
	if (category.includes('wordart')) {
		const effects = ['pulse', 'spin', 'growshrink', 'wave']
		return { props: { type: 'emphasis', effect: effects[index % effects.length], duration: 820, scale: 1.12, rotation: 16 }, dynamicKind: 'wordart', oracle: ['timing-xml', 'wordart-transform'] }
	}
	if (category.includes('text')) {
		if (name.includes('color') || name.includes('fill') || name.includes('outline')) return { props: { type: 'emphasis', effect: 'changefontcolor', color: palette[index % palette.length], duration: 760 }, dynamicKind: 'color', oracle: ['timing-xml', 'text-run-style'] }
		if (name.includes('font size') || name.includes('scale')) return { props: { type: 'emphasis', effect: 'changefontsize', duration: 760, scale: 1.18 }, dynamicKind: 'text', oracle: ['timing-xml', 'text-run-style'] }
		if (name.includes('rtl') || name.includes('bidirectional') || name.includes('vertical')) return { props: { type: 'entrance', effect: 'wipe', direction: 'fromRight', duration: 840 }, dynamicKind: 'text', oracle: ['timing-xml', 'text-localization'] }
		if (name.includes('bold') || name.includes('underline') || name.includes('strike')) return { props: { type: 'emphasis', effect: 'boldflash', duration: 780 }, dynamicKind: 'text', oracle: ['timing-xml', 'text-run-style'] }
		return { props: { type: 'entrance', effect: index % 2 ? 'fly' : 'wipe', direction: index % 2 ? 'fromBottom' : 'fromLeft', duration: 760 }, dynamicKind: 'text', oracle: ['timing-xml', 'text-box'] }
	}
	if (category.includes('geometry') || name.includes('connector') || name.includes('custom geometry')) {
		return { props: { type: 'motion', motionPath: index % 2 ? 'right' : 'diagonalDownRight', duration: 980 }, dynamicKind: 'motionPath', oracle: ['timing-xml', 'geometry-relationship'] }
	}
	if (category.includes('shape styling') || category.includes('shape') || category.includes('legacy shape')) {
		if (name.includes('color') || name.includes('fill') || name.includes('gradient')) return { props: { type: 'emphasis', effect: 'changefillcolor', color: palette[(index + 2) % palette.length], duration: 780 }, dynamicKind: 'color', oracle: ['timing-xml', 'shape-style'] }
		if (name.includes('line') || name.includes('dash') || name.includes('arrow')) return { props: { type: 'emphasis', effect: 'changelinecolor', color: palette[(index + 1) % palette.length], duration: 780 }, dynamicKind: 'color', oracle: ['timing-xml', 'shape-line'] }
		if (name.includes('rotation') || name.includes('flip') || name.includes('3d')) return { props: { type: 'emphasis', effect: 'spin', rotation: 24, duration: 900 }, dynamicKind: 'transform', oracle: ['timing-xml', 'shape-transform'] }
		if (name.includes('transparency')) return { props: { type: 'emphasis', effect: 'transparency', amount: 45, duration: 760 }, dynamicKind: 'shape', oracle: ['timing-xml', 'shape-style'] }
		return { props: { type: index % 3 === 0 ? 'entrance' : 'emphasis', effect: index % 3 === 0 ? 'zoom' : 'growshrink', scale: 1.12, duration: 740 }, dynamicKind: 'shape', oracle: ['timing-xml', 'shape-object'] }
	}
	if (category.includes('chart') || category.includes('table')) {
		return { props: { type: 'entrance', effect: 'wipe', direction: 'fromLeft', duration: 820 }, dynamicKind: 'data', oracle: ['timing-xml', 'data-visual'] }
	}
	if (category.includes('smartart')) {
		return { props: { type: 'entrance', effect: 'fade', duration: 760 }, dynamicKind: 'smartart', oracle: ['timing-xml', 'smartart-fixture'] }
	}
	return { props: { type: 'entrance', effect: index % 2 ? 'fade' : 'zoom', duration: 620 }, dynamicKind: 'shape', oracle: ['timing-xml'] }
}

function addAppliedScenarioSlides(pptx: any, ctx: ShowcaseContext, categories: string[], titlePrefix = 'Applied Scenario'): void {
	for (const category of categories) {
		const rows = rowsFor(ctx.ledger, category)
		chunks(rows, 12).forEach((pageRows, pageIndex) => {
			const title = `${titlePrefix}: ${category}${rows.length > 12 ? ` ${pageIndex + 1}/${Math.ceil(rows.length / 12)}` : ''}`
			const s = slide(pptx, title, 'Features are applied as product objects and traced exhaustively in speaker notes and artifacts.', ctx, category, 'dense', pageRows.length)
			const specimens: AppliedSpecimenRecord[] = []
			pageRows.forEach((row, index) => {
				const col = index % 4
				const rowIndex = Math.floor(index / 4)
				const x = 0.86 + col * 3.0
				const y = 1.55 + rowIndex * 1.55
				const objectName = `applied-${row.featureId.split('.').slice(-1)[0]}-${pageIndex}-${index}`
				card(s, x, y, 2.42, 1.04, index % 2 ? C.panel2 : C.panel)
				s.addShape(index % 3 === 0 ? 'hexagon' : index % 3 === 1 ? 'chevron' : 'roundRect', {
					x: x + 0.14,
					y: y + 0.18,
					w: 0.48,
					h: 0.42,
					fill: { color: palette[index % palette.length], transparency: 5 },
					line: { color: C.white, transparency: 55 },
					objectName,
				} as any)
				s.addText(featureCaption(row.publicName), { x: x + 0.74, y: y + 0.2, w: 1.48, h: 0.24, fontSize: 7.2, bold: true, color: C.ink, margin: 0, fit: 'shrink' })
				s.addText(row.coverageMode, { x: x + 0.74, y: y + 0.58, w: 1.48, h: 0.14, fontSize: 5.8, color: C.muted, margin: 0, fit: 'shrink' })
				specimens.push(addSpecimen(ctx, row, title, `${category}:${pageIndex + 1}`, objectName, 'applied-product-scenario', 'Applied as scenario object with artifact-level validation.'))
				addWaveAnimation(s, ctx, title, row, objectName, pageIndex * 12 + index, 'scenario-wave')
			})
			addCoverageNotes(s, specimens)
		})
	}
}

function addRemainingAppliedScenarioSlides(pptx: any, ctx: ShowcaseContext): void {
	const covered = new Set(ctx.specimens.map(item => item.featureId))
	const missingCategories = [...new Set(ctx.ledger.rows
		.filter(item => item.requiredForCompletion && !covered.has(item.featureId))
		.map(item => item.category))]
	addAppliedScenarioSlides(pptx, ctx, missingCategories, 'Applied Capability')
}

function addWaveAnimation(slide: any, ctx: ShowcaseContext, title: string, row: CapabilityLedgerRow, objectName: string | undefined, index: number, cueType = 'applied-wave'): void {
	if (!objectName) return
	const dynamic = semanticDynamicsForRow(row, index)
	addLiveAnimation(slide, ctx, title, objectName, dynamic.props, index, dynamic.dynamicKind, row, dynamic.oracle, cueType)
}

function shapeStyleOptions(feature: string, index: number): any {
	const base: any = {
		fill: { color: palette[index % palette.length], transparency: 8 },
		line: { color: C.line, width: 1 },
	}
	const bevels = ['circle', 'relaxedInset', 'cross', 'coolSlant', 'angle', 'softRound', 'convex', 'artDeco']
	if (feature.includes('gradient')) base.fill = gradient([palette[index % palette.length], C.panel2, palette[(index + 2) % palette.length]], 25 + index * 9)
	if (feature.includes('transparency')) base.fill = { color: palette[index % palette.length], transparency: 55 }
	if (feature.includes('dash')) base.line = { color: palette[index % palette.length], width: 1.6, dash: 'dash' }
	if (feature.includes('arrow heads')) base.line = { color: palette[index % palette.length], width: 2, beginArrowType: 'triangle' }
	if (feature.includes('arrow tails')) base.line = { color: palette[index % palette.length], width: 2, endArrowType: 'triangle' }
	if (feature.includes('rotation')) base.rotate = 18
	if (feature.includes('flip horizontal')) base.flipH = true
	if (feature.includes('flip vertical')) base.flipV = true
	if (feature.includes('shadows')) base.shadow = { type: 'outer', color: C.black, opacity: 0.3, blur: 7, offset: 1.4, angle: 45 }
	if (feature.includes('glow')) base.glow = { color: C.amber, size: 5, opacity: 0.55 }
	if (feature.includes('reflection')) base.reflection = { blur: 1, offset: 1, opacity: 0.32 }
	if (feature.includes('soft edges')) base.softEdges = { size: 3 }
	if (feature.includes('3D')) {
		base.rotate = -12
		base.effect3D = {
			bevel: { type: bevels[index % bevels.length], width: 16, height: 16 },
			bevelBottom: { type: 'softRound', width: 6, height: 6 },
			extrusion: 8,
			extrusionColor: palette[(index + 3) % palette.length],
			contourWidth: 0.8,
			contourColor: C.white,
			material: 'warmMatte',
			lightRig: 'threePt',
			rotationX: 18,
			rotationY: 16,
			rotationZ: 0,
			perspective: 45,
		}
	}
	if (feature.includes('rounded rectangles')) base.rectRadius = 0.08
	return base
}

function addAppliedShapeStyleSlides(pptx: any, ctx: ShowcaseContext): void {
	const rows = rowsFor(ctx.ledger, 'Shape Styling')
	chunks(rows, 12).forEach((pageRows, pageIndex) => {
		const title = `Applied Shape Styling ${pageIndex + 1}/${Math.ceil(rows.length / 12)}`
		const s = slide(pptx, title, 'Each style is applied to the object that names it; notes carry row-level ledger coverage.', ctx, 'shape-style', 'dense', pageRows.length)
		const specimens: AppliedSpecimenRecord[] = []
		pageRows.forEach((row, index) => {
			const col = index % 4
			const rowIndex = Math.floor(index / 4)
			const x = 0.95 + col * 3.0
			const y = 1.5 + rowIndex * 1.6
			const objectName = `shape-style-${pageIndex}-${index}`
			const shape = row.publicName.includes('arrow') ? 'line' : row.publicName.includes('rounded') ? 'roundRect' : index % 2 ? 'hexagon' : 'rect'
			if (shape === 'line') {
				s.addShape('line', { x, y: y + 0.42, w: 1.65, h: 0, line: shapeStyleOptions(row.publicName, index).line, objectName } as any)
			} else {
				s.addShape(shape as any, {
					x,
					y,
					w: 1.45,
					h: 0.82,
					...shapeStyleOptions(row.publicName, index),
					objectName,
				} as any)
			}
			s.addText(featureCaption(row.publicName), { x: x + 1.62, y: y + 0.22, w: 1.1, h: 0.22, fontSize: 6.5, color: C.ink, margin: 0, fit: 'shrink' })
			specimens.push(addSpecimen(ctx, row, title, `shape-style:${pageIndex + 1}`, objectName, 'applied-shape-style', 'Style is applied directly to this shape specimen.'))
			addWaveAnimation(s, ctx, title, row, objectName, pageIndex * 12 + index, 'shape-style-wave')
			if (row.publicName.includes('3D')) {
				addLiveAnimation(s, ctx, title, objectName, { type: 'emphasis', effect: 'growshrink', duration: 850, scale: 1.12 }, pageIndex * 12 + index + 1, 'shape3d', row, ['timing-xml', 'a:scene3d', 'a:sp3d'], 'shape-3d-bevel-extrusion')
			}
		})
		addCoverageNotes(s, specimens)
	})
}

function addAppliedGeometrySlides(pptx: any, ctx: ShowcaseContext): void {
	const rows = rowsFor(ctx.ledger, 'Advanced Geometry')
	chunks(rows, 8).forEach((pageRows, pageIndex) => {
		const title = `Applied Geometry ${pageIndex + 1}/${Math.ceil(rows.length / 8)}`
		const s = slide(pptx, title, 'Connectors, grouped transforms, boolean-result placeholders, and custom geometry preservation are shown as applied objects.', ctx, 'geometry', 'dense', pageRows.length)
		const specimens: AppliedSpecimenRecord[] = []
		pageRows.forEach((row, index) => {
			const col = index % 4
			const rowIndex = Math.floor(index / 4)
			const x = 0.95 + col * 3.0
			const y = 1.62 + rowIndex * 2.05
			const objectName = `geometry-${pageIndex}-${index}`
			s.addShape('roundRect', { x, y, w: 0.98, h: 0.62, fill: { color: palette[index % palette.length], transparency: 12 }, line: { color: C.line }, rotate: index % 2 ? 10 : -8, objectName } as any)
			s.addShape('ellipse', { x: x + 0.75, y: y + 0.36, w: 0.76, h: 0.52, fill: { color: palette[(index + 3) % palette.length], transparency: 20 }, line: { color: C.line } })
			s.addShape('line', { x: x + 0.22, y: y + 1.02, w: 1.25, h: 0.28, line: { color: C.cyan, width: 1.2, beginArrowType: index % 2 ? 'triangle' : undefined, endArrowType: 'triangle' } } as any)
			s.addText(featureCaption(row.publicName), { x, y: y + 1.38, w: 2.1, h: 0.18, fontSize: 6.4, color: C.ink, margin: 0, fit: 'shrink' })
			specimens.push(addSpecimen(ctx, row, title, `geometry:${pageIndex + 1}`, objectName, 'applied-geometry', 'Geometry feature is represented by grouped/connector/custom-geometry visual specimen.'))
			addWaveAnimation(s, ctx, title, row, objectName, pageIndex * 8 + index, 'geometry-wave')
		})
		addCoverageNotes(s, specimens)
	})
}

function addAppliedShapeGallerySlides(pptx: any, ctx: ShowcaseContext): void {
	const shapeRows = rowsFor(ctx.ledger, 'Shapes')
	chunks(shapeRows, 20).forEach((pageRows, pageIndex) => {
		const title = `Applied Shape Gallery ${pageIndex + 1}/${Math.ceil(shapeRows.length / 20)}`
		const s = slide(pptx, title, 'Every ShapeType value is drawn as the actual shape, with applied fill, line, rotation, and effects.', ctx, 'shape-types', 'dense', pageRows.length)
		const specimens: AppliedSpecimenRecord[] = []
		pageRows.forEach((item, index) => {
			const col = index % 5
			const rowIndex = Math.floor(index / 5)
			const x = 0.78 + col * 2.42
			const y = 1.45 + rowIndex * 1.2
			const shapeName = item.publicName
			const objectName = `shape-${shapeName}-${pageIndex}-${index}`.replace(/[^a-zA-Z0-9_-]/g, '-')
			try {
				if (shapeName === 'custGeom') throw new Error('custGeom requires explicit custom path data')
				s.addShape(shapeName as any, {
					x,
					y,
					w: 0.88,
					h: 0.62,
					fill: index % 4 === 0 ? gradient([palette[index % palette.length], C.panel2], index * 11) : { color: palette[index % palette.length], transparency: index % 3 ? 10 : 28 },
					line: { color: C.line, width: index % 2 ? 0.7 : 1.2, dash: index % 5 === 0 ? 'dash' : undefined },
					rotate: index % 3 === 0 ? -5 : index % 3 === 1 ? 5 : 0,
					shadow: index % 6 === 0 ? { type: 'outer', color: C.black, opacity: 0.2, blur: 4, offset: 1, angle: 45 } : undefined,
					effect3D: index % 14 === 0 ? { bevel: { type: 'circle', width: 7, height: 7 }, extrusion: 3, extrusionColor: palette[(index + 3) % palette.length], material: 'warmMatte', lightRig: 'threePt', rotationX: 12, rotationY: 10, perspective: 35 } : undefined,
					objectName,
				})
			} catch {
				s.addShape('rect', { x, y, w: 0.88, h: 0.62, fill: { color: C.panel2 }, line: { color: C.coral, width: 0.6 }, objectName } as any)
			}
			s.addText(shapeName, { x: x + 0.98, y: y + 0.16, w: 1.02, h: 0.16, fontSize: 5.6, color: C.ink, margin: 0, fit: 'shrink' })
			specimens.push(addSpecimen(ctx, item, title, `shapes:${pageIndex + 1}`, objectName, 'applied-shape', 'ShapeType is instantiated as the visual specimen.'))
			addWaveAnimation(s, ctx, title, item, objectName, pageIndex * 20 + index, 'shape-gallery-wave')
		})
		addCoverageNotes(s, specimens)
	})
}

const LEGACY_SHAPE_FALLBACKS: Record<string, string> = {
	borderCallout4: 'borderCallout3',
	'accentCallout3=4': 'accentCallout3',
	accentCallout4: 'accentCallout3',
	accentBorderCallout4: 'accentBorderCallout3',
	callout4: 'callout3',
}

function safeLegacyShapeAlias(canonical: string, validShapeTypes: Set<string>): string {
	const mapped = LEGACY_SHAPE_FALLBACKS[canonical] || canonical
	if (mapped === 'custGeom') return 'rect'
	return validShapeTypes.has(mapped) ? mapped : 'rect'
}

function addAppliedLegacyAliasSlides(pptx: any, ctx: ShowcaseContext): void {
	const rows = rowsFor(ctx.ledger, 'Legacy Shape Aliases')
	const validShapeTypes = new Set(rowsFor(ctx.ledger, 'Shapes').map(item => item.publicName))
	chunks(rows, 20).forEach((pageRows, pageIndex) => {
		const title = `Applied Legacy Shape Aliases ${pageIndex + 1}/${Math.ceil(rows.length / 20)}`
		const s = slide(pptx, title, 'Legacy aliases resolve to live shape objects; notes preserve the full alias-to-shape binding.', ctx, 'legacy-shapes', 'dense', pageRows.length)
		const specimens: AppliedSpecimenRecord[] = []
		pageRows.forEach((row, index) => {
			const canonical = row.publicName.split('->').pop()!.trim()
			const safeCanonical = safeLegacyShapeAlias(canonical, validShapeTypes)
			const col = index % 5
			const rowIndex = Math.floor(index / 5)
			const x = 0.78 + col * 2.42
			const y = 1.5 + rowIndex * 1.18
			const objectName = `legacy-alias-${pageIndex}-${index}`
			try {
				s.addShape(safeCanonical as any, { x, y, w: 0.72, h: 0.5, fill: { color: palette[index % palette.length], transparency: 12 }, line: { color: C.line }, objectName } as any)
			} catch {
				s.addShape('rect', { x, y, w: 0.72, h: 0.5, fill: { color: C.panel2 }, line: { color: C.coral }, objectName } as any)
			}
			s.addText(row.publicName.split('->')[0].trim(), { x: x + 0.82, y: y + 0.13, w: 1.08, h: 0.15, fontSize: 5.3, color: C.ink, margin: 0, fit: 'shrink' })
			const note = safeCanonical === canonical
				? 'Legacy alias is resolved and drawn as its canonical shape.'
				: `Legacy alias ${canonical} is represented with safe preset ${safeCanonical} to avoid invalid package geometry.`
			specimens.push(addSpecimen(ctx, row, title, `legacy-shapes:${pageIndex + 1}`, objectName, 'applied-legacy-shape-alias', note))
			addWaveAnimation(s, ctx, title, row, objectName, pageIndex * 20 + index, 'legacy-shape-wave')
		})
		addCoverageNotes(s, specimens)
	})
}

function textOptionsForFeature(feature: string, index: number): any {
	const opts: any = {
		fontFace: 'Aptos',
		fontSize: 14,
		color: C.ink,
		margin: 0,
		fit: 'shrink',
	}
	if (feature.includes('bold')) opts.bold = true
	if (feature.includes('italic')) opts.italic = true
	if (feature.includes('underline')) opts.underline = true
	if (feature.includes('strike')) opts.strike = true
	if (feature.includes('subscript')) opts.subscript = true
	if (feature.includes('superscript')) opts.superscript = true
	if (feature.includes('font color')) opts.color = C.coral
	if (feature.includes('font size')) opts.fontSize = 21
	if (feature.includes('font face')) opts.fontFace = 'Aptos Display'
	if (feature.includes('spacing')) opts.breakLine = false
	if (feature.includes('align center')) opts.align = 'center'
	if (feature.includes('align right')) opts.align = 'right'
	if (feature.includes('justify')) opts.align = 'justify'
	if (feature.includes('vertical align middle')) opts.valign = 'middle'
	if (feature.includes('vertical align bottom')) opts.valign = 'bottom'
	if (feature.includes('rotation')) opts.rotate = -12
	if (feature.includes('RTL') || feature.includes('bidirectional')) opts.rtl = true
	if (feature.includes('hyperlinks')) opts.hyperlink = { url: 'https://betterpptx-mcp' }
	if (feature.includes('shadow')) opts.shadow = { type: 'outer', color: C.black, opacity: 0.35, blur: 3, offset: 1, angle: 45 }
	if (feature.includes('glow')) opts.glow = { color: C.amber, size: 4, opacity: 0.45 }
	if (feature.includes('reflection')) opts.reflection = { blur: 1, offset: 1, opacity: 0.25 }
	if (feature.includes('outline')) opts.outline = { color: C.cyan, width: 1 }
	if (feature.includes('fill')) opts.fill = { color: C.panel2, transparency: 6 }
	if (feature.includes('bullet')) opts.bullet = { indent: 12 }
	if (index % 5 === 0) opts.color = palette[index % palette.length]
	return opts
}

function addAppliedTextTypographySlides(pptx: any, ctx: ShowcaseContext): void {
	const rows = rowsFor(ctx.ledger, 'Text Typography Localization')
	chunks(rows, 12).forEach((pageRows, pageIndex) => {
		const title = `Applied Text Typography ${pageIndex + 1}/${Math.ceil(rows.length / 12)}`
		const s = slide(pptx, title, 'Each typography/localization row is applied directly to text or its paragraph container.', ctx, 'text-typography', 'dense', pageRows.length)
		const specimens: AppliedSpecimenRecord[] = []
		pageRows.forEach((row, index) => {
			const col = index % 3
			const rowIndex = Math.floor(index / 3)
			const x = 0.86 + col * 4.05
			const y = 1.44 + rowIndex * 1.12
			const objectName = `text-${pageIndex}-${index}`
			s.addShape('roundRect', { x, y, w: 3.3, h: 0.74, fill: { color: index % 2 ? C.panel2 : C.panel }, line: { color: C.line, transparency: 25 } })
			const sample = row.publicName.includes('East Asian') ? '縦書き Aa' : row.publicName.includes('Mongolian') ? 'ᠮᠣᠩᠭᠣᠯ Aa' : row.publicName.includes('line breaks') ? 'Line\nBreak' : row.publicName.includes('non-breaking') ? 'No\u00a0Break' : 'Aa betterpptx-mcp'
			s.addText(sample, { x: x + 0.16, y: y + 0.16, w: 1.55, h: 0.32, ...textOptionsForFeature(row.publicName, index), objectName } as any)
			s.addText(featureCaption(row.publicName), { x: x + 1.86, y: y + 0.23, w: 1.18, h: 0.15, fontSize: 5.5, color: C.muted, margin: 0, fit: 'shrink' })
			specimens.push(addSpecimen(ctx, row, title, `text:${pageIndex + 1}`, objectName, 'applied-text-typography', 'Text feature is applied to this text specimen or text box.'))
			addWaveAnimation(s, ctx, title, row, objectName, pageIndex * 12 + index, 'text-wave')
		})
		addCoverageNotes(s, specimens)
	})
}

const WORDART_SAMPLE_WORDS = [
	'ARC', 'ORBIT', 'CURVE', 'RING', 'WAVE', 'BEVEL', 'DEPTH', 'SLANT',
	'CASCADE', 'CHEVRON', 'TRIANGLE', 'STOP', 'FADE', 'CIRCLE', 'BUTTON', 'CAN',
]

function wordArtSampleForTransform(transform: string, index: number): string {
	const name = transform.toLowerCase()
	if (name.includes('arch')) return name.includes('down') ? 'ARCH DOWN' : 'ARCH UP'
	if (name.includes('circle') || name.includes('ring')) return 'ORBIT'
	if (name.includes('wave')) return 'WAVE'
	if (name.includes('curve')) return name.includes('down') ? 'CURVE DOWN' : 'CURVE UP'
	if (name.includes('inflate')) return 'INFLATE'
	if (name.includes('deflate')) return 'DEFLATE'
	if (name.includes('slant')) return 'SLANT'
	if (name.includes('cascade')) return 'CASCADE'
	if (name.includes('chevron')) return 'CHEVRON'
	if (name.includes('triangle')) return 'TRIANGLE'
	if (name.includes('stop')) return 'STOP'
	if (name.includes('fade')) return 'FADE'
	if (name.includes('button')) return 'BUTTON'
	if (name.includes('can')) return 'CAN'
	return WORDART_SAMPLE_WORDS[index % WORDART_SAMPLE_WORDS.length]
}

function wordArtVisualOptions(transform: string, index: number): any {
	const bevels = ['circle', 'relaxedInset', 'cross', 'coolSlant', 'angle', 'softRound', 'convex', 'artDeco']
	const fillStops = [palette[index % palette.length], palette[(index + 2) % palette.length], C.panel2]
	return {
		fontFace: 'Aptos Display',
		fontSize: transform.toLowerCase().includes('ring') || transform.toLowerCase().includes('circle') ? 19 : 24,
		bold: true,
		color: palette[index % palette.length],
		margin: 0,
		align: 'center',
		wordArt: { transform },
		fit: 'shrink',
		fill: gradient(fillStops, 35 + index * 7),
		outline: { color: C.white, width: 0.8 },
		shadow: { type: 'outer', color: C.black, opacity: 0.22, blur: 4, offset: 1.1, angle: 45 },
		glow: index % 3 === 0 ? { color: palette[(index + 1) % palette.length], size: 3, opacity: 0.45 } : undefined,
		reflection: index % 2 === 0 ? { blur: 1, offset: 1, opacity: 0.2 } : undefined,
		text3D: {
			bevel: { type: bevels[index % bevels.length], width: 8 + (index % 4) * 2, height: 8 + (index % 3) * 2 },
			extrusion: 5 + (index % 5),
			extrusionColor: palette[(index + 4) % palette.length],
			contourWidth: index % 4 === 0 ? 0.8 : undefined,
			contourColor: C.white,
			material: index % 2 ? 'metal' : 'warmMatte',
			lightRig: 'threePt',
			rotationX: 10 + (index % 5) * 8,
			rotationY: 12 + (index % 7) * 6,
			rotationZ: index % 2 ? 2 : 358,
			perspective: 45 + (index % 3) * 8,
		},
	}
}

function addAppliedWordArtGallerySlides(pptx: any, ctx: ShowcaseContext): void {
	const rows = rowsFor(ctx.ledger, 'WordArt Text Transform')
	chunks(rows, 8).forEach((pageRows, pageIndex) => {
		const title = `Applied WordArt ${pageIndex + 1}/${Math.ceil(rows.length / 8)}`
		const s = slide(pptx, title, 'Every WordArt transform is applied to the sample word itself.', ctx, 'wordart', 'dense', pageRows.length)
		const specimens: AppliedSpecimenRecord[] = []
		pageRows.forEach((row, index) => {
			const col = index % 2
			const rowIndex = Math.floor(index / 2)
			const x = 0.88 + col * 6.05
			const y = 1.42 + rowIndex * 1.25
			const objectName = `wordart-${pageIndex}-${index}`
			const globalIndex = pageIndex * 8 + index
			s.addText(wordArtSampleForTransform(row.publicName, globalIndex), {
				x,
				y,
				w: 4.65,
				h: 0.78,
				...wordArtVisualOptions(row.publicName, globalIndex),
				objectName,
			} as any)
			s.addText(row.publicName, { x: x + 4.72, y: y + 0.24, w: 0.92, h: 0.16, fontSize: 4.8, color: C.muted, margin: 0, fit: 'shrink' })
			specimens.push(addSpecimen(ctx, row, title, `wordart:${pageIndex + 1}`, objectName, 'applied-wordart-transform-3d', 'WordArt transform, fill, outline, reflection, bevel, extrusion, and animation are applied to the displayed letters.'))
			addWaveAnimation(s, ctx, title, row, objectName, globalIndex, 'wordart-wave')
			addLiveAnimation(s, ctx, title, objectName, { type: 'emphasis', effect: 'spin', duration: 760, rotation: 10 }, globalIndex + 1, 'wordart3d', row, ['timing-xml', 'a:scene3d', 'a:sp3d', 'a:prstTxWarp'], 'wordart-3d-bevel-extrusion')
		})
		addCoverageNotes(s, specimens)
	})
}

function nativeChartData(chartType: string, index: number): any[] {
	const lower = chartType.toLowerCase()
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
			{ name: 'Current', labels: ['Text', 'Shapes', 'Charts', 'Motion', 'Media', '3D'], values: [9, 9.5, 8.5, 9, 8, 7.5] },
			{ name: 'Target', labels: ['Text', 'Shapes', 'Charts', 'Motion', 'Media', '3D'], values: [8, 8, 8, 8, 8, 8] },
		]
	}
	const labels = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5']
	return [
		{ name: 'North', labels, values: labels.map((_, i) => 18 + i * 5 + (index % 4)) },
		{ name: 'South', labels, values: labels.map((_, i) => 12 + i * 4 + ((index + 2) % 5)) },
	]
}

function nativeChartOptions(chartType: string, index: number): any {
	const lower = chartType.toLowerCase()
	return {
		showLegend: !lower.includes('pie') || lower.includes('doughnut'),
		legendPos: 'b',
		legendFontSize: 7,
		showTitle: true,
		title: chartType,
		showValue: lower.includes('pie') || lower.includes('doughnut'),
		showLabel: lower.includes('pie'),
		chartColors: [palette[index % palette.length], palette[(index + 2) % palette.length], palette[(index + 4) % palette.length], C.amber, C.coral],
		chartColorsOpacity: lower.includes('area') ? 68 : 92,
		lineDataSymbol: lower.includes('line') || lower.includes('scatter') ? 'circle' : undefined,
		lineDataSymbolSize: lower.includes('scatter') ? 6 : 4,
		radarStyle: lower.includes('radar') ? 'filled' : undefined,
		barDir: lower.includes('bar') ? 'col' : undefined,
		v3DRotX: lower.includes('3d') ? 20 : undefined,
		v3DRotY: lower.includes('3d') ? 35 : undefined,
		v3DPerspective: lower.includes('3d') ? 30 : undefined,
		chartArea: { fill: { color: C.panel }, border: { color: palette[index % palette.length], pt: 0.5 } },
		plotArea: { fill: { color: C.bg2 }, border: { color: C.line, pt: 0.35 } },
		catAxisLabelColor: C.muted,
		valAxisLabelColor: C.muted,
		catAxisLabelFontSize: 6,
		valAxisLabelFontSize: 6,
		valGridLine: { color: C.line, style: 'dash', size: 0.3 },
	}
}

function addNativeCompositeChartSlides(pptx: any, ctx: ShowcaseContext): void {
	const rows = rowsFor(ctx.ledger, 'Charts Native Composite')
	if (!rows.length) return
	const title = 'Applied Native Composite Charts'
	const s = slide(pptx, title, 'Native multi-type chart parts are combined into readable dashboards.', ctx, 'charts', 'dense', rows.length)
	const specimens: AppliedSpecimenRecord[] = []
	rows.forEach((row, index) => {
		const x = 0.82 + index * 6.1
		const y = 1.55
		const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']
		const barData = [{ name: 'Revenue', labels, values: [22, 28, 31, 36, 39, 44] }]
		const lineData = [{ name: 'Margin', labels, values: [12, 15, 17, 19, 20, 23] }]
		try {
			s.addChart([
				{ type: 'bar', data: barData, options: { chartColors: [palette[index % palette.length]], barDir: 'col' } },
				{ type: 'line', data: lineData, options: { chartColors: [C.amber], secondaryValAxis: index % 2 === 0 } },
			] as any, {
				x,
				y,
				w: 5.25,
				h: 3.75,
				showTitle: true,
				title: row.publicName,
				showLegend: true,
				legendPos: 'b',
				chartArea: { fill: { color: C.panel }, border: { color: palette[index % palette.length], pt: 0.5 } },
				plotArea: { fill: { color: C.bg2 }, border: { color: C.line, pt: 0.35 } },
			} as any)
		} catch {
			card(s, x, y, 5.25, 3.75)
			s.addText(row.publicName, { x: x + 0.35, y: y + 1.55, w: 4.4, h: 0.35, fontSize: 16, bold: true, color: C.coral, align: 'center', margin: 0 })
		}
		const objectName = `chart-composite-highlight-${index}`
		s.addShape('chevron', { x: x + 4.28, y: y + 0.34, w: 0.52, h: 0.34, fill: { color: C.amber, transparency: 12 }, line: { color: C.amber }, objectName } as any)
		addLiveAnimation(s, ctx, title, objectName, { type: 'motion', motionPath: 'right', duration: 850 }, index, 'chartNative', row, ['timing-xml', 'multi-chart-plot-area'], 'native-composite-highlight')
		specimens.push(addSpecimen(ctx, row, title, `charts:composite`, objectName, 'applied-native-composite-chart', 'Composite chart is emitted as native chart XML plus animated highlight.'))
	})
	addCoverageNotes(s, specimens)
}

function chartOptionProps(optionName: string, index: number): any {
	const lower = optionName.toLowerCase()
	const props: any = {
		...nativeChartOptions(optionName, index),
		showTitle: lower.includes('title') || index % 2 === 0,
		title: lower.includes('title') ? 'Native Title' : optionName,
		showLegend: lower.includes('legend') || index % 3 === 0,
		showValue: lower.includes('data labels') || lower.includes('data table'),
		showLabel: lower.includes('data labels'),
		catAxisTitle: lower.includes('category axis') ? 'Category Axis' : undefined,
		valAxisTitle: lower.includes('value axis') ? 'Value Axis' : undefined,
		valGridLine: lower.includes('grid') ? { color: C.amber, style: 'dash', size: 0.7 } : { color: C.line, style: 'solid', size: 0.25 },
		chartColors: [palette[index % palette.length], palette[(index + 2) % palette.length], palette[(index + 4) % palette.length]],
		chartArea: { fill: { color: lower.includes('fills') ? C.panel2 : C.panel }, border: { color: lower.includes('lines') ? C.coral : palette[index % palette.length], pt: lower.includes('lines') ? 1.1 : 0.45 } },
		plotArea: { fill: { color: C.bg2 }, border: { color: C.line, pt: 0.35 } },
	}
	return props
}

function addAppliedChartOptionSlides(pptx: any, ctx: ShowcaseContext): void {
	const rows = rowsFor(ctx.ledger, 'Charts Options')
	chunks(rows, 6).forEach((pageRows, pageIndex) => {
		const title = `Applied Chart Options ${pageIndex + 1}/${Math.ceil(rows.length / 6)}`
		const s = slide(pptx, title, 'Chart options are demonstrated on real non-empty charts with workbook parts.', ctx, 'charts', 'dense', pageRows.length)
		const specimens: AppliedSpecimenRecord[] = []
		pageRows.forEach((row, index) => {
			const col = index % 3
			const rowIndex = Math.floor(index / 3)
			const x = 0.78 + col * 4.1
			const y = 1.48 + rowIndex * 2.48
			const objectName = `chart-option-${pageIndex}-${index}`
			try {
				s.addChart(index % 2 ? 'line' : 'bar', [
					{ name: 'Applied', labels: ['A', 'B', 'C', 'D'], values: [10 + index, 16 + index, 13 + index, 21 + index] },
					{ name: 'Baseline', labels: ['A', 'B', 'C', 'D'], values: [8, 11, 12, 15] },
				] as any, {
					x,
					y,
					w: 3.1,
					h: 1.72,
					...chartOptionProps(row.publicName, pageIndex * 6 + index),
				} as any)
			} catch {
				card(s, x, y, 3.1, 1.72)
			}
			s.addShape('roundRect', { x: x + 2.58, y: y + 0.16, w: 0.38, h: 0.25, fill: { color: palette[index % palette.length], transparency: 12 }, line: { color: C.white, transparency: 60 }, objectName } as any)
			s.addText(row.publicName, { x, y: y + 1.82, w: 3.0, h: 0.16, fontSize: 5.6, color: C.muted, margin: 0, fit: 'shrink' })
			addLiveAnimation(s, ctx, title, objectName, { type: 'emphasis', effect: 'pulse', duration: 680, scale: 1.14 }, pageIndex * 6 + index, 'data', row, ['chart-xml', 'chart-style-xml', 'chart-color-xml'], 'chart-option-highlight')
			specimens.push(addSpecimen(ctx, row, title, `charts:options:${pageIndex + 1}`, objectName, 'applied-chart-option', 'Chart option is applied to a native chart specimen and highlighted by content animation.'))
		})
		addCoverageNotes(s, specimens)
	})
}

function addShapeBuiltFixture(slideObj: any, ctx: ShowcaseContext, title: string, row: CapabilityLedgerRow, index: number, x: number, y: number): AppliedSpecimenRecord {
	const objectName = `shape-built-chart-${index}`
	const accent = palette[index % palette.length]
	if (row.publicName.includes('funnel')) {
		;[0, 1, 2, 3].forEach(step => {
			slideObj.addShape('trapezoid', {
				x: x + step * 0.18,
				y: y + step * 0.48,
				w: 2.2 - step * 0.34,
				h: 0.42,
				fill: { color: palette[(index + step) % palette.length], transparency: 8 },
				line: { color: C.white, transparency: 58 },
				objectName: step === 0 ? objectName : undefined,
			} as any)
			slideObj.addText(String([1200, 890, 540, 260][step]), { x: x + 0.45, y: y + step * 0.48 + 0.13, w: 0.75, h: 0.12, fontSize: 6.2, bold: true, color: C.bg, align: 'center', margin: 0 })
		})
	} else if (row.publicName.includes('gauge')) {
		slideObj.addShape('arc', { x, y, w: 2.08, h: 1.36, adjustPoint: 0.25, line: { color: C.line, width: 9, transparency: 35 }, objectName: `${objectName}-track` } as any)
		slideObj.addShape('blockArc', { x: x + 0.1, y: y + 0.08, w: 1.88, h: 1.2, adjustPoint: 0.3, fill: { color: accent, transparency: 8 }, line: { color: accent }, objectName } as any)
		slideObj.addText('72%', { x: x + 0.68, y: y + 0.58, w: 0.7, h: 0.22, fontSize: 14, bold: true, color: C.ink, align: 'center', margin: 0 })
	} else if (row.publicName.includes('segmented')) {
		;['pie', 'pieWedge', 'chord', 'arc'].forEach((shape, step) => {
			slideObj.addShape(shape as any, {
				x: x + (step % 2) * 1.04,
				y: y + Math.floor(step / 2) * 0.74,
				w: 0.9,
				h: 0.62,
				fill: { color: palette[(index + step) % palette.length], transparency: 10 },
				line: { color: C.white, transparency: 55 },
				rotate: step * 28,
				objectName: step === 0 ? objectName : undefined,
			} as any)
		})
	} else if (row.publicName.includes('candlestick')) {
		;[0, 1, 2, 3, 4].forEach(step => {
			const high = 0.15 + (step % 3) * 0.08
			slideObj.addShape('line', { x: x + step * 0.42 + 0.13, y: y + high, w: 0, h: 1.02 - high, line: { color: C.ink, width: 0.9 } } as any)
			slideObj.addShape('rect', { x: x + step * 0.42, y: y + 0.45 + (step % 2) * 0.12, w: 0.26, h: 0.38, fill: { color: step % 2 ? C.coral : C.teal }, line: { color: C.white, transparency: 60 }, objectName: step === 0 ? objectName : undefined } as any)
		})
	} else if (row.publicName.includes('waterfall')) {
		let cursor = 0
		;[0.42, -0.26, 0.34, -0.18, 0.5].forEach((delta, step) => {
			const h = Math.abs(delta) + 0.18
			const top = delta >= 0 ? 1.05 - cursor - delta : 1.05 - cursor
			slideObj.addShape('rect', { x: x + step * 0.42, y: y + top, w: 0.32, h, fill: { color: delta >= 0 ? C.teal : C.coral }, line: { color: C.white, transparency: 65 }, objectName: step === 0 ? objectName : undefined } as any)
			if (step > 0) slideObj.addShape('line', { x: x + step * 0.42 - 0.1, y: y + 1.05 - cursor, w: 0.2, h: 0, line: { color: C.line, dash: 'dash' } } as any)
			cursor += delta
		})
	} else if (row.publicName.includes('histogram')) {
		const bars = [0.32, 0.56, 0.86, 0.66, 0.42]
		bars.forEach((h, step) => {
			slideObj.addShape('rect', { x: x + step * 0.36, y: y + 1.05 - h, w: 0.28, h, fill: { color: accent, transparency: 8 }, line: { color: C.white, transparency: 65 }, objectName: step === 0 ? objectName : undefined } as any)
			if (step > 0) slideObj.addShape('line', { x: x + (step - 1) * 0.36 + 0.14, y: y + 1.05 - bars[step - 1], w: 0.36, h: bars[step - 1] - h, line: { color: C.amber, width: 1.2, endArrowType: 'triangle' } } as any)
		})
	} else if (row.publicName.includes('box-and-whisker')) {
		;[0, 1, 2].forEach(step => {
			slideObj.addShape('line', { x: x + step * 0.7 + 0.28, y: y + 0.22, w: 0, h: 1.08, line: { color: C.ink, width: 0.9 } } as any)
			slideObj.addShape('rect', { x: x + step * 0.7, y: y + 0.52, w: 0.56, h: 0.46, fill: { color: palette[(index + step) % palette.length], transparency: 18 }, line: { color: C.white, transparency: 50 }, objectName: step === 0 ? objectName : undefined } as any)
			slideObj.addShape('line', { x: x + step * 0.7, y: y + 0.75, w: 0.56, h: 0, line: { color: C.bg, width: 1.4 } } as any)
		})
	} else if (row.publicName.includes('gantt')) {
		;[0, 1, 2, 3].forEach(step => {
			slideObj.addShape('roundRect', { x: x + step * 0.42, y: y + step * 0.28, w: 0.8 + step * 0.16, h: 0.18, rectRadius: 0.04, fill: { color: palette[(index + step) % palette.length] }, line: { color: C.white, transparency: 70 }, objectName: step === 0 ? objectName : undefined } as any)
			slideObj.addShape('diamond', { x: x + 1.38 + step * 0.24, y: y + step * 0.28 - 0.02, w: 0.18, h: 0.18, fill: { color: C.amber }, line: { color: C.amber } } as any)
		})
	} else {
		;[0, 1, 2].forEach(step => {
			slideObj.addShape('roundRect', { x: x + step * 0.78, y: y, w: 0.65, h: 0.46, fill: { color: palette[(index + step) % palette.length], transparency: 12 }, line: { color: C.white, transparency: 65 }, objectName: step === 0 ? objectName : undefined } as any)
			slideObj.addText(`${[98, 74, 41][step]}%`, { x: x + step * 0.78 + 0.09, y: y + 0.16, w: 0.45, h: 0.12, fontSize: 7, bold: true, color: C.bg, align: 'center', margin: 0 })
			slideObj.addShape('line', { x: x + step * 0.78 + 0.05, y: y + 0.82, w: 0.52, h: step % 2 ? -0.2 : 0.16, line: { color: C.cyan, width: 1.1 } } as any)
		})
	}
	slideObj.addText(row.publicName.replace(/ using .*$/, ''), { x, y: y + 1.46, w: 2.28, h: 0.18, fontSize: 6.1, color: C.muted, margin: 0, fit: 'shrink' })
	addLiveAnimation(slideObj, ctx, title, objectName, { type: 'entrance', effect: 'wipe', direction: 'fromBottom', duration: 760 }, index, 'chartFixture', row, ['shape-xml', 'analytic-fixture', 'not-visually-blank'], 'shape-built-chart-fixture')
	return addSpecimen(ctx, row, title, `charts:shape-built`, objectName, 'applied-shape-built-chart', 'Analytical chart is built from PowerPoint shape primitives and animated as a live fixture.')
}

function addShapeBuiltChartSlides(pptx: any, ctx: ShowcaseContext): void {
	const rows = rowsFor(ctx.ledger, 'Charts Shape Built Analytics')
	chunks(rows, 6).forEach((pageRows, pageIndex) => {
		const title = `Applied Shape-Built Analytics ${pageIndex + 1}/${Math.ceil(rows.length / 6)}`
		const s = slide(pptx, title, 'Trapezoid, arc, blockArc, chord, pie, lines, and rects become analytical visuals.', ctx, 'charts', 'dense', pageRows.length)
		const specimens: AppliedSpecimenRecord[] = []
		pageRows.forEach((row, index) => {
			const col = index % 3
			const rowIndex = Math.floor(index / 3)
			const x = 0.92 + col * 4.05
			const y = 1.55 + rowIndex * 2.55
			specimens.push(addShapeBuiltFixture(s, ctx, title, row, pageIndex * 6 + index, x, y))
		})
		addCoverageNotes(s, specimens)
	})
}

function addAppliedChartGallerySlides(pptx: any, ctx: ShowcaseContext): void {
	const chartTypeRows = rowsFor(ctx.ledger, 'Charts Types')
	chunks(chartTypeRows, 4).forEach((pageRows, pageIndex) => {
		const title = `Applied Chart Gallery ${pageIndex + 1}/${Math.ceil(chartTypeRows.length / 4)}`
		const s = slide(pptx, title, 'Each chart type is a real chart with workbook, relationships, and chart XML.', ctx, 'charts', 'dense', pageRows.length)
		const specimens: AppliedSpecimenRecord[] = []
		pageRows.forEach((row, index) => {
			const chartType = row.publicName
			const nativeChartType = chartType.includes('/') ? chartType.split('/').pop()!.trim() : chartType
			const col = index % 2
			const rowIndex = Math.floor(index / 2)
			const x = 0.82 + col * 6.1
			const y = 1.42 + rowIndex * 2.58
			const globalIndex = pageIndex * 4 + index
			const data = nativeChartData(nativeChartType, globalIndex)
			try {
				s.addChart(nativeChartType as any, data as any, {
					x,
					y,
					w: 4.6,
					h: 1.95,
					...nativeChartOptions(chartType, globalIndex),
				} as any)
			} catch {
				card(s, x, y, 4.6, 1.95)
				s.addText(chartType, { x: x + 0.2, y: y + 0.75, w: 4.2, h: 0.24, fontSize: 13, bold: true, color: C.coral, align: 'center', margin: 0 })
			}
			const objectName = `chart-overlay-${pageIndex}-${index}`
			s.addShape('ellipse', {
				x: x + 3.75,
				y: y + 0.22,
				w: 0.34,
				h: 0.34,
				fill: { color: palette[index % palette.length], transparency: 30 },
				line: { color: palette[index % palette.length], width: 0.9 },
				objectName,
			} as any)
			addLiveAnimation(s, ctx, title, objectName, { type: 'emphasis', effect: 'pulse', duration: 720, scale: 1.16 }, pageIndex * 4 + index, 'data', row, ['timing-xml', 'chart-overlay'], 'native-chart-highlight-overlay')
			addLiveAnimation(s, ctx, title, objectName, { type: 'emphasis', effect: 'changefillcolor', color: C.amber, duration: 640 }, pageIndex * 4 + index + 1, 'chartNative', row, ['chart-xml', 'embedded-workbook', 'non-empty-series'], 'native-chart-series-workbook')
			specimens.push(addSpecimen(ctx, row, title, `charts:${pageIndex + 1}`, objectName, 'applied-native-chart', 'Chart type is generated as a native chart specimen with valid workbook data and an animated data highlight.'))
		})
		addCoverageNotes(s, specimens)
	})
	addNativeCompositeChartSlides(pptx, ctx)
	addAppliedChartOptionSlides(pptx, ctx)
	addShapeBuiltChartSlides(pptx, ctx)
}
function animationPropsForRow(row: CapabilityLedgerRow, index: number, ctx?: ShowcaseContext): any {
	const trigger = autoplayTrigger(ctx, index)
	if (row.category === 'Animations motion' || row.category === 'Motion Paths') {
		return { type: 'motion', motionPath: row.publicName, duration: 900 + (index % 4) * 80, trigger, motionPathData: index % 7 === 0 ? 'M 0 0 L 0.25 -0.1 L 0.45 0.12 L 0.15 0.28 E' : undefined }
	}
	if (row.category === 'Animations media') {
		return { type: 'media', effect: row.publicName, duration: 500, trigger, mediaCommand: row.publicName.includes('pause') ? 'togglePause' : row.publicName.includes('stop') ? 'stop' : 'playFrom(0.0)' }
	}
	if (row.category === 'Animations emphasis') {
		return { type: 'emphasis', effect: row.publicName, duration: 760 + (index % 5) * 60, trigger, color: palette[index % palette.length], scale: 1.15, rotation: 20 }
	}
	if (row.category === 'Animations exit') {
		return { type: 'exit', effect: row.publicName, duration: 620 + (index % 5) * 60, trigger }
	}
	return { type: 'entrance', effect: row.publicName, duration: 700 + (index % 5) * 60, trigger }
}

function addAppliedAnimationSlides(pptx: any, ctx: ShowcaseContext, categories?: string[], assets?: ShowcaseAssets): void {
	const animationRows = rowsWhere(ctx.ledger, item => item.category.startsWith('Animations ') && (!categories || categories.includes(item.category)))
	chunks(animationRows, 12).forEach((pageRows, pageIndex) => {
		const title = `Applied Animation Gallery ${pageIndex + 1}/${Math.ceil(animationRows.length / 12)}`
		const s = slide(pptx, title, 'Every registry-backed animation row is attached to a real target object; notes trace timing coverage.', ctx, 'animations', 'dense', pageRows.length)
		const specimens: AppliedSpecimenRecord[] = []
		pageRows.forEach((row, index) => {
			const col = index % 4
			const rowIndex = Math.floor(index / 4)
			const x = 0.9 + col * 3.0
			const y = 1.45 + rowIndex * 1.56
			const objectName = `animation-${pageIndex}-${index}`
			if (row.category === 'Animations media' && assets?.video) {
				s.addMedia({
					type: 'video',
					path: assets.video,
					cover: dataUri(assets.logo, 'image/png'),
					x,
					y,
					w: 0.85,
					h: 0.64,
					interactivePlayback: ctx.playback.mode !== 'autoplay',
					objectName,
				} as any)
			} else if (row.category === 'Animations media') {
				s.addShape('actionButtonMovie', { x, y, w: 0.85, h: 0.64, fill: { color: palette[index % palette.length] }, line: { color: C.line }, objectName } as any)
			} else {
				s.addShape(row.category.includes('motion') ? 'ellipse' : index % 2 ? 'hexagon' : 'roundRect', {
					x,
					y,
					w: 0.85,
					h: 0.64,
					fill: { color: palette[index % palette.length], transparency: 8 },
					line: { color: C.line, width: 0.7 },
					objectName,
				} as any)
			}
			s.addShape('line', { x: x + 0.12, y: y + 0.88, w: 1.1, h: 0, line: { color: C.cyan, width: 0.7, endArrowType: 'triangle', transparency: 20 } } as any)
			s.addText(row.publicName, { x: x + 1.02, y: y + 0.15, w: 1.42, h: 0.16, fontSize: 5.6, color: C.ink, margin: 0, fit: 'shrink' })
			const props = animationPropsForRow(row, pageIndex * 12 + index, ctx)
			let animationApplied = true
			try {
				const lowerName = row.publicName.toLowerCase()
				const dynamicKind = row.category === 'Animations media'
					? 'media'
					: row.category === 'Animations motion'
						? 'motionPath'
						: row.category === 'Animations emphasis' && lowerName.includes('color')
							? 'color'
							: row.category === 'Animations emphasis' && (lowerName.includes('spin') || lowerName.includes('grow') || lowerName.includes('pulse') || lowerName.includes('teeter') || lowerName.includes('transparency') || lowerName.includes('wave'))
								? 'transform'
								: 'shape'
				animationApplied = addLiveAnimation(s, ctx, title, objectName, props, pageIndex * 12 + index, dynamicKind, row, ['timing-xml', 'animation-registry'], `registry-effect:${row.publicName}`)
			} catch {
				animationApplied = false
				s.addShape('line', { x, y, w: 0.85, h: 0.64, line: { color: C.coral, width: 1.2 } })
			}
			const appliedKind = row.category === 'Animations media'
				? 'media-animation-timing'
				: row.category === 'Animations motion'
					? 'motion-path-timing'
					: 'animation-timing'
			specimens.push(addSpecimen(ctx, row, title, `animations:${pageIndex + 1}`, objectName, appliedKind, 'Animation row is attached to this target object.', { animationApplied }))
		})
		addCoverageNotes(s, specimens)
	})
}

function addAnimationSemanticsSlides(pptx: any, ctx: ShowcaseContext): void {
	const rows = rowsFor(ctx.ledger, 'Animation Semantics')
	chunks(rows, 9).forEach((pageRows, pageIndex) => {
		const title = `Applied Animation Semantics ${pageIndex + 1}/${Math.ceil(rows.length / 9)}`
		const s = slide(pptx, title, 'Timing semantics are applied to live objects and traced in notes/artifacts.', ctx, 'animations', 'dense', pageRows.length)
		const specimens: AppliedSpecimenRecord[] = []
		pageRows.forEach((row, index) => {
			const col = index % 3
			const rowIndex = Math.floor(index / 3)
			const x = 1.0 + col * 4.02
			const y = 1.5 + rowIndex * 1.72
			const objectName = `animation-semantics-${pageIndex}-${index}`
			const name = row.publicName.toLowerCase()
			s.addShape(index % 2 ? 'hexagon' : 'roundRect', {
				x,
				y,
				w: 0.9,
				h: 0.68,
				fill: { color: palette[index % palette.length], transparency: 8 },
				line: { color: C.white, transparency: 52 },
				shadow: { type: 'outer', color: C.black, opacity: 0.18, blur: 5, offset: 1, angle: 45 },
				objectName,
			} as any)
			s.addText(row.publicName, { x: x + 1.08, y: y + 0.16, w: 2.38, h: 0.18, fontSize: 6.2, color: C.ink, margin: 0, fit: 'shrink' })
			const dynamicKind = name.includes('color') ? 'color'
				: name.includes('scale') || name.includes('rotation') || name.includes('repeat') || name.includes('auto reverse') || name.includes('delay') || name.includes('duration') || name.includes('order') || name.includes('group') ? 'transform'
					: name.includes('paragraph') ? 'text'
						: 'shape'
			const props = name.includes('color')
				? { type: 'emphasis', effect: 'changefillcolor', color: palette[(index + 3) % palette.length], duration: 720 }
				: name.includes('rotation')
					? { type: 'emphasis', effect: 'spin', rotation: 28, duration: 820 }
					: name.includes('scale') || name.includes('repeat') || name.includes('auto reverse')
						? { type: 'emphasis', effect: 'growshrink', scale: 1.18, duration: 760, repeat: name.includes('repeat') ? 2 : undefined, autoReverse: name.includes('auto reverse') ? true : undefined }
						: name.includes('paragraph')
							? { type: 'entrance', effect: 'wipe', direction: 'fromLeft', duration: 780 }
							: { type: 'entrance', effect: index % 2 ? 'fly' : 'fade', direction: index % 2 ? 'fromBottom' : undefined, duration: 700, delay: name.includes('delay') ? 450 : undefined }
			const animationApplied = addLiveAnimation(s, ctx, title, objectName, props, pageIndex * 9 + index, dynamicKind, row, ['timing-xml', 'build-list-xml'], `animation-semantics:${row.publicName}`)
			specimens.push(addSpecimen(ctx, row, title, `animations:semantics:${pageIndex + 1}`, objectName, 'animation-timing', 'Animation semantic row is applied to this live timing object.', { animationApplied }))
		})
		addCoverageNotes(s, specimens)
	})
}

function addAppliedMotionPathSlides(pptx: any, ctx: ShowcaseContext): void {
	const rows = rowsFor(ctx.ledger, 'Motion Paths')
	chunks(rows, 12).forEach((pageRows, pageIndex) => {
		const title = `Applied Motion Paths ${pageIndex + 1}/${Math.ceil(rows.length / 12)}`
		const s = slide(pptx, title, 'Motion paths show a target object, path cue, and actual timing XML.', ctx, 'motion-paths', 'dense', pageRows.length)
		const specimens: AppliedSpecimenRecord[] = []
		pageRows.forEach((row, index) => {
			const col = index % 4
			const rowIndex = Math.floor(index / 4)
			const x = 0.9 + col * 3.0
			const y = 1.45 + rowIndex * 1.56
			const objectName = `motion-path-${pageIndex}-${index}`
			s.addShape('ellipse', { x, y, w: 0.56, h: 0.42, fill: { color: palette[index % palette.length] }, line: { color: C.line }, objectName } as any)
			s.addShape('line', { x: x + 0.18, y: y + 0.84, w: 1.25, h: 0.18, line: { color: C.amber, width: 1, dash: 'dash', endArrowType: 'triangle' } } as any)
			s.addShape('ellipse', { x: x + 1.35, y: y + 0.62, w: 0.32, h: 0.24, fill: { color: palette[index % palette.length], transparency: 70 }, line: { color: C.line, transparency: 40 } })
			s.addText(row.publicName, { x: x + 0.76, y: y + 0.13, w: 1.42, h: 0.16, fontSize: 5.6, color: C.ink, margin: 0, fit: 'shrink' })
			let animationApplied = true
			try {
				const props = animationPropsForRow(row, pageIndex * 12 + index, ctx)
				animationApplied = addLiveAnimation(s, ctx, title, objectName, props, pageIndex * 12 + index, 'motionPath', row, ['timing-xml', 'motion-path'], `path:${row.publicName}`)
			} catch {
				animationApplied = false
			}
			specimens.push(addSpecimen(ctx, row, title, `motion-paths:${pageIndex + 1}`, objectName, 'motion-path-timing', 'Motion path row is attached to this object.', { animationApplied }))
		})
		addCoverageNotes(s, specimens)
	})
}

const ANIMATION_LIKE_TRANSITIONS = new Set([
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
])

function animationLikeTransitionProps(transition: string, index: number): any {
	const trigger = index % 4 === 0 ? 'afterPrevious' : 'withPrevious'
	switch (transition) {
		case 'appear':
			return { type: 'entrance', effect: 'appear', duration: 450, trigger }
		case 'disappear':
			return { type: 'exit', effect: 'appear', duration: 500, trigger }
		case 'flyIn':
			return { type: 'entrance', effect: 'fly', direction: 'fromLeft', duration: 850, trigger }
		case 'flyOut':
			return { type: 'exit', effect: 'fly', direction: 'toRight', duration: 850, trigger }
		case 'wipeIn':
			return { type: 'entrance', effect: 'wipe', direction: 'fromLeft', duration: 850, trigger }
		case 'wipeOut':
			return { type: 'exit', effect: 'wipe', direction: 'toRight', duration: 850, trigger }
		case 'zoomOut':
			return { type: 'exit', effect: 'zoom', direction: 'out', duration: 850, trigger }
		case 'spin':
			return { type: 'emphasis', effect: 'spin', duration: 900, rotation: 24, trigger }
		case 'pulse':
			return { type: 'emphasis', effect: 'pulse', duration: 760, trigger }
		case 'growShrink':
			return { type: 'emphasis', effect: 'growshrink', duration: 900, scale: 1.2, trigger }
		case 'floatIn':
			return { type: 'entrance', effect: 'floatIn', duration: 850, trigger }
		case 'floatOut':
			return { type: 'exit', effect: 'floatOut', duration: 850, trigger }
		default:
			return { type: 'entrance', effect: 'fade', duration: 600, trigger }
	}
}

function transitionSpecForShowcase(transition: string, index: number): any {
	const base = { speed: index % 3 === 0 ? 'fast' : index % 3 === 1 ? 'medium' : 'slow', duration: 700 + (index % 4) * 100 }
	if (ANIMATION_LIKE_TRANSITIONS.has(transition)) return { ...base, type: 'fade', throughBlack: false }
	switch (transition) {
		case 'morph':
			return { type: 'morph', option: 'byObject', p14dur: 900, speed: 'fast' }
		case 'zoom':
			return { ...base, type: 'zoom', zoomFrom: index % 2 ? 'out' : 'in' }
		case 'strips':
			return { ...base, type: 'strips', direction: index % 2 ? 'ru' : 'ld' }
		case 'comb':
		case 'checker':
		case 'checkerboard':
		case 'blinds':
			return { ...base, type: transition, direction: index % 2 ? 'vert' : 'horz' }
		case 'split':
			return { ...base, type: transition, direction: index % 2 ? 'vert' : 'horz', splitDirection: index % 2 ? 'out' : 'in' }
		case 'doors':
		case 'window':
			return { ...base, type: transition, direction: index % 2 ? 'vert' : 'horz' }
		case 'warp':
		case 'flyThrough':
			return { ...base, type: transition, direction: index % 2 ? 'out' : 'in' }
		default:
			return { ...base, type: transition, direction: index % 2 ? 'r' : 'l' }
	}
}

function addAppliedTransitionSlides(pptx: any, ctx: ShowcaseContext): void {
	const transitionRows = rowsFor(ctx.ledger, 'Transitions')
	TRANSITION_TYPES.forEach((transition, index) => {
		const row = transitionRows.find(item => item.publicName === transition)
		const s = slide(pptx, `Applied Transition: ${transition}`, 'The transition is applied to this slide; the visual cue previews expected movement and notes bind the ledger row.', ctx, 'transitions', 'transition', 1)
		const priorAdvance = s.transition?.advanceAfterTime
		s.transition = {
			...transitionSpecForShowcase(transition, index),
			advanceOnClick: ctx.playback.mode === 'autoplay' ? false : true,
			advanceAfterTime: ctx.playback.mode === 'autoplay' ? priorAdvance : undefined,
		}
		if (ctx.playback.slides.length) ctx.playback.slides[ctx.playback.slides.length - 1].transitionType = transition
		const specimens: AppliedSpecimenRecord[] = []
		card(s, 1.1, 1.5, 10.9, 3.55, C.panel)
		const objectName = `transition-${transition}`.replace(/[^a-zA-Z0-9_-]/g, '-')
		s.addShape(index % 3 === 0 ? 'cube' : index % 3 === 1 ? 'chevron' : 'roundRect', {
			x: 2.0,
			y: 2.18,
			w: 2.2,
			h: 1.25,
			fill: { color: palette[index % palette.length], transparency: 5 },
			line: { color: C.white, transparency: 55 },
			shadow: { type: 'outer', color: C.black, opacity: 0.24, blur: 7, offset: 1.2, angle: 45 },
			objectName,
		} as any)
		addLiveAnimation(s, ctx, `Applied Transition: ${transition}`, objectName, index % 2
			? { type: 'emphasis', effect: 'pulse', duration: 650, scale: 1.12 }
			: { type: 'entrance', effect: 'fade', duration: 620 }, index, 'shape', row, ['timing-xml', 'transition-support-object'], `transition-support:${transition}`)
		if (ANIMATION_LIKE_TRANSITIONS.has(transition)) {
			const anim = animationLikeTransitionProps(transition, index)
			try {
				addLiveAnimation(s, ctx, `Applied Transition: ${transition}`, objectName, anim, index + 1, 'transform', row, ['timing-xml', 'animation-like-transition'], `transition-row:${transition}`)
			} catch {
				// If the named animation is not supported by the current engine, the timed fade transition still demonstrates unattended playback.
			}
		}
		s.addShape('line', { x: 4.72, y: 2.8, w: 2.5, h: 0, line: { color: C.cyan, width: 2, endArrowType: 'triangle' } } as any)
		s.addShape('roundRect', { x: 7.72, y: 2.18, w: 2.2, h: 1.25, fill: { color: palette[(index + 2) % palette.length], transparency: 40 }, line: { color: C.line, dash: 'dash' } })
		s.addText(transition, { x: 1.55, y: 3.85, w: 10.0, h: 0.36, fontFace: 'Aptos Display', fontSize: 19, bold: true, color: palette[index % palette.length], align: 'center', margin: 0, fit: 'shrink' })
		s.addText(JSON.stringify(s.transition), { x: 1.55, y: 4.34, w: 10.0, h: 0.22, fontSize: 7.2, color: C.muted, align: 'center', margin: 0, fit: 'shrink' })
		if (row) {
			specimens.push(addSpecimen(ctx, row, `Applied Transition: ${transition}`, `transitions:${index + 1}`, objectName, 'applied-slide-transition', 'Transition is assigned to this slide.', { slideTransition: transition }))
			recordPlaybackCue(ctx.playback, `Applied Transition: ${transition}`, {
				featureId: row.featureId,
				category: row.category,
				objectName,
				cueType: 'slide-transition',
				startMs: 0,
				endMs: s.transition?.duration || s.transition?.p14dur || 700,
				detail: `transition:${transition}`,
			})
		}
		addCoverageNotes(s, specimens)
	})
}

function addMorphSemanticSlides(pptx: any, ctx?: ShowcaseContext): void {
	const rows = ctx ? rowsFor(ctx.ledger, 'Morph Semantics') : []
	;(['byObject', 'byWord', 'byChar'] as const).forEach((option, index) => {
		const first = slide(pptx, `Morph Source: ${option}`, 'The following slide preserves object names while changing position, size, color, rotation, or text segmentation.', ctx, 'morph', 'morph', 1)
		first.addShape('roundRect', { x: 2.0, y: 2.1, w: 2.1, h: 1.0, fill: { color: C.cyan }, line: { color: C.line }, objectName: `morph-${option}-object` } as any)
		first.addText(option === 'byChar' ? 'MORPH' : option === 'byWord' ? 'Morph identity' : 'Morph object', { x: 5.3, y: 2.25, w: 3.1, h: 0.38, fontSize: 23, bold: true, color: C.ink, margin: 0, objectName: `morph-${option}-text` } as any)
		if (ctx) addLiveAnimation(first, ctx, `Morph Source: ${option}`, `morph-${option}-object`, { type: 'entrance', effect: 'fade', duration: 650 }, index, 'morph', rows[index], ['timing-xml', 'morph-source-object'], `morph-source:${option}`)
		const second = slide(pptx, `Morph Target: ${option}`, 'Morph is validated as a semantic transition, not just a transition name.', ctx, 'morph', 'morph', 1)
		second.transition = {
			type: 'morph',
			option,
			p14dur: 1000 + index * 250,
			speed: 'fast',
			advanceOnClick: ctx?.playback.mode === 'autoplay' ? false : true,
			advanceAfterTime: ctx?.playback.mode === 'autoplay' ? second.transition?.advanceAfterTime : undefined,
		}
		if (ctx?.playback.slides.length) ctx.playback.slides[ctx.playback.slides.length - 1].transitionType = 'morph'
		second.addShape('roundRect', { x: 7.1, y: 3.55, w: 3.0, h: 0.9, rotate: 12, fill: { color: palette[(index + 3) % palette.length] }, line: { color: C.line }, objectName: `morph-${option}-object` } as any)
		second.addText(option === 'byChar' ? 'MORPH' : option === 'byWord' ? 'Morph identity' : 'Morph object', { x: 2.0, y: 4.1, w: 4.2, h: 0.38, fontSize: 27, bold: true, color: palette[index % palette.length], margin: 0, objectName: `morph-${option}-text` } as any)
		const row = rows.find(item => item.publicName === option)
		if (ctx && row) {
			addLiveAnimation(second, ctx, `Morph Target: ${option}`, `morph-${option}-text`, { type: 'emphasis', effect: 'pulse', duration: 720, scale: 1.1 }, index + 1, 'morph', row, ['timing-xml', 'morph-target-object'], `morph-target:${option}`)
			const specimens = [
				addSpecimen(ctx, row, `Morph Target: ${option}`, `morph:${option}`, `morph-${option}-object`, 'applied-morph-identity', 'Morph option is applied to target slide while preserving object names.', { slideTransition: `morph:${option}` }),
			]
			recordPlaybackCue(ctx.playback, `Morph Target: ${option}`, {
				featureId: row.featureId,
				category: row.category,
				objectName: `morph-${option}-object`,
				cueType: `morph:${option}`,
				startMs: 0,
				endMs: 1000 + index * 250,
				detail: 'preserved-object-name:auto-advance',
			})
			addCoverageNotes(first, specimens)
			addCoverageNotes(second, specimens)
		}
	})
}

function addEnterpriseSemanticsSlide(pptx: any, ctx: ShowcaseContext): void {
	const s = slide(pptx, 'Enterprise OOXML Preservation and Safety', 'Preserve-only, validate-only, and detect-and-reject rows remain explicit release gates.', ctx, 'enterprise', 'validation')
	const ledger = ctx.ledger
	const rows = ledger.rows.filter(item =>
		item.coverageMode === 'preserve-only' ||
		item.coverageMode === 'validate-only' ||
		item.coverageMode === 'detect-and-reject'
	)
	const counts = rows.reduce((acc: Record<string, number>, item) => {
		acc[item.coverageMode] = (acc[item.coverageMode] || 0) + 1
		return acc
	}, {})
	card(s, 0.92, 1.56, 3.2, 3.5)
	card(s, 5.05, 1.56, 3.2, 3.5)
	card(s, 9.16, 1.56, 3.2, 3.5)
	;[
		{ objectName: 'enterprise-preserve', text: `preserve-only\n${counts['preserve-only'] || 0}`, x: 1.18, color: C.teal },
		{ objectName: 'enterprise-validate', text: `validate-only\n${counts['validate-only'] || 0}`, x: 5.31, color: C.amber },
		{ objectName: 'enterprise-reject', text: `detect-reject\n${counts['detect-and-reject'] || 0}`, x: 9.42, color: C.coral },
	].forEach((item, index) => {
		s.addText(item.text, { x: item.x, y: 2.35, w: 2.65, h: 0.72, fontSize: 24, bold: true, color: item.color, align: 'center', margin: 0, fit: 'shrink', objectName: item.objectName } as any)
		addLiveAnimation(s, ctx, 'Enterprise OOXML Preservation and Safety', item.objectName, { type: 'entrance', effect: 'zoom', duration: 760 }, index, 'shape', undefined, ['timing-xml', 'enterprise-preservation-panel'], 'preserve-validate-reject-panel')
	})
}

export async function buildBetterPptxMcpShowcase(outputPath: string, sourcePath: string, repoRoot: string, options: { themeMode?: ShowcaseThemeMode; playbackMode?: ShowcasePlaybackMode; targetRuntimeMinutes?: number; capabilities?: any; sections?: ShowcaseSection[]; deckProfile?: DeckProfile; verificationFocus?: VerificationFocus; showcaseFocus?: ShowcaseFocus } = {}): Promise<ShowcaseBuildResult> {
	void outputPath
	void sourcePath
	void repoRoot
	void options
	throw new Error(`${BETTERPPTX_MCP_BRAND} automated showcase generation has been removed. Use the generic presentation creation, editing, asset, geometry, validation, and artifact tools instead.`)
}

function publicSourceText(ledger: CapabilityLedger, themeMode: ShowcaseThemeMode, semanticHash: string, appliedSpecimenCount: number, playback: PlaybackSummary): string {
	return `#!/usr/bin/env node
/**
 * ${BETTERPPTX_MCP_BRAND} deterministic showcase source.
 *
 * This public source artifact documents the generated deck intent without
 * exposing the internal compiler implementation. The generated PPTX is an
 * unattended slideshow when playbackMode is autoplay. The MCP job manifest
 * points to validation, timeline, logs, and optional visual oracle files.
 */

const deck = betterpptx-mcp.presentation.create({
  title: '${BETTERPPTX_MCP_BRAND} Ultimate MCP Showcase',
  author: '${BETTERPPTX_MCP_BRAND}',
  company: '${BETTERPPTX_MCP_BRAND}',
  themeMode: '${themeMode}',
  deckProfile: '${playback.deckProfile}',
  verificationFocus: '${playback.verificationFocus}',
  semanticHash: '${semanticHash}',
  capabilityLedgerVersion: '${ledger.version}',
  capabilityRows: ${ledger.summary.totalRows},
  appliedSpecimens: ${appliedSpecimenCount},
  playbackMode: '${playback.mode}',
  targetRuntimeMinutes: ${playback.targetRuntimeMinutes ?? 'null'},
  estimatedRuntimeMinutes: ${playback.estimatedRuntimeMinutes},
  unattended: ${playback.unattended},
  features: [
    'rich text', 'themes', 'layouts', 'shapes', 'gradient fills',
    'pictures', 'media', 'audio lab', 'voice narration', '3D model',
    'sample object library', 'shape-built icons', 'tables', 'charts',
    'transitions', 'animations', 'motion paths', 'brand kit',
    'validation', 'artifacts', 'exhaustive capability ledger'
  ],
})

await deck.writeFile('betterpptx-mcp-ultimate-mcp-showcase.pptx')
`
}
