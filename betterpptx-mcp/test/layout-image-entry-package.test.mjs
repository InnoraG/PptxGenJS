import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import test from 'node:test'
import JSZip from 'jszip'

const require = createRequire(import.meta.url)
const PptxGenJS = require('../../dist/pptxgen.cjs.js')

const EMU_PER_INCH = 914400
const PNG_DATA = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAARklEQVR4nO3XQREAMAgDwSqIfwMRhwrqov3sgz8zQLg76ezPOhqIEdQSjjNcQRRRXM9ovOMFJIFkBaUDy5eYhJqVnM5zPb+Oa2yXkEs5uwAAAABJRU5ErkJggg=='
const PNG_BYTES = Buffer.from(PNG_DATA.slice(PNG_DATA.indexOf(',') + 1), 'base64')
const PNG_SHA256 = crypto.createHash('sha256').update(PNG_BYTES).digest('hex')

const PLACEHOLDERS = Object.freeze([
	Object.freeze({
		name: 'clipArtZero',
		idx: 0,
		size: 'half',
		orient: 'vert',
		hasCustomPrompt: true,
		x: 0.7,
		y: 1.1,
		w: 5.2,
		h: 4.6,
	}),
	Object.freeze({
		name: 'clipArtSeven',
		idx: 7,
		size: 'quarter',
		orient: 'horz',
		hasCustomPrompt: false,
		x: 7.1,
		y: 1.4,
		w: 4.8,
		h: 3.2,
	}),
])

function decodeXmlAttribute(value = '') {
	return value
		.replaceAll('&quot;', '"')
		.replaceAll('&apos;', "'")
		.replaceAll('&lt;', '<')
		.replaceAll('&gt;', '>')
		.replaceAll('&amp;', '&')
}

function parseAttributes(source = '') {
	return Object.fromEntries(
		[...source.matchAll(/([A-Za-z_][\w:.-]*)="([^"]*)"/g)]
			.map(match => [match[1], decodeXmlAttribute(match[2])]),
	)
}

function elementBlocks(xml, tagName) {
	const pattern = new RegExp(`<${tagName}\\b[\\s\\S]*?<\\/${tagName}>`, 'g')
	return [...xml.matchAll(pattern)].map(match => match[0])
}

function placeholderTuple(block) {
	const match = block.match(/<p:ph\b([^>]*)\/>/)
	assert.ok(match, 'expected a self-closing p:ph element')
	const attrs = parseAttributes(match[1])
	return {
		type: attrs.type,
		idx: attrs.idx,
		sz: attrs.sz,
		orient: attrs.orient,
		hasCustomPrompt: attrs.hasCustomPrompt,
	}
}

function geometryTuple(block) {
	const transform = block.match(/<a:xfrm\b[^>]*>[\s\S]*?<a:off\b([^>]*)\/>[\s\S]*?<a:ext\b([^>]*)\/>[\s\S]*?<\/a:xfrm>/)
	assert.ok(transform, 'expected an a:xfrm with a:off and a:ext')
	const off = parseAttributes(transform[1])
	const ext = parseAttributes(transform[2])
	return { x: off.x, y: off.y, cx: ext.cx, cy: ext.cy }
}

function expectedGeometry(definition) {
	return {
		x: String(Math.round(definition.x * EMU_PER_INCH)),
		y: String(Math.round(definition.y * EMU_PER_INCH)),
		cx: String(Math.round(definition.w * EMU_PER_INCH)),
		cy: String(Math.round(definition.h * EMU_PER_INCH)),
	}
}

function relationships(xml) {
	return [...xml.matchAll(/<Relationship\b([^>]*)\/>/g)].map(match => parseAttributes(match[1]))
}

function resolveRelationshipTarget(sourcePart, target) {
	return path.posix.normalize(path.posix.join(path.posix.dirname(sourcePart), decodeXmlAttribute(target))).replace(/^\/+/, '')
}

function relationshipPartFor(sourcePart) {
	return path.posix.join(path.posix.dirname(sourcePart), '_rels', `${path.posix.basename(sourcePart)}.rels`)
}

