import { traceArtifactDelivery } from '../diagnostic-trace.mjs'
import { DEFAULT_CLIENT_SAFE_EMBED_BYTES } from './embedded-presentation.mjs'

const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'

export function savedPresentationResourceLink(payload) {
	if (payload?.ok !== true) return null
	const result = payload.data?.result?.downloadUrl ? payload.data.result : payload.data
	if (!result || typeof result !== 'object') return null
	// A resource_link is an attachment offer, not merely a visible browser URL:
	// some hosts materialize it automatically. Apply the same conservative size
	// policy as embedded delivery. Unknown/large files keep their original URL
	// in text/structured output without provoking an attachment download.
	const size = result.bytes
	if (!Number.isSafeInteger(size) || size < 1 || size > DEFAULT_CLIENT_SAFE_EMBED_BYTES) return null
	const name = String(result.downloadName || '')
	const uri = String(result.downloadUrl || '')
	if (!name.toLowerCase().endsWith('.pptx') || !/^[a-f0-9]{64}$/i.test(String(result.packageSha256 || ''))) return null
	let url
	try { url = new URL(uri) } catch { return null }
	if (url.protocol !== 'https:' || !url.pathname.endsWith('.pptx')) return null
	return {
		type: 'resource_link',
		uri,
		name,
		description: 'Saved native-editable BetterPPTX presentation. Recover the download link through owner-scoped operation status within the original file expiry; retrieval does not publish again or extend retention.',
		mimeType: PPTX_MIME,
		size,
	}
}

export function withSavedPresentationResourceLink(toolResult, payload) {
	const link = savedPresentationResourceLink(payload)
	if (!link) return toolResult
	traceArtifactDelivery({ phase: 'offered', routePath: new URL(link.uri).pathname, bytes: link.size })
	return { ...toolResult, content: [...(toolResult.content || []), link] }
}
