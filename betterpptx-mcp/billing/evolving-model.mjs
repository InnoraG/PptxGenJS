import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

// CONTINUOUS COST-LEARNING (CEO doctrine 2026-07-03): the evolving cost model is fitted
// from real cost observations (tools/build-evolving-cost-model.mjs) and consumed by the
// estimator so quote precision improves with every real operation — e.g. per-voice
// chars->seconds ratios let a quote predict TTS/avatar duration without synthesizing.
// The W1-W5 matrix runs remain the calibrated PRICE anchor; this model refines the
// PREDICTIONS between anchors. Always fail-soft: absent/broken model -> static defaults.

const DEFAULT_CHARS_PER_SECOND = 13

function modelFile() {
	return path.resolve(
		process.env.BETTERPPTX_EVOLVING_MODEL_FILE
		|| path.join(path.dirname(fileURLToPath(import.meta.url)), 'cost-basis', 'evolving-model.json'),
	)
}

let cache = { file: null, mtimeMs: 0, model: null }

export function loadEvolvingCostModel() {
	try {
		const file = modelFile()
		const stat = fs.statSync(file)
		if (cache.file === file && cache.mtimeMs === stat.mtimeMs) return cache.model
		const model = JSON.parse(fs.readFileSync(file, 'utf8'))
		if (model?.schemaVersion !== 'betterpptx.evolving-cost-model.v1') return null
		cache = { file, mtimeMs: stat.mtimeMs, model }
		return model
	} catch {
		return null
	}
}

export function speechCharsPerSecond(voice = '') {
	const model = loadEvolvingCostModel()
	const learned = model?.speech?.voices?.[String(voice || '').trim()]?.charsPerSecond
	if (Number.isFinite(learned) && learned > 1) return learned
	const learnedDefault = model?.speech?.defaultCharsPerSecond
	if (Number.isFinite(learnedDefault) && learnedDefault > 1) return learnedDefault
	return DEFAULT_CHARS_PER_SECOND
}

export function speechSecondsFromChars(chars, voice = '') {
	const n = Math.max(0, Number(chars) || 0)
	if (!n) return 0
	return Math.ceil(n / speechCharsPerSecond(voice))
}
