import test from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { inspectNativeCaptionTracks, inspectWebVtt } from '../narration/native-caption-package-evidence.mjs'

function packageFixture({ missingSecondPart = false, invalidSecondCue = false } = {}) {
	const zip = new JSZip()
	zip.file('ppt/slides/slide1.xml', `<?xml version="1.0"?><p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:p173="http://schemas.microsoft.com/office/powerpoint/2017/3/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:spTree><p:pic><p:nvPicPr><p:cNvPr name="narration-seg1"/></p:nvPicPr><p173:track r:embed="rId4" lang="en-US"/></p:pic><p:pic><p:nvPicPr><p:cNvPr name="narration-seg2"/></p:nvPicPr><p173:track r:embed="rId8" lang="en-US"/></p:pic></p:spTree></p:sld>`)
	zip.file('ppt/slides/_rels/slide1.xml.rels', `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId4" Type="http://schemas.microsoft.com/office/2017/04/relationships/track" Target="../media/caption-1.vtt"/><Relationship Id="rId8" Type="http://schemas.microsoft.com/office/2017/04/relationships/track" Target="../media/caption-2.vtt"/></Relationships>`)
	zip.file('ppt/media/caption-1.vtt', 'WEBVTT\n\n1\n00:00:00.000 --> 00:00:02.500\nFirst clip\n')
	if (!missingSecondPart) zip.file('ppt/media/caption-2.vtt', invalidSecondCue
		? 'WEBVTT\n\n1\n00:00:03.000 --> 00:00:01.000\nBad cue\n'
		: 'WEBVTT\n\n1\n00:00:00.000 --> 00:00:03.250\nSecond clip\n')
	return zip
}

test('native caption evidence binds clip-local WebVTT to semantic narration segments', async () => {
	const evidence = await inspectNativeCaptionTracks(packageFixture(), 0, {
		segments: [{ objectName: 'narration-seg1', startMs: 1000 }, { objectName: 'narration-seg2', startMs: 5000 }],
	})
	assert.equal(evidence.trackCount, 2)
	assert.equal(evidence.verifiedTrackCount, 2)
	assert.equal(evidence.cueCount, 2)
	assert.equal(evidence.captionTimelineEndMs, 8250)
	assert.equal(evidence.captionTimingSource, 'native-webvtt-clip-local')
	assert.deepEqual(evidence.issues, [])
	assert.equal(evidence.tracks[1].objectName, 'narration-seg2')
	assert.equal(evidence.tracks[1].slideCueEndMs, 8250)
})

test('native caption evidence identifies a missing referenced VTT part', async () => {
	const evidence = await inspectNativeCaptionTracks(packageFixture({ missingSecondPart: true }), 0)
	assert.equal(evidence.trackCount, 2)
	assert.equal(evidence.verifiedTrackCount, 1)
	assert.match(evidence.issues.join(' '), /CAPTION_VTT_PART_MISSING/)
})

test('native caption evidence rejects non-positive cue timing', async () => {
	const evidence = await inspectNativeCaptionTracks(packageFixture({ invalidSecondCue: true }), 0)
	assert.equal(evidence.verifiedTrackCount, 1)
	assert.match(evidence.issues.join(' '), /WEBVTT_CUE_TIMING_INVALID/)
})

test('WebVTT inspection supports a clip-local MM:SS clock and rejects missing header', () => {
	assert.deepEqual(inspectWebVtt('WEBVTT\n\n00:00.000 --> 00:01.250\nHello\n'), { cueCount: 1, maxCueEndMs: 1250, issues: [] })
	assert.match(inspectWebVtt('00:00.000 --> 00:01.000\nHello\n').issues.join(' '), /WEBVTT_HEADER_MISSING/)
})
