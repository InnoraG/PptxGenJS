#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import sharp from 'sharp'

const GLB_MAGIC = 0x46546c67
const CHUNK_JSON = 0x4e4f534a
const CHUNK_BIN = 0x004e4942

function parseArgs(argv) {
	const args = {}
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i]
		if (!arg.startsWith('--')) continue
		const key = arg.slice(2)
		const value = argv[i + 1]
		if (!value || value.startsWith('--')) args[key] = true
		else {
			args[key] = value
			i++
		}
	}
	return args
}

function parseGlb(source) {
	if (source.length < 12 || source.readUInt32LE(0) !== GLB_MAGIC) throw new Error('Invalid GLB')
	let offset = 12
	let json = null
	let bin = Buffer.alloc(0)
	while (offset + 8 <= source.length) {
		const length = source.readUInt32LE(offset)
		const type = source.readUInt32LE(offset + 4)
		const data = source.subarray(offset + 8, offset + 8 + length)
		if (type === CHUNK_JSON) json = JSON.parse(data.toString('utf8'))
		if (type === CHUNK_BIN) bin = Buffer.from(data)
		offset += 8 + length
	}
	if (!json) throw new Error('GLB has no JSON chunk')
	return { json, bin }
}

function serializeGlb(json, bin) {
	let jsonBytes = Buffer.from(JSON.stringify(json), 'utf8')
	if (jsonBytes.length % 4) jsonBytes = Buffer.concat([jsonBytes, Buffer.alloc(4 - (jsonBytes.length % 4), 0x20)])
	let binBytes = Buffer.from(bin)
	if (binBytes.length % 4) binBytes = Buffer.concat([binBytes, Buffer.alloc(4 - (binBytes.length % 4))])
	const output = Buffer.alloc(12 + 8 + jsonBytes.length + 8 + binBytes.length)
	output.writeUInt32LE(GLB_MAGIC, 0)
	output.writeUInt32LE(2, 4)
	output.writeUInt32LE(output.length, 8)
	let offset = 12
	output.writeUInt32LE(jsonBytes.length, offset)
	output.writeUInt32LE(CHUNK_JSON, offset + 4)
	jsonBytes.copy(output, offset + 8)
	offset += 8 + jsonBytes.length
	output.writeUInt32LE(binBytes.length, offset)
	output.writeUInt32LE(CHUNK_BIN, offset + 4)
	binBytes.copy(output, offset + 8)
	return output
}

function sha256(buffer) {
	return createHash('sha256').update(buffer).digest('hex')
}

function walk(value, visitor) {
	if (!value || typeof value !== 'object') return
	visitor(value)
	if (Array.isArray(value)) {
		for (const child of value) walk(child, visitor)
		return
	}
	for (const child of Object.values(value)) walk(child, visitor)
}

function textureInfoRefs(json) {
	const refs = []
	walk(json.materials || [], object => {
		for (const [key, value] of Object.entries(object)) {
			if (key.endsWith('Texture') && value && typeof value === 'object' && Number.isInteger(value.index)) refs.push(value)
		}
	})
	return refs
}

function textureSourceRefs(texture) {
	const refs = []
	if (Number.isInteger(texture.source)) refs.push({ object: texture, key: 'source' })
	walk(texture.extensions || {}, object => {
		if (Number.isInteger(object.source)) refs.push({ object, key: 'source' })
	})
	return refs
}

function removeUnusedTexturesAndImages(json) {
	const originalTextureCount = (json.textures || []).length
	const originalImageCount = (json.images || []).length
	const textureRefs = textureInfoRefs(json)
	const usedTextureIndices = new Set(textureRefs.map(ref => ref.index))
	const textureIndexMap = new Map()
	const retainedTextures = []
	for (let oldIndex = 0; oldIndex < (json.textures || []).length; oldIndex++) {
		if (!usedTextureIndices.has(oldIndex)) continue
		textureIndexMap.set(oldIndex, retainedTextures.length)
		retainedTextures.push(json.textures[oldIndex])
	}
	for (const ref of textureRefs) ref.index = textureIndexMap.get(ref.index)
	json.textures = retainedTextures

	const sourceRefs = retainedTextures.flatMap(textureSourceRefs)
	const usedImageIndices = new Set(sourceRefs.map(ref => ref.object[ref.key]))
	const imageIndexMap = new Map()
	const retainedImages = []
	for (let oldIndex = 0; oldIndex < (json.images || []).length; oldIndex++) {
		if (!usedImageIndices.has(oldIndex)) continue
		imageIndexMap.set(oldIndex, retainedImages.length)
		retainedImages.push(json.images[oldIndex])
	}
	for (const ref of sourceRefs) ref.object[ref.key] = imageIndexMap.get(ref.object[ref.key])
	json.images = retainedImages
	return {
		removedTextures: originalTextureCount - retainedTextures.length,
		removedImages: originalImageCount - retainedImages.length,
		retainedTextureCount: retainedTextures.length,
		retainedImageCount: retainedImages.length,
	}
}

