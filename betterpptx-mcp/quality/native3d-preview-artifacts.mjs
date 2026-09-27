import crypto from 'node:crypto'
import path from 'node:path'
import JSZip from 'jszip'
import { DOMParser } from '@xmldom/xmldom'

export const NATIVE_MODEL_PREVIEW_SCHEMA_VERSION = 'betterpptx.native-model-preview.v1'
const NS = Object.freeze({ p: 'http://schemas.openxmlformats.org/presentationml/2006/main', r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships', model: 'http://schemas.microsoft.com/office/drawing/2017/model3d', xmlns: 'http://www.w3.org/2000/xmlns/' })
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const elements = (node, ns, name) => Array.from(node?.getElementsByTagNameNS(ns, name) || [])
const parseXml = text => new DOMParser({ errorHandler: { warning() {}, error(message) { throw new Error(message) }, fatalError(message) { throw new Error(message) } } }).parseFromString(text, 'application/xml')
const previewError = message => Object.assign(new Error(message), { code: 'POWERPOINT_PREVIEW_3D_NOT_READY' })
const sha256 = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)

function canonicalElement(node) {
	return {
		name: [node.namespaceURI || '', node.localName],
		attributes: Array.from(node.attributes || []).filter(attr => attr.namespaceURI !== NS.xmlns && !(attr.namespaceURI === NS.r && attr.localName === 'embed')).map(attr => [attr.namespaceURI || '', attr.localName, attr.value]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
		children: Array.from(node.childNodes || []).filter(item => item.nodeType === 1 || (item.nodeType === 3 && item.data.trim())).map(item => item.nodeType === 1 ? canonicalElement(item) : item.data.trim()),
	}
}

// Opaque hashes bind the observed pose (inside the exact model bytes), native
// camera/view/lighting, and authored frame. No package XML or media path leaves
// this maintainer-side reader. Only the optional preview publication uses it.
export async function readNativeModelPreviewBindings(packageBytes, requirements) {
	const zip = await JSZip.loadAsync(packageBytes)
	const read = async name => {
		const part = zip.file(name)
		if (!part) throw previewError('Native model preview binding metadata is unavailable.')
		return parseXml(await part.async('string'))
	}
	const relationships = async name => {
		const document = await read(path.posix.join(path.posix.dirname(name), '_rels', `${path.posix.basename(name)}.rels`))
		return new Map(elements(document, '*', 'Relationship').filter(node => node.getAttribute('TargetMode') !== 'External').map(node => {
			const target = node.getAttribute('Target')
			const resolved = path.posix.normalize(target.startsWith('/') ? target.slice(1) : path.posix.join(path.posix.dirname(name), target))
			if (resolved.startsWith('../')) throw previewError('Native model preview binding metadata is invalid.')
			return [node.getAttribute('Id'), resolved]
		}))
	}
	const presentation = await read('ppt/presentation.xml')
	const presentationRels = await relationships('ppt/presentation.xml')
	const slideParts = elements(presentation, NS.p, 'sldId').map(node => presentationRels.get(node.getAttributeNS(NS.r, 'id')))
	const bindings = new Map()
	const modelHashes = new Map()
	for (const requirement of requirements.slides) {
		if (!requirement.targets.length) continue
		const slidePart = slideParts[requirement.slideIndex]
		if (!slidePart) throw previewError('Native model preview slide binding is unavailable.')
		const document = await read(slidePart)
		const rels = await relationships(slidePart)
		for (const frame of elements(document, NS.p, 'graphicFrame')) {
			const model = elements(frame, NS.model, 'model3d')[0]
			if (!model) continue
			const nv = elements(frame, NS.p, 'cNvPr')[0]
			const shapeId = Number(nv?.getAttribute('id'))
			const target = requirement.targets.find(item => item.shapeId === shapeId)
			if (!target) continue
			const modelPart = rels.get(model.getAttributeNS(NS.r, 'embed'))
			if (!modelPart || !zip.file(modelPart)) throw previewError('Native model preview cannot bind the embedded model.')
			if (!modelHashes.has(modelPart)) modelHashes.set(modelPart, hash(await zip.file(modelPart).async('nodebuffer')))
			const modelSha256 = modelHashes.get(modelPart)
			const viewSha256 = hash(JSON.stringify(canonicalElement(model)))
			const frameSha256 = hash(JSON.stringify(target.frameEmu))
			bindings.set(`${requirement.slideIndex}:${shapeId}`, {
				objectName: nv.getAttribute('name') || `3D model ${shapeId}`,
				modelSha256, viewSha256, frameSha256,
				bindingSha256: hash(JSON.stringify({ modelSha256, viewSha256, frameSha256 })),
			})
		}
	}
	return bindings
}

// Deliberate allowlist: the export adapter carries local temporary filenames;
// public model previews may carry only downloadable artifacts and opaque assets.
export function nativeModelPreviewDescriptor({ packageSha256, deckVersion, slideIndex, shapeId, binding, frameEmu, slideSizeEmu, renderWidth, renderHeight, imageWidth, imageHeight, asset, artifact, appearanceEvidence = 'non-fallback-native-object-export' }) {
	if (![packageSha256, binding?.modelSha256, binding?.viewSha256, binding?.frameSha256, binding?.bindingSha256, asset?.digest, artifact?.renderSha256].every(sha256) || asset.digest !== artifact.renderSha256) throw previewError('Native model preview artifact binding could not be verified.')
	const assetMatch = /^asset:\/\/locked\/[^/]+\/([a-f0-9]{64})\.png$/.exec(String(asset?.handle || ''))
	if (!assetMatch || assetMatch[1] !== asset.digest) throw previewError('Native model preview requires an opaque image asset.')
	if (!/^https:\/\//i.test(String(artifact?.downloadUrl || ''))) throw previewError('Native model preview requires a client-accessible download.')
	if (![renderWidth, renderHeight, imageWidth, imageHeight, slideSizeEmu?.w, slideSizeEmu?.h, frameEmu?.w, frameEmu?.h].every(value => Number.isFinite(value) && value > 0) || ![frameEmu?.x, frameEmu?.y].every(Number.isFinite)) throw previewError('Native model preview frame metadata is invalid.')
	if (Math.abs(imageWidth * frameEmu.h - imageHeight * frameEmu.w) > frameEmu.w + frameEmu.h) throw previewError('Native model preview did not preserve its frame aspect.')
	if (!['non-fallback-native-object-export', 'trusted-pose-view-frame-bound-poster'].includes(appearanceEvidence)) throw previewError('Native model preview appearance evidence is unavailable.')
	return {
		schemaVersion: NATIVE_MODEL_PREVIEW_SCHEMA_VERSION,
		slideIndex, objectId: `object://native3d/${hash(`${packageSha256}:${slideIndex}:${shapeId}`).slice(0, 32)}`,
		objectName: binding.objectName,
		format: 'png', width: imageWidth, height: imageHeight, transparentBackground: true,
		posterAsset: asset.handle, renderSha256: asset.digest,
		pixelViewport: { width: renderWidth, height: renderHeight },
		pixelFrame: { x: frameEmu.x * renderWidth / slideSizeEmu.w, y: frameEmu.y * renderHeight / slideSizeEmu.h, w: frameEmu.w * renderWidth / slideSizeEmu.w, h: frameEmu.h * renderHeight / slideSizeEmu.h },
		binding: { packageSha256, deckVersion, contentSha256: binding.modelSha256, viewSha256: binding.viewSha256, frameSha256: binding.frameSha256, bindingSha256: binding.bindingSha256, poseEvidence: 'exact-embedded-model-bytes', viewEvidence: 'exact-native-camera-transform-lighting-and-scene' },
		appearance: { status: 'verified', evidence: appearanceEvidence, liveHydration: appearanceEvidence === 'trusted-pose-view-frame-bound-poster' ? 'unverified' : 'non-fallback-render-observed', playback: 'not-verified' },
		downloadUrl: artifact.downloadUrl, downloadName: artifact.downloadName,
		artifact: { state: artifact.artifact?.state || 'download_ready', expiresAt: artifact.artifact?.expiresAt },
		usage: 'Use posterAsset on this same native model, stopped pose, view, and frame aspect in the next public specification. Revalidate and preview the newly committed deck. This transparent model image is a compatibility poster, not a slide image or animation-playback proof.',
	}
}
