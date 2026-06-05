export function secondsToMs(seconds) {
	const n = Number(seconds)
	if (!Number.isFinite(n)) throw new Error(`Expected seconds to be numeric, got ${seconds}`)
	return Math.max(0, Math.round(n * 1000))
}

export function clampAdvanceMs(ms, minMs = 250) {
	const n = Number(ms)
	if (!Number.isFinite(n)) throw new Error(`Expected milliseconds to be numeric, got ${ms}`)
	return Math.max(minMs, Math.round(n))
}

export function assertLikelyMilliseconds(ms, label = 'advanceAfterTime') {
	const n = Number(ms)
	if (Number.isFinite(n) && n > 0 && n < 50) {
		process.stderr.write(`[betterpptx:narration] ${label}=${n} looks like seconds, but PPTX advTm expects milliseconds.\n`)
	}
	return n
}
