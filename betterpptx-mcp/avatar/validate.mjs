import * as fs from 'node:fs/promises'
import path from 'node:path'
import JSZip from 'jszip'
import { DOMParser } from '@xmldom/xmldom'

function localName(node) {
	return String(node?.localName || node?.nodeName || '').split(':').pop()
}
function descendants(node, name) {
	const out = []
	const walk = current => {
		if (!current) return
		if (current.nodeType === 1 && localName(current) === name) out.push(current)
		for (let i = 0; current.childNodes && i < current.childNodes.length; i++) walk(current.childNodes[i])
	}
	walk(node)
	return out
}
function shapeBox(pic) {
	const xfrm = descendants(pic, 'xfrm')[0]
	const off = descendants(xfrm, 'off')[0]
	const ext = descendants(xfrm, 'ext')[0]
	if (!off || !ext) return null
	const box = { x: Number(off.getAttribute('x')), y: Number(off.getAttribute('y')), cx: Number(ext.getAttribute('cx')), cy: Number(ext.getAttribute('cy')) }
	return Object.values(box).every(Number.isFinite) ? box : null
}
function sameBox(a, b) {
	return Boolean(a && b) && ['x', 'y', 'cx', 'cy'].every(key => Number(a[key]) === Number(b[key]))
}

function notesTextFromXml(xml) {
	if (!xml) return ''
	try {
		const doc = new DOMParser().parseFromString(xml, 'text/xml')
		const shapes = descendants(doc.documentElement, 'sp')
		const bodyShape = shapes.find(shape => descendants(shape, 'ph').some(ph => String(ph.getAttribute('type') || '').toLowerCase() === 'body'))
		if (!bodyShape) return ''
		return descendants(bodyShape, 'p').map(paragraph =>
			descendants(paragraph, 't').map(run => String(run.textContent || '')).join(''))
			.join('\n')
			.trim()
	} catch {
		return ''
	}
}

async function slideNotesText(zip, relsXml, slidePath) {
	try {
		const doc = new DOMParser().parseFromString(relsXml || '', 'text/xml')
		const rel = descendants(doc.documentElement, 'Relationship')
			.find(node => String(node.getAttribute('Type') || '').endsWith('/notesSlide'))
		if (!rel) return { present: false, text: '' }
		const target = String(rel.getAttribute('Target') || '')
		const notesPath = path.posix.normalize(path.posix.join(path.posix.dirname(slidePath), target))
		const xml = await zip.file(notesPath)?.async('string') || ''
		return { present: Boolean(xml), text: notesTextFromXml(xml), path: notesPath }
	} catch {
		return { present: false, text: '' }
	}
}

const EMU_PER_INCH = 914400
const DEFAULT_FRAME_TOLERANCE_IN = 0.01
const DEFAULT_ACCEPTED_FRAME_CONTRACT = Object.freeze({
	shape: 'ellipse',
	crop: 'centered-cover',
	canonicalWindowIn: Object.freeze({ x: 10.993, y: 5.160, w: 2.25, h: 2.25 }),
	toleranceIn: DEFAULT_FRAME_TOLERANCE_IN,
})

function approximately(actual, expected, tolerance = DEFAULT_FRAME_TOLERANCE_IN) {
	return Number.isFinite(actual) && Number.isFinite(expected) && Math.abs(actual - expected) <= tolerance
}

function contractFor(manifest = null) {
	if (!manifest || typeof manifest !== 'object') return null
	return manifest.playbackContract || manifest.avatarPlaybackContract || manifest.contract || null
}

function expectedFrameContract(manifest = null, entry = null) {
	const contract = contractFor(manifest)
	const authored = entry?.talkingHeadFrame || entry?.frameContract || contract?.talkingHeadFrame || contract?.frame
	if (!authored) return DEFAULT_ACCEPTED_FRAME_CONTRACT
	return {
		...DEFAULT_ACCEPTED_FRAME_CONTRACT,
		...authored,
		canonicalWindowIn: authored.canonicalWindowIn
			? { ...DEFAULT_ACCEPTED_FRAME_CONTRACT.canonicalWindowIn, ...authored.canonicalWindowIn }
			: DEFAULT_ACCEPTED_FRAME_CONTRACT.canonicalWindowIn,
	}
}

