/**
 * Canonical package media typing and lightweight signature validation.
 *
 * Package part names, content types, and payload bytes must agree.  Keeping
 * this logic here prevents image, media, poster, and fill call sites from
 * independently guessing extensions from untrusted strings.
 */

export type PackageMediaKind = 'image' | 'audio' | 'video'

export interface PackageMediaType {
	extn: string
	mimeType: string
	kind: PackageMediaKind
}

const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
	png: 'image/png',
	jpeg: 'image/jpeg',
	gif: 'image/gif',
	svg: 'image/svg+xml',
	webp: 'image/webp',
	bmp: 'image/bmp',
	tiff: 'image/tiff',
	emf: 'image/x-emf',
	wmf: 'image/x-wmf',
}

const MEDIA_MIME_BY_EXTENSION: Record<string, string> = {
	mp3: 'audio/mpeg',
	m4a: 'audio/mp4',
	wav: 'audio/wav',
	ogg: 'audio/ogg',
	wma: 'audio/x-ms-wma',
	mp4: 'video/mp4',
	m4v: 'video/mp4',
	mov: 'video/quicktime',
	webm: 'video/webm',
	wmv: 'video/x-ms-wmv',
}

function cleanExtension(value: unknown): string {
	let extension = String(value || '').trim().toLowerCase()
	while (extension.startsWith('.')) extension = extension.slice(1)
	for (const delimiter of ['?', '#', ';', ',']) {
		const index = extension.indexOf(delimiter)
		if (index >= 0) extension = extension.slice(0, index)
	}
	if (extension === 'jpg' || extension === 'pjpeg') return 'jpeg'
	if (extension === 'svg+xml') return 'svg'
	if (extension === 'tif') return 'tiff'
	if (extension === 'mpeg') return 'mp3'
	if (extension === 'quicktime') return 'mov'
	return extension
}

function extensionFromPath(sourcePath: string): string {
	let cleanPath = String(sourcePath || '')
	for (const delimiter of ['?', '#']) {
		const index = cleanPath.indexOf(delimiter)
		if (index >= 0) cleanPath = cleanPath.slice(0, index)
	}
	const slash = Math.max(cleanPath.lastIndexOf('/'), cleanPath.lastIndexOf('\\'))
	const fileName = cleanPath.slice(slash + 1)
	const dot = fileName.lastIndexOf('.')
	return cleanExtension(dot >= 0 ? fileName.slice(dot + 1) : '')
}

function mimeFromDataHeader(data: string): string {
	const comma = String(data || '').indexOf(',')
	const header = String(data || '').slice(0, comma >= 0 ? comma : undefined).trim().toLowerCase()
	const withoutPrefix = header.startsWith('data:') ? header.slice(5) : header
	return withoutPrefix.split(';', 1)[0].trim()
}

function imageExtensionFromMime(mimeType: string): string {
	const mime = String(mimeType || '').toLowerCase()
	if (mime === 'image/jpeg' || mime === 'image/jpg' || mime === 'image/pjpeg') return 'jpeg'
	if (mime === 'image/svg+xml') return 'svg'
	if (mime === 'image/tif' || mime === 'image/tiff') return 'tiff'
	if (mime === 'image/x-emf' || mime === 'image/emf') return 'emf'
	if (mime === 'image/x-wmf' || mime === 'image/wmf') return 'wmf'
	return mime.startsWith('image/') ? cleanExtension(mime.slice('image/'.length)) : ''
}

function mediaExtensionFromMime(mimeType: string, kind: 'audio' | 'video'): string {
	const mime = String(mimeType || '').toLowerCase()
	if (kind === 'audio') {
		if (mime === 'audio/mpeg' || mime === 'audio/mp3') return 'mp3'
		if (mime === 'audio/mp4' || mime === 'audio/m4a' || mime === 'audio/x-m4a') return 'm4a'
		if (mime === 'audio/wav' || mime === 'audio/wave' || mime === 'audio/x-wav') return 'wav'
		if (mime === 'audio/ogg') return 'ogg'
		if (mime === 'audio/x-ms-wma') return 'wma'
	} else {
		if (mime === 'video/mp4') return 'mp4'
		if (mime === 'video/x-m4v') return 'm4v'
		if (mime === 'video/quicktime') return 'mov'
		if (mime === 'video/webm') return 'webm'
		if (mime === 'video/x-ms-wmv') return 'wmv'
	}
	return ''
}

function decodeBase64Data(data: string): Uint8Array {
	const text = String(data || '')
	const comma = text.indexOf(',')
	if (comma < 0 || !text.slice(0, comma).toLowerCase().includes(';base64')) {
		throw new Error('Media data must be a base64 data URI.')
	}
	const encoded = text.slice(comma + 1).replace(/\s/g, '')
	if (!encoded) throw new Error('Media data payload is empty.')
	if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(encoded, 'base64'))
	const binary = atob(encoded)
	const bytes = new Uint8Array(binary.length)
	for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
	return bytes
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
	let value = ''
	for (let index = start; index < Math.min(end, bytes.length); index++) value += String.fromCharCode(bytes[index])
	return value
}

function begins(bytes: Uint8Array, values: number[]): boolean {
	return values.every((value, index) => bytes[index] === value)
}

