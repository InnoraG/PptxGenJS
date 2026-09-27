// IMG4 deterministic image-quality gates. CPU-only; no generator, VLM, network, or customer data.
// Semantic/style judgment remains a separate IMG5 concern. Hard gates fail closed when an
// required measurement (for example OCR) has not actually run.
import crypto from 'node:crypto'
import sharp from 'sharp'

const SUPPORTED_FORMATS = new Set(['png', 'jpeg', 'webp'])
const clamp = (value, low, high) => Math.min(high, Math.max(low, value))
const pct = (value, fallback = 0) => clamp(Number.isFinite(Number(value)) ? Number(value) : fallback, 0, 100)

function regionBounds(region, width, height) {
	const x = Math.round(pct(region?.x) / 100 * width)
	const y = Math.round(pct(region?.y) / 100 * height)
	const w = Math.max(1, Math.min(width - x, Math.round(pct(region?.w, 100) / 100 * width)))
	const h = Math.max(1, Math.min(height - y, Math.round(pct(region?.h, 100) / 100 * height)))
	return { left: x, top: y, width: w, height: h }
}

function luma(r, g, b) {
	return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function parseHexColor(value) {
	const text = String(value || '').trim().replace(/^#/, '')
	if (!/^[0-9a-f]{6}$/i.test(text)) return null
	return [Number.parseInt(text.slice(0, 2), 16), Number.parseInt(text.slice(2, 4), 16), Number.parseInt(text.slice(4, 6), 16)]
}

function paletteCoverage(raw, palette, distance = 90) {
	const colors = (Array.isArray(palette) ? palette : []).map(parseHexColor).filter(Boolean)
	if (!colors.length) return null
	let covered = 0
	for (let i = 0; i < raw.length; i += 4) {
		let nearest = Number.POSITIVE_INFINITY
		for (const color of colors) {
			const dr = raw[i] - color[0]
			const dg = raw[i + 1] - color[1]
			const db = raw[i + 2] - color[2]
			nearest = Math.min(nearest, Math.sqrt(dr * dr + dg * dg + db * db))
		}
		if (nearest <= distance) covered += 1
	}
	return covered / Math.max(1, raw.length / 4)
}

function regionMetrics(raw, width, height, region) {
	const bounds = regionBounds(region, width, height)
	const values = []
	for (let y = bounds.top; y < bounds.top + bounds.height; y += 1) {
		for (let x = bounds.left; x < bounds.left + bounds.width; x += 1) {
			const i = (y * width + x) * 4
			values.push(luma(raw[i], raw[i + 1], raw[i + 2]))
		}
	}
	const sorted = [...values].sort((a, b) => a - b)
	const median = sorted[Math.floor(sorted.length / 2)] || 0
	const mean = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)
	const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, values.length)
	let edges = 0
	let occupancy = 0
	for (let y = bounds.top; y < bounds.top + bounds.height; y += 1) {
		for (let x = bounds.left; x < bounds.left + bounds.width; x += 1) {
			const index = (y - bounds.top) * bounds.width + (x - bounds.left)
			if (Math.abs(values[index] - median) > 18) occupancy += 1
			if (x > bounds.left && Math.abs(values[index] - values[index - 1]) > 16) edges += 1
			if (y > bounds.top && Math.abs(values[index] - values[index - bounds.width]) > 16) edges += 1
		}
	}
	const edgeDenominator = Math.max(1, bounds.width * bounds.height * 2 - bounds.width - bounds.height)
	return {
		mean: Math.round(mean * 100) / 100,
		stdev: Math.round(Math.sqrt(variance) * 100) / 100,
		occupancy: Math.round(occupancy / Math.max(1, width * height) * 10000) / 10000,
		edgeDensity: Math.round(edges / edgeDenominator * 10000) / 10000,
		region,
		bounds,
	}
}