function collectUsedExtensions(json) {
	const used = new Set()
	walk(json, object => {
		if (!object.extensions || typeof object.extensions !== 'object') return
		for (const name of Object.keys(object.extensions)) used.add(name)
	})
	return used
}

function pruneExtensionDeclarations(json) {
	const used = collectUsedExtensions(json)
	if (json.extensionsUsed) json.extensionsUsed = json.extensionsUsed.filter(name => used.has(name))
	if (json.extensionsRequired) json.extensionsRequired = json.extensionsRequired.filter(name => used.has(name))
	if (json.extensionsUsed && !json.extensionsUsed.length) delete json.extensionsUsed
	if (json.extensionsRequired && !json.extensionsRequired.length) delete json.extensionsRequired
}

async function resizeRetainedImages(json, bin, maxTextureSize) {
	const replacements = new Map()
	const report = []
	for (const image of json.images || []) {
		if (!Number.isInteger(image.bufferView)) continue
		const view = json.bufferViews?.[image.bufferView]
		if (!view) continue
		const start = view.byteOffset || 0
		const source = bin.subarray(start, start + view.byteLength)
		const metadata = await sharp(source).metadata()
		const width = metadata.width || 0
		const height = metadata.height || 0
		let optimized = Buffer.from(source)
		if (Math.max(width, height) > maxTextureSize && ['image/png', 'image/jpeg'].includes(image.mimeType)) {
			let pipeline = sharp(source).resize({
				width: maxTextureSize,
				height: maxTextureSize,
				fit: 'inside',
				withoutEnlargement: true,
				kernel: 'lanczos3',
			})
			if (image.mimeType === 'image/png') pipeline = pipeline.png({ compressionLevel: 9, effort: 10, palette: false })
			else pipeline = pipeline.jpeg({ quality: 90, chromaSubsampling: '4:4:4', mozjpeg: true })
			optimized = await pipeline.toBuffer()
		}
		replacements.set(image.bufferView, optimized)
		const optimizedMetadata = await sharp(optimized).metadata()
		report.push({
			name: image.name || null,
			mimeType: image.mimeType || null,
			beforeBytes: source.length,
			afterBytes: optimized.length,
			beforeSize: [width, height],
			afterSize: [optimizedMetadata.width || 0, optimizedMetadata.height || 0],
		})
	}
	return { replacements, report }
}

function repackBufferViews(json, bin, replacements) {
	const usedViews = new Set()
	walk(json, object => {
		if (Number.isInteger(object.bufferView)) usedViews.add(object.bufferView)
	})
	const indexMap = new Map()
	const chunks = []
	const retainedViews = []
	let byteOffset = 0
	for (let oldIndex = 0; oldIndex < (json.bufferViews || []).length; oldIndex++) {
		if (!usedViews.has(oldIndex)) continue
		const oldView = json.bufferViews[oldIndex]
		const source = replacements.get(oldIndex) || bin.subarray(oldView.byteOffset || 0, (oldView.byteOffset || 0) + oldView.byteLength)
		const padding = (4 - (byteOffset % 4)) % 4
		if (padding) {
			chunks.push(Buffer.alloc(padding))
			byteOffset += padding
		}
		indexMap.set(oldIndex, retainedViews.length)
		retainedViews.push({ ...oldView, byteOffset, byteLength: source.length })
		chunks.push(Buffer.from(source))
		byteOffset += source.length
	}
	walk(json, object => {
		if (Number.isInteger(object.bufferView)) object.bufferView = indexMap.get(object.bufferView)
	})
	json.bufferViews = retainedViews
	const packed = Buffer.concat(chunks)
	json.buffers ||= [{}]
	json.buffers[0].byteLength = packed.length
	return { packed, removedBufferViews: usedViews.size ? indexMap.size : 0 }
}

