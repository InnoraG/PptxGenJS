// IMAGE OPS — the internal raster engine behind the json-spec `content[].imageOps`
// contract (M21, worlds/media expansion wave 1). sharp/libvips in-process: fast, no
// external binary, deterministic for identical inputs. GOLD RULE: this module is
// blackboxed machinery — the AI-facing surface is only the declarative ops list.
//
// Region coordinates are PERCENentages (0-100) of the source image so specs stay
// resolution-independent and replay identically on any copy of the source.
import sharp from 'sharp'

export class ImageOpsError extends Error {
	constructor(code, message, details = {}) {
		super(message)
		this.name = 'ImageOpsError'
		this.code = code
		this.details = details
	}
}

const MAX_OPS = 12
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n))
const pctToPx = (pct, total) => Math.round(clamp(Number(pct) || 0, 0, 100) / 100 * total)

function regionPx(op, width, height) {
	const x = pctToPx(op.x ?? 0, width)
	const y = pctToPx(op.y ?? 0, height)
	const w = clamp(pctToPx(op.w ?? 100, width), 1, width - x)
	const h = clamp(pctToPx(op.h ?? 100, height), 1, height - y)
	return { left: x, top: y, width: w, height: h }
}

function hexColor(value, fallback) {
	const hex = String(value || '').replace(/^#/, '')
	return /^[0-9a-fA-F]{6}$/.test(hex) ? `#${hex}` : fallback
}

const svgOverlay = (width, height, body) =>
	Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${body}</svg>`)

async function applyOne(image, op, meta) {
	const kind = String(op?.op || op?.kind || '').trim()
	const { width, height } = meta
	switch (kind) {
		case 'crop': {
			const region = regionPx(op, width, height)
			return { image: image.extract(region), meta: { width: region.width, height: region.height } }
		}
		case 'resize': {
			const w = Math.max(1, Math.round(Number(op.width) || 0)) || null
			const h = Math.max(1, Math.round(Number(op.height) || 0)) || null
			if (!w && !h) throw new ImageOpsError('IMAGE_OP_INVALID', 'resize needs width and/or height (px).')
			const fit = ['cover', 'contain', 'fill', 'inside', 'outside'].includes(op.fit) ? op.fit : 'inside'
			const resized = image.resize({ width: w || undefined, height: h || undefined, fit })
			const buf = await resized.png().toBuffer()
			const m = await sharp(buf).metadata()
			return { image: sharp(buf), meta: { width: m.width, height: m.height } }
		}
		case 'rotate': {
			const deg = Number(op.degrees ?? op.deg) || 0
			const buf = await image.rotate(deg, { background: hexColor(op.background, '#00000000') }).png().toBuffer()
			const m = await sharp(buf).metadata()
			return { image: sharp(buf), meta: { width: m.width, height: m.height } }
		}
		case 'flip': return { image: op.axis === 'horizontal' ? image.flop() : image.flip(), meta }
		case 'grayscale': return { image: image.grayscale(), meta }
		case 'duotone': {
			// world-grade treatment: grayscale mapped between a dark and a light ink
			const dark = hexColor(op.dark, '#0B1220')
			const light = hexColor(op.light, '#F8FAFC')
			const toned = image.grayscale().tint(light)
			const buf = await toned.png().toBuffer()
			const withDark = sharp(buf).composite([{
				input: svgOverlay(width, height, `<rect width="100%" height="100%" fill="${dark}" opacity="0.35"/>`),
				blend: 'multiply',
			}])
			return { image: withDark, meta }
		}
		case 'tint': return { image: image.tint(hexColor(op.color, '#2DD4BF')), meta }
		case 'blurRegion': {
			const region = regionPx(op, width, height)
			const base = await image.png().toBuffer()
			const blurred = await sharp(base).extract(region).blur(Math.max(3, Number(op.sigma) || 12)).toBuffer()
			return { image: sharp(base).composite([{ input: blurred, left: region.left, top: region.top }]), meta }
		}
		case 'highlightRegion': {
			const region = regionPx(op, width, height)
			const color = hexColor(op.color, '#F59E0B')
			const thickness = clamp(Math.round(Number(op.thickness) || Math.max(3, width * 0.006)), 2, 40)
			const radius = clamp(Math.round(Number(op.radius) || thickness * 2), 0, 60)
			return {
				image: image.composite([{
					input: svgOverlay(width, height,
						`<rect x="${region.left}" y="${region.top}" width="${region.width}" height="${region.height}" rx="${radius}" fill="none" stroke="${color}" stroke-width="${thickness}"/>`),
				}]),
				meta,
			}
		}
		case 'dimOutsideRegion': {
			// tutorial spotlight: everything except the region dims
			const region = regionPx(op, width, height)
			const opacity = clamp(Number(op.opacity) || 0.55, 0.1, 0.95)
			return {
				image: image.composite([{
					input: svgOverlay(width, height,
						`<path fill-rule="evenodd" fill="#000" opacity="${opacity}" d="M0 0h${width}v${height}H0z M${region.left} ${region.top}h${region.width}v${region.height}h-${region.width}z"/>`),
				}]),
				meta,
			}
		}
		case 'pad': {
			const px = clamp(Math.round(Number(op.px) || 24), 1, 400)
			const background = hexColor(op.color, '#FFFFFF')
			const buf = await image.extend({ top: px, bottom: px, left: px, right: px, background }).png().toBuffer()
			const m = await sharp(buf).metadata()
			return { image: sharp(buf), meta: { width: m.width, height: m.height } }
		}
		case 'deviceFrame': {
			// screenshot chrome: 'browser' (title bar + traffic lights) or 'phone' (rounded bezel)
			const style = op.style === 'phone' ? 'phone' : 'browser'
			const frameColor = hexColor(op.color, style === 'phone' ? '#0B1220' : '#E2E8F0')
			if (style === 'browser') {
				const bar = Math.max(28, Math.round(height * 0.055))
				const buf = await image.extend({ top: bar, bottom: 2, left: 2, right: 2, background: frameColor }).png().toBuffer()
				const m = await sharp(buf).metadata()
				const dots = ['#EF4444', '#F59E0B', '#22C55E'].map((c, i) =>
					`<circle cx="${Math.round(bar * 0.55) + i * Math.round(bar * 0.62)}" cy="${Math.round(bar / 2)}" r="${Math.round(bar * 0.16)}" fill="${c}"/>`).join('')
				return {
					image: sharp(buf).composite([{ input: svgOverlay(m.width, m.height, dots) }]),
					meta: { width: m.width, height: m.height },
				}
			}
			const bezel = Math.max(14, Math.round(width * 0.03))
			const buf = await image.extend({ top: bezel * 2, bottom: bezel * 2, left: bezel, right: bezel, background: frameColor }).png().toBuffer()
			const m = await sharp(buf).metadata()
			const radius = Math.round(Math.min(m.width, m.height) * 0.08)
			const mask = svgOverlay(m.width, m.height, `<rect width="100%" height="100%" rx="${radius}" fill="#fff"/>`)
			return {
				image: sharp(buf).composite([{ input: mask, blend: 'dest-in' }]),
				meta: { width: m.width, height: m.height },
			}
		}
		default:
			throw new ImageOpsError('IMAGE_OP_UNKNOWN', `Unknown image op "${kind}".`, {
				supported: ['crop', 'resize', 'rotate', 'flip', 'grayscale', 'duotone', 'tint', 'blurRegion', 'highlightRegion', 'dimOutsideRegion', 'pad', 'deviceFrame'],
			})
	}
}

export async function applyImageOpsToBuffer(buffer, ops = []) {
	if (!Array.isArray(ops) || !ops.length) return { buffer, applied: 0 }
	if (ops.length > MAX_OPS) throw new ImageOpsError('IMAGE_OPS_TOO_MANY', `At most ${MAX_OPS} image ops per image.`)
	let image = sharp(buffer)
	let meta = await image.metadata()
	if (!meta.width || !meta.height) throw new ImageOpsError('IMAGE_OPS_UNREADABLE', 'Source image has no readable dimensions.')
	let state = { image, meta: { width: meta.width, height: meta.height } }
	for (const op of ops) state = await applyOne(state.image, op, state.meta)
	return { buffer: await state.image.png().toBuffer(), applied: ops.length, width: state.meta.width, height: state.meta.height }
}

// splitGrid: one source image -> rows x cols cell buffers (optionally a subset via
// pick: [ [row, col], ... ] 1-based). Used by the compiler to EXPAND one image block
// into multiple placed blocks (each cell flows through layout like any image).
export async function splitImageBuffer(buffer, { rows = 2, cols = 2, pick = null } = {}) {
	const r = clamp(Math.round(Number(rows) || 2), 1, 6)
	const c = clamp(Math.round(Number(cols) || 2), 1, 6)
	const meta = await sharp(buffer).metadata()
	if (!meta.width || !meta.height) throw new ImageOpsError('IMAGE_OPS_UNREADABLE', 'Source image has no readable dimensions.')
	const wanted = Array.isArray(pick) && pick.length
		? pick.map(cell => [clamp(Math.round(cell?.[0]) || 1, 1, r), clamp(Math.round(cell?.[1]) || 1, 1, c)])
		: Array.from({ length: r * c }, (_, i) => [Math.floor(i / c) + 1, (i % c) + 1])
	const cellW = Math.floor(meta.width / c)
	const cellH = Math.floor(meta.height / r)
	const cells = []
	for (const [row, col] of wanted) {
		const cell = await sharp(buffer)
			.extract({ left: (col - 1) * cellW, top: (row - 1) * cellH, width: cellW, height: cellH })
			.png().toBuffer()
		cells.push({ row, col, buffer: cell, width: cellW, height: cellH })
	}
	return cells
}
