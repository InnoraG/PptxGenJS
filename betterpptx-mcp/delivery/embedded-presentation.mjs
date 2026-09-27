import { createHash } from 'node:crypto'

// Wire capability is not the same as a chat client's usable context budget.
// The conservative default is a transport policy, not a measured universal
// ChatGPT limit; larger decks get a browser link instead.
export const MAX_EMBEDDED_PRESENTATION_BYTES = 25 * 1024 * 1024
export const DEFAULT_CLIENT_SAFE_EMBED_BYTES = 256 * 1024

export function shouldOfferDownloadLink(mode, totalBytes) {
	return mode === 'link' || (mode === 'resource' && totalBytes > DEFAULT_CLIENT_SAFE_EMBED_BYTES)
}

function deliveryError(code, message) {
	return Object.assign(new Error(message), { code })
}

export function assertEmbeddedPresentationSize(totalBytes, expectedBytes) {
	if (!Number.isSafeInteger(totalBytes) || totalBytes < 1
		|| !Number.isSafeInteger(expectedBytes) || expectedBytes !== totalBytes) {
		throw deliveryError('ARTIFACT_IDENTITY_MISMATCH', 'The stored artifact size does not match its publication record.')
	}
	if (totalBytes > MAX_EMBEDDED_PRESENTATION_BYTES) {
		throw deliveryError('ARTIFACT_RESOURCE_TOO_LARGE', 'This artifact exceeds the embedded-resource limit. Use the owner-scoped browser download link.')
	}
	return totalBytes
}

export function verifyEmbeddedPresentation(bytes, totalBytes, expectedSha256) {
	if (!Buffer.isBuffer(bytes) || bytes.length !== totalBytes
		|| !/^[a-f0-9]{64}$/i.test(String(expectedSha256 || ''))
		|| createHash('sha256').update(bytes).digest('hex') !== String(expectedSha256).toLowerCase()) {
		throw deliveryError('ARTIFACT_IDENTITY_MISMATCH', 'The stored artifact does not match its publication record.')
	}
	return bytes
}
