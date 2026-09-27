// Native lifecycle proof for the canonical narration and transition contract.
// Audio synthesis is intentionally disabled here: notes, cues, timing and
// transition intent are certified independently while public TTS remains an
// explicitly tracked infrastructure boundary.
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createMcpToolDispatcher } from './engine.mjs'

process.env.BETTERPPTX_LOCAL_MAINTAINER = '1'
process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'
process.env.BETTERPPTX_FORCE_PLAN = 'premium'
const sourcePath = path.resolve(process.argv.includes('--source') ? process.argv[process.argv.indexOf('--source') + 1] : 'tmp_autonomous_test/GPT56_BetterPPTX_Canonical_Full_Spec.json')
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
const countCues = spec => (spec?.slides || []).reduce((sum, slide) => sum + (slide?.narration?.cues?.length || 0), 0)
const countTransitions = spec => (spec?.slides || []).filter(slide => slide?.transition && typeof slide.transition === 'object').length
const dataOf = result => { if (!result?.ok) throw new Error(JSON.stringify(result)); return result.data || result }

const sourceSpec = JSON.parse(await fs.readFile(sourcePath, 'utf8'))
const executionSpec = {
  ...sourceSpec,
  outputVariant: 'silent-timed-notes',
  selectedOutputVariants: ['silent-timed-notes'],
  narrationPolicy: { ...(sourceSpec.narrationPolicy || {}), synthesizeAudio: false, required: false, failurePolicy: 'notes-only' },
  slides: (sourceSpec.slides || []).map(slide => ({ ...slide, narration: slide.narration && typeof slide.narration === 'object' ? { ...slide.narration, synthesizeAudio: false, useAsTimingAuthority: false } : slide.narration }))
}
const executionSha256 = sha256(Buffer.from(`${JSON.stringify(stable(executionSpec))}\n`))
const sourceSha256 = sha256(Buffer.from(`${JSON.stringify(stable(sourceSpec))}\n`))
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const outputDir = path.resolve(`outputs/authoring-principle-corpus/finalized-jsonspec-archive/canonical-25-slide-narration-transition/${stamp}`)
const fileName = 'canonical-25-slide-narration-transition-silent.pptx'
await fs.mkdir(outputDir, { recursive: true })
const mcp = createMcpToolDispatcher({ sessionId: `canonical-narration-transition-${Date.now()}` })
const dry = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { spec: executionSpec, phase: 'dryRun', commitMode: 'createNew', plan: 'premium', detail: 'summary', validateAfterCompile: true, validationMode: 'strict', idempotencyKey: `canonical-narration-transition-dry-${executionSha256}` }))
const commit = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { spec: executionSpec, phase: 'commit', commitMode: 'createNew', plan: 'premium', planId: dry.planId, lockedPlanId: dry.planId, planDigest: dry.planDigest, detail: 'summary', validateAfterCompile: true, validationMode: 'strict', billingConfirmed: true, saveAfterCommit: false, idempotencyKey: `canonical-narration-transition-commit-${executionSha256}` }))
const quality = dataOf(await mcp.call('betterpptx.deck.validate_quality', { deckId: commit.deckId, profile: 'modern', detail: 'summary' }))
const current = dataOf(await mcp.call('betterpptx.deck.export_spec', { deckId: commit.deckId, mode: 'current', detail: 'summary' }))
const currentSpec = current.spec || current
const saved = dataOf(await mcp.call('betterpptx.deck.save', { deckId: commit.deckId, outputDir, fileName, idempotencyKey: `canonical-narration-transition-save-${executionSha256}` }))
const outputPath = path.resolve(saved.filePath || saved.path || path.join(outputDir, fileName))
const reopened = dataOf(await mcp.call('betterpptx.deck.open_uploaded', { data: (await fs.readFile(outputPath)).toString('base64'), fileName, preserveTiming: true }))
const readback = dataOf(await mcp.call('betterpptx.deck.export_spec', { deckId: reopened.deckId, mode: 'current', detail: 'summary' }))
const readbackSpec = readback.spec || readback
const sourceCues = countCues(sourceSpec)
const currentCues = countCues(currentSpec)
const readbackCues = countCues(readbackSpec)
const sourceTransitions = countTransitions(sourceSpec)
const currentTransitions = countTransitions(currentSpec)
const readbackTransitions = countTransitions(readbackSpec)
const checks = {
  sourceIs25Slides: sourceSpec.slides?.length === 25,
  sourceHas156NarrationCues: sourceCues === 156,
  sourceHas25Transitions: sourceTransitions === 25,
  dryRunMutationFree: dry.mutationFree === true,
  committed25Slides: commit.slideCount === 25,
  committedObjectsAtLeast871: commit.objectCount >= 871,
  qualityReturned: quality && typeof quality === 'object',
  currentReadback25Slides: currentSpec.slides?.length === 25,
  currentReadbackNarrationCues: currentCues === sourceCues,
  currentReadbackTransitions: currentTransitions === sourceTransitions,
  savedNonEmpty: await fs.stat(outputPath).then(stat => stat.size > 0).catch(() => false),
  reopened25Slides: reopened.slideCount === 25,
  reopenedNarrationCues: readbackCues === sourceCues,
  reopenedTransitions: readbackTransitions === sourceTransitions
}
const report = {
  schemaVersion: 'betterpptx.canonical-25-narration-transition-native-proof.v1',
  status: Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL',
  generatedAt: new Date().toISOString(),
  source: { file: path.relative(process.cwd(), sourcePath).replaceAll('\\', '/'), sha256: sourceSha256, slides: sourceSpec.slides?.length || 0, narrationCues: sourceCues, transitionIntents: sourceTransitions },
  execution: { variant: 'silent-timed-notes', sha256: executionSha256, dryRun: { mutationFree: dry.mutationFree, slideCount: dry.slideCount, objectCount: dry.objectCount, planDigest: dry.planDigest }, commit: { slideCount: commit.slideCount, objectCount: commit.objectCount, deckId: commit.deckId }, quality: { ok: quality.ok, warningCount: quality.warnings?.length || 0, blockingIssues: quality.blockingIssues?.length || 0 } },
  currentReadback: { slides: currentSpec.slides?.length || 0, narrationCues: currentCues, transitionIntents: currentTransitions },
  reopenedReadback: { slides: readbackSpec.slides?.length || 0, narrationCues: readbackCues, transitionIntents: readbackTransitions, deckId: reopened.deckId },
  package: { file: path.relative(process.cwd(), outputPath).replaceAll('\\', '/'), bytes: (await fs.stat(outputPath)).size, sha256: sha256(await fs.readFile(outputPath)) },
  checks,
  externalBoundary: 'public narrated TTS previously ended with UND_ERR_BODY_TIMEOUT / TypeError terminated; this native proof certifies notes, cue timing and transition intent without audio synthesis'
}
const reportBytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`)
const reportPath = path.join(outputDir, 'canonical-25-narration-transition-native-proof.json')
await fs.writeFile(reportPath, reportBytes)
await fs.writeFile(`${reportPath}.sha256`, `${sha256(reportBytes)}  ${path.basename(reportPath)}\n`)
console.log(JSON.stringify({ status: report.status, reportPath: path.relative(process.cwd(), reportPath).replaceAll('\\', '/'), reportSha256: sha256(reportBytes), package: report.package, checks }, null, 2))
if (report.status !== 'PASS') process.exitCode = 1
