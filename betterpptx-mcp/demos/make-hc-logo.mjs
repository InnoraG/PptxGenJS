// Generate a stand-in HC-logo PNG with the same blue/teal/green palette as the
// real "Home Cleaning HC" logo, so the theme.from_image MCP tool has a real
// image to sample. ~96×96 px is plenty.

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as zlib from 'node:zlib'

const W = 96, H = 96

// Logo palette (HC home-cleaning brand)
const C_WHITE = [255, 255, 255]
const C_BLUE  = [32, 102, 200]   // deep brand blue
const C_AZURE = [56, 158, 220]   // softer brand blue
const C_TEAL  = [42, 178, 184]   // teal accent
const C_GREEN = [124, 194, 66]   // brand green (leaves)
const C_DARK  = [13, 76, 122]    // shaded dark blue

// 96×96 buffer of RGB pixels
const px = Buffer.alloc(W * H * 3)
function setPx(x, y, c) {
	if (x < 0 || y < 0 || x >= W || y >= H) return
	const i = (y * W + x) * 3
	px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]
}
function fillRect(x0, y0, x1, y1, c) {
	for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) setPx(x, y, c)
}
function fillDisk(cx, cy, r, c) {
	for (let y = cy - r; y <= cy + r; y++)
		for (let x = cx - r; x <= cx + r; x++)
			if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) setPx(x, y, c)
}

// White background
fillRect(0, 0, W, H, C_WHITE)

// Outer brand ring (very subtle teal halo)
for (let y = 0; y < H; y++)
	for (let x = 0; x < W; x++) {
		const d = Math.sqrt((x - W / 2) ** 2 + (y - H / 2) ** 2)
		if (d > 30 && d < 44) {
			const t = (d - 30) / 14
			const c = t < 0.5 ? C_BLUE : C_TEAL
			setPx(x, y, c)
		}
	}

// House silhouette (top-left quadrant) — blue
fillRect(20, 26, 38, 42, C_BLUE)
// Roof
for (let y = 18; y < 26; y++) {
	const half = (y - 18)
	for (let x = 29 - half - 6; x < 29 + half + 6; x++) setPx(x, y, C_BLUE)
}
// Window
fillRect(26, 32, 32, 38, C_AZURE)

// Squeegee head (right side) — teal
fillRect(58, 22, 78, 28, C_TEAL)
fillRect(68, 28, 70, 36, C_DARK)
// Sparkles next to squeegee
fillDisk(62, 36, 2, C_AZURE)
fillDisk(72, 40, 2, C_AZURE)
fillDisk(58, 44, 1, C_AZURE)

// Leaves at the bottom — green
fillDisk(28, 70, 6, C_GREEN)
fillDisk(38, 76, 5, C_GREEN)
fillDisk(48, 78, 4, C_GREEN)

// Shield at bottom-right — teal/dark
for (let y = 60; y < 80; y++) {
	const w = (y < 76) ? 10 : 10 - (y - 76) * 2
	for (let x = 65 - w; x < 65 + w; x++) setPx(x, y, C_TEAL)
}
fillRect(63, 64, 67, 74, C_WHITE)
fillRect(64, 65, 66, 73, C_DARK)

// "H" letter centre
for (let y = 36; y < 60; y++) {
	setPx(44, y, C_BLUE); setPx(45, y, C_BLUE)
	setPx(54, y, C_BLUE); setPx(55, y, C_BLUE)
}
for (let x = 44; x < 56; x++) {
	setPx(x, 47, C_BLUE); setPx(x, 48, C_BLUE)
}
// "C" letter (right of H, partly overlapping ring)
for (let y = 40; y < 60; y++) {
	const cx = 64, cy = 50, r = 10
	for (let x = cx - r; x <= cx + 2; x++) {
		if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r &&
			(x - cx) ** 2 + (y - cy) ** 2 >= (r - 2) ** 2) setPx(x, y, C_TEAL)
	}
}

// =====================================================================
//  Encode as PNG
// =====================================================================
function crc32(buf) {
	let table = []
	for (let n = 0; n < 256; n++) {
		let c = n
		for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
		table[n] = c >>> 0
	}
	let c = 0xFFFFFFFF
	for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xFF] ^ (c >>> 8)
	return (c ^ 0xFFFFFFFF) >>> 0
}

function chunk(type, data) {
	const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0)
	const t = Buffer.from(type, 'ascii')
	const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0)
	return Buffer.concat([len, t, data, crc])
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4)
ihdr[8] = 8        // bit depth
ihdr[9] = 2        // colour type 2 = truecolour RGB
ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
// Filter byte 0 (none) at the start of each scanline
const scanlines = Buffer.alloc(H * (1 + W * 3))
for (let y = 0; y < H; y++) {
	scanlines[y * (1 + W * 3)] = 0
	px.copy(scanlines, y * (1 + W * 3) + 1, y * W * 3, (y + 1) * W * 3)
}
const idat = zlib.deflateSync(scanlines)
const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
const png = Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])

const outPath = path.resolve('outputs/hc-logo.png')
fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, png)
console.log(`wrote ${outPath} (${png.length} bytes, ${W}×${H} px)`)