// A small, dependency-free focus measure used only as a deterministic quality
// signal. It is intentionally not a semantic/aesthetic score: higher variance
// means more high-frequency edge definition after the common 64px normalization.
function laplacianVariance(raw, width, height) {
	if (width < 3 || height < 3) return 0
	const values = []
	for (let y = 1; y < height - 1; y += 1) {
		for (let x = 1; x < width - 1; x += 1) {
			const center = (y * width + x) * 4
			const up = ((y - 1) * width + x) * 4
			const down = ((y + 1) * width + x) * 4
			const left = (y * width + x - 1) * 4
			const right = (y * width + x + 1) * 4
			values.push(4 * luma(raw[center], raw[center + 1], raw[center + 2])
				- luma(raw[up], raw[up + 1], raw[up + 2])
				- luma(raw[down], raw[down + 1], raw[down + 2])
				- luma(raw[left], raw[left + 1], raw[left + 2])
				- luma(raw[right], raw[right + 1], raw[right + 2]))
		}
	}
	const mean = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)
	return values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, values.length)
}

function averageHash(raw, width, height) {
	const values = []
	const size = 8
	for (let by = 0; by < size; by += 1) {
		for (let bx = 0; bx < size; bx += 1) {
			let total = 0
			let count = 0
			const top = Math.floor(by * height / size)
			const bottom = Math.max(top + 1, Math.floor((by + 1) * height / size))
			const left = Math.floor(bx * width / size)
			const right = Math.max(left + 1, Math.floor((bx + 1) * width / size))
			for (let y = top; y < bottom; y += 1) {
				for (let x = left; x < right; x += 1) {
					const i = (y * width + x) * 4
					total += luma(raw[i], raw[i + 1], raw[i + 2])
					count += 1
				}
			}
			values.push(total / Math.max(1, count))
		}
	}
	const mean = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)
	let bits = ''
	for (const value of values) bits += value >= mean ? '1' : '0'
	return bits.padEnd(64, '0').slice(0, 64)
}

function hamming(a, b) {
	const left = String(a || '')
	const right = String(b || '')
	const length = Math.max(left.length, right.length)
	let distance = Math.abs(left.length - right.length)
	for (let i = 0; i < Math.min(left.length, right.length); i += 1) if (left[i] !== right[i]) distance += 1
	return distance + Math.max(0, 64 - length)
}

