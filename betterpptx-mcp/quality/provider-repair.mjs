// IMG6 provider-backed bounded repair adapter.
// The adapter owns orchestration only: callers supply a private Modal-backed candidate
// generator and the real deterministic/semantic evaluator. It never calls an AI API itself.
import { runBoundedRepairLoop } from './repair-loop.mjs'

const ACTION_PROMPTS = {
	edit: 'Preserve the subject and composition while correcting the diagnosed visual issue.',
	'reframe': 'Preserve the subject and visual language while correcting framing, focal placement, or quiet space.',
	'mask-cleanup': 'Preserve the subject and composition while cleaning the cutout edge and alpha boundary.',
	regenerate: 'Create a fresh candidate that satisfies the original brief and the diagnosed visual issue. If the brief requires no text, use a hard no-text raster boundary: no signs, posters, chalkboards, screens, monitors, displays, control panels, projectors, worksheets, book pages, labels, letters, numbers, logos, or watermarks anywhere in the pixels; never show a visible rectangular screen or monitor.',
}

export function imageQualityScore(report = {}) {
	const deterministic = report.deterministic
	const checks = deterministic?.checks && typeof deterministic.checks === 'object' ? Object.values(deterministic.checks) : []
	const hardRatio = checks.length ? checks.filter(Boolean).length / checks.length : (deterministic?.status === 'pass' ? 1 : 0)
	const semantic = report.semantic
	const semanticScore = Number.isFinite(Number(semantic?.weightedTotal)) ? Math.max(0, Math.min(1, Number(semantic.weightedTotal) / 5)) : 0
	// Deterministic hard gates dominate; a calibrated semantic score breaks ties and is
	// intentionally absent (zero) when the private judge abstains.
	return Math.round((hardRatio * 0.8 + semanticScore * 0.2) * 1000000) / 1000000
}

export async function runProviderBackedImageRepair(options = {}) {
	if (!options.initialCandidate) throw new TypeError('initialCandidate is required')
	if (typeof options.evaluate !== 'function') throw new TypeError('evaluate callback is required')
	if (typeof options.generate !== 'function') throw new TypeError('generate callback is required')
	const evaluate = async candidate => {
		const quality = await options.evaluate(candidate)
		return { ...quality, score: Number.isFinite(Number(quality?.score)) ? Number(quality.score) : imageQualityScore(quality) }
	}
	const repair = async context => {
		const action = String(context.action || 'regenerate')
		const instruction = ACTION_PROMPTS[action] || ACTION_PROMPTS.regenerate
		return options.generate({ ...context, action, instruction })
	}
	return runBoundedRepairLoop({
		initialCandidate: options.initialCandidate,
		initialQuality: options.initialQuality,
		maxAttempts: options.maxAttempts,
		costCeilingUsd: options.costCeilingUsd,
		initialCostUsd: options.initialCostUsd,
		evaluate,
		repair,
	})
}

export { ACTION_PROMPTS }
