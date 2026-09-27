import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import JSZip from 'jszip'

const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-chart-emphasis-'))
Object.assign(process.env, {
	BETTERPPTX_ENV: 'test', BETTERPPTX_DEPLOYMENT_STAGE: 'test', NODE_ENV: 'test',
	BETTERPPTX_PUBLIC_BLACK_BOX: '0', BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY: '1',
	BETTERPPTX_BILLING_ENFORCE: '0', BETTERPPTX_PREMIUM: '1', BETTERPPTX_FORCE_PLAN: 'premium',
	BETTERPPTX_OUT_DIR: outputDir, BETTERPPTX_DOWNLOAD_ROOT: outputDir,
})

const { createMcpToolDispatcher } = await import('../engine.mjs')
const dispatcher = createMcpToolDispatcher({ sessionId: `chart-emphasis-${Date.now()}`, blackBox: false })
const dataOf = (result, label) => { assert.equal(result?.ok, true, `${label}: ${JSON.stringify(result?.error || result)}`); return result.data || result }

test.after(async () => fs.rm(outputDir, { recursive: true, force: true }))

test('chart-emphasis lesson serializes the intended fourth-point override through the public path', async () => {
	let deckId
	try {
		const lesson = dataOf(await dispatcher.call('betterpptx.authoring.catalog', { view: 'lesson', lessonId: 'chart-emphasis' }), 'lesson')
		assert.equal(lesson.id, 'chart-emphasis')
		const committed = dataOf(await dispatcher.call('betterpptx.deck.generate_from_spec', {
			spec: lesson.minimalSpec,
			phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true,
			validateAfterCompile: true, validationMode: 'strict', detail: 'full',
		}), 'commit')
		deckId = committed.deckId
		assert.equal(committed.validation.valid, true)
		const nativeAudit = dataOf(await dispatcher.call('betterpptx.deck.validate_native_visuals', { deckId }), 'validate_native_visuals')
		const pointControl = nativeAudit.featureRealizationLedger.controls.find(item => item.controlId === 'chart.dataPointColors')
		assert.ok(pointControl, 'feature-realization ledger must include chart point colors')
		assert.equal(pointControl.verificationLevel, 'structurally-validated')
		assert.deepEqual(pointControl.serializationEvidence.packagePoints, [
			{ index: 0, color: '64748B' },
			{ index: 1, color: '64748B' },
			{ index: 2, color: '64748B' },
			{ index: 3, color: '22C55E' },
		])
		dataOf(await dispatcher.call('betterpptx.deck.validate_quality', {
			deckId, profile: 'static', mode: 'strict', minScore: 0,
			accessibilityMode: 'basic', requireNarration: false, requireMotion: false,
			requireVisualProof: false, requireExpressive3D: false,
		}), 'validate_quality')
		const saved = dataOf(await dispatcher.call('betterpptx.deck.save', {
			deckId, outputDir, fileName: 'chart-emphasis-realization.pptx', plan: 'premium',
		}), 'save')
		const bytes = await fs.readFile(saved.filePath)
		const zip = await JSZip.loadAsync(bytes)
		const chartName = Object.keys(zip.files).find(name => /^ppt\/charts\/chart\d+\.xml$/i.test(name))
		assert.ok(chartName, 'saved lesson must contain one native chart part')
		const xml = await zip.file(chartName).async('string')
		const points = [...xml.matchAll(/<c:dPt>([\s\S]*?)<\/c:dPt>/g)].map(match => match[1])
		const colors = new Map(points.map(point => {
			const index = Number(point.match(/<c:idx val="(\d+)"\/>/)?.[1])
			const color = point.match(/<a:srgbClr val="([0-9A-Fa-f]{6})"/)?.[1]?.toUpperCase()
			return [index, color]
		}))
		assert.equal(colors.get(0), '64748B')
		assert.equal(colors.get(1), '64748B')
		assert.equal(colors.get(2), '64748B')
		assert.equal(colors.get(3), '22C55E')
	} finally {
		if (deckId) await dispatcher.call('betterpptx.deck.dispose', { deckId }).catch(() => {})
	}
})