export async function evaluateImageQuality(buffer, request = {}) {
	if (!Buffer.isBuffer(buffer) || buffer.length < 32) {
		return { status: 'fail', scope: 'deterministic-image-quality', checks: { validPayload: false }, blockingIssues: ['INVALID_PAYLOAD'] }
	}
	let metadata
	try { metadata = await sharp(buffer).metadata() } catch {
		return { status: 'fail', scope: 'deterministic-image-quality', checks: { validPayload: false }, blockingIssues: ['UNREADABLE_PAYLOAD'] }
	}
	const width = Number(metadata.width) || 0
	const height = Number(metadata.height) || 0
	const format = String(metadata.format || '').toLowerCase()
	const actualRatio = width > 0 && height > 0 ? width / height : 0
	const requestedAspect = String(request.aspect || 'square').toLowerCase()
	const targetRatio = ['portrait', 'tall', 'vertical'].includes(requestedAspect) ? 768 / 1280
		: ['landscape'].includes(requestedAspect) ? 1280 / 768
		: ['wide', '16:9'].includes(requestedAspect) ? 16 / 9
		: ['4:3'].includes(requestedAspect) ? 4 / 3
		: 1
	const aspectDeviation = actualRatio ? Math.abs(actualRatio - targetRatio) / targetRatio : 1
	const rawResult = await sharp(buffer).ensureAlpha().resize({ width: 64, height: 64, fit: 'fill' }).raw().toBuffer({ resolveWithObject: true })
	const raw = rawResult.data
	const stats = await sharp(buffer).stats()
	const allRegion = regionMetrics(raw, rawResult.info.width, rawResult.info.height, { x: 0, y: 0, w: 100, h: 100 })
	const sharpness = laplacianVariance(raw, rawResult.info.width, rawResult.info.height)
	let alphaCoverage = null
	let alphaEdgeDensity = null
	if (metadata.hasAlpha === true) {
		let visible = 0
		let edge = 0
		for (let y = 0; y < rawResult.info.height; y += 1) {
			for (let x = 0; x < rawResult.info.width; x += 1) {
				const i = (y * rawResult.info.width + x) * 4
				if (raw[i + 3] > 16) visible += 1
				if (x > 0 && Math.abs(raw[i + 3] - raw[i - 4 + 3]) > 24) edge += 1
				if (y > 0 && Math.abs(raw[i + 3] - raw[i - rawResult.info.width * 4 + 3]) > 24) edge += 1
			}
		}
		alphaCoverage = visible / Math.max(1, rawResult.info.width * rawResult.info.height)
		alphaEdgeDensity = edge / Math.max(1, rawResult.info.width * rawResult.info.height * 2 - rawResult.info.width - rawResult.info.height)
	}
	const checks = {
		validPayload: SUPPORTED_FORMATS.has(format),
		dimensionsPresent: width > 0 && height > 0,
		requestedAspectHonored: aspectDeviation <= Number(request.aspectTolerance ?? 0.05),
		minimumResolution: width >= Number(request.minWidth || 512) && height >= Number(request.minHeight || 512),
		minimumVisualInformation: Number(stats.entropy || 0) >= Number(request.minEntropy || 1.2) && allRegion.stdev >= Number(request.minStdev || 4),
		...(request.minSharpness != null ? { sharpness: sharpness >= Number(request.minSharpness) } : {}),
		alphaIntegrity: request.cutout === true
			? metadata.hasAlpha === true
				&& Number(alphaCoverage) >= Number(request.minAlphaCoverage ?? 0.01)
				&& Number(alphaCoverage) <= Number(request.maxAlphaCoverage ?? 0.995)
				&& Number(alphaEdgeDensity) >= Number(request.minAlphaEdgeDensity ?? 0.001)
			: true,
	}
	const measurements = {
		format,
		width,
		height,
		aspectDeviation: Math.round(aspectDeviation * 10000) / 10000,
		entropy: Math.round(Number(stats.entropy || 0) * 10000) / 10000,
		stdev: allRegion.stdev,
		sharpness: Math.round(sharpness * 100) / 100,
		isOpaque: stats.isOpaque === true,
		averageHash: averageHash(raw, rawResult.info.width, rawResult.info.height),
		...(alphaCoverage !== null ? { alphaCoverage: Math.round(alphaCoverage * 10000) / 10000, alphaEdgeDensity: Math.round(alphaEdgeDensity * 10000) / 10000 } : {}),
	}
	if (Array.isArray(request.palette) && request.palette.length) {
		const coverage = paletteCoverage(raw, request.palette, Number(request.paletteDistance ?? 90))
		measurements.paletteCoverage = Math.round(Number(coverage || 0) * 10000) / 10000
		checks.paletteCompatible = coverage !== null && coverage >= Number(request.minPaletteCoverage ?? 0.35)
	}
	const regions = {}
	if (request.focalRegion) {
		const focal = regionBounds(request.focalRegion, rawResult.info.width, rawResult.info.height)
		const focalMetric = regionMetrics(raw.slice(0), rawResult.info.width, rawResult.info.height, request.focalRegion)
		// The region metric is intentionally measured on the whole downsample here; the hard
		// placement check is geometric and the independent judge owns semantic saliency.
		regions.focal = { bounds: focal, ...focalMetric }
		checks.focalRegionPresent = focalMetric.edgeDensity >= Number(request.minFocalEdgeDensity ?? 0.01) || focalMetric.occupancy >= Number(request.minFocalOccupancy ?? 0.03)
	}
	if (request.quietRegion) {
		const quiet = regionBounds(request.quietRegion, rawResult.info.width, rawResult.info.height)
		const quietMetric = regionMetrics(raw.slice(0), rawResult.info.width, rawResult.info.height, request.quietRegion)
		regions.quiet = { bounds: quiet, ...quietMetric }
		checks.quietSpace = quietMetric.edgeDensity <= Number(request.maxQuietEdgeDensity ?? 0.22) && quietMetric.occupancy <= Number(request.maxQuietOccupancy ?? 0.72)
	}
	if (request.noText === true) {
		const ocr = request.ocr
		checks.ocrCompleted = ocr?.status === 'complete'
		checks.noReadableText = checks.ocrCompleted && String(ocr.text || '').trim().length === 0
	}
	if (Array.isArray(request.existingHashes) && request.existingHashes.length) {
		const closestDuplicateDistance = Math.min(...request.existingHashes.map(hash => hamming(measurements.averageHash, hash)))
		measurements.closestDuplicateDistance = closestDuplicateDistance
		checks.notDuplicate = closestDuplicateDistance > Number(request.duplicateDistance ?? 4)
	}
	if (request.actualGpuSeconds != null && request.usdPerGpuSecond != null && request.costCeilingUsd != null) {
		const actual = Number(request.actualGpuSeconds || 0) * Number(request.usdPerGpuSecond || 0)
		measurements.actualGpuCostUsd = Math.round(actual * 1e8) / 1e8
		checks.costWithinCeiling = Number.isFinite(actual) && Number(request.costCeilingUsd || 0) > 0 && actual <= Number(request.costCeilingUsd)
	}
	const blockingIssues = Object.entries(checks).filter(([, value]) => value !== true).map(([key]) => key.toUpperCase())
	return {
		status: blockingIssues.length ? 'fail' : 'pass',
		scope: 'deterministic-image-quality',
		checks,
		blockingIssues,
		measurements,
		regions,
		note: 'Deterministic hard gates do not claim semantic or aesthetic correctness. OCR is fail-closed when no completed scan is supplied; IMG5 owns independent visual judgment.',
	}
}

