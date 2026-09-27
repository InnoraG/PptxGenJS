#!/usr/bin/env node
// Package-level playback evidence for the PowerPoint-native talking-head lane.
// This is deliberately independent of ffprobe: it checks the exact MP4 payload
// embedded in the canary deck plus the PowerPoint media/timing relationships.
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import JSZip from 'jszip'
import { validateAvatarNarrationPackage } from './avatar/validate.mjs'

const artifactPath = path.resolve('betterpptx-mcp', 'outputs', 'private-avatar-mcp-canary.pptx')
const canaryReportPath = path.resolve('betterpptx-mcp', 'outputs', 'private-avatar-mcp-canary-report.json')
const reportPath = path.resolve('betterpptx-mcp', 'outputs', 'avatar-pptx-playback-contract-report.json')

function digest(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex') }
function ascii(bytes) { return bytes.toString('latin1') }
function hasToken(bytes, token) { return ascii(bytes).includes(token) }
function expect(condition, message, details = {}) {
	if (!condition) {
		const error = new Error(message)
		error.details = details
		throw error
	}
}

const report = {
	schemaVersion: 'betterpptx.avatar-pptx-playback-contract-report.v1',
	status: 'BLOCKED',
	checks: {},
}

try {
	const [pptxBytes, canary] = await Promise.all([
		fs.readFile(artifactPath),
		fs.readFile(canaryReportPath, 'utf8').then(JSON.parse),
	])
	const packageDigest = digest(pptxBytes)
	expect(canary?.status === 'research-live-pass' && canary?.powerPoint?.status === 'PASS', 'The source canary must pass before playback evidence is accepted.', { canary })
	report.checks.sourceCanary = true
	expect(!canary.package?.digest || canary.package.digest === packageDigest, 'The playback artifact must match the canary digest.', { expected: canary.package?.digest, actual: packageDigest })
	report.checks.digestMatch = true

	const zip = await JSZip.loadAsync(pptxBytes)
	const mediaNames = Object.keys(zip.files).filter(name => /^ppt\/media\/.+\.mp4$/i.test(name))
	expect(mediaNames.length >= 1, 'The canary deck must contain an embedded MP4 media part.', { mediaNames })
	const mediaBytes = await zip.file(mediaNames[0]).async('nodebuffer')
	expect(mediaBytes.length > 1024, 'Embedded MP4 payload is unexpectedly small.', { bytes: mediaBytes.length })
	const mp4Checks = {
		ftyp: hasToken(mediaBytes, 'ftyp'),
		moov: hasToken(mediaBytes, 'moov'),
		mdat: hasToken(mediaBytes, 'mdat'),
		videoTrack: hasToken(mediaBytes, 'avc1') || hasToken(mediaBytes, 'avcC'),
		audioTrack: hasToken(mediaBytes, 'mp4a') || hasToken(mediaBytes, 'esds'),
	}
	expect(Object.values(mp4Checks).every(Boolean), 'Embedded MP4 is missing a required container or audio/video track marker.', { mp4Checks })
	report.checks.mp4ContainerAndTracks = true

	const validated = await validateAvatarNarrationPackage(artifactPath)
	expect(validated.ok === true, 'Avatar package validator reported playback relationship issues.', { issues: validated.issues, perSlide: validated.perSlide })
	report.checks.powerPointMediaRelationships = true
	const slideXml = await zip.file('ppt/slides/slide1.xml')?.async('string') || ''
	// The talking-head contract is semantic at the client boundary but exact at
	// the package boundary: a canonical 10.993/5.160/2.25/2.25-inch ellipse
	// with a centered cover crop. Keep this regression check here so a future
	// compiler change cannot silently reintroduce the old rectangular presenter.
	const avatarPic = slideXml.match(/<p:pic>[\s\S]*?<a:prstGeom prst="ellipse"[\s\S]*?<\/p:pic>/)?.[0] || ''
	const canonicalEllipse = /<a:off x="10051999" y="4718304"\/><a:ext cx="2057400" cy="2057400"\/><\/a:xfrm>\s*<a:prstGeom prst="ellipse"/.test(avatarPic)
	const centeredCover = /<a:srcRect l="(\d+)" r="\1" t="(\d+)" b="\2"\/>/.test(avatarPic)
	expect(canonicalEllipse, 'Talking-head media must use the canonical ellipse presenter window.', { expected: { x: 10.993, y: 5.16, w: 2.25, h: 2.25, shape: 'ellipse' } })
	expect(centeredCover, 'Talking-head media must use a centered cover crop.', { expected: 'equal left/right and top/bottom srcRect margins' })
	report.checks.canonicalEllipseCenteredCover = true
	const slide = validated.perSlide[0] || {}
	expect(slide.advanceAfterTime >= Number(canary.input?.durationMs || 0), 'Slide advance timing must cover the source narration duration.', { slide, durationMs: canary.input?.durationMs })
	report.checks.advanceCoversNarration = true

	report.status = 'PASS'
	report.artifact = { digest: packageDigest, bytes: pptxBytes.length, mediaParts: mediaNames.length, mediaBytes: mediaBytes.length }
	report.mp4 = mp4Checks
	report.slide = {
		advanceAfterTime: slide.advanceAfterTime,
		hasVideoNode: slide.hasVideoNode,
		hasMediaCall: slide.hasMediaCall,
		hasVideoRel: slide.hasVideoRel,
		hasMediaRel: slide.hasMediaRel,
		hasPosterRel: slide.hasPosterRel,
	}
	await fs.mkdir(path.dirname(reportPath), { recursive: true })
	await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)
	console.log(`AVATAR PPTX PLAYBACK CONTRACT: PASS media=1 mp4=1 tracks=1 relationships=1 timing=1 com=1`)
} catch (error) {
	report.status = 'BLOCKED'
	report.error = { code: error?.code || 'PLAYBACK_CONTRACT_FAILED', message: error?.message || String(error), details: error?.details || {} }
	await fs.mkdir(path.dirname(reportPath), { recursive: true })
	await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)
	console.error(`AVATAR PPTX PLAYBACK CONTRACT: BLOCKED ${error?.message || error}`)
	process.exitCode = 2
}
