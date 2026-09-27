/**
 * Deterministic generated textures for native PowerPoint picture/texture fills.
 * PowerPoint can retile and replace the pixels; it cannot edit the recipe.
 */
import { deflateSync } from 'node:zlib'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const GENERATED_TEXTURE_TYPES = Object.freeze([
	'grain', 'filmGrain', 'paperFibre', 'speckle', 'halftone', 'scanlines',
	'dotGrid', 'weave', 'clouds', 'starField', 'bokeh', 'metallicNoise', 'blueprintGrid',
])

export const NATIVE_PRESET_TEXTURES = Object.freeze([
	'texture.papyrus', 'texture.canvas', 'texture.denim', 'texture.wovenMat', 'texture.waterDroplets',
	'texture.paperBag', 'texture.fishFossil', 'texture.sand', 'texture.greenMarble', 'texture.whiteMarble',
	'texture.brownMarble', 'texture.granite', 'texture.newsprint', 'texture.recycledPaper', 'texture.parchment',
	'texture.stationery', 'texture.blueTissuePaper', 'texture.pinkTissuePaper', 'texture.purpleMesh',
	'texture.bouquet', 'texture.cork', 'texture.walnut', 'texture.oak', 'texture.mediumWood',
])

const CRC_TABLE = (() => {
	const table = new Uint32Array(256)
	for (let n = 0; n < 256; n += 1) {
		let c = n
		for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
		table[n] = c >>> 0
	}
	return table
})()

function crc32(buf) {
	let c = 0xFFFFFFFF
	for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8)
	return (c ^ 0xFFFFFFFF) >>> 0
}

function u32(value) {
	return Buffer.from([(value >>> 24) & 0xFF, (value >>> 16) & 0xFF, (value >>> 8) & 0xFF, value & 0xFF])
}

function chunk(type, data) {
	const typeBuf = Buffer.from(type, 'ascii')
	const body = Buffer.concat([typeBuf, data])
	return Buffer.concat([u32(data.length), body, u32(crc32(body))])
}

function encodePngRgba(width, height, pixels) {
	const raw = Buffer.alloc((width * 4 + 1) * height)
	for (let y = 0; y < height; y += 1) {
		const dest = y * (width * 4 + 1)
		raw[dest] = 0
		pixels.copy(raw, dest + 1, y * width * 4, (y + 1) * width * 4)
	}
	const ihdr = Buffer.alloc(13)
	ihdr.writeUInt32BE(width, 0)
	ihdr.writeUInt32BE(height, 4)
	ihdr[8] = 8
	ihdr[9] = 6
	return Buffer.concat([
		Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
		chunk('IHDR', ihdr),
		chunk('IDAT', deflateSync(raw, { level: 9 })),
		chunk('IEND', Buffer.alloc(0)),
	])
}

function mulberry32(seed) {
	let a = seed >>> 0
	return () => {
		a = (a + 0x6D2B79F5) >>> 0
		let t = a
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

function hexRgb(value, fallback = [255, 255, 255]) {
	const hex = String(value || '').replace('#', '')
	if (!/^[0-9a-fA-F]{6}$/.test(hex)) return fallback
	return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)]
}

function hash2(x, y, seed) {
	let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + (seed | 0)
	h = (h ^ (h >>> 13)) >>> 0
	h = Math.imul(h, 1274126177) >>> 0
	return (h ^ (h >>> 16)) / 4294967296
}

function valueNoise(x, y, seed, scale) {
	const nx = x / scale
	const ny = y / scale
	const x0 = Math.floor(nx)
	const y0 = Math.floor(ny)
	const fx = nx - x0
	const fy = ny - y0
	const v00 = hash2(x0, y0, seed)
	const v10 = hash2(x0 + 1, y0, seed)
	const v01 = hash2(x0, y0 + 1, seed)
	const v11 = hash2(x0 + 1, y0 + 1, seed)
	const sx = fx * fx * (3 - 2 * fx)
	const sy = fy * fy * (3 - 2 * fy)
	return v00 * (1 - sx) * (1 - sy) + v10 * sx * (1 - sy) + v01 * (1 - sx) * sy + v11 * sx * sy
}

function clampByte(value) {
	return Math.max(0, Math.min(255, Math.round(value)))
}

export function normalizeTextureRecipe(recipe = {}) {
	const type = GENERATED_TEXTURE_TYPES.includes(recipe.type) ? recipe.type : 'grain'
	const widthPx = Math.max(32, Math.min(1024, Number(recipe.widthPx) || 256))
	const heightPx = Math.max(32, Math.min(1024, Number(recipe.heightPx) || widthPx))
	return {
		type,
		seed: Number.isFinite(Number(recipe.seed)) ? Number(recipe.seed) : 1042,
		widthPx,
		heightPx,
		density: Math.max(0, Math.min(1, Number(recipe.density ?? recipe.amount ?? 0.12))),
		scale: Math.max(0.2, Math.min(8, Number(recipe.scale) || 1)),
		foreground: String(recipe.foreground || 'FFFFFF').replace('#', ''),
		background: String(recipe.background || '000000').replace('#', ''),
		alpha: Math.max(0, Math.min(1, Number(recipe.alpha ?? 0.16))),
		seamless: recipe.seamless !== false,
	}
}

