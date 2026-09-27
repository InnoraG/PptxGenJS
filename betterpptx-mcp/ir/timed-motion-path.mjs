// Native paths preserve spatial vertices, not their source timestamps. Lower
// sampled motion to individually timed linear segments so a target follows the
// measured clock, including pauses and non-uniform motion, on any slide size.
function invalid(message) {
	const error = new Error(message)
	error.code = 'TIMED_MOTION_PATH_INVALID'
	throw error
}

export function validateTimedMotionSamples(samples, minimum = 2) {
	if (!Array.isArray(samples) || samples.length < minimum) invalid(`A timed motion path requires at least ${minimum} samples.`)
	let previous = -Infinity
	return samples.map((sample, index) => {
		if (!Array.isArray(sample) || sample.length !== 3 || sample.some(value => typeof value !== 'number' || !Number.isFinite(value))) invalid(`Timed motion sample ${index} must contain finite time, x and y values.`)
		if (sample[0] < 0 || sample[0] <= previous) invalid('Timed motion sample times must be nonnegative and strictly increasing.')
		previous = sample[0]
		return [...sample]
	})
}

export function timedMotionPathAnimations(samples, { slideW = 13.333333, slideH = 7.5 } = {}) {
	if (![slideW, slideH].every(value => typeof value === 'number' && Number.isFinite(value) && value > 0)) invalid('Timed motion requires finite positive slide dimensions.')
	const rows = validateTimedMotionSamples(samples), [, originX, originY] = rows[0]
	const point = row => `${((row[1] - originX) / slideW).toFixed(7)} ${((row[2] - originY) / slideH).toFixed(7)}`
	return rows.slice(1).map((row, index) => {
		const previous = rows[index], delay = Math.round(previous[0]), end = Math.round(row[0])
		if (end <= delay) invalid('Timed motion samples must remain distinct at whole-millisecond precision.')
		const path = `M ${point(previous)} L ${point(row)} E`
		return { type: 'motion', effect: 'right', motionPath: 'right', pathData: path, motionPathData: path,
			motionEasing: 'linear', trigger: 'withPrevious', delay, duration: end - delay }
	})
}
