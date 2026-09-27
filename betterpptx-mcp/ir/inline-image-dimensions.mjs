// The structured source contract permits PNG/JPEG/SVG. Legacy native data
// carriers additionally permit GIF/WebP/BMP/TIFF/EMF/WMF (src/media-types.ts).
// Formats and dimensions are parsed locally with bounded reads; this keeps
// untrusted uploads away from broad third-party format detectors.
export const INLINE_IMAGE_LIMITS = Object.freeze({
	maxBytes: 16 * 1024 * 1024, // Existing image materialization/worker bound.
	maxEncodedChars: 4 * Math.ceil(16 * 1024 * 1024 / 3),
	maxDimension: 32768,
	maxPixels: 25_000_000, // Existing image worker input-pixel bound.
	maxHeaderBytes: 64 * 1024,
})

const MIME_FORMATS = new Map([
	['image/png', 'png'], ['image/jpeg', 'jpeg'], ['image/jpg', 'jpeg'], ['image/pjpeg', 'jpeg'],
	['image/gif', 'gif'], ['image/webp', 'webp'], ['image/bmp', 'bmp'],
	['image/tiff', 'tiff'], ['image/tif', 'tiff'], ['image/svg+xml', 'svg'], ['image/svg', 'svg'],
	['image/x-emf', 'emf'], ['image/emf', 'emf'], ['image/x-wmf', 'wmf'], ['image/wmf', 'wmf'],
])

export class InlineImageValidationError extends Error {
	constructor(code, message) {
		super(message)
		this.name = 'InlineImageValidationError'
		this.code = code
	}
}

function invalid(message = 'Inline image data has an invalid or incomplete header.') {
	throw new InlineImageValidationError('INLINE_IMAGE_INVALID', message)
}

function unsupported() {
	throw new InlineImageValidationError('INLINE_IMAGE_UNSUPPORTED', 'Inline images must use PNG, JPEG, GIF, WebP, BMP, TIFF, SVG, EMF, or WMF with matching content.')
}

function tooLarge() {
	throw new InlineImageValidationError('INLINE_IMAGE_TOO_LARGE', 'Inline image data exceeds the permitted size.')
}

function boundedDimensions(width, height) {
	if (![width, height].every(value => Number.isSafeInteger(value) && value > 0)) invalid('Inline image dimensions must be positive whole numbers.')
	if (width > INLINE_IMAGE_LIMITS.maxDimension || height > INLINE_IMAGE_LIMITS.maxDimension
		|| width * height > INLINE_IMAGE_LIMITS.maxPixels) {
		throw new InlineImageValidationError('INLINE_IMAGE_DIMENSIONS_EXCEEDED', 'Inline image dimensions exceed the permitted side or pixel limit.')
	}
	return { width, height }
}

function bytesAt(bytes, at, values) {
	return at + values.length <= bytes.length && values.every((value, index) => bytes[at + index] === value)
}

function ascii(bytes, at, text) {
	// latin1 is byte-exact here; Node's ascii decoder masks high bits and would
	// incorrectly admit forged magic bytes into the dependency's fallback scan.
	return at + text.length <= bytes.length && bytes.toString('latin1', at, at + text.length) === text
}

function decodeInline(value) {
	if (typeof value !== 'string') invalid('Inline image data must be a base64 image string.')
	// Check raw input length before searching/slicing/decoding a large payload.
	if (value.length > INLINE_IMAGE_LIMITS.maxEncodedChars + 256) tooLarge()
	const comma = value.indexOf(',')
	if (comma < 0 || comma > 256) invalid('Inline image data must include a bounded base64 image header.')
	const header = /^(?:data:)?(image\/[a-z0-9.+-]+)(?:;charset=(?:utf-8|us-ascii))?;base64$/i.exec(value.slice(0, comma).trim())
	if (!header) invalid('Inline image data must be base64 encoded.')
	const format = MIME_FORMATS.get(header[1].toLowerCase())
	if (!format) unsupported()
	const raw = value.slice(comma + 1)
	if (raw.length > INLINE_IMAGE_LIMITS.maxEncodedChars) tooLarge()
	// Accept native MIME base64 line wrapping and unpadded final quanta, but not
	// Buffer.from's permissive treatment of arbitrary junk or URL-safe alphabet.
	let chars = 0, padding = 0
	for (let index = 0; index < raw.length; index++) {
		const code = raw.charCodeAt(index)
		if (code === 9 || code === 10 || code === 13 || code === 32) continue
		if (code === 61) { if (++padding > 2) invalid('Inline image base64 padding is invalid.') }
		else if (padding || !((code >= 65 && code <= 90) || (code >= 97 && code <= 122)
			|| (code >= 48 && code <= 57) || code === 43 || code === 47)) invalid('Inline image base64 contains invalid characters.')
		chars++
	}
	if (!chars || chars % 4 === 1 || (padding && chars % 4 !== 0)) invalid('Inline image base64 is incomplete.')
	const expectedBytes = Math.floor(chars * 3 / 4) - padding
	if (expectedBytes > INLINE_IMAGE_LIMITS.maxBytes) tooLarge()
	const bytes = Buffer.from(raw, 'base64')
	if (!bytes.length || bytes.length !== expectedBytes) invalid('Inline image base64 is incomplete.')
	if (bytes.length > INLINE_IMAGE_LIMITS.maxBytes) tooLarge()
	return { format, bytes }
}

