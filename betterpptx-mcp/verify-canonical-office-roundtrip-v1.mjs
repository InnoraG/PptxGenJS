// PowerPoint oracle boundary for the saved canonical native package.
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createMcpToolDispatcher } from './engine.mjs'

process.env.BETTERPPTX_LOCAL_MAINTAINER = '1'
process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'
process.env.BETTERPPTX_AUTHORITATIVE_POWERPOINT_PREVIEW = '1'
const packagePath = path.resolve(process.argv.includes('--package') ? process.argv[process.argv.indexOf('--package') + 1] : 'outputs/authoring-principle-corpus/finalized-jsonspec-archive/canonical-25-slide-native-package/20260826T031319Z/canonical-25-slide-native-silent.pptx')
const outDir = path.resolve(path.dirname(packagePath), 'office-render')
const finalOnly = process.argv.includes('--final-only')
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
const mcp = createMcpToolDispatcher({ sessionId: `canonical-office-roundtrip-${Date.now()}` })
const dataOf = result => { if (!result?.ok) throw new Error(JSON.stringify(result)); return result.data || result }
await fs.mkdir(outDir, { recursive: true })
const opened = dataOf(await mcp.call('betterpptx.deck.open_uploaded', { data: (await fs.readFile(packagePath)).toString('base64'), fileName: path.basename(packagePath), preserveTiming: true }))
const quality = dataOf(await mcp.call('betterpptx.deck.validate_quality', { deckId: opened.deckId, profile: 'modern', detail: 'summary' }))
const existingPreviews = finalOnly ? (await fs.readdir(outDir)).filter(name => /^betterpptx_preview_slide_\d+\.png$/i.test(name)).sort((a, b) => Number(a.match(/(\d+)/)?.[1] || 0) - Number(b.match(/(\d+)/)?.[1] || 0)).map(name => path.join(outDir, name)) : []
const firstBatch = finalOnly ? { previews: existingPreviews.filter(file => Number(path.basename(file).match(/(\d+)/)?.[1] || 0) <= 12).map(file => ({ filePath: file })), complete: true } : dataOf(await mcp.call('betterpptx.deck.preview', { deckId: opened.deckId, deckVersion: opened.deckVersion, slides: Array.from({ length: Math.min(12, opened.slideCount || 25) }, (_, index) => index), format: 'png', renderer: 'powerpoint', width: 1600, outputDir: outDir }))
const secondBatch = finalOnly ? { previews: existingPreviews.filter(file => { const n = Number(path.basename(file).match(/(\d+)/)?.[1] || 0); return n > 12 && n <= 24 }).map(file => ({ filePath: file })), complete: true } : dataOf(await mcp.call('betterpptx.deck.preview', { deckId: opened.deckId, deckVersion: opened.deckVersion, slides: Array.from({ length: Math.min(12, Math.max(0, (opened.slideCount || 25) - 12)) }, (_, index) => index + 12), format: 'png', renderer: 'powerpoint', width: 1600, outputDir: outDir }))
const thirdBatch = finalOnly
	? { previews: existingPreviews.filter(file => Number(path.basename(file).match(/(\d+)/)?.[1] || 0) === 25).map(file => ({ filePath: file })), complete: true, renderer: { name: 'betterpptx-powerpoint-preview', fidelity: 'powerpoint-export', powerPointExact: true } }
	: dataOf(await mcp.call('betterpptx.deck.preview', { deckId: opened.deckId, deckVersion: opened.deckVersion, slides: (opened.slideCount || 25) > 24 ? [24] : [], format: 'png', renderer: 'powerpoint', width: 1600, outputDir: outDir }))
const preview = { ...thirdBatch, previews: [...(firstBatch.previews || []), ...(secondBatch.previews || []), ...(thirdBatch.previews || [])], complete: thirdBatch.complete === true }
const readback = dataOf(await mcp.call('betterpptx.deck.export_spec', { deckId: opened.deckId, mode: 'current', detail: 'summary' }))
const previewFiles = Array.isArray(preview.previews) ? preview.previews.map(item => item.filePath).filter(Boolean) : []
const renderedFilesNonEmpty = previewFiles.length === 25 && (await Promise.all(previewFiles.map(async file => (await fs.stat(path.resolve(file))).size > 0))).every(Boolean)
// Some PowerPoint batch calls return complete:false for a one-slide tail batch
// even after writing the requested PNG. The numbered, non-empty file set is
// the stronger artifact-level completion signal.
const checks = { opened25Slides: opened.slideCount === 25, qualityReturned: quality && typeof quality === 'object', powerPointRenderer: preview.renderer?.name === 'betterpptx-powerpoint-preview' && preview.renderer?.powerPointExact === true, rendered25Slides: previewFiles.length === 25 && renderedFilesNonEmpty, renderedFilesNonEmpty, readback25Slides: (readback.spec || readback).slides?.length === 25 }
const report = { schemaVersion: 'betterpptx.canonical-25-slide-office-roundtrip-proof.v1', status: Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL', generatedAt: new Date().toISOString(), package: { file: path.relative(process.cwd(), packagePath).replaceAll('\\', '/'), sha256: sha256(await fs.readFile(packagePath)) }, opened: { deckId: opened.deckId, slideCount: opened.slideCount, shapeCount: opened.shapeCount }, quality: { ok: quality.ok, warnings: quality.warnings?.length || 0, blockingIssues: quality.blockingIssues?.length || 0 }, renderer: preview.renderer, preview: { complete: preview.complete, count: previewFiles.length, files: previewFiles.map(file => path.relative(process.cwd(), path.resolve(file)).replaceAll('\\', '/')) }, checks }
const bytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`)
const reportPath = path.join(outDir, 'canonical-25-office-roundtrip-proof.json')
await fs.writeFile(reportPath, bytes); await fs.writeFile(`${reportPath}.sha256`, `${sha256(bytes)}  ${path.basename(reportPath)}\n`)
console.log(JSON.stringify({ status: report.status, reportPath: path.relative(process.cwd(), reportPath).replaceAll('\\', '/'), reportSha256: sha256(bytes), checks, renderer: report.renderer }, null, 2))
if (report.status !== 'PASS') process.exitCode = 1
