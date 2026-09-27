// Resolve an explicitly authored carry window from the selected action's
// composed hand trajectory. No motion or contact time is guessed here.
function invalid(message) {
	const error = new Error(message)
	error.code = 'PERFORMANCE_CARRY_UNRESOLVED'
	throw error
}

export function performanceCarryHandSamples({ action, hand, grabMs, dropMs }, extraTimes = []) {
	if (!action || !['left', 'right'].includes(hand)) invalid('Carry requires a resolved action and an explicit left or right hand.')
	if (!Number.isFinite(action.startMs) || action.startMs < 0 || !Number.isFinite(action.durationMs) || action.durationMs <= 0) invalid('Carry requires a finite resolved action clock.')
	if (![grabMs, dropMs].every(Number.isInteger) || grabMs < 0 || dropMs <= grabMs || dropMs > action.durationMs) invalid('Carry requires 0 <= grabMs < dropMs <= action.durationMs in whole milliseconds.')
	const start = action.startMs + grabMs, end = action.startMs + dropMs
	const samples = action.handSamples
	if (!Array.isArray(samples) || samples.length < 2) invalid('The selected action has no measurable carry trajectory.')
	let previous = -Infinity
	for (const sample of samples) {
		const position = sample?.[hand]?.normalizedPosition
		if (!Number.isFinite(sample?.atMs) || sample.atMs <= previous || !position || !['x', 'yAboveFloor', 'z'].every(key => typeof position[key] === 'number' && Number.isFinite(position[key]))) invalid('The selected carry hand must have finite, ordered measurements throughout the action.')
		previous = sample.atMs
	}
	if (samples[0].atMs > start || samples.at(-1).atMs < end) invalid('The carry window extends beyond the measured hand trajectory.')
	const times = [...new Set([start, end, ...samples.map(sample => sample.atMs).filter(time => time > start && time < end), ...extraTimes.filter(time => time > start && time < end)])].sort((a, b) => a - b)
	return times.map(atMs => {
		let index = samples.findIndex(sample => sample.atMs >= atMs)
		if (index < 0) index = samples.length - 1
		const b = samples[index], a = samples[Math.max(0, index - 1)]
		const t = b.atMs === a.atMs ? 0 : (atMs - a.atMs) / (b.atMs - a.atMs)
		return { atMs, normalizedPosition: Object.fromEntries(['x', 'yAboveFloor', 'z'].map(key => [key, a[hand].normalizedPosition[key] + (b[hand].normalizedPosition[key] - a[hand].normalizedPosition[key]) * t])) }
	})
}