function proofOutputPath() {
	const raw = process.env.BETTERPPTX_LAYOUT_IMAGE_ENTRY_PROOF_OUTPUT?.trim()
	if (!raw) return null
	if (['1', 'true', 'yes'].includes(raw.toLowerCase())) {
		return path.resolve('validation-output/layout-image-entry/clipart-add-image-package-proof.pptx')
	}
	const resolved = path.resolve(raw)
	return path.extname(resolved).toLowerCase() === '.pptx'
		? resolved
		: path.join(resolved, 'clipart-add-image-package-proof.pptx')
}

test('clipArt layout placeholders and matching pictures form a closed native package', async () => {
	const pptx = new PptxGenJS()
	pptx.layout = 'LAYOUT_WIDE'
	pptx.defineSlideMaster({
		title: 'CLIPART_PACKAGE_LAYOUT',
		objects: PLACEHOLDERS.map(definition => ({
			placeholder: {
				options: {
					name: definition.name,
					type: 'clipArt',
					idx: definition.idx,
					sz: definition.size,
					orient: definition.orient,
					hasCustomPrompt: definition.hasCustomPrompt,
					x: definition.x,
					y: definition.y,
					w: definition.w,
					h: definition.h,
				},
				text: '',
			},
		})),
	})
	const slide = pptx.addSlide({ masterName: 'CLIPART_PACKAGE_LAYOUT' })
	for (const definition of PLACEHOLDERS) {
		slide.addImage({
			data: PNG_DATA,
			x: definition.x,
			y: definition.y,
			w: definition.w,
			h: definition.h,
			objectName: `${definition.name}-picture`,
			phType: 'clipArt',
			phIdx: definition.idx,
			phSz: definition.size,
			phOrient: definition.orient,
			phHasCustomPrompt: definition.hasCustomPrompt,
		})
	}

	const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-layout-image-package-'))
	const filePath = path.join(tempDirectory, 'clipart-add-image-package.pptx')
	try {
		await pptx.writeFile({ fileName: filePath, compression: false })
		const proofPath = proofOutputPath()
		if (proofPath) {
			await fs.mkdir(path.dirname(proofPath), { recursive: true })
			await fs.copyFile(filePath, proofPath)
		}

		const zip = await JSZip.loadAsync(await fs.readFile(filePath), { checkCRC32: true })
		const slidePart = 'ppt/slides/slide1.xml'
		const slideRelsPart = relationshipPartFor(slidePart)
		const slideXml = await zip.file(slidePart)?.async('string')
		const slideRelsXml = await zip.file(slideRelsPart)?.async('string')
		assert.ok(slideXml, 'slide XML must exist')
		assert.ok(slideRelsXml, 'slide relationships must exist')

		const slideRelationships = relationships(slideRelsXml)
		const layoutRelationship = slideRelationships.find(rel => rel.Type?.endsWith('/slideLayout'))
		assert.ok(layoutRelationship, 'slide must retain its authored layout relationship')
		const layoutPart = resolveRelationshipTarget(slidePart, layoutRelationship.Target)
		const layoutXml = await zip.file(layoutPart)?.async('string')
		assert.ok(layoutXml, `resolved layout target must exist: ${layoutPart}`)
		assert.match(layoutXml, /CLIPART_PACKAGE_LAYOUT|clipArtZero/)

		const layoutBlocks = elementBlocks(layoutXml, 'p:sp')
		for (const definition of PLACEHOLDERS) {
			const block = layoutBlocks.find(candidate => candidate.includes(`Placeholder ${definition.name}`))
			assert.ok(block, `layout p:sp must exist for ${definition.name}`)
			assert.match(block, /<p:nvSpPr>[\s\S]*?<p:nvPr>\s*<p:ph\b[\s\S]*?<\/p:nvPr>[\s\S]*?<\/p:nvSpPr>/)
			assert.deepEqual(placeholderTuple(block), {
				type: 'clipArt',
				idx: definition.idx === 0 ? undefined : String(definition.idx),
				sz: definition.size,
				orient: undefined,
				hasCustomPrompt: definition.hasCustomPrompt ? '1' : undefined,
			})
			assert.deepEqual(geometryTuple(block), expectedGeometry(definition))
		}

		const pictureBlocks = elementBlocks(slideXml, 'p:pic')
		assert.equal(pictureBlocks.length, PLACEHOLDERS.length, 'slide must contain exactly the two authored pictures')
		for (const definition of PLACEHOLDERS) {
			const block = pictureBlocks.find(candidate => candidate.includes(`${definition.name}-picture`))
			assert.ok(block, `slide p:pic must exist for clipArt idx ${definition.idx}`)
			assert.match(block, /<p:nvPicPr>[\s\S]*?<p:nvPr>\s*<p:ph\b[\s\S]*?<\/p:nvPr>[\s\S]*?<\/p:nvPicPr>/)
			assert.match(block, /<p:cNvPicPr><a:picLocks[^>]*noGrp="1"[^>]*noChangeAspect="1"\/><\/p:cNvPicPr>/)
			assert.deepEqual(placeholderTuple(block), {
				type: 'clipArt',
				idx: definition.idx === 0 ? undefined : String(definition.idx),
				sz: definition.size,
				orient: undefined,
				hasCustomPrompt: definition.hasCustomPrompt ? '1' : undefined,
			})
			assert.deepEqual(geometryTuple(block), expectedGeometry(definition))
		}

		for (const rel of slideRelationships.filter(rel => rel.TargetMode !== 'External')) {
			const targetPart = resolveRelationshipTarget(slidePart, rel.Target)
			assert.ok(zip.file(targetPart), `slide relationship ${rel.Id} target must exist: ${targetPart}`)
		}

		const layoutRelsPart = relationshipPartFor(layoutPart)
		const layoutRelsXml = await zip.file(layoutRelsPart)?.async('string')
		assert.ok(layoutRelsXml, 'custom layout relationships must exist')
		const layoutRelationships = relationships(layoutRelsXml)
		const masterRelationship = layoutRelationships.find(rel => rel.Type?.endsWith('/slideMaster'))
		assert.ok(masterRelationship, 'custom layout must retain a slide-master relationship')
		for (const rel of layoutRelationships.filter(rel => rel.TargetMode !== 'External')) {
			const targetPart = resolveRelationshipTarget(layoutPart, rel.Target)
			assert.ok(zip.file(targetPart), `layout relationship ${rel.Id} target must exist: ${targetPart}`)
		}

		const imageRelationships = slideRelationships.filter(rel => rel.Type?.endsWith('/image'))
		assert.equal(imageRelationships.length, PLACEHOLDERS.length, 'each picture must own an image relationship')
		const imageRelationshipIds = imageRelationships.map(rel => rel.Id).sort()
		const embeddedRelationshipIds = [...slideXml.matchAll(/<a:blip\b[^>]*r:embed="([^"]+)"/g)].map(match => match[1]).sort()
		assert.deepEqual(embeddedRelationshipIds, imageRelationshipIds, 'every picture blip must resolve through its image relationship')

		const mediaParts = []
		for (const rel of imageRelationships) {
			const mediaPart = resolveRelationshipTarget(slidePart, rel.Target)
			const media = await zip.file(mediaPart)?.async('nodebuffer')
			assert.ok(media, `image relationship ${rel.Id} target must exist: ${mediaPart}`)
			assert.equal(crypto.createHash('sha256').update(media).digest('hex'), PNG_SHA256, `${mediaPart} must retain the authored PNG bytes`)
			mediaParts.push(mediaPart)
		}
		const packagedMediaParts = Object.keys(zip.files).filter(name => name.startsWith('ppt/media/') && !name.endsWith('/')).sort()
		assert.deepEqual(packagedMediaParts, [...new Set(mediaParts)].sort(), 'package must contain no orphan or missing media parts')

		const contentTypesXml = await zip.file('[Content_Types].xml')?.async('string')
		assert.ok(contentTypesXml, 'package content types must exist')
		const defaultTypes = new Map(
			[...contentTypesXml.matchAll(/<Default\b([^>]*)\/>/g)].map(match => {
				const attrs = parseAttributes(match[1])
				return [attrs.Extension?.toLowerCase(), attrs.ContentType]
			}),
		)
		const overrideTypes = new Map(
			[...contentTypesXml.matchAll(/<Override\b([^>]*)\/>/g)].map(match => {
				const attrs = parseAttributes(match[1])
				return [attrs.PartName, attrs.ContentType]
			}),
		)
		for (const mediaPart of mediaParts) {
			const contentType = overrideTypes.get(`/${mediaPart}`) || defaultTypes.get(path.posix.extname(mediaPart).slice(1).toLowerCase())
			assert.equal(contentType, 'image/png', `${mediaPart} must resolve to the PNG content type`)
		}
	} finally {
		await fs.rm(tempDirectory, { recursive: true, force: true })
	}
})
