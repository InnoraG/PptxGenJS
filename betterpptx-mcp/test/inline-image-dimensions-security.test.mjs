import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import test from 'node:test'
import imageSize from 'image-size'
import { INLINE_IMAGE_LIMITS, InlineImageValidationError, inlineImageDimensions } from '../ir/inline-image-dimensions.mjs'

// Ordinary node --test. Synthetic headers only; no engine startup, credential
// or environment reads, live image jobs, image rendering, or network services.
const uri = (bytes, mime = 'image/png', prefix = 'data:') => `${prefix}${mime};base64,${bytes.toString('base64')}`
const png = () => Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=', 'base64')

function jpeg(progressive = false) {
	return Buffer.from([
		0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0,
		0xff, progressive ? 0xc2 : 0xc0, 0, 11, 8, 0, 3, 0, 2, 1, 1, 0x11, 0, 0xff, 0xd9,
	])
}

function gif() {
	const bytes = Buffer.alloc(14)
	bytes.write('GIF89a'); bytes.writeUInt16LE(2, 6); bytes.writeUInt16LE(3, 8); bytes[13] = 0x3b
	return bytes
}

function bmp(core = false) {
	const bytes = Buffer.alloc(core ? 26 : 54)
	bytes.write('BM'); bytes.writeUInt32LE(bytes.length, 2); bytes.writeUInt32LE(core ? 12 : 40, 14)
	if (core) { bytes.writeUInt16LE(2, 18); bytes.writeUInt16LE(3, 20) }
	else { bytes.writeInt32LE(2, 18); bytes.writeInt32LE(-3, 22) }
	return bytes
}

function webp(kind) {
	const bytes = Buffer.alloc(30)
	bytes.write('RIFF'); bytes.writeUInt32LE(22, 4); bytes.write('WEBP', 8); bytes.write(kind, 12); bytes.writeUInt32LE(10, 16)
	if (kind === 'VP8X') { bytes.writeUIntLE(1, 24, 3); bytes.writeUIntLE(2, 27, 3) }
	else if (kind === 'VP8L') { bytes[20] = 0x2f; bytes.writeUInt32LE(1 | (2 << 14), 21) }
	else { bytes.set([0x9d, 0x01, 0x2a], 23); bytes.writeUInt16LE(2, 26); bytes.writeUInt16LE(3, 28) }
	return bytes
}

function tiff(big = false) {
	const bytes = Buffer.alloc(38)
	const u16 = (value, at) => big ? bytes.writeUInt16BE(value, at) : bytes.writeUInt16LE(value, at)
	const u32 = (value, at) => big ? bytes.writeUInt32BE(value, at) : bytes.writeUInt32LE(value, at)
	bytes.write(big ? 'MM' : 'II'); u16(42, 2); u32(8, 4); u16(2, 8)
	u16(256, 10); u16(3, 12); u32(1, 14); u16(2, 18)
	u16(257, 22); u16(4, 24); u32(1, 26); u32(3, 30)
	return bytes
}

function emf() {
	const bytes = Buffer.alloc(88)
	bytes.writeUInt32LE(1, 0); bytes.writeUInt32LE(88, 4); bytes.writeInt32LE(2, 16); bytes.writeInt32LE(3, 20); bytes.write(' EMF', 40)
	return bytes
}

function wmf(placeable) {
	const bytes = Buffer.alloc(placeable ? 40 : 28)
	if (placeable) {
		bytes.writeUInt32LE(0x9ac6cdd7); bytes.writeInt16LE(2, 10); bytes.writeInt16LE(3, 12); bytes.writeUInt16LE(1440, 14)
	} else {
		bytes.set([1, 0, 9, 0]); bytes.writeUInt32LE(14, 6)
		bytes.writeUInt32LE(5, 18); bytes.writeUInt16LE(0x020c, 22); bytes.writeInt16LE(3, 24); bytes.writeInt16LE(2, 26)
	}
	return bytes
}

function attacks() {
	const icns = Buffer.alloc(16)
	icns.write('icns'); icns.writeUInt32BE(16, 4); icns.write('icp4', 8) // zero entry size
	const jxl = Buffer.alloc(20)
	jxl.writeUInt32BE(12); jxl.write('JXL ', 4); jxl.set([13, 10, 135, 10], 8); jxl.write('free', 16)
	const boxes = ['avif', 'heic', 'mif1'].map(brand => {
		const bytes = Buffer.alloc(32)
		bytes.writeUInt32BE(24); bytes.write('ftyp', 4); bytes.write(brand, 8); bytes.write('free', 28)
		return bytes
	})
	const forgedBmp = bmp()
	forgedBmp[0] |= 0x80; forgedBmp[1] |= 0x80; forgedBmp.write('JXL ', 4)
	return [icns, jxl, ...boxes, Buffer.from([0xff, 0x0a, 0, 0]), forgedBmp]
}