function pngDimensions(bytes) {
	let offset = 8
	// Preserve the fixed CgBI header recognized by the existing reader.
	if (bytes.length >= 16 && ascii(bytes, 12, 'CgBI')) {
		if (bytes.readUInt32BE(8) !== 4) invalid()
		offset = 24
	}
	if (bytes.length < offset + 25 || bytes.readUInt32BE(offset) !== 13 || !ascii(bytes, offset + 4, 'IHDR')) invalid()
	const bitDepths = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] }
	if (!bitDepths[bytes[offset + 17]]?.includes(bytes[offset + 16]) || bytes[offset + 18] !== 0
		|| bytes[offset + 19] !== 0 || bytes[offset + 20] > 1) invalid()
	return boundedDimensions(bytes.readUInt32BE(offset + 8), bytes.readUInt32BE(offset + 12))
}

function jpegDimensions(bytes) {
	let offset = 2
	// Each iteration consumes bytes or throws. Inspect markers, never entropy
	// data, and validate segment lengths before the dependency can inspect EXIF.
	while (offset < bytes.length) {
		if (bytes[offset++] !== 0xff) invalid()
		while (offset < bytes.length && bytes[offset] === 0xff) offset++
		if (offset >= bytes.length) invalid()
		const marker = bytes[offset++]
		if (marker === 0xda || marker === 0xd9 || marker === 0x00 || marker === 0xd8) invalid('Inline JPEG has no supported dimension header.')
		if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue
		if (offset + 2 > bytes.length) invalid()
		const length = bytes.readUInt16BE(offset)
		if (length < 2 || offset + length > bytes.length) invalid()
		if ([0xc0, 0xc1, 0xc2].includes(marker)) {
			if (length < 8 || length !== 8 + 3 * bytes[offset + 7]) invalid()
			return boundedDimensions(bytes.readUInt16BE(offset + 5), bytes.readUInt16BE(offset + 3))
		}
		offset += length
	}
	invalid('Inline JPEG has no supported dimension header.')
}

function bmpDimensions(bytes) {
	if (bytes.length < 26) invalid()
	const dibSize = bytes.readUInt32LE(14)
	if (dibSize === 12) return boundedDimensions(bytes.readUInt16LE(18), bytes.readUInt16LE(20))
	if (![40, 52, 56, 64, 108, 124].includes(dibSize) || 14 + dibSize > bytes.length) invalid()
	return boundedDimensions(bytes.readInt32LE(18), Math.abs(bytes.readInt32LE(22)))
}