export function renderGeneratedTexturePng(recipeInput = {}) {
	const recipe = normalizeTextureRecipe(recipeInput)
	const { widthPx: w, heightPx: h, seed, density, scale, alpha } = recipe
	const [fr, fg, fb] = hexRgb(recipe.foreground)
	const [br, bg, bb] = hexRgb(recipe.background, [0, 0, 0])
	const pixels = Buffer.alloc(w * h * 4)
	const rand = mulberry32(seed)
	for (let y = 0; y < h; y += 1) {
		for (let x = 0; x < w; x += 1) {
			const i = (y * w + x) * 4
			let mix = 0
			let a = alpha
			if (recipe.type === 'scanlines') {
				mix = (y % Math.max(2, Math.round(2 * scale))) === 0 ? 1 : 0
				a = mix ? alpha : 0
			} else if (recipe.type === 'dotGrid' || recipe.type === 'halftone') {
				const step = Math.max(4, Math.round(8 * scale))
				const dx = (x % step) - step / 2
				const dy = (y % step) - step / 2
				mix = Math.hypot(dx, dy) < Math.max(1, step * density) ? 1 : 0
				a = mix ? alpha : 0
			} else if (recipe.type === 'blueprintGrid') {
				mix = (x % Math.round(16 * scale) === 0 || y % Math.round(16 * scale) === 0) ? 1 : 0
				a = mix ? alpha : 0
			} else if (recipe.type === 'starField') {
				mix = rand() < density * 0.04 ? 1 : 0
				a = mix ? Math.min(1, alpha + rand() * 0.6) : 0
			} else if (recipe.type === 'clouds' || recipe.type === 'bokeh') {
				mix = valueNoise(x, y, seed, 24 * scale)
				if (recipe.type === 'bokeh') mix = mix > (1 - density) ? mix : 0
				a = mix * alpha
			} else if (recipe.type === 'weave') {
				mix = ((Math.floor(x / (4 * scale)) + Math.floor(y / (4 * scale))) % 2) === 0 ? 0.65 : 0.2
				a = alpha
			} else if (recipe.type === 'paperFibre') {
				mix = valueNoise(x, y * 3, seed, 6 * scale) * 0.7 + rand() * 0.3
				a = mix * alpha
			} else {
				const coarse = recipe.type === 'filmGrain' ? valueNoise(x, y, seed, 3 * scale) : 0
				mix = recipe.type === 'metallicNoise'
					? 0.35 + valueNoise(x, y, seed, 8 * scale) * 0.65
					: rand() * (recipe.type === 'speckle' ? 1 : 0.85) + coarse * 0.4
				a = mix < (1 - density) && recipe.type !== 'metallicNoise' ? 0 : mix * alpha
			}
			pixels[i] = clampByte(br + (fr - br) * mix)
			pixels[i + 1] = clampByte(bg + (fg - bg) * mix)
			pixels[i + 2] = clampByte(bb + (fb - bb) * mix)
			pixels[i + 3] = clampByte(a * 255)
		}
	}
	const png = encodePngRgba(w, h, pixels)
	return {
		recipe,
		mime: 'image/png',
		dataUri: `image/png;base64,${png.toString('base64')}`,
		editability: {
			powerPointFillParameters: 'ui-editable',
			embeddedTexturePixels: 'asset-editable',
			generationRecipe: 'mcp-regenerable',
		},
	}
}

export function resolveNativePresetTexture(presetId = '') {
	const raw = String(presetId || '').trim()
	const id = raw.startsWith('texture.') ? raw : `texture.${raw}`
	const fileName = id.replace(/^texture\./, '') + '.jpeg'
	const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'native-preset-textures', fileName)
	if (!fs.existsSync(file)) {
		throw new Error(`Unknown native PowerPoint texture preset: ${presetId}`)
	}
	return {
		presetId: id,
		dataUri: `image/jpeg;base64,${fs.readFileSync(file).toString('base64')}`,
		alignment: 'tl',
		tile: true,
		scaleX: 1,
		scaleY: 1,
	}
}

export function materializeGeneratedTextureFill(fill = {}) {
	const tex = fill.texture && typeof fill.texture === 'object' ? { ...fill.texture } : {}
	const source = tex.source && typeof tex.source === 'object' ? { ...tex.source } : {}
	if (source.kind === 'nativePreset' || tex.presetId) {
		const resolved = resolveNativePresetTexture(source.presetId || tex.presetId)
		return {
			...fill,
			type: 'texture',
			texture: {
				...tex,
				source: { ...source, kind: 'nativePreset', presetId: resolved.presetId },
				data: resolved.dataUri,
				tile: tex.tile !== false,
				alignment: tex.alignment || tex.placement?.alignment || resolved.alignment,
				scaleX: tex.scaleX ?? tex.placement?.scaleX ?? resolved.scaleX,
				scaleY: tex.scaleY ?? tex.placement?.scaleY ?? resolved.scaleY,
			},
		}
	}
	if (source.kind !== 'generated' && !(tex.recipe && !tex.data)) return fill
	const rendered = renderGeneratedTexturePng(source.recipe || tex.recipe || {})
	return {
		...fill,
		type: 'texture',
		texture: {
			...tex,
			source: { ...source, kind: 'generated', recipe: rendered.recipe },
			data: rendered.dataUri,
			tile: tex.tile !== false,
			scaleX: tex.scaleX ?? tex.placement?.scaleX ?? 0.35,
			scaleY: tex.scaleY ?? tex.placement?.scaleY ?? 0.35,
		},
		_generatedTextureEditability: rendered.editability,
	}
}
