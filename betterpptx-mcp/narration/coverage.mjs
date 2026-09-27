function manifestSlides(manifest) {
	return Array.isArray(manifest?.slides) ? manifest.slides : []
}

function slideKey(item, fallbackIndex, source) {
	const slideIndex = Number(item?.slideIndex)
	return Number.isFinite(slideIndex) ? `slide:${slideIndex}` : `${source}:${fallbackIndex}`
}

export function narrationCoverageForManifests(narrationManifest, avatarManifest) {
	const covered = new Map()
	const timed = new Map()
	for (const [source, manifest] of [['narration', narrationManifest], ['avatarNarration', avatarManifest]]) {
		manifestSlides(manifest).forEach((item, index) => {
			const key = slideKey(item, index, source)
			if (!covered.has(key)) covered.set(key, item)
			const durationMs = Number(item?.durationMs)
			const advanceAfterTime = Number(item?.advanceAfterTime)
			if (Number.isFinite(durationMs) && durationMs > 0 && Number.isFinite(advanceAfterTime) && advanceAfterTime > 0) {
				timed.set(key, item)
			}
		})
	}
	return {
		coveredSlideCount: covered.size,
		coveredSlides: Array.from(covered.values()),
		timedSlideCount: timed.size,
		timedSlides: Array.from(timed.values()),
	}
}
