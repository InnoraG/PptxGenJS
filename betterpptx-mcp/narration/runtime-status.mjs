import { listVoices, narrationMode } from './licenseGate.mjs'
import { getProvider } from './providers/index.mjs'

function narrationDisabled() {
	return process.env.BETTERPPTX_NARRATION_DISABLED === '1'
}

// The local Piper service can be cold-started or CPU-throttled. A short fixed
// probe made a healthy runtime look unavailable, which then blocked narrated
// commits even though /voices eventually returned 200. Keep the probe bounded,
// but allow deployment owners to tune it for their service latency.
const DEFAULT_PROBE_TIMEOUT_MS = Number(process.env.BETTERPPTX_TTS_PROBE_TIMEOUT_MS || 10000)

export async function probeSynthesisRuntime(timeoutMs = DEFAULT_PROBE_TIMEOUT_MS) {
	if (narrationDisabled()) {
		return { ok: false, reason: 'Narration is disabled by configuration.' }
	}
	try {
		const provider = getProvider(process.env.BETTERPPTX_TTS_PROVIDER || 'piper-http')
		if (typeof provider.probe === 'function') {
			const ok = await provider.probe(timeoutMs)
			return { ok: ok === true, reason: ok ? null : 'The internal voice runtime did not respond.' }
		}
		if (typeof provider.listVoices === 'function') {
			await provider.listVoices()
			return { ok: true, reason: null }
		}
		return { ok: false, reason: 'The internal voice runtime does not expose a readiness probe.' }
	} catch (err) {
		return { ok: false, reason: String(err?.message || err) }
	}
}

export async function publicVoiceCatalog(args = {}) {
	const runtime = await probeSynthesisRuntime()
	const observedAt = new Date().toISOString()
	let listed
	try {
		listed = listVoices(args)
	} catch {
		return {
			catalogAvailable: false,
			synthesisRuntimeAvailable: runtime.ok === true,
			mode: narrationMode(),
			productionReady: false,
			listedVoiceCount: 0,
			approvedVoiceCount: 0,
			productionApprovedVoiceCount: 0,
			lineageReviewRequiredCount: 0,
			filter: {
				gender: args.gender || null,
				language: args.language || args.lang || null,
				query: args.query || null,
			},
			readiness: {
				observedAt,
				voiceCatalog: { status: 'unavailable', available: false },
				synthesisRuntime: { status: runtime.ok ? 'available' : 'unavailable', available: runtime.ok === true },
				environmentMode: { value: narrationMode(), productionEligible: narrationMode() === 'production' },
				productionApproval: { status: 'blocked', approvedVoiceCount: 0 },
				productionReady: false,
			},
			failure: {
				code: 'NARRATION_CATALOG_UNAVAILABLE',
				scope: 'voice-catalog',
				retryable: true,
				nextAction: { tool: 'betterpptx.narration.voices', request: {} },
			},
			note: 'The voice catalog could not be read. Narration authoring documentation remains available; retry this focused readiness call.',
			voices: [],
		}
	}
	const mode = listed.manifest?.mode || narrationMode()
	const catalogReady = listed.count > 0
	const approvalReady = listed.productionApprovedCount > 0
	const productionReady = mode === 'production' && runtime.ok === true && catalogReady && approvalReady
	return {
		catalogAvailable: true,
		synthesisRuntimeAvailable: runtime.ok === true,
		mode,
		productionReady,
		listedVoiceCount: listed.count,
		approvedVoiceCount: listed.productionApprovedCount,
		productionApprovedVoiceCount: listed.productionApprovedCount,
		lineageReviewRequiredCount: listed.lineageReviewCount,
		filter: listed.filter,
		genderCoverage: listed.genderCoverage,
		readiness: {
			observedAt,
			voiceCatalog: { status: catalogReady ? 'available' : 'empty', available: true, listedVoiceCount: listed.count },
			synthesisRuntime: { status: runtime.ok ? 'available' : 'unavailable', available: runtime.ok === true },
			environmentMode: { value: mode, productionEligible: mode === 'production' },
			productionApproval: { status: approvalReady ? 'available' : 'blocked', approvedVoiceCount: listed.productionApprovedCount, lineageReviewRequiredCount: listed.lineageReviewCount },
			productionReady,
		},
		note: 'catalogAvailable, synthesisRuntimeAvailable, mode, and productionReady are independent facts. productionReady requires production mode, an available synthesis runtime, at least one production-approved voice, and a non-empty current catalog.',
		voices: listed.voices,
		...(runtime.ok ? {} : { synthesisRuntimeReason: 'The narration synthesis runtime is not ready for this request.' }),
	}
}
