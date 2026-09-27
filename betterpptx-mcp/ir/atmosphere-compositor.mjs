/**
 * Semantic atmosphere compositor.
 * The AI chooses layers, color, intensity, and purpose.
 * The engine owns geometry, grouping, serialization, and diagnostics.
 */
import { atmosphereReadback } from './native-visual-primitives.mjs'

const ANCHOR = {
	'upper-right': { x: 0.62, y: -0.08, w: 0.55, h: 0.7 },
	'upper-left': { x: -0.08, y: -0.08, w: 0.55, h: 0.7 },
	center: { x: 0.18, y: 0.12, w: 0.64, h: 0.76 },
	'lower-left': { x: -0.06, y: 0.45, w: 0.5, h: 0.6 },
	'lower-right': { x: 0.56, y: 0.45, w: 0.5, h: 0.6 },
}

function hex(value, fallback = '0B1220') {
	return String(value || fallback).replace(/^#/, '')
}

function support(ownerName) {
	return {
		ownerObjectName: ownerName,
		inheritsTransform: true,
		inheritsCrop: true,
		inheritsAnimation: true,
		inheritsMorphIdentity: true,
		excludedFromReadingOrder: true,
	}
}

function box(base, fraction) {
	return {
		x: (base?.x || 0) + (base?.w || 13.333) * fraction.x,
		y: (base?.y || 0) + (base?.h || 7.5) * fraction.y,
		w: (base?.w || 13.333) * fraction.w,
		h: (base?.h || 7.5) * fraction.h,
	}
}

export function expandAtmosphereBlock(block = {}, baseRect = { x: 0, y: 0, w: 13.333, h: 7.5 }) {
	const ownerName = block.objectName || block.name || 'atmosphere'
	const layers = Array.isArray(block.layers) ? block.layers : []
	const content = []
	const nodes = []
	layers.forEach((layer, index) => {
		const kind = String(layer?.kind || '').trim()
		const name = `${ownerName}-${kind || 'layer'}-${index + 1}`
		if (kind === 'gradientField') {
			content.push({
				kind: 'shape',
				name,
				shapeName: 'rect',
				rect: baseRect,
				decorative: true,
				supportLayer: support(ownerName),
				style: {
					fill: {
						type: 'gradient',
						gradientDirection: 'linear',
						gradientAngle: 48,
						rotateGradientWithShape: true,
						gradientStops: [
							{ position: 0, color: hex(layer.colors?.[0] || '081426'), transparency: 0 },
							{ position: 65, color: hex(layer.colors?.[1] || '3B82F6'), transparency: Math.round((1 - Number(layer.intensity || 0.8)) * 65) },
							{ position: 100, color: hex(layer.colors?.[2] || 'A855F7'), transparency: 100 },
						],
					},
					line: { width: 0 },
				},
				altText: layer.intent || 'Atmosphere field',
			})
			nodes.push({ source: kind, compiledAs: 'native-gradient-fill', status: 'exact-native' })
			return
		}
		if (kind === 'radialLight') {
			content.push({
				kind: 'shape',
				name,
				shapeName: 'ellipse',
				rect: box(baseRect, ANCHOR[layer.anchor] || ANCHOR.center),
				decorative: true,
				supportLayer: support(ownerName),
				style: {
					fill: {
						type: 'gradient',
						gradientDirection: 'circle',
						gradientStops: [
							{ position: 0, color: hex(layer.color, '38BDF8'), transparency: Math.round((1 - Number(layer.intensity || 0.7)) * 20) },
							{ position: 100, color: hex(layer.color, '38BDF8'), transparency: 100 },
						],
					},
					line: { width: 0 },
					blur: { radiusPt: Math.max(6, Number(layer.softness || 0.8) * 22), grow: true },
				},
				altText: 'Radial light',
			})
			nodes.push({ source: kind, compiledAs: 'native-gradient-fill+native-blur', status: 'exact-native' })
			return
		}
		if (kind === 'auroraBand') {
			content.push({
				kind: 'shape',
				name,
				shapeName: 'roundRect',
				rect: { ...box(baseRect, { x: 0.05, y: 0.18, w: 1.05, h: 0.28 }), rotate: layer.flow === 'diagonal-up' ? -18 : 12 },
				decorative: true,
				supportLayer: support(ownerName),
				style: {
					fill: {
						type: 'gradient',
						gradientDirection: 'linear',
						gradientAngle: 20,
						gradientStops: [
							{ position: 0, color: hex(layer.colors?.[0], '38BDF8'), transparency: 20 },
							{ position: 100, color: hex(layer.colors?.[1], 'A855F7'), transparency: 85 },
						],
					},
					line: { width: 0 },
					blur: { radiusPt: Math.max(8, Number(layer.softness || 0.9) * 24), grow: true },
					glow: { color: hex(layer.colors?.[0], '38BDF8'), opacity: 0.28, size: 14 },
				},
				altText: 'Aurora band',
			})
			nodes.push({ source: kind, compiledAs: 'native-gradient-fill+native-glow', status: 'exact-native' })
			return
		}
		if (kind === 'mist') {
			content.push({
				kind: 'shape',
				name,
				shapeName: 'ellipse',
				rect: box(baseRect, { x: -0.1, y: 0.35, w: 1.2, h: 0.55 }),
				decorative: true,
				supportLayer: support(ownerName),
				style: {
					fill: { type: 'solid', color: 'E2E8F0', transparency: Math.round((1 - Number(layer.density || 0.22)) * 88) },
					line: { width: 0 },
					blur: { radiusPt: 28, grow: true },
					softEdges: { size: 18 },
				},
				altText: 'Mist',
			})
			nodes.push({ source: kind, compiledAs: 'native-fill+native-blur', status: 'exact-native' })
			return
		}
		if (kind === 'vignette') {
			content.push({
				kind: 'shape',
				name,
				shapeName: 'rect',
				rect: baseRect,
				decorative: true,
				supportLayer: support(ownerName),
				style: {
					fill: {
						type: 'gradient',
						gradientDirection: 'circle',
						gradientStops: [
							{ position: 0, color: '000000', transparency: 100 },
							{ position: 100, color: '000000', transparency: Math.round((1 - Number(layer.strength || 0.36)) * 55) },
						],
					},
					line: { width: 0 },
				},
				altText: 'Vignette',
			})
			nodes.push({ source: kind, compiledAs: 'native-gradient-fill', status: 'exact-native' })
			return
		}
		if (kind === 'grain') {
			content.push({
				kind: 'shape',
				name,
				shapeName: 'rect',
				rect: baseRect,
				decorative: true,
				fallbackKind: 'full-canvas-effect-only-texture',
				supportLayer: support(ownerName),
				style: {
					fill: {
						type: 'texture',
						texture: {
							source: {
								kind: 'generated',
								recipe: {
									type: 'grain',
									seed: Number.isFinite(Number(layer.seed)) ? Number(layer.seed) : 84,
									density: Number(layer.amount || 0.08),
									alpha: 0.18,
									seamless: true,
									widthPx: 256,
									heightPx: 256,
									foreground: hex(layer.foreground || 'FFFFFF'),
									background: hex(layer.background || '000000'),
								},
							},
							placement: { mode: 'tile', scaleX: 0.35, scaleY: 0.35, rotateWithShape: true },
							tile: true,
							scaleX: 0.35,
							scaleY: 0.35,
							transparency: Math.round((1 - Number(layer.amount || 0.08)) * 40),
						},
					},
					line: { width: 0 },
				},
				altText: 'Grain',
			})
			nodes.push({
				source: kind,
				compiledAs: 'generated-tile-texture',
				status: 'exact-native',
				representationPreference: layer.representationPreference || ['native-texture-fill', 'generated-tile-texture'],
			})
			return
		}
		content.push({
			kind: 'shape',
			name,
			shapeName: 'rect',
			rect: baseRect,
			decorative: true,
			supportLayer: support(ownerName),
			style: {
				fill: { type: 'solid', color: hex(layer.color, '38BDF8'), transparency: 88 },
				line: { width: 0 },
				blur: { radiusPt: 12, grow: true },
			},
			altText: kind || 'Atmosphere layer',
		})
		nodes.push({ source: kind || 'layer', compiledAs: 'native-fill+native-blur', status: 'native-approximation' })
	})
	return {
		content,
		atmosphereReadback: atmosphereReadback(nodes),
		nodes,
	}
}

export function expandAtmosphereSpec(spec = {}) {
	const slides = Array.isArray(spec.slides) ? spec.slides : []
	let changed = false
	const nextSlides = slides.map(slide => {
		const content = Array.isArray(slide.content) ? slide.content : []
		const expanded = []
		const readbacks = []
		for (const block of content) {
			if (!block || String(block.kind || '').toLowerCase() !== 'atmosphere') {
				expanded.push(block)
				continue
			}
			changed = true
			const result = expandAtmosphereBlock(block, block.rect || { x: 0, y: 0, w: 13.333, h: 7.5 })
			expanded.push(...result.content)
			readbacks.push({ sourceObjectId: block.objectName || block.name, ...result.atmosphereReadback, nodes: result.nodes })
		}
		if (!readbacks.length) return slide
		return { ...slide, content: expanded, atmosphereReadback: readbacks }
	})
	if (!changed) return spec
	return { ...spec, slides: nextSlides }
}
