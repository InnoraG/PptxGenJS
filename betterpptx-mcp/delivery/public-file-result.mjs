import { traceArtifactDelivery } from '../diagnostic-trace.mjs'

const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'

export function savedPresentationResourceLink(payload) {
	if (payload?.ok !== true) return null
	const result = payload.data?.result?.downloadUrl ? payload.data.result : payload.data
	if (!result || typeof result !== 'object') return null
	const name = String(result.downloadName || '')
	const uri = String(result.downloadUrl || '')
	if (!name.toLowerCase().endsWith('.pptx') || !/^[a-f0-9]{64}$/i.test(String(result.packageSha256 || ''))) return null
	let url
	try { url = new URL(uri) } catch { return null }
	if (url.protocol !== 'https:' || !url.pathname.endsWith('.pptx')) return null
	const size = Number(result.bytes)
	return {
		type: 'resource_link',
		uri,
		name,
		description: 'Saved native-editable BetterPPTX presentation. The browser link expires; refresh it with the owner-scoped operation status tool without publishing again.',
		mimeType: PPTX_MIME,
		...(Number.isSafeInteger(size) && size >= 0 ? { size } : {}),
	}
}

export function withSavedPresentationResourceLink(toolResult, payload) {
	const link = savedPresentationResourceLink(payload)
	if (!link) return toolResult
	traceArtifactDelivery({ phase: 'offered', routePath: new URL(link.uri).pathname, bytes: link.size })
	return { ...toolResult, content: [...(toolResult.content || []), link] }
}
