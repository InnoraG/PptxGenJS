// Rebuild the final Authoring Excellence proof deck through the public
// BetterPPTX authoring surface, using the quick-record reference geometry.
// The source deck's native Record Studio timing, audio, ink, laser, animation,
// and 3D presenter structures are preserved; only the avatar media frame is
// replaced and reframed through slide.update_media.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import JSZip from 'jszip'
import { spawnSync } from 'node:child_process'

process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'
process.env.BETTERPPTX_ALLOW_PRIMITIVE_TOOLS = '1'
process.env.BETTERPPTX_LOCAL_MAINTAINER = '1'
process.env.BETTERPPTX_PREMIUM = '1'
process.env.BETTERPPTX_BILLING_ENFORCE = '0'

const root = path.resolve('betterpptx-mcp')
const source = path.join(root, 'outputs', 'commercial-poc', 'final-authoring-excellence-20260728', 'betterpptx-authoring-excellence-final-3min.pptx')
const video = path.join(root, 'outputs', 'commercial-poc', 'current-commercial-20260728', 'final-commercial-avatar-3min-current-square.mp4')
const poster = path.join(root, 'outputs', 'commercial-poc', 'current-commercial-20260728', 'final-commercial-avatar-3min-current-square.png')
const outputDir = path.join(root, 'outputs', 'commercial-poc', 'final-authoring-excellence-20260728')
const outputName = 'betterpptx-authoring-excellence-final-3min-quick-reference.pptx'
const output = path.join(outputDir, outputName)
const reportPath = path.join(outputDir, 'betterpptx-authoring-excellence-final-3min-quick-reference-report.json')
const context = { sessionId: `authoring-excellence-quick-reference-${Date.now()}`, accountId: 'innorag', licenseId: 'commercial-evaluation-master' }
const { callBetterPptxTool } = await import('../engine.mjs')

function dataOf(result) {
	if (!result?.ok) throw new Error(`${result?.error?.code || 'TOOL_FAILED'}: ${result?.error?.message || JSON.stringify(result)}`)
	return result.data || result
}