function nonImagePayloadHashes(json, bin) {
	const imageViews = new Set((json.images || []).map(image => image.bufferView).filter(Number.isInteger))
	return (json.bufferViews || []).flatMap((view, index) => {
		if (imageViews.has(index)) return []
		const start = view.byteOffset || 0
		return [{ byteLength: view.byteLength, sha256: sha256(bin.subarray(start, start + view.byteLength)) }]
	})
}

export async function optimizeGlbTexturesSafeBuffer(sourceBuffer, { maxTextureSize = 1024 } = {}) {
	const source = Buffer.isBuffer(sourceBuffer) ? sourceBuffer : Buffer.from(sourceBuffer)
	const boundedTextureSize = Math.max(256, Math.min(4096, Number(maxTextureSize || 1024)))
	const parsed = parseGlb(source)
	const beforePayloadHashes = nonImagePayloadHashes(parsed.json, parsed.bin)
	const beforeCounts = {
		meshes: parsed.json.meshes?.length || 0,
		nodes: parsed.json.nodes?.length || 0,
		skins: parsed.json.skins?.length || 0,
		animations: parsed.json.animations?.length || 0,
		accessors: parsed.json.accessors?.length || 0,
		bufferViews: parsed.json.bufferViews?.length || 0,
		textures: parsed.json.textures?.length || 0,
		images: parsed.json.images?.length || 0,
	}
	const texturePrune = removeUnusedTexturesAndImages(parsed.json)
	pruneExtensionDeclarations(parsed.json)
	const resized = await resizeRetainedImages(parsed.json, parsed.bin, boundedTextureSize)
	const repacked = repackBufferViews(parsed.json, parsed.bin, resized.replacements)
	const optimized = serializeGlb(parsed.json, repacked.packed)
	const roundTrip = parseGlb(optimized)
	const afterPayloadHashes = nonImagePayloadHashes(roundTrip.json, roundTrip.bin)
	const afterCounts = {
		meshes: roundTrip.json.meshes?.length || 0,
		nodes: roundTrip.json.nodes?.length || 0,
		skins: roundTrip.json.skins?.length || 0,
		animations: roundTrip.json.animations?.length || 0,
		accessors: roundTrip.json.accessors?.length || 0,
		bufferViews: roundTrip.json.bufferViews?.length || 0,
		textures: roundTrip.json.textures?.length || 0,
		images: roundTrip.json.images?.length || 0,
	}
	const payloadPreserved = JSON.stringify(beforePayloadHashes) === JSON.stringify(afterPayloadHashes)
	for (const key of ['meshes', 'nodes', 'skins', 'animations', 'accessors']) {
		if (beforeCounts[key] !== afterCounts[key]) throw new Error(`Structural count changed: ${key} ${beforeCounts[key]} -> ${afterCounts[key]}`)
	}
	if (!payloadPreserved) throw new Error('Non-image binary payload changed')
	return {
		buffer: optimized,
		report: {
			maxTextureSize: boundedTextureSize,
			beforeBytes: source.length,
			afterBytes: optimized.length,
			reductionPercent: Number((((source.length - optimized.length) / source.length) * 100).toFixed(2)),
			beforeSha256: sha256(source),
			afterSha256: sha256(optimized),
			beforeCounts,
			afterCounts,
			payloadPreserved,
			texturePrune,
			images: resized.report,
		},
	}
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
	const args = parseArgs(process.argv.slice(2))
	if (!args.input || !args.output) throw new Error('Usage: optimize-glb-textures-safe.mjs --input <glb> --output <glb> [--max-texture-size 1024] [--report <json>]')
	const input = path.resolve(args.input)
	const output = path.resolve(args.output)
	const source = readFileSync(input)
	const optimized = await optimizeGlbTexturesSafeBuffer(source, { maxTextureSize: args['max-texture-size'] || 1024 })
	mkdirSync(path.dirname(output), { recursive: true })
	writeFileSync(output, optimized.buffer)
	const report = { input, output, ...optimized.report }
	const reportPath = path.resolve(args.report || `${output}.report.json`)
	writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
	console.log(JSON.stringify(report, null, 2))
}
