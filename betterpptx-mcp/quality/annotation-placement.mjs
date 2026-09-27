// Deterministic image-aware placement for native PowerPoint annotations.
// It uses only the generated raster pixels; no network, model or customer data.
import sharp from 'sharp'

const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, Number(value) || 0))
const cleanTarget = value => String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40)

function pixelClass(r, g, b, x, y, width, height) {
	const yn = y / Math.max(1, height - 1)
	const green = g > 48 && g > r * 1.04 && g >= b * 0.88 && (g - r) > 7
	const brown = r > 45 && r > g * 1.14 && g > b * 1.12
	const blue = b > 70 && b > r * 1.12 && b >= g * 0.98
	const sky = yn < 0.46 && b > 90 && b >= r * 0.98 && (b - r) > 8
	return {
		plants: green && yn > 0.08 && yn < 0.72,
		soil: brown && yn > 0.38,
		ocean: blue && yn > 0.34,
		atmosphere: sky && yn < 0.52,
		x,
		y,
	}
}

function summarize(points, width, height) {
	if (!points.length) return { x: 0.5, y: 0.5, confidence: 0, bbox: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 } }
	const xs = points.map(point => point.x)
	const ys = points.map(point => point.y)
	const x = xs.reduce((sum, value) => sum + value, 0) / points.length
	const y = ys.reduce((sum, value) => sum + value, 0) / points.length
	const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
	return {
		x: clamp(x / Math.max(1, width - 1)), y: clamp(y / Math.max(1, height - 1)),
		confidence: clamp(Math.min(1, points.length / Math.max(1, width * height * 0.015))),
		bbox: { x: clamp(minX / Math.max(1, width - 1)), y: clamp(minY / Math.max(1, height - 1)), w: clamp((maxX - minX) / Math.max(1, width - 1)), h: clamp((maxY - minY) / Math.max(1, height - 1)) },
	}
}

export async function detectAnnotationAnchors(input) {
	const rawInput = typeof input === 'string' && input.startsWith('data:') ? Buffer.from(input.replace(/^data:[^,]*,/, ''), 'base64') : input
	const decoded = await sharp(rawInput).resize({ width: 192, height: 192, fit: 'inside', withoutEnlargement: true }).removeAlpha().raw().toBuffer({ resolveWithObject: true })
	const { data, info } = decoded
	const points = { plants: [], soil: [], ocean: [], atmosphere: [] }
	for (let y = 0; y < info.height; y += 1) {
		for (let x = 0; x < info.width; x += 1) {
			const offset = (y * info.width + x) * info.channels
			const classified = pixelClass(data[offset], data[offset + 1], data[offset + 2], x, y, info.width, info.height)
			for (const key of Object.keys(points)) if (classified[key]) points[key].push({ x, y })
		}
	}
	return Object.fromEntries(Object.entries(points).map(([key, values]) => {
		if (key === 'plants' && values.length > 8) {
			// Grass can dominate a full-scene green centroid. Prefer the denser
			// upper-canopy cluster, choosing the side with more foliage evidence.
			const upper = values.filter(point => point.y / Math.max(1, info.height - 1) < 0.45)
			const left = upper.filter(point => point.x < info.width * 0.60)
			const right = upper.filter(point => point.x >= info.width * 0.60)
			const selected = (left.length >= right.length ? left : right)
			if (selected.length > 8) {
				const region = summarize(selected, info.width, info.height)
				const full = summarize(values, info.width, info.height)
				return [key, { ...region, confidence: full.confidence, bbox: full.bbox }]
			}
		}
		// The soil region is intentionally broad. Keep the vertical centroid of
		// the detected layer (so the label remains below the cutaway), but gently
		// center the horizontal target to avoid a left-biased pointer in wide scenes.
		if (key === 'soil' && values.length > 8) {
			const full = summarize(values, info.width, info.height)
			return [key, { ...full, x: clamp((full.x * 0.7) + (0.5 * 0.3)) }]
		}
		return [key, summarize(values, info.width, info.height)]
	}))
}

function labelSize(label) {
	const text = String(label?.text || '').trim()
	return { w: clamp(Math.max(0.16, Math.min(0.30, 0.105 + text.length * 0.010)), 0.12, 0.34), h: 0.085 }
}

function overlap(a, b, pad = 0.012) {
	return a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y
}