if (process.argv.includes('--guarded-hostile-child')) {
	// Exercise the real guarded dependency call in a killable process, not a
	// vulnerable raw detector call in the test runner. No unguarded reproduction.
	for (const bytes of attacks()) for (const mime of ['image/png', 'image/jpeg', 'image/gif', 'image/bmp', 'image/svg+xml', 'image/avif', 'image/heif', 'image/jxl', 'image/icns']) {
		assert.throws(() => inlineImageDimensions(uri(bytes, mime)), error => error instanceof InlineImageValidationError)
	}
	process.exit(0)
}

test('hostile ICNS/JXL/HEIF/AVIF and forged signatures never reach imageSize, regardless of declared MIME', () => {
	let calls = 0
	for (const bytes of attacks()) for (const mime of ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp', 'image/tiff', 'image/svg+xml', 'image/x-emf', 'image/x-wmf', 'image/avif', 'image/heif', 'image/jxl', 'image/icns']) {
		assert.throws(() => inlineImageDimensions(uri(bytes, mime), () => { calls++; throw new Error('Decoder must not execute') }), error => error instanceof InlineImageValidationError)
	}
	assert.equal(calls, 0)
	const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--guarded-hostile-child'], { timeout: 3000, encoding: 'utf8', env: {} })
	assert.equal(child.error, undefined, child.error?.message)
	assert.equal(child.status, 0, child.stderr)
})

test('supported PNG, baseline/progressive JPEG, GIF, BMP and all WebP headers retain existing dimensions', () => {
	for (const [bytes, mime] of [
		[png(), 'image/png'], [jpeg(), 'image/jpeg'], [jpeg(true), 'image/jpeg'], [jpeg(), 'image/jpg'], [jpeg(), 'image/pjpeg'],
		[gif(), 'image/gif'], [bmp(), 'image/bmp'], ...['VP8 ', 'VP8L', 'VP8X'].map(kind => [webp(kind), 'image/webp']),
	]) {
		let calls = 0
		const result = inlineImageDimensions(uri(bytes, mime), data => { calls++; return imageSize(data) })
		assert.deepEqual(result, imageSize(bytes))
		assert.equal(calls, 1)
		assert.deepEqual(inlineImageDimensions(uri(bytes, mime, '')), result, 'Compact native base64 form is preserved')
	}
})

test('TIFF, native metafiles and OS/2 BMP remain supported without unsupported decoder calls', () => {
	for (const [bytes, mime, type] of [
		[tiff(), 'image/tiff', 'tiff'], [tiff(true), 'image/tif', 'tiff'], [emf(), 'image/x-emf', 'emf'],
		[wmf(true), 'image/x-wmf', 'wmf'], [wmf(false), 'image/wmf', 'wmf'], [bmp(true), 'image/bmp', 'bmp'],
	]) {
		assert.deepEqual(inlineImageDimensions(uri(bytes, mime), () => assert.fail('Unexpected buffer decoder')), { width: 2, height: 3, type })
	}
})

test('bounded SVG parsing preserves root dimensions, units, viewBox, XML declarations and quoted attributes', () => {
	for (const [text, width, height] of [
		['<svg xmlns="http://www.w3.org/2000/svg" width="2" height="3"></svg>', 2, 3],
		['\ufeff<?xml version="1.0"?>\n<!-- fixture --><svg viewBox="0 0 2 3"/>', 2, 3],
		['<!-- fixture without declaration --><svg width="2" height="3"/>', 2, 3],
		["<svg data-label='a > b' width='2in' height='3in'/>", 192, 288],
		['<svg viewBox="0,0,2,3" width="100%" height="100%"/>', 2, 3],
		['<svg viewBox="0 0 2 3" width="4"/>', 4, 6],
	]) {
		assert.deepEqual(inlineImageDimensions(uri(Buffer.from(text), 'image/svg+xml'), () => assert.fail('SVG must bypass detector')), { width, height, type: 'svg' })
	}
	for (const text of ['<html><svg width="2" height="3"/></html>', '<svg/>', '<svg width="1" height="0"/>', '<svg width="1" width="2" height="3"/>', '<svg width="NaN" height="1"/>', '<svg width="1e999" height="1"/>', '<svg width="1"' + ' '.repeat(INLINE_IMAGE_LIMITS.maxHeaderBytes) + 'height="1"/>']) {
		assert.throws(() => inlineImageDimensions(uri(Buffer.from(text), 'image/svg+xml'), () => assert.fail('SVG must bypass detector')), error => error instanceof InlineImageValidationError)
	}
})