function sniffExtensions(bytes: Uint8Array): string[] {
	if (bytes.length >= 8 && begins(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return ['png']
	if (bytes.length >= 3 && begins(bytes, [0xff, 0xd8, 0xff])) return ['jpeg']
	if (bytes.length >= 6 && (ascii(bytes, 0, 6) === 'GIF87a' || ascii(bytes, 0, 6) === 'GIF89a')) return ['gif']
	if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return ['webp']
	if (bytes.length >= 2 && ascii(bytes, 0, 2) === 'BM') return ['bmp']
	if (bytes.length >= 4 && (begins(bytes, [0x49, 0x49, 0x2a, 0x00]) || begins(bytes, [0x4d, 0x4d, 0x00, 0x2a]))) return ['tiff']
	if (bytes.length >= 44 && begins(bytes, [0x01, 0x00, 0x00, 0x00]) && ascii(bytes, 40, 44) === ' EMF') return ['emf']
	if (bytes.length >= 4 && (begins(bytes, [0xd7, 0xcd, 0xc6, 0x9a]) || begins(bytes, [0x01, 0x00, 0x09, 0x00]))) return ['wmf']

	let start = 0
	if (bytes.length >= 3 && begins(bytes, [0xef, 0xbb, 0xbf])) start = 3
	while (start < bytes.length && [0x09, 0x0a, 0x0d, 0x20].includes(bytes[start])) start++
	const xmlHead = ascii(bytes, start, Math.min(bytes.length, start + 1024)).toLowerCase()
	if (xmlHead.startsWith('<svg') || (xmlHead.startsWith('<?xml') && xmlHead.includes('<svg'))) return ['svg']

	if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WAVE') return ['wav']
	if (bytes.length >= 4 && ascii(bytes, 0, 4) === 'OggS') return ['ogg']
	if (bytes.length >= 3 && ascii(bytes, 0, 3) === 'ID3') return ['mp3']
	if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return ['mp3']
	if (bytes.length >= 12 && ascii(bytes, 4, 8) === 'ftyp') return ['mp4', 'm4v', 'm4a', 'mov']
	if (bytes.length >= 4 && begins(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return ['webm']
	if (bytes.length >= 16 && begins(bytes, [0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11, 0xa6, 0xd9, 0x00, 0xaa, 0x00, 0x62, 0xce, 0x6c])) return ['wma', 'wmv']
	return []
}

export function assertPackageMediaBytes(bytes: Uint8Array | ArrayBuffer, expected: Pick<PackageMediaType, 'extn' | 'mimeType'>, context = 'media'): void {
	const payload = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
	const extensions = sniffExtensions(payload)
	const expectedExtension = cleanExtension(expected.extn)
	if (!extensions.length || !extensions.includes(expectedExtension)) {
		throw new Error(`${context} payload does not match declared ${expected.mimeType || expectedExtension} package type.`)
	}
}

export function assertPackageMediaData(data: string, expected: Pick<PackageMediaType, 'extn' | 'mimeType'>, context = 'media'): void {
	assertPackageMediaBytes(decodeBase64Data(data), expected, context)
}

export function resolveImagePackageType(data = '', imagePath = ''): PackageMediaType {
	const dataMime = data ? mimeFromDataHeader(data) : ''
	const dataExtension = dataMime ? imageExtensionFromMime(dataMime) : ''
	const pathExtension = imagePath ? extensionFromPath(imagePath) : ''
	const extn = dataExtension || pathExtension || 'png'
	const mimeType = IMAGE_MIME_BY_EXTENSION[extn]
	if (!mimeType || (dataMime && !dataExtension)) throw new Error(`Unsupported image package type '${dataMime || pathExtension || extn}'.`)
	if (dataExtension && pathExtension && dataExtension !== pathExtension) {
		throw new Error(`Image data type ${dataMime} does not match path extension .${pathExtension}.`)
	}
	const result = { extn, mimeType, kind: 'image' as const }
	if (data) assertPackageMediaData(data, result, 'image')
	return result
}

export function resolveAudioVideoPackageType(type: string, explicitExtension: unknown, data = '', mediaPath = ''): PackageMediaType {
	const kind: 'audio' | 'video' = String(type).toLowerCase() === 'video' ? 'video' : 'audio'
	const explicit = cleanExtension(explicitExtension)
	const dataMime = data ? mimeFromDataHeader(data) : ''
	const fromData = dataMime ? mediaExtensionFromMime(dataMime, kind) : ''
	const fromPath = mediaPath ? extensionFromPath(mediaPath) : ''
	const extn = explicit || fromData || fromPath || (kind === 'video' ? 'mp4' : 'mp3')
	const mimeType = MEDIA_MIME_BY_EXTENSION[extn]
	if (!mimeType || !mimeType.startsWith(`${kind}/`) || (dataMime && !fromData)) {
		throw new Error(`Unsupported ${kind} package type '${dataMime || explicit || fromPath || extn}'.`)
	}
	for (const [source, extension] of [['data', fromData], ['path', fromPath]] as Array<[string, string]>) {
		if (extension && explicit && extension !== explicit) throw new Error(`${kind} ${source} type .${extension} does not match explicit extension .${explicit}.`)
	}
	if (fromData && fromPath && fromData !== fromPath) throw new Error(`${kind} data type ${dataMime} does not match path extension .${fromPath}.`)
	const result = { extn, mimeType, kind }
	if (data) assertPackageMediaData(data, result, kind)
	return result
}
