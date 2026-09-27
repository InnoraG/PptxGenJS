// A3 seed: run the release-safety verify suite with ONE command and emit a single green/red
// machine-readable report. Each verify is spawned in its own process (they mutate process.env
// and import the engine with dev-harness flags; isolation keeps them honest).
//
// Run: node betterpptx-mcp/verify-release-safety-suite.mjs
// Strict release run: node betterpptx-mcp/verify-release-safety-suite.mjs --strict
// Exit 0 = every required suite passed. In normal development mode, opt-in live
// research suites may be skipped; strict mode fails closed on any skip.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')
const strict = process.argv.includes('--strict') || process.env.BETTERPPTX_RELEASE_SAFETY_STRICT === '1'

const SUITES = [
	{ id: 'layout-engine-v1', file: path.join(here, 'verify-layout-engine-v1.mjs') },
	{ id: 'authoring-excellence-fixture-contract', file: path.join(here, 'verify-authoring-excellence-fixture-contract-v1.mjs') },
	// World treatment is part of the Director contract: gradient Worlds must emit
	// gradients and flat Worlds must stay flat. Keep this in the release aggregate
	// so a visually plausible but semantically wrong treatment cannot pass unnoticed.
	{ id: 'gradient-policy-world-contract', file: path.join(here, 'test', 'gradient-policy.integration.mjs') },
	{ id: 'world-data-style-contract', file: path.join(here, 'test', 'world-data-style.integration.mjs') },
	{ id: 'gradient-package-regression', file: path.join(here, 'verify-gradient-package-regression.mjs') },
	{ id: 'c3-layout-interaction-property-corpus', file: path.join(here, 'verify-c3-layout-interaction-property-corpus.mjs') },
	{ id: 'interaction-contract-v1', file: path.join(here, 'verify-interaction-contract-v1.mjs') },
	{ id: 'timeline-ir', file: path.join(here, 'verify-timeline-ir.mjs') },
	{ id: 'decisions', file: path.join(here, 'verify-decisions.mjs') },
	{ id: 'proposals', file: path.join(here, 'verify-proposals.mjs') },
	{ id: 'motion-policy', file: path.join(here, 'verify-motion-policy.mjs') },
	{ id: 'story-arc', file: path.join(here, 'verify-story-arc.mjs') },
	{ id: 'secondary-motion', file: path.join(here, 'verify-secondary-motion.mjs') },
	{ id: 'impact-accent', file: path.join(here, 'verify-impact-accent.mjs') },
	{ id: 'arc-application', file: path.join(here, 'verify-arc-application.mjs') },
	{ id: 'image-gen-provider', file: path.join(here, 'verify-image-gen-provider.mjs') },
	{ id: 'image-generation-call-metrology', file: path.join(here, 'verify-generation-call-metrology.mjs') },
	{ id: 'image-generation-call-ceiling-corpus', file: path.join(here, 'verify-generation-call-ceiling-corpus.mjs') },
	{ id: 'composition-quiet-space-corpus', file: path.join(here, 'verify-composition-quiet-space-corpus.mjs') },
	{ id: 'image-gen-capability-routing', file: path.join(here, 'verify-image-gen-capability-routing.mjs') },
	{ id: 'image-illustration-demo', file: path.join(here, 'verify-image-illustration-demo.mjs') },
	{ id: 'native-annotation-text-fit', file: path.join(here, 'verify-native-annotation-text-fit.mjs') },
	{ id: 'image-edit-worker-contract', file: path.join(here, 'verify-image-edit-worker-contract.mjs') },
	{ id: 'image-edit-worker-license-inventory', file: path.join(here, 'verify-image-edit-worker-license-inventory.mjs') },
	{ id: 'image-edit-worker-canary-evidence', file: path.join(here, 'verify-image-edit-worker-canary-evidence.mjs') },
	{ id: 'image-quality-gates', file: path.join(here, 'verify-image-quality-gates.mjs') },
	{ id: 'sharpness-selector', file: path.join(here, 'verify-sharpness-selector.mjs') },
	{ id: 'premium-ensemble-selection-durability', file: path.join(here, 'verify-premium-ensemble-selection-durability.mjs') },
	{ id: 'image-quality-corpus', file: path.join(here, 'verify-image-quality-corpus.mjs') },
	{ id: 'ocr-adapter', file: path.join(here, 'verify-ocr-adapter.mjs') },
	{ id: 'image-authoring-ocr-corpus', file: path.join(here, 'verify-image-authoring-ocr-corpus.mjs') },
	{ id: 'semantic-judge', file: path.join(here, 'verify-semantic-judge.mjs') },
	{ id: 'semantic-judge-candidates', file: path.join(here, 'verify-semantic-judge-candidates.mjs') },
	{ id: 'semantic-calibration', file: path.join(here, 'verify-semantic-calibration.mjs') },
	{ id: 'repair-loop', file: path.join(here, 'verify-repair-loop.mjs') },
	{ id: 'provider-repair', file: path.join(here, 'verify-provider-repair.mjs') },
	{ id: 'repair-multicase-corpus', file: path.join(here, 'verify-repair-multicase-corpus.mjs') },
	{ id: 'semantic-judge-worker-contract', file: path.join(here, 'verify-semantic-judge-worker-contract.mjs') },
	{ id: 'semantic-judge-worker-inventory', file: path.join(here, 'verify-semantic-judge-worker-inventory.mjs') },
	{ id: 'semantic-judge-worker-client', file: path.join(here, 'verify-semantic-judge-worker-client.mjs') },
	{ id: 'semantic-judge-direct-pairwise-client', file: path.join(here, 'verify-semantic-judge-direct-pairwise-client.mjs') },
	{ id: 'semantic-judge-profile-registration', file: path.join(here, 'verify-semantic-judge-profile-registration.mjs') },
	{ id: 'semantic-judge-worker-live-adapter', file: path.join(here, 'verify-semantic-judge-worker-live-adapter.mjs') },
	{ id: 'visual-director', file: path.join(here, 'verify-visual-director.mjs') },
	{ id: 'visual-source-router-corpus', file: path.join(here, 'verify-visual-source-router-corpus.mjs') },
	{ id: 'series-director', file: path.join(here, 'verify-series-director.mjs') },
	{ id: 'image-treatment-plan', file: path.join(here, 'verify-image-treatment-plan.mjs') },
	{ id: 'image-treatment-canary', file: path.join(here, 'verify-image-treatment-canary.mjs') },
	{ id: 'series-coherence', file: path.join(here, 'verify-series-coherence.mjs') },
	{ id: 'img8-rendered-series-coherence', file: path.join(here, 'verify-img8-rendered-series-coherence.mjs') },
	{ id: 'image-accessibility-contract', file: path.join(here, 'verify-image-accessibility-contract.mjs') },
	{ id: 'image-pptx-package', file: path.join(here, 'verify-image-pptx-package.mjs') },
	{ id: 'image-pptx-crop-corpus', file: path.join(here, 'verify-image-pptx-crop-corpus.mjs') },
	{ id: 'image-pptx-com-corpus', file: path.join(here, 'verify-image-pptx-com-corpus.mjs') },
	{ id: 'generated-pptx-com-corpus', file: path.join(here, 'verify-generated-pptx-com-corpus.mjs') },
	// Contextual corpus proof is intentionally routed through the public semantic
	// JSON-spec MCP boundary; it must never fall back to primitive slide mutation.
	{ id: 'contextual-authoring-pptx', file: path.join(here, 'verify-contextual-authoring-pptx.mjs') },
	{ id: 'authoring-com-regression', file: path.join(here, 'verify-authoring-com-regression.mjs') },
	{ id: 'hidden-image-deck-communication', file: path.join(here, 'verify-hidden-image-deck-communication.mjs') },
	{ id: 'rendered-pptx-slide-quality', file: path.join(here, 'verify-rendered-pptx-slide-quality.mjs') },
	{ id: 'img11-slide-context-corpus', file: path.join(here, 'verify-img11-slide-context-corpus.mjs') },
	{ id: 'modal-rotation-cross-instance', file: path.join(here, 'verify-modal-rotation-cross-instance.mjs') },
	{ id: 'private-modal-account-inventory', file: path.join(here, 'verify-private-modal-account-inventory.mjs') },
	{ id: 'owner-control-evidence', file: path.join(here, 'verify-owner-control-evidence.mjs') },
	{ id: 'owner-quality-criterion', file: path.join(here, 'verify-owner-quality-criterion.mjs') },
	{ id: 'image-authoring-research-mode-signoff', file: path.join(here, 'verify-image-authoring-research-mode-signoff.mjs') },
	{ id: 'gen-asset-tenant-policy', file: path.join(here, 'verify-gen-asset-tenant-policy.mjs') },
	{ id: 'blind-review-packet', file: path.join(here, 'verify-blind-review-packet.mjs') },
	{ id: 'blind-review-visual-packet', file: path.join(here, 'verify-blind-review-visual-packet.mjs') },
	{ id: 'modal-canary-evidence', file: path.join(here, 'verify-modal-canary-evidence.mjs') },
	{ id: 'modal-repair-evidence', file: path.join(here, 'verify-modal-repair-evidence.mjs') },
	{ id: 'generated-image-durability', file: path.join(here, 'verify-generated-image-durability.mjs') },
	// Bounded live research proof is opt-in so the ordinary regression suite never
	// spends GPU silently. Run with BETTERPPTX_RUN_LIVE_RESEARCH=1 when the
	// maintained Modal credential pool is intentionally being exercised.
	{ id: 'live-generated-image-durability', file: path.join(here, 'verify-live-generated-image-durability.mjs'), liveResearch: true },
	{ id: 'live-sharpness-brief-canary', file: path.join(here, 'verify-live-sharpness-brief-canary.mjs'), liveResearch: true },
	{ id: 'live-engine-premium-ensemble', file: path.join(here, 'verify-live-engine-premium-ensemble.mjs'), liveResearch: true },
	{ id: 'img12-private-e2e-canary', file: path.join(here, 'verify-img12-private-e2e-canary.mjs') },
	{ id: 'director-workflow-contract', file: path.join(here, 'verify-director-workflow-v1.mjs') },
	{ id: 'mcp-json-spec-authoring-boundary', file: path.join(here, 'verify-mcp-json-spec-authoring-boundary-v1.mjs') },
	{ id: 'private-generation-boundary', file: path.join(here, 'verify-private-generation-boundary.mjs') },
	{ id: 'public-semantic-authoring', file: path.join(here, 'verify-public-semantic-authoring-v1.mjs') },
	{ id: 'blackbox-generation-adversarial', file: path.join(here, 'verify-blackbox-generation-adversarial.mjs') },
	{ id: 'blackbox-fixtures', file: path.join(here, 'verify-blackbox-fixtures.mjs') },
	{ id: 'g1-historical-artifact-quarantine', file: path.join(here, 'verify-g1-historical-artifact-quarantine.mjs'), args: ['--strict'] },
	// Narrow owner-evidence check: verifies the exact private scoped avatar
	// approval artifact, while preserving the full identity gate as open.
	{ id: 'avatar-scoped-owner-approval', file: path.join(here, 'verify-avatar-scoped-owner-approval.mjs') },
	{ id: 'avatar-production-routing', file: path.join(here, 'verify-avatar-production-routing.mjs') },
	{ id: 'source-provenance-contract', file: path.join(here, 'verify-source-provenance-contract.mjs') },
	// The normal aggregate keeps these release gates report-only, matching `gulp ship`.
	// Strict mode passes their explicit fail-closed switches so the aggregate proves the
	// actual delivery boundary, not only the deterministic test corpus.
	{ id: 'source-provenance-release-gate', file: path.join(here, 'verify-source-provenance-gate.mjs'), strictArgs: ['--strict'] },
	{ id: 'g1-delivery-release-gate', file: path.join(here, 'verify-g1-delivery-release-manifest.mjs'), strictArgs: ['--strict'] },
	{ id: 'g4-deployment-secret-gate', file: path.join(here, 'verify-g4-deployment-secret-gate.mjs'), strictArgs: ['--strict'] },
	{ id: 'g5-product-asset-release-gate', file: path.join(here, 'verify-g5-product-asset-ledger.mjs'), strictArgs: ['--strict'] },
	{ id: 'avatar-durable-dispatch', file: path.join(here, 'verify-avatar-durable-dispatch.mjs') },
	{ id: 'rigged3d-gen', file: path.join(here, 'verify-rigged3d-gen.mjs') },
	{ id: 'meshy-timeline-profile-contract', file: path.join(here, 'verify-meshy-timeline-profile-contract.mjs') },
	{ id: 'model3d-worker-timeline-contract', file: path.join(here, 'verify-model3d-worker-timeline-contract.mjs') },
	{ id: 'sidecar-privacy', file: path.join(here, 'verify-sidecar-privacy.mjs') },
	{ id: 'gen-asset-durability', file: path.join(here, 'verify-gen-asset-durability.mjs') },
	{ id: 'director-compose', file: path.join(repoRoot, 'research-demos', '2026-07-12-presenter-cofire', 'verify-director-compose.mjs'), optional: true }, // research-demos is gitignored; present on the dev box only
	{ id: 'compiler-determinism', file: path.join(here, 'verify-compiler-determinism.mjs'), optional: true }, // self-skips without the on-disk research manifests
]

