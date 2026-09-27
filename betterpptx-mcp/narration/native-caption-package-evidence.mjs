import * as path from 'node:path'
import { createHash } from 'node:crypto'
import { DOMParser } from '@xmldom/xmldom'

const TRACK_NS = 'http://schemas.microsoft.com/office/powerpoint/2017/3/main'
const DOC_REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const PACKAGE_REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships'
const TRACK_REL_TYPE = 'http://schemas.microsoft.com/office/2017/04/relationships/track'

function nodesByName(document, namespace, localName) {
	return Array.from(document.getElementsByTagNameNS(namespace, localName))
}

function parseXml(text) {
	const errors = []
	const document = new DOMParser({
		errorHandler: {
			warning: () => {},
			error: message => errors.push(String(message)),
			fatalError: message => errors.push(String(message)),
		},
	}).parseFromString(text, 'application/xml')
	return { document, errors }
}

function parseTimestamp(value) {
	const match = String(value || '').match(/^(?:(\d{2,}):)?(\d{2}):(\d{2})\.(\d{3})$/)
	if (!match) return null
	const hours = Number(match[1] || 0)
	const minutes = Number(match[2])
	const seconds = Number(match[3])
	if (minutes > 59 || seconds > 59) return null
	return ((hours * 60 + minutes) * 60 + seconds) * 1000 + Number(match[4])
}

export function inspectWebVtt(text) {
	const normalized = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
	const lines = normalized.split('\n')
	const issues = []
	if (lines[0] !== 'WEBVTT' && !lines[0]?.startsWith('WEBVTT ')) issues.push('WEBVTT_HEADER_MISSING')
	let cueCount = 0
	let maxCueEndMs = 0
	for (const line of lines) {
		if (!line.includes('-->')) continue
		const match = line.trim().match(/^(\S+)\s+-->\s+(\S+)(?:\s+.*)?$/)
		const startMs = parseTimestamp(match?.[1])
		const endMs = parseTimestamp(match?.[2])
		if (startMs === null || endMs === null || endMs <= startMs) {
			issues.push('WEBVTT_CUE_TIMING_INVALID')
			continue
		}
		cueCount += 1
		maxCueEndMs = Math.max(maxCueEndMs, endMs)
	}
	if (cueCount === 0) issues.push('WEBVTT_CUES_MISSING')
	return { cueCount, maxCueEndMs, issues: [...new Set(issues)] }
}

function mediaObjectName(trackNode) {
	let node = trackNode
	while (node && node.localName !== 'pic') node = node.parentNode
	if (!node) return null
	const metadata = Array.from(node.getElementsByTagName('*')).find(child => child.localName === 'cNvPr')
	return metadata?.getAttribute('name') || null
}

function segmentStartMs(manifestEntry, objectName) {
	const segment = (manifestEntry?.segments || []).find(item => item.objectName === objectName)
	if (segment && Number.isFinite(Number(segment.startMs))) return Number(segment.startMs)
	if (manifestEntry?.audioObjectName === objectName) return Number(manifestEntry.startDelayMs || 0)
	return null
}

export async function inspectNativeCaptionTracks(zip, slideIndex, manifestEntry = null) {
	const slidePath = `ppt/slides/slide${slideIndex + 1}.xml`
	const relsPath = `ppt/slides/_rels/slide${slideIndex + 1}.xml.rels`
	const slideXml = await zip.file(slidePath)?.async('string') || ''
	const relsXml = await zip.file(relsPath)?.async('string') || ''
	const slide = parseXml(slideXml)
	const rels = parseXml(relsXml)
	const issues = []
	if (slide.errors.length || rels.errors.length) issues.push('CAPTION_XML_INVALID')
	const relationships = new Map(nodesByName(rels.document, PACKAGE_REL_NS, 'Relationship').map(node => [node.getAttribute('Id'), node]))
	const trackNodes = nodesByName(slide.document, TRACK_NS, 'track')
	const referencedIds = new Set(trackNodes.map(node => node.getAttributeNS(DOC_REL_NS, 'embed')).filter(Boolean))
	for (const relationship of relationships.values()) {
		if (relationship.getAttribute('Type') === TRACK_REL_TYPE && !referencedIds.has(relationship.getAttribute('Id'))) {
			issues.push('CAPTION_TRACK_RELATIONSHIP_UNREFERENCED')
		}
	}
	if (referencedIds.size !== trackNodes.length) issues.push('CAPTION_TRACK_RELATIONSHIP_DUPLICATE_OR_MISSING')
	const tracks = []
	let cueCount = 0
	let verifiedTrackCount = 0
	let maxTimelineEndMs = 0
	for (const node of trackNodes) {
		const relationshipId = node.getAttributeNS(DOC_REL_NS, 'embed')
		const relationship = relationships.get(relationshipId)
		const objectName = mediaObjectName(node)
		const track = { objectName, relationshipId, language: node.getAttribute('lang') || null, label: node.getAttribute('label') || null }
		const trackIssues = []
		if (!relationship || relationship.getAttribute('Type') !== TRACK_REL_TYPE || relationship.getAttribute('TargetMode') === 'External') {
			trackIssues.push('CAPTION_TRACK_RELATIONSHIP_INVALID')
		} else {
			const target = relationship.getAttribute('Target') || ''
			const partName = path.posix.normalize(path.posix.join(path.posix.dirname(slidePath), target))
			if (!partName.startsWith('ppt/media/') || !partName.endsWith('.vtt') || !zip.file(partName)) {
				trackIssues.push('CAPTION_VTT_PART_MISSING')
			} else {
				const bytes = await zip.file(partName).async('nodebuffer')
				const vtt = inspectWebVtt(bytes.toString('utf8'))
				track.partName = partName
				track.partSha256 = createHash('sha256').update(bytes).digest('hex')
				track.cueCount = vtt.cueCount
				track.clipLocalCueEndMs = vtt.maxCueEndMs
				cueCount += vtt.cueCount
				trackIssues.push(...vtt.issues)
				const startMs = segmentStartMs(manifestEntry, objectName)
				if (startMs !== null) {
					track.clipStartMs = startMs
					track.slideCueEndMs = startMs + vtt.maxCueEndMs
					maxTimelineEndMs = Math.max(maxTimelineEndMs, track.slideCueEndMs)
				} else if (manifestEntry?.segments?.length || manifestEntry?.audioObjectName) {
					trackIssues.push('CAPTION_TIMING_OBJECT_UNMAPPED')
				}
				if (trackIssues.length === 0) verifiedTrackCount += 1
			}
		}
		track.issues = trackIssues
		tracks.push(track)
		issues.push(...trackIssues.map(code => `${code}:${objectName || relationshipId || 'unknown'}`))
	}
	return {
		trackCount: trackNodes.length,
		verifiedTrackCount,
		cueCount,
		captionTimelineEndMs: maxTimelineEndMs || null,
		captionTimingSource: trackNodes.length ? (maxTimelineEndMs ? 'native-webvtt-clip-local' : 'native-webvtt-unmapped') : 'none',
		tracks,
		issues,
	}
}
