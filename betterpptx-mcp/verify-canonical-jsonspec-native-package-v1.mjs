// Local maintainer proof for the canonical source: compile the same silent
// execution variant, save a real PPTX, reopen it, and read its semantic deck.
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createMcpToolDispatcher } from './engine.mjs'

process.env.BETTERPPTX_LOCAL_MAINTAINER = '1'
process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'
process.env.BETTERPPTX_FORCE_PLAN = 'premium'
const source = process.argv.includes('--source') ? process.argv[process.argv.indexOf('--source') + 1] : 'tmp_autonomous_test/GPT56_BetterPPTX_Canonical_Full_Spec.json'
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
const sourceRaw = await fs.readFile(path.resolve(source))
const sourceSpec = JSON.parse(sourceRaw)
const executionSpec = {
	...sourceSpec,
	outputVariant: 'silent-timed-notes',
	selectedOutputVariants: ['silent-timed-notes'],
	narrationPolicy: { ...(sourceSpec.narrationPolicy || {}), synthesizeAudio: false, required: false, failurePolicy: 'notes-only' },
	slides: (sourceSpec.slides || []).map(slide => ({ ...slide, narration: slide.narration && typeof slide.narration === 'object' ? { ...slide.narration, synthesizeAudio: false, useAsTimingAuthority: false } : slide.narration })),
}
const executionBytes = Buffer.from(`${JSON.stringify(stable(executionSpec))}\n`)
const sourceSha256 = sha256(Buffer.from(`${JSON.stringify(stable(sourceSpec))}\n`))
const executionSha256 = sha256(executionBytes)
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const outDir = path.resolve(`outputs/authoring-principle-corpus/finalized-jsonspec-archive/canonical-25-slide-native-package/${stamp}`)
const fileName = 'canonical-25-slide-native-silent.pptx'
const mcp = createMcpToolDispatcher({ sessionId: `canonical-native-package-${Date.now()}` })
const dataOf = result => { if (!result?.ok) throw new Error(JSON.stringify(result)); return result.data || result }
await fs.mkdir(outDir, { recursive: true })
const dry = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { spec: executionSpec, phase: 'dryRun', commitMode: 'createNew', plan: 'premium', detail: 'summary', validateAfterCompile: true, validationMode: 'strict', idempotencyKey: `canonical-native-package-dry-${executionSha256}` }))
const commit = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { spec: executionSpec, phase: 'commit', commitMode: 'createNew', plan: 'premium', planId: dry.planId, lockedPlanId: dry.planId, planDigest: dry.planDigest, detail: 'summary', validateAfterCompile: true, validationMode: 'strict', billingConfirmed: true, saveAfterCommit: false, idempotencyKey: `canonical-native-package-commit-${executionSha256}` }))
const quality = dataOf(await mcp.call('betterpptx.deck.validate_quality', { deckId: commit.deckId, profile: 'modern', detail: 'summary' }))
const saved = dataOf(await mcp.call('betterpptx.deck.save', { deckId: commit.deckId, outputDir: outDir, fileName, idempotencyKey: `canonical-native-package-save-${executionSha256}` }))
const outputPath = path.resolve(saved.filePath || saved.path || path.join(outDir, fileName))
const reopened = dataOf(await mcp.call('betterpptx.deck.open_uploaded', { data: (await fs.readFile(outputPath)).toString('base64'), fileName, preserveTiming: true }))
const readback = dataOf(await mcp.call('betterpptx.deck.export_spec', { deckId: reopened.deckId, mode: 'current', detail: 'summary' }))
const readbackSpec = readback.spec || readback
const readbackSlides = readbackSpec.slides?.length || 0
const readbackObjects = readbackSpec.slides?.reduce((n, slide) => n + (slide.content?.length || 0), 0) || 0
const checks = { sourceIs25Slides: sourceSpec.slides?.length === 25, dryRunMutationFree: dry.mutationFree === true, committed: commit.slideCount === 25 && commit.objectCount >= 871, qualityReturned: quality && typeof quality === 'object', saved: await fs.stat(outputPath).then(stat => stat.size > 0).catch(() => false), reopened: reopened.slideCount === 25, readbackSlides: readbackSlides === 25, readbackObjectsAtLeastSource: readbackObjects >= 871 }
const report = { schemaVersion: 'betterpptx.canonical-25-slide-native-package-proof.v1', status: Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL', generatedAt: new Date().toISOString(), source: path.basename(source), sourceSha256, executionVariant: 'silent-timed-notes', executionSha256, deck: { deckId: commit.deckId, slideCount: commit.slideCount, objectCount: commit.objectCount, deckVersion: commit.deckVersion }, quality: { ok: quality.ok, warnings: quality.warnings?.length || 0, blockingIssues: quality.blockingIssues?.length || 0 }, package: { file: path.relative(process.cwd(), outputPath).replaceAll('\\', '/'), bytes: (await fs.stat(outputPath)).size, sha256: sha256(await fs.readFile(outputPath)) }, reopened: { deckId: reopened.deckId, slideCount: reopened.slideCount, shapeCount: reopened.shapeCount }, readback: { slideCount: readbackSlides, objectCount: readbackObjects }, checks, externalBoundary: 'canonical narrated TTS was separately attempted through the public lane and timed out; this package proof isolates native slide compilation and notes/timing without audio synthesis' }
const reportBytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`)
const reportPath = path.join(outDir, 'canonical-25-native-package-proof.json')
await fs.writeFile(reportPath, reportBytes); await fs.writeFile(`${reportPath}.sha256`, `${sha256(reportBytes)}  ${path.basename(reportPath)}\n`)
console.log(JSON.stringify({ status: report.status, reportPath: path.relative(process.cwd(), reportPath).replaceAll('\\', '/'), reportSha256: sha256(reportBytes), package: report.package, checks }, null, 2))
if (report.status !== 'PASS') process.exitCode = 1
