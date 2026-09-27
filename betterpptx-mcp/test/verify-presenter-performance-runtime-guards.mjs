#!/usr/bin/env node
// Local maintainer regression probe. Unlike the public transport harness, this
// deliberately changes only a disposable in-memory deck to test fail-closed
// validation. It never edits a saved package or opens PowerPoint.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'

const value = flag => { const i = process.argv.indexOf(flag); return i < 0 ? undefined : process.argv[i + 1] }
const source = value('--spec'), destination = value('--out')
assert.ok(source && destination, 'Usage: --spec performance-spec.json --out runtime-guards.json')
const { createMcpToolDispatcher, getDeck, collectCompositionIssues } = await import('../engine.mjs')
// Use the supported product dispatcher for construction. No environment gate
// override or raw engine authoring call is used; only the later regression
// mutations are local to this disposable in-memory validation fixture.
const dispatcher = createMcpToolDispatcher({ sessionId: `performance-runtime-guards-${Date.now()}` })
const spec = JSON.parse(await fs.readFile(path.resolve(source), 'utf8'))
const slideIndex = spec.slides.findIndex(slide => slide.presenterPerformance?.entry?.type === 'drop')
assert.ok(slideIndex >= 0, 'A staged drop performance is required for this regression probe')
const actorName = spec.slides[slideIndex].presenterPerformance.actor || 'presenter'
const report = { schemaVersion: 'betterpptx.presenter-performance.runtime-guards.v1', status: 'RUNNING', fixtureConstruction: 'supported-local-dispatcher', opensPowerPoint: false, editsSavedPackage: false, cases: [] }
const call = async (name, args) => {
  const response = await dispatcher.call(name, args)
  assert.equal(response.ok, true, `${name}: ${JSON.stringify(response.error)}`)
  return response.data || response
}
let deckId
try {
  const commit = await call('betterpptx.deck.generate_from_spec', { spec, phase: 'commit', commitMode: 'createNew', plan: 'premium', detail: 'full' })
  deckId = commit.deckId
  const entry = getDeck(deckId), slide = entry.pptx.slides[slideIndex]
  const actor = slide._slideObjects.find(obj => (obj.options?.objectName || obj.objectName) === actorName)
  assert.ok(actor, 'Compiled actor missing')
  const proof = entry.presenterPerformanceValidation?.slides?.find(item => item.actor === actorName && item.slideIndex === slideIndex)
  assert.ok(proof?.entry?.motionPathData, 'Version-bound staged entry proof missing')
  const entryMotion = slide._animations.find(record => record.target === actor && record.animation?.type === 'motion' && record.animation.motionPathData === proof.entry.motionPathData)
  assert.ok(entryMotion, 'Compiled staged entry path missing')
  const nativeLayout = entry.pptx.presLayout || entry.pptx._presLayout
  const inches = value => Number(value) > 1000 ? Number(value) / 914400 : Number(value)
  const slideSize = { w: inches(nativeLayout.width), h: inches(nativeLayout.height) }
  assert.ok(Number.isFinite(slideSize.w) && Number.isFinite(slideSize.h))
  const issues = () => collectCompositionIssues(entry, slideSize)
  const offslide = () => issues().filter(issue => issue.code === 'VISUAL_OFF_SLIDE' && (issue.evidence?.objectName === actorName || issue.objectName === actorName))
  assert.equal(offslide().length, 0, 'Untouched staged entry must validate')
  report.cases.push({ name: 'exact authored entry', status: 'PASS', accepted: true })
  const negative = (name, mutate, restore) => {
    try {
      mutate()
      const findings = offslide()
      assert.ok(findings.length, `${name} incorrectly inherited the staged-entry exemption`)
      report.cases.push({ name, status: 'PASS', rejectedBy: 'VISUAL_OFF_SLIDE', issueCount: findings.length })
    } finally { restore() }
    assert.equal(offslide().length, 0, `${name}: restoring the exact entry must restore validation`)
  }
  const animations = slide._animations
  negative('removed native entry path', () => { slide._animations = animations.filter(record => record !== entryMotion) }, () => { slide._animations = animations })
  const originalX = actor.options.x
  negative('moved actor frame', () => { actor.options.x = originalX + 0.25 }, () => { actor.options.x = originalX })
  const originalDelay = entryMotion.animation.delay
  negative('retimed native entry path', () => { entryMotion.animation.delay = originalDelay + 1 }, () => { entryMotion.animation.delay = originalDelay })
  const originalVersion = entry.presenterPerformanceValidation.deckVersion
  negative('stale compiled validation evidence', () => { entry.presenterPerformanceValidation.deckVersion = originalVersion - 1 }, () => { entry.presenterPerformanceValidation.deckVersion = originalVersion })
  report.status = 'PASS'
} catch (error) {
  report.status = 'FAIL'; report.error = error.stack || String(error); process.exitCode = 1
} finally {
  if (deckId) { try { await call('betterpptx.deck.dispose', { deckId }) } catch {} }
  await fs.mkdir(path.dirname(path.resolve(destination)), { recursive: true })
  await fs.writeFile(path.resolve(destination), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
}