export { hamming, laplacianVariance }

// Research-only candidate arbitration. Hard deterministic gates are evaluated
// before the owner sharpness rule; a missing/invalid focus measurement or a
// top-score tie abstains instead of inventing a semantic winner.
export function selectSharpestCandidate(candidates, options = {}) {
	const items = Array.isArray(candidates) ? candidates : []
	const tieEpsilon = Number.isFinite(Number(options.tieEpsilon)) ? Math.max(0, Number(options.tieEpsilon)) : 1e-9
	const eligible = items.filter(item => item && item.quality?.status === 'pass' && Number.isFinite(Number(item.quality?.measurements?.sharpness)))
	if (!eligible.length) return { status: 'abstain', selected: null, eligible: [], policy: 'hard-gates-then-owner-sharpness-proxy', reason: 'NO_HARD_GATE_PASS' }
	const ranked = eligible.map((item, index) => ({ item, index, sharpness: Number(item.quality.measurements.sharpness) })).sort((a, b) => b.sharpness - a.sharpness || a.index - b.index)
	const top = ranked[0]
	const tied = ranked.filter(entry => Math.abs(entry.sharpness - top.sharpness) <= tieEpsilon)
	if (tied.length > 1) return { status: 'abstain', selected: null, eligible: eligible.slice(), ranked: ranked.map(entry => ({ lane: entry.item.lane || null, sharpness: entry.sharpness })), policy: 'hard-gates-then-owner-sharpness-proxy', reason: 'TOP_SHARPNESS_TIE' }
	return { status: 'selected', selected: top.item, eligible: eligible.slice(), ranked: ranked.map(entry => ({ lane: entry.item.lane || null, sharpness: entry.sharpness })), policy: 'hard-gates-then-owner-sharpness-proxy', reason: 'SHARPEST_ELIGIBLE_CANDIDATE' }
}