function webpDimensions(bytes) {
	if (bytes.length < 25) invalid()
	const end = bytes.readUInt32LE(4) + 8
	const length = bytes.readUInt32LE(16)
	if (end > bytes.length || end < 25 || length < 5 || 20 + length > end) invalid()
	if (ascii(bytes, 12, 'VP8X')) {
		if (length !== 10 || bytes.length < 30 || (bytes[20] & 0xc1)) invalid()
		return boundedDimensions(bytes.readUIntLE(24, 3) + 1, bytes.readUIntLE(27, 3) + 1)
	}
	if (ascii(bytes, 12, 'VP8L')) {
		if (bytes[20] !== 0x2f) invalid()
		const bits = bytes.readUInt32LE(21)
		return boundedDimensions((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1)
	}
	if (ascii(bytes, 12, 'VP8 ')) {
		if (length < 10 || bytes.length < 30 || !bytesAt(bytes, 23, [0x9d, 0x01, 0x2a])) invalid()
		return boundedDimensions(bytes.readUInt16LE(26) & 0x3fff, bytes.readUInt16LE(28) & 0x3fff)
	}
	invalid()
}

function tiffDimensions(bytes) {
	// Read only the first IFD with fixed entry strides: no filesystem access,
	// pointer chasing, or cyclic lists.
	if (bytes.length < 8) invalid()
	const little = bytes[0] === 0x49
	const uint16 = at => little ? bytes.readUInt16LE(at) : bytes.readUInt16BE(at)
	const uint32 = at => little ? bytes.readUInt32LE(at) : bytes.readUInt32BE(at)
	const offset = uint32(4)
	if (offset < 8 || offset + 2 > bytes.length) invalid()
	const count = uint16(offset)
	if (offset + 2 + count * 12 + 4 > bytes.length) invalid()
	let width, height
	for (let index = 0; index < count; index++) {
		const at = offset + 2 + index * 12
		const tag = uint16(at)
		if (tag !== 256 && tag !== 257) continue
		const type = uint16(at + 2)
		if (uint32(at + 4) !== 1 || (type !== 3 && type !== 4)) invalid()
		const value = type === 3 ? uint16(at + 8) : uint32(at + 8)
		if (tag === 256) { if (width !== undefined && width !== value) invalid(); width = value }
		else { if (height !== undefined && height !== value) invalid(); height = value }
	}
	return boundedDimensions(width, height)
}

function metafileDimensions(bytes, format) {
	if (format === 'emf') {
		if (bytes.length < 88 || bytes.readUInt32LE(4) < 88 || bytes.readUInt32LE(4) > bytes.length) invalid()
		return boundedDimensions(bytes.readInt32LE(16) - bytes.readInt32LE(8), bytes.readInt32LE(20) - bytes.readInt32LE(12))
	}
	if (bytesAt(bytes, 0, [0xd7, 0xcd, 0xc6, 0x9a])) {
		if (bytes.length < 40 || bytes.readUInt16LE(14) === 0) invalid()
		return boundedDimensions(bytes.readInt16LE(10) - bytes.readInt16LE(6), bytes.readInt16LE(12) - bytes.readInt16LE(8))
	}
	if (bytes.length < 18) invalid()
	const end = bytes.readUInt32LE(6) * 2
	if (end < 18 || end > bytes.length) invalid()
	for (let offset = 18; offset < end;) {
		if (offset + 6 > end) invalid()
		const size = bytes.readUInt32LE(offset) * 2
		if (size < 6 || offset + size > end) invalid()
		if (bytes.readUInt16LE(offset + 4) === 0x020c) {
			if (size !== 10) invalid()
			return boundedDimensions(Math.abs(bytes.readInt16LE(offset + 8)), Math.abs(bytes.readInt16LE(offset + 6)))
		}
		offset += size
	}
	invalid('Inline WMF requires a bounded window extent.')
}

function svgDimensions(bytes) {
	// Parse only a bounded root tag with a linear scanner. Never use the
	// dependency's all-format detector or its whole-document SVG regex here.
	const text = bytes.toString('utf8', 0, Math.min(bytes.length, INLINE_IMAGE_LIMITS.maxHeaderBytes))
	let at = text.charCodeAt(0) === 0xfeff ? 1 : 0
	const space = value => value === ' ' || value === '\t' || value === '\r' || value === '\n'
	const skipSpace = () => { while (at < text.length && space(text[at])) at++ }
	skipSpace()
	if (text.startsWith('<?xml', at)) {
		const end = text.indexOf('?>', at + 5)
		if (end < 0) invalid()
		at = end + 2
		skipSpace()
	}
	while (text.startsWith('<!--', at)) {
		const end = text.indexOf('-->', at + 4)
		if (end < 0) invalid()
		at = end + 3
		skipSpace()
	}
	if (!text.startsWith('<svg', at) || (!space(text[at + 4]) && !['>', '/'].includes(text[at + 4]))) invalid('Inline SVG requires an SVG root element.')
	at += 4
	const attributes = new Map()
	let closed = false
	while (at < text.length) {
		skipSpace()
		if (text[at] === '>' || text.startsWith('/>', at)) { closed = true; break }
		const start = at
		while (at < text.length && !space(text[at]) && !['=', '>', '/'].includes(text[at])) at++
		const name = text.slice(start, at)
		if (!name || name.length > 256 || /[<"'&]/.test(name)) invalid()
		skipSpace()
		if (text[at++] !== '=') invalid()
		skipSpace()
		const quote = text[at++]
		if (quote !== '"' && quote !== "'") invalid()
		const end = text.indexOf(quote, at)
		if (end < 0) invalid()
		if (['width', 'height', 'viewBox'].includes(name)) {
			if (attributes.has(name) || end - at > 128) invalid()
			attributes.set(name, text.slice(at, end))
		}
		at = end + 1
	}
	if (!closed) invalid('Inline SVG root exceeds the permitted header size.')
	const units = { px: 1, in: 96, cm: 96 / 2.54, mm: 96 / 25.4, pt: 96 / 72, pc: 16, em: 16, ex: 8 }
	const length = name => {
		if (!attributes.has(name)) return null
		const value = attributes.get(name).trim()
		if (/^[0-9.]+%$/.test(value)) return null
		const match = /^([+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)(px|in|cm|mm|pt|pc|em|ex)?$/i.exec(value)
		if (!match) invalid('Inline SVG has unsupported dimensions.')
		return Math.round(Number(match[1]) * (units[(match[2] || 'px').toLowerCase()]))
	}
	const width = length('width'), height = length('height')
	if (width !== null && height !== null) return boundedDimensions(width, height)
	const viewBox = (attributes.get('viewBox') || '').trim().split(/[\s,]+/).map(Number)
	if (viewBox.length !== 4 || !viewBox.every(Number.isFinite) || viewBox[2] <= 0 || viewBox[3] <= 0) invalid('Inline SVG requires dimensions or a positive viewBox.')
	const ratio = viewBox[2] / viewBox[3]
	return boundedDimensions(width ?? (height === null ? Math.round(viewBox[2]) : Math.floor(height * ratio)),
		height ?? (width === null ? Math.round(viewBox[3]) : Math.floor(width / ratio)))
}

/**
 * Measure a browser or compact native base64 image without altering its data.
 * readDimensions is an optional test-only cross-check, never spec input.
 * @param {string} value
 * @param {((bytes: Buffer) => {width: number, height: number, type?: string}) | null} readDimensions
 * @returns {{width: number, height: number, type?: string}}
 * @throws {InlineImageValidationError} Unsupported, mismatched, invalid or oversized data.
 */
export function inlineImageDimensions(value, readDimensions = null) {
	const { format, bytes } = decodeInline(value)
	let actual
	if (bytesAt(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) actual = 'png'
	else if (bytesAt(bytes, 0, [0xff, 0xd8, 0xff])) actual = 'jpeg'
	else if (ascii(bytes, 0, 'GIF87a') || ascii(bytes, 0, 'GIF89a')) actual = 'gif'
	else if (ascii(bytes, 0, 'RIFF') && ascii(bytes, 8, 'WEBP')) actual = 'webp'
	else if (ascii(bytes, 0, 'BM')) actual = 'bmp'
	else if (bytesAt(bytes, 0, [0x49, 0x49, 0x2a, 0]) || bytesAt(bytes, 0, [0x4d, 0x4d, 0, 0x2a])) actual = 'tiff'
	else if (bytesAt(bytes, 0, [1, 0, 0, 0]) && ascii(bytes, 40, ' EMF')) actual = 'emf'
	else if (bytesAt(bytes, 0, [0xd7, 0xcd, 0xc6, 0x9a]) || bytesAt(bytes, 0, [1, 0, 9, 0])) actual = 'wmf'
	else if (format === 'svg') {
		const dimensions = svgDimensions(bytes)
		return { ...dimensions, type: 'svg' }
	}
	if (!actual) unsupported()
	if (actual !== format) throw new InlineImageValidationError('INLINE_IMAGE_MIME_MISMATCH', 'Inline image content does not match its declared MIME type.')
	let dimensions
	if (actual === 'png') dimensions = pngDimensions(bytes)
	else if (actual === 'jpeg') dimensions = jpegDimensions(bytes)
	else if (actual === 'gif') {
		if (bytes.length < 13) invalid()
		dimensions = boundedDimensions(bytes.readUInt16LE(6), bytes.readUInt16LE(8))
	} else if (actual === 'bmp') dimensions = bmpDimensions(bytes)
	else if (actual === 'webp') dimensions = webpDimensions(bytes)
	else if (actual === 'tiff') return { ...tiffDimensions(bytes), type: 'tiff' }
	else return { ...metafileDimensions(bytes, actual), type: actual }
	// BMP's 12-byte OS/2 header is native-supported and parsed directly above.
	if (actual === 'bmp' && bytes.readUInt32LE(14) === 12) return { ...dimensions, type: 'bmp' }
	if (readDimensions == null) return { ...dimensions, type: actual === 'jpeg' ? 'jpg' : actual }
	try {
		const measured = readDimensions(bytes)
		boundedDimensions(measured?.width, measured?.height)
		if (measured.width !== dimensions.width || measured.height !== dimensions.height) invalid('Inline image has inconsistent dimension headers.')
		return measured
	} catch (error) {
		if (error instanceof InlineImageValidationError) throw error
		invalid('Inline image dimensions could not be read.')
	}
}