const results = []
for (const suite of SUITES) {
	if (suite.liveResearch && process.env.BETTERPPTX_RUN_LIVE_RESEARCH !== '1') {
		results.push({ id: suite.id, status: 'SKIPPED_OPTIONAL', passed: null, failed: null, ms: 0, reason: 'live research suite is opt-in' })
		console.log(`  skip ${suite.id} (set BETTERPPTX_RUN_LIVE_RESEARCH=1 to run)`)
		continue
	}
	const started = Date.now()
	const suiteArgs = [...(suite.args || []), ...(strict ? (suite.strictArgs || []) : [])]
	// Every verifier resolves repository-relative fixtures and outputs. Pin the
	// child cwd to the repository root so the aggregate is invocation-location
	// independent (running from betterpptx-mcp/ must not create false path/ENOENT
	// failures in otherwise passing gates).
	const run = spawnSync(process.execPath, [suite.file, ...suiteArgs], { cwd: repoRoot, encoding: 'utf8', timeout: 600000 })
	const out = `${run.stdout || ''}${run.stderr || ''}`
	const missing = run.error?.code === 'ENOENT' || /Cannot find module|no such file/i.test(out)
	const tally = out.match(/PASSED:\s*(\d+)\s*passed,\s*(\d+)\s*failed/i) || out.match(/UNIT PASSED:\s*(\d+)\s*passed,\s*(\d+)\s*failed/i)
	const status = missing && suite.optional ? 'SKIPPED_OPTIONAL' : run.status === 0 ? 'PASS' : 'FAIL'
	results.push({
		id: suite.id,
		status,
		passed: tally ? Number(tally[1]) : null,
		failed: tally ? Number(tally[2]) : null,
		ms: Date.now() - started,
		...(status === 'FAIL' ? { tail: out.split(/\r?\n/).filter(Boolean).slice(-8) } : {}),
	})
	console.log(`  ${status === 'PASS' ? 'ok  ' : status === 'SKIPPED_OPTIONAL' ? 'skip' : 'FAIL'} ${suite.id}${tally ? ` (${tally[1]} passed, ${tally[2]} failed)` : ''} ${Math.round((Date.now() - started) / 1000)}s`)
}

const red = results.filter(r => r.status === 'FAIL')
const skipped = results.filter(r => r.status === 'SKIPPED_OPTIONAL')
const blocking = strict ? [...red, ...skipped] : red
const report = { suite: 'release-safety', mode: strict ? 'strict' : 'development', strict, green: blocking.length === 0, results }
const reportFile = strict ? 'release-safety-suite-strict-report.json' : 'release-safety-suite-report.json'
await fs.writeFile(path.join(here, 'outputs', reportFile), JSON.stringify(report, null, 2) + '\n')
console.log(`\nREPORT ${JSON.stringify(report)}`)
if (blocking.length === 0) {
	console.log(strict ? 'GREEN: all strict release-safety verifies passed' : 'GREEN: all release-safety verifies passed')
} else {
	const reasons = [
		...red.map(r => `${r.id} failed`),
		...(strict ? skipped.map(r => `${r.id} skipped`) : []),
	]
	console.log(`RED: ${reasons.join(', ')}`)
}
process.exit(blocking.length === 0 ? 0 : 1)