test('MIME/content mismatches, truncated signatures and malformed supported headers reject before decoding', () => {
	let calls = 0
	const read = () => { calls++; throw new Error('Decoder must not execute') }
	for (const [bytes, mime] of [[png(), 'image/jpeg'], [jpeg(), 'image/png'], [gif(), 'image/webp'], [tiff(), 'image/svg+xml']]) {
		assert.throws(() => inlineImageDimensions(uri(bytes, mime), read), { code: 'INLINE_IMAGE_MIME_MISMATCH' })
	}
	const badPng = png(); badPng.writeUInt32BE(0, 8)
	const badJpeg = jpeg(); badJpeg.writeUInt16BE(0, 4)
	const badWebp = webp('VP8X'); badWebp.writeUInt32LE(0, 16)
	const badTiff = tiff(); badTiff.writeUInt32LE(0xffffffff, 4)
	const badWmf = wmf(false); badWmf.writeUInt32LE(0, 18)
	for (const [bytes, mime] of [[badPng, 'image/png'], [badJpeg, 'image/jpeg'], [badWebp, 'image/webp'], [badTiff, 'image/tiff'], [badWmf, 'image/wmf'], [png().subarray(0, 20), 'image/png'], [gif().subarray(0, 8), 'image/gif'], [Buffer.alloc(0), 'image/png']]) {
		assert.throws(() => inlineImageDimensions(uri(bytes, mime), read), error => error instanceof InlineImageValidationError)
	}
	assert.equal(calls, 0)
})

test('strict base64 and encoded/decoded byte bounds are checked before decode allocation', t => {
	const from = Buffer.from
	let allocations = 0
	const mock = t.mock.method(Buffer, 'from', function (...args) { allocations++; return from(...args) })
	for (const data of [
		'data:image/png;base64,', 'data:image/png;base64,abcde', 'data:image/png;base64,a===',
		'data:image/png;base64,ab_c', 'data:image/png;base64,YQ==junk', 'data:image/png;base64,%00',
		'data:image/png,not-base64', 'data:image/avif;base64,AAAA',
		'data:image/png;base64,' + 'A'.repeat(INLINE_IMAGE_LIMITS.maxEncodedChars + 1),
		'data:image/png;base64,' + 'A'.repeat(INLINE_IMAGE_LIMITS.maxEncodedChars), // predicted bytes exceed 16 MiB
	]) assert.throws(() => inlineImageDimensions(data, () => assert.fail('Unexpected decoder')), error => error instanceof InlineImageValidationError)
	assert.equal(allocations, 0)
	mock.mock.restore()
	const wrapped = uri(png()).replace(';base64,', ';charset=utf-8;base64,\r\n') + '\n'
	assert.deepEqual(inlineImageDimensions(wrapped), imageSize(png()))
	assert.deepEqual(inlineImageDimensions(uri(png()).replace(/=+$/, '')), imageSize(png()))
})

test('side/pixel/invalid dimension bounds reject before imageSize and validate its returned dimensions too', () => {
	for (const [width, height, code] of [[0, 1, 'INLINE_IMAGE_INVALID'], [32769, 1, 'INLINE_IMAGE_DIMENSIONS_EXCEEDED'], [5001, 5000, 'INLINE_IMAGE_DIMENSIONS_EXCEEDED']]) {
		const bytes = png(); bytes.writeUInt32BE(width, 16); bytes.writeUInt32BE(height, 20)
		assert.throws(() => inlineImageDimensions(uri(bytes), () => assert.fail('Out-of-bounds input reached decoder')), { code })
	}
	const limit = png(); limit.writeUInt32BE(5000, 16); limit.writeUInt32BE(5000, 20)
	assert.deepEqual(inlineImageDimensions(uri(limit)), imageSize(limit))
	for (const result of [{ width: Infinity, height: 1 }, { width: 1.5, height: 1 }, { width: 2, height: 2 }, { width: 5001, height: 5000 }]) {
		assert.throws(() => inlineImageDimensions(uri(png()), () => result), error => error instanceof InlineImageValidationError)
	}
})

test('the actual compiler call section preserves framing and propagates typed rejection instead of substituting output', () => {
	const source = fs.readFileSync(new URL('../ir/spec-compiler.mjs', import.meta.url), 'utf8')
	const start = source.indexOf('\nfunction imageOptionsForObject(')
	const end = source.indexOf('\n}', start) + 2
	assert.ok(start > 0 && end > start)
	assert.match(source, /import \{ inlineImageDimensions \} from '\.\/inline-image-dimensions\.mjs'/)
	const functionSource = source.slice(start, end)
	assert.equal(functionSource.includes('imageSize('), false)
	const context = vm.createContext({
		inlineImageDimensions,
		validatePictureImageAdjustments: () => {}, normalizeImageAdjustments: () => null,
		validateImageAssetSource: value => value,
		placeholderOptionsForObject: () => ({}), optionalStyleEffects: () => ({}), animationOptions: () => ({}), rotationOption: () => ({}), flipOptions: () => ({}),
	})
	const compile = vm.runInContext(`(${functionSource})`, context)
	for (const object of [
		{ data: uri(png()) }, { data: uri(png(), 'image/png', '') }, { image: uri(png()) },
		{ source: { kind: 'inline', data: uri(png()), format: 'png' } },
	]) {
		const output = compile({ ...object, objectName: 'fixture', rect: { x: 1, y: 1, w: 2, h: 2 } }, new Map(), {})
		assert.equal(output._imageSourceW, 1)
		assert.equal(output._imageSourceH, 1)
		assert.equal(output.data || output.source.data, object.data || object.image || object.source.data)
	}
	for (const bytes of attacks()) {
		assert.throws(() => compile({ data: uri(bytes) }, new Map(), {}), error => error instanceof InlineImageValidationError)
	}
})
