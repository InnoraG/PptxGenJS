const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))

export async function waitForIdentityMatch(expected, readActual, {
	maxAttempts = 24,
	retryDelayMs = 5000,
	timeoutMs = 120_000,
	wait = pause,
	onRetry = () => {},
} = {}) {
	if (!expected || typeof expected !== 'object' || Array.isArray(expected) || Object.keys(expected).length === 0) {
		throw new TypeError('Expected release identity must be a non-empty object.')
	}
	if (typeof readActual !== 'function') throw new TypeError('readActual must be a function.')
	if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 100) {
		throw new RangeError('maxAttempts must be an integer from 1 through 100.')
	}
	if (!Number.isFinite(retryDelayMs) || retryDelayMs < 0 || retryDelayMs > 60_000) {
		throw new RangeError('retryDelayMs must be between 0 and 60000 milliseconds.')
	}
	if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 600_000) {
		throw new RangeError('timeoutMs must be between 1 and 600000 milliseconds.')
	}
	if (typeof wait !== 'function') throw new TypeError('wait must be a function.')
	if (typeof onRetry !== 'function') throw new TypeError('onRetry must be a function.')

	let lastMismatchFields = []
	let lastReadFailed = false
	const deadline = Date.now() + timeoutMs
	for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
		const remainingMs = deadline - Date.now()
		if (remainingMs <= 0) break
		let actual
		try {
			actual = await readActual(AbortSignal.timeout(remainingMs))
			lastReadFailed = false
			lastMismatchFields = Object.keys(expected).filter(field => actual?.[field] !== expected[field])
			if (lastMismatchFields.length === 0) return { actual, attempts: attempt }
		} catch {
			lastReadFailed = true
			lastMismatchFields = []
		}

		const remainingAfterReadMs = deadline - Date.now()
		if (attempt < maxAttempts && remainingAfterReadMs > 0) {
			onRetry({ attempt, nextAttempt: attempt + 1, mismatchFields: lastMismatchFields, readFailed: lastReadFailed })
			await wait(Math.min(retryDelayMs, remainingAfterReadMs))
		}
	}

	const reason = lastReadFailed || lastMismatchFields.length === 0
		? 'the custom domain remained unavailable or returned an invalid release identity'
		: `identity fields did not converge: ${lastMismatchFields.join(', ')}`
	throw new Error(`Custom-domain release identity did not match within ${timeoutMs} ms (maximum ${maxAttempts} attempts); ${reason}.`)
}