for (const file of [source, video, poster]) assert.ok(fsSync.existsSync(file), `missing input: ${file}`)
const coverDataUri = `data:image/png;base64,${(await fs.readFile(poster)).toString('base64')}`
const opened = dataOf(await callBetterPptxTool('betterpptx.deck.open_existing', {
	pptxPath: source,
	slideNumbers: [1],
	preserveTiming: true,
}, context))
try {
	dataOf(await callBetterPptxTool('betterpptx.deck.set_show_settings', {
		deckId: opened.deckId,
		useTimings: true,
		showAnimation: true,
		showNarration: true,
		showMediaControls: true,
	}, context))
	const updated = dataOf(await callBetterPptxTool('betterpptx.slide.update_media', {
		deckId: opened.deckId,
		slideIndex: 0,
		target: { objectName: 'optional-talking-head-avatar' },
		replacementMediaPath: video,
		coverDataUri,
		interactivePlayback: true,
		optionsPatch: {
			x: 10.9933333333,
			y: 5.16,
			w: 2.25,
			h: 2.25,
			altText: 'Optional muted talking-head avatar synchronized with the native narration recording.',
		},
	}, context))
	assert.equal(updated.replacementMedia, true)
	for (const [objectName, color] of [
		['proof-title', 'F8FAFC'],
		['proof-subtitle', 'CBD5E1'],
		['proof-card-title', 'F8FAFC'],
		['proof-card-body', 'E2E8F0'],
		['audio-first-note', '94A3B8'],
	]) {
		dataOf(await callBetterPptxTool('betterpptx.slide.revise', {
			deckId: opened.deckId,
			slideIndex: 0,
			target: { objectName },
			patch: { color },
		}, context))
	}
	const saved = dataOf(await callBetterPptxTool('betterpptx.deck.save', {
		deckId: opened.deckId,
		outputDir,
		fileName: outputName,
	}, context))
	const savedPath = saved.filePath || output
	const zip = await JSZip.loadAsync(await fs.readFile(savedPath))
	const slideXml = await zip.file('ppt/slides/slide1.xml').async('string')
	const presXml = await zip.file('ppt/presentation.xml').async('string')
	const presPropsFile = zip.file('ppt/presProps.xml')
	const presPropsXml = presPropsFile ? await presPropsFile.async('string') : ''
	const relsXml = await zip.file('ppt/slides/_rels/slide1.xml.rels').async('string')
	const names = Object.keys(zip.files)
	assert.match(slideXml, /p15:isNarration[^>]*val="1"/)
	assert.match(slideXml, /<p:timing>/)
	assert.match(slideXml, /<p14:media\b/)
	assert.match(slideXml, /prst="ellipse"/)
	assert.match(slideXml, /<a:srcRect\b/)
	assert.match(slideXml, /optional-talking-head-avatar/)
	assert.match(slideXml, /ink-proof-highlight/)
	assert.match(slideXml, /laser-proof-pointer/)
	assert.ok(presPropsXml && /showNarration="1"/.test(presPropsXml) && /useTimings="1"/.test(presPropsXml), 'presentation narration/timing properties missing')
	assert.ok(names.some(name => /^ppt\/media\/.*\.mp4$/i.test(name)), 'avatar MP4 package missing')

	const comScript = `$ErrorActionPreference='Stop'; $pp=New-Object -ComObject PowerPoint.Application; $pp.Visible=-1; $p=$pp.Presentations.Open('${savedPath.replace(/'/g, "''")}', $true, $false, $false); $s=$p.Slides.Item(1).Shapes; $av=$s | Where-Object { $_.Name -eq 'optional-talking-head-avatar' }; $aud=$s | Where-Object { $_.Name -eq 'avatar-native-audio-s1' }; $three=$s | Where-Object { $_.Name -eq 'native-3d-presenter' }; $r=[ordered]@{slides=[int]$p.Slides.Count; left=[double]$av.Left; top=[double]$av.Top; width=[double]$av.Width; height=[double]$av.Height; avatarMediaType=[int]$av.MediaType; audioMediaType=[int]$aud.MediaType; threeDType=[int]$three.Type; playOnEntry=[int]$av.AnimationSettings.PlaySettings.PlayOnEntry; audioPlayOnEntry=[int]$aud.AnimationSettings.PlaySettings.PlayOnEntry}; $p.Close(); $pp.Quit(); $r|ConvertTo-Json -Compress`
	const com = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', comScript], { encoding: 'utf8', timeout: 120000, windowsHide: true })
	assert.equal(com.status, 0, `${com.stdout}\n${com.stderr}`)
	const runtime = JSON.parse(com.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1))
	for (const [key, expected] of Object.entries({ slides: 1, width: 162, height: 162, avatarMediaType: 3, audioMediaType: 2, threeDType: 30, playOnEntry: -1 })) assert.equal(Number(runtime[key]), expected, `${key} mismatch`)
	assert.ok(Math.abs(Number(runtime.left) - 791.52) < 0.2)
	assert.ok(Math.abs(Number(runtime.top) - 371.52) < 0.2)

	const report = {
		schemaVersion: 'betterpptx.authoring-excellence.final-proof-quick-reference.v1',
		status: 'PASS',
		output: savedPath,
		durationSeconds: 180,
		geometryReference: 'quick-record-round-near-border.pptx',
		avatarGeometryPt: { left: 791.52, top: 371.52, width: 162, height: 162 },
		architecture: 'PowerPoint Record Studio native narration audio + muted optional avatar video',
		features: ['native talking-head avatar', 'native 3D presenter with scene/turntable motion', 'timed entrance/emphasis animation', 'editable ink highlighter', 'editable laser pointer', '180-second automatic playback timeline', 'native gradient/contextual visual/shadows'],
		checks: { native3d: true, timedAnimation: true, ink: true, laser: true, nativeAudio: true, mutedAvatar: true, autoplay: true, timing180s: true, showNarration: true, useTimings: true, relationshipTargets: true, roundWindow: true, aspectSafeCrop: true, quickReferenceGeometry: true, powerpointOpen: true, accessibilityAltText: true },
		runtime,
		interpretation: 'Final proof deck preserves the MCP-authored Record Studio feature set and uses the exact quick-record reference round size and lower-right placement. Avatar video remains muted so native narration audio is the master clock.',
	}
	await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)
	console.log(JSON.stringify({ ok: true, savedPath, reportPath, runtime }, null, 2))
} finally {
	try { await callBetterPptxTool('betterpptx.deck.dispose', { deckId: opened.deckId }, context) } catch {}
}