function chooseRect(anchor, size, occupied, target = '') {
	const ax = anchor.x, ay = anchor.y
	if (target === 'ocean') {
		const rect = { x: clamp(ax - size.w / 2, 0.02, 0.98 - size.w), y: clamp(ay - 0.16 - size.h, 0.02, 0.98 - size.h), w: size.w, h: size.h }
		if (!occupied.some(item => overlap(rect, item))) return rect
	}
	if (target === 'soil') {
		const rect = { x: clamp(ax - size.w / 2, 0.02, 0.98 - size.w), y: clamp(ay + 0.10, 0.02, 0.98 - size.h), w: size.w, h: size.h }
		if (!occupied.some(item => overlap(rect, item))) return rect
	}
	const candidates = [
		{ x: ax - size.w / 2, y: ay - 0.18 - size.h },
		{ x: ax - size.w - 0.05, y: ay - size.h / 2 },
		{ x: ax + 0.05, y: ay - size.h / 2 },
		{ x: ax - size.w / 2, y: ay + 0.10 },
		{ x: ax - size.w - 0.05, y: ay - 0.16 - size.h },
		{ x: ax + 0.05, y: ay - 0.16 - size.h },
	].map(rect => ({ ...rect, w: size.w, h: size.h }))
	let best = null
	for (const candidate of candidates) {
		candidate.x = clamp(candidate.x, 0.02, 0.98 - candidate.w)
		candidate.y = clamp(candidate.y, 0.02, 0.98 - candidate.h)
		const distance = Math.hypot((candidate.x + candidate.w / 2) - ax, (candidate.y + candidate.h / 2) - ay)
		const collisions = occupied.reduce((sum, item) => sum + (overlap(candidate, item) ? 1 : 0), 0)
		const score = collisions * 100 + distance
		if (!best || score < best.score) best = { rect: candidate, score }
	}
	return best?.rect || { x: clamp(ax - size.w / 2), y: clamp(ay - size.h / 2), ...size }
}

export async function refineNativeAnnotationPlacement({ image, annotations } = {}) {
	if (!image || !annotations || typeof annotations !== 'object') return { annotations, changed: false, status: 'not-requested' }
	const anchors = await detectAnnotationAnchors(image)
	const labels = Array.isArray(annotations.labels) ? annotations.labels : []
	const occupied = []
	const refinedLabels = labels.map((label, index) => {
		const item = typeof label === 'string' ? { text: label } : { ...label }
		const target = cleanTarget(item.target) || ['atmosphere', 'plants', 'soil', 'ocean'][index] || 'atmosphere'
		const anchor = anchors[target] || anchors.atmosphere
		const rect = chooseRect(anchor, labelSize(item), occupied, target)
		occupied.push(rect)
		return { ...item, target, x: rect.x, y: rect.y, w: rect.w, h: rect.h, anchorX: anchor.x, anchorY: anchor.y, placementConfidence: anchor.confidence, autoPlaced: true }
	})
	const byTarget = new Map(refinedLabels.map(label => [cleanTarget(label.target), label]))
	const arrows = Array.isArray(annotations.arrows) ? annotations.arrows : []
	const refinedArrows = arrows.map((arrow, index) => {
		const item = arrow && typeof arrow === 'object' ? { ...arrow } : {}
		const label = byTarget.get(cleanTarget(item.target)) || refinedLabels[index]
		const target = cleanTarget(item.target) || cleanTarget(label?.target) || 'atmosphere'
		const anchor = anchors[target] || anchors.atmosphere
		const source = label ? { x: label.x + label.w / 2, y: label.y + label.h / 2 } : { x: 0.5, y: 0.5 }
		const startX = clamp(anchor.x), startY = clamp(anchor.y), endX = clamp(source.x), endY = clamp(source.y)
		const minX = Math.min(startX, endX), minY = Math.min(startY, endY)
		const w = Math.max(0.035, Math.abs(endX - startX)), h = Math.max(0.035, Math.abs(endY - startY))
		return { ...item, target, x: minX, y: minY, w, h, flipH: startX > endX, flipV: startY > endY, arrowAt: 'start', autoPlaced: true, placementConfidence: anchor.confidence }
	})
	return { annotations: { ...annotations, placement: 'image-aware-deterministic-v1', labels: refinedLabels, arrows: refinedArrows, anchors }, anchors, changed: refinedLabels.some(label => label.autoPlaced) || refinedArrows.some(arrow => arrow.autoPlaced), status: 'refined' }
}
