import fs from 'node:fs'
import path from 'node:path'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'

Object.assign(process.env, {
	BETTERPPTX_LOCAL_MAINTAINER: '1',
	BETTERPPTX_ALLOW_PRIMITIVE_TOOLS: '1',
	BETTERPPTX_PUBLIC_BLACK_BOX: '0',
	BETTERPPTX_ASSETS_ROOT: 'D:/PptxGenJS_Claude',
})

const engine = await import('../engine.mjs')
const root = 'D:/PptxGenJS_Claude'
const source = path.join(root, 'research-demos/2026-07-12-presenter-cofire/kinetic-synergy-deck.pptx')
const video = path.join(root, 'research-demos/2026-07-12-presenter-cofire/avatar-rebuilt/assets/slide-1-avatar.mp4')
const poster = path.join(root, 'research-demos/2026-07-12-presenter-cofire/avatar-rebuilt/assets/slide-1-poster.png')
const output = path.join(root, 'research-demos/2026-07-12-presenter-cofire/avatar-rebuilt/single-avatar-replace-native-audio-preserve-timing.pptx')

const data = fs.readFileSync(source).toString('base64')
const opened = await engine.callBetterPptxTool('betterpptx.deck.open_uploaded', {
	data: `data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,${data}`,
	fileName: path.basename(source),
	preserveTiming: true,
})
if (!opened?.ok) throw new Error(JSON.stringify(opened))
const deckId = opened.data.deckId
const slide = engine.getSlide(deckId, 0)
const audio = (slide._slideObjects || []).find(obj => obj?._type === 'media' && String(obj.mtype).toLowerCase() === 'audio')
const audioSpid = Number(audio?.options?.spid)
if (!audio || !Number.isFinite(audioSpid)) throw new Error('native audio object not found')

const cover = `data:image/png;base64,${fs.readFileSync(poster).toString('base64')}`
slide.addMedia({
	type: 'video', path: video, extn: 'mp4', cover,
	x: 0.42, y: 5.22, w: 1.78, h: 1.78,
	objectName: 'head-talker-avatar', mediaVolume: 80000, spid: audioSpid + 1,
})
const videoObject = slide._slideObjects[slide._slideObjects.length - 1]
const videoSpid = Number(videoObject?.options?.spid ?? videoObject?.spid)
if (!Number.isFinite(videoSpid)) throw new Error(`video SPID not found: ${JSON.stringify(videoObject)}`)

// Remove the separate narration shape; the MP4 already carries the same audio.
slide._slideObjects = (slide._slideObjects || []).filter(obj => obj !== audio)
const audioRid = Number(audio.mediaRid)
if (Array.isArray(slide._relsMedia) && Number.isFinite(audioRid)) {
	const removed = new Set([audioRid, audioRid + 1, audioRid + 2])
	slide._relsMedia = slide._relsMedia.filter(rel => !removed.has(Number(rel?.rId)))
}

const raw = slide._rawTimingXml
const doc = new DOMParser().parseFromString(raw, 'text/xml')
const elementName = node => String(node?.nodeName || '').split(':').pop()
const descendants = (node, name) => {
	const found = []
	for (let i = 0; i < (node?.childNodes?.length || 0); i++) {
		const child = node.childNodes[i]
		if (child.nodeType !== 1) continue
		if (elementName(child) === name) found.push(child)
		found.push(...descendants(child, name))
	}
	return found
}
for (const audioNode of descendants(doc.documentElement, 'audio')) audioNode.parentNode?.removeChild(audioNode)
for (const target of descendants(doc.documentElement, 'spTgt')) {
	if (Number(target.getAttribute('spid')) === audioSpid) target.setAttribute('spid', String(videoSpid))
}
const timing = new XMLSerializer().serializeToString(doc)
slide._rawTimingXml = timing.replace('</p:tnLst>', `<p:video><p:cMediaNode vol="80000"><p:cTn id="99" fill="hold" display="0"><p:stCondLst><p:cond delay="indefinite"/></p:stCondLst></p:cTn><p:tgtEl><p:spTgt spid="${videoSpid}"/></p:tgtEl></p:cMediaNode></p:video></p:tnLst>`)

const saved = await engine.callBetterPptxTool('betterpptx.deck.save', { deckId, fileName: path.basename(output), outputDir: path.dirname(output) })
if (!saved?.ok) throw new Error(JSON.stringify(saved))
console.log(JSON.stringify({ ok: true, output, audioSpid, videoSpid }, null, 2))