export async function validateAvatarNarrationPackage(filePath, manifest = null) {
	const buf = await fs.readFile(filePath)
	const zip = await JSZip.loadAsync(buf)
	const files = Object.keys(zip.files)
	const issues = []
	const mediaParts = files.filter(n => /^ppt\/media\/.+\.mp4$/i.test(n))
	const contentTypes = await zip.file('[Content_Types].xml')?.async('string') || ''
	if (!/Extension="mp4"\s+ContentType="video\/mp4"/i.test(contentTypes)) issues.push('[Content_Types].xml missing mp4 video content type')
	if (manifest?.slides?.length && mediaParts.length < manifest.slides.length) {
		issues.push(`Expected at least ${manifest.slides.length} mp4 media parts, found ${mediaParts.length}`)
	}
	const slideEntries = manifest?.slides?.length
		? manifest.slides
		: files.filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).map(n => ({ slideIndex: Number(n.match(/slide(\d+)\.xml$/)[1]) - 1 }))
	const playbackContract = contractFor(manifest)
	const requireAutoplay = playbackContract?.requireAutoplay === true || manifest?.requireAutoplay === true
	const requireNativeNarrationMarker = playbackContract?.requireNativeNarrationMarker === true
	const requireNarrationNotes = playbackContract?.requireNarrationNotes === true || playbackContract?.requireBetterPptxNarrationNotes === true
	const requireCanonicalNarrationRubric = playbackContract?.requireBetterPptxNarrationNotes === true
	const perSlide = []
	for (const entry of slideEntries) {
		const slideNum = Number(entry.slideIndex) + 1
		const slidePath = `ppt/slides/slide${slideNum}.xml`
		const relsPath = `ppt/slides/_rels/slide${slideNum}.xml.rels`
		const xml = await zip.file(slidePath)?.async('string') || ''
		const rels = await zip.file(relsPath)?.async('string') || ''
		const slideIssues = []
		const hasVideoFile = /<a:videoFile\b/.test(xml)
		const hasP14Media = /<p14:media\b/.test(xml)
		const hasVideoNode = /<p:video\b/.test(xml)
		const hasMediaCall = /presetClass="mediacall"/.test(xml) && /cmd="playFrom\(0\.0\)"/.test(xml)
		const hasVideoRel = /relationships\/video"/.test(rels)
		const hasMediaRel = /relationships\/media"/.test(rels)
		const hasPosterRel = /relationships\/image"/.test(rels) && /Target="\.\.\/media\/image-[^"]+\.png"/.test(rels)
		const hasNativeNarrationMarker = /<p15:isNarration\b[^>]*\bval="1"/.test(xml)
		const hasInteractivePause = /nodeType="interactiveSeq"/.test(xml) && /cmd="togglePause"/.test(xml)
		const notes = await slideNotesText(zip, rels, slidePath)
		const canonicalNarrationMatch = notes.text.match(/(^|\n)[ \t]*\[BetterPPTX-narration\][ \t]*\n([\s\S]*\S)[ \t]*$/i)
		const legacyNarrationMatch = notes.text.match(/(^|\n)[ \t]*\[narration\][ \t]*\n([\s\S]*\S)[ \t]*$/i)
		const hasCanonicalNarrationRubric = Boolean(canonicalNarrationMatch)
		const hasLegacyNarrationRubric = Boolean(legacyNarrationMatch)
		const hasNarrationNotes = hasCanonicalNarrationRubric || hasLegacyNarrationRubric
		const adv = Number((xml.match(/\badvTm="(\d+)"/) || [])[1] || 0)
		const hasAdvClick0 = /\badvClick="0"/.test(xml)
		if (!hasVideoFile) slideIssues.push('missing a:videoFile')
		if (!hasP14Media) slideIssues.push('missing p14:media')
		if (!hasVideoNode) slideIssues.push('missing p:video timing node')
		if (!hasMediaCall) slideIssues.push('missing mediacall playFrom(0.0)')
		if (!hasInteractivePause) slideIssues.push('missing native interactiveSeq/togglePause playback control')
		if (!hasVideoRel) slideIssues.push('missing video relationship')
		if (!hasMediaRel) slideIssues.push('missing media relationship')
		if (!hasPosterRel) slideIssues.push('missing png poster image relationship')
		if (requireNativeNarrationMarker && !hasNativeNarrationMarker) slideIssues.push('missing native p15:isNarration marker')
		if (requireNarrationNotes && !notes.present) slideIssues.push('missing native notes slide')
		if (requireNarrationNotes && !hasNarrationNotes) slideIssues.push('missing final narration notes rubric')
		if (requireCanonicalNarrationRubric && !hasCanonicalNarrationRubric) slideIssues.push('missing final [BetterPPTX-narration] block')
		if (!hasAdvClick0) slideIssues.push('missing advClick="0"')
		if (!adv) slideIssues.push('missing advTm')
		if (requireAutoplay && (!hasAdvClick0 || !adv)) slideIssues.push('autoplay timing contract is incomplete')
		if (entry.durationMs && adv && adv < entry.durationMs) slideIssues.push(`advTm ${adv} is shorter than avatar video ${entry.durationMs}`)
		// Director-level frame proof: the visible talking head must be the native
		// ellipse with a centered cover crop, and no second same-box picture may sit
		// over it as a rectangular poster fallback.
		try {
			const doc = new DOMParser().parseFromString(xml, 'text/xml')
			const pics = descendants(doc, 'pic')
			// A manifest may pin the semantic object name.  When validating an
			// imported/legacy canary without one, discover the native video picture
			// from its media relationship instead of treating the missing name as a
			// geometry failure.
			const target = entry.videoObjectName
				? pics.find(pic => descendants(pic, 'cNvPr').some(node => node.getAttribute('name') === entry.videoObjectName))
				: pics.find(pic => descendants(pic, 'videoFile').length > 0 && descendants(pic, 'media').length > 0)
			if (target) {
				const geom = descendants(target, 'prstGeom')[0]
				const frameContract = expectedFrameContract(manifest, entry)
				const expectedShape = frameContract?.shape || 'ellipse'
				if (geom?.getAttribute('prst') !== expectedShape) slideIssues.push(`talking-head frame is not ${expectedShape}`)
				const srcRect = descendants(target, 'srcRect')[0]
				const cropValue = edge => srcRect ? Number(srcRect.getAttribute(edge) || 0) : 0
				const left = cropValue('l')
				const right = cropValue('r')
				const top = cropValue('t')
				const bottom = cropValue('b')
				const centeredCrop = frameContract?.crop === undefined || frameContract.crop === 'centered-cover'
				if (centeredCrop && (![left, right, top, bottom].every(Number.isFinite) || left !== right || top !== bottom)) slideIssues.push('talking-head crop is not centered')
				if (frameContract?.sourceCropPercent && typeof frameContract.sourceCropPercent === 'object') {
					const expected = Object.fromEntries(['left', 'right', 'top', 'bottom'].map(edge => [edge, Math.round(Number(frameContract.sourceCropPercent[edge] || 0) * 1000)]))
					const actual = { left, right, top, bottom }
					for (const edge of ['left', 'right', 'top', 'bottom']) {
						if (actual[edge] !== expected[edge]) slideIssues.push(`talking-head ${edge} crop is ${actual[edge] / 1000}%; expected ${expected[edge] / 1000}%`)
					}
				}
				if (frameContract?.sourceCropPerSidePercent !== undefined) {
					const expectedCrop = Math.round(Number(frameContract.sourceCropPerSidePercent) * 1000)
					if (left !== expectedCrop || right !== expectedCrop) slideIssues.push(`talking-head horizontal crop is not ${frameContract.sourceCropPerSidePercent}% per side`)
				}
				const targetBox = shapeBox(target)
				const duplicate = pics.find(pic => pic !== target && sameBox(shapeBox(pic), targetBox))
				if (duplicate) slideIssues.push('duplicate visual occupies the talking-head frame')
				const canonical = frameContract?.canonicalWindowIn
				if (canonical && targetBox) {
					const actual = {
						x: targetBox.x / EMU_PER_INCH,
						y: targetBox.y / EMU_PER_INCH,
						w: targetBox.cx / EMU_PER_INCH,
						h: targetBox.cy / EMU_PER_INCH,
					}
					const tolerance = Number(frameContract.toleranceIn) > 0 ? Number(frameContract.toleranceIn) : DEFAULT_FRAME_TOLERANCE_IN
					for (const key of ['x', 'y', 'w', 'h']) {
						if (!approximately(actual[key], Number(canonical[key]), tolerance)) slideIssues.push(`talking-head ${key} is ${actual[key].toFixed(4)}in; expected ${canonical[key]}in`)
					}
				}
			} else {
				slideIssues.push(entry.videoObjectName ? 'talking-head object was not found by videoObjectName' : 'native talking-head video object was not found')
			}
		} catch {
			slideIssues.push('talking-head geometry could not be inspected')
		}
		if (slideIssues.length) issues.push(`slide ${slideNum}: ${slideIssues.join('; ')}`)
		perSlide.push({
			slideIndex: entry.slideIndex,
			hasVideoFile,
			hasP14Media,
			hasVideoNode,
			hasMediaCall,
			hasVideoRel,
			hasMediaRel,
			hasPosterRel,
			hasNativeNarrationMarker,
			hasInteractivePause,
			hasNativeNotesSlide: notes.present,
			hasNarrationNotes,
			hasCanonicalNarrationRubric,
			hasLegacyNarrationRubric,
			advanceAfterTime: adv || null,
			frameContract: expectedFrameContract(manifest, entry) ? {
				shape: expectedFrameContract(manifest, entry)?.shape || 'ellipse',
				crop: expectedFrameContract(manifest, entry)?.crop || 'centered-cover',
				canonicalWindowIn: expectedFrameContract(manifest, entry)?.canonicalWindowIn || null,
				sourceCropPerSidePercent: expectedFrameContract(manifest, entry)?.sourceCropPerSidePercent ?? null,
				sourceCropPercent: expectedFrameContract(manifest, entry)?.sourceCropPercent || null,
			} : null,
			issues: slideIssues,
		})
	}
	return { ok: issues.length === 0, filePath, mediaParts, perSlide, issues }
}
