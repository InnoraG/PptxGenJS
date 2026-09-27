#!/usr/bin/env node
// Verify the private M3 PowerPoint CreateVideo evidence without treating it as
// an owner approval or a production-release gate.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const evidenceDir = path.resolve(process.argv[2] || path.join(repoRoot, 'outputs', 'render-oracle', 'm3-verb-probe-20260802'))
const reportPath = path.join(evidenceDir, 'm3-verb-probe-report.json')
const tracePath = path.join(evidenceDir, 'm3-tracker-metrology-8s.json')
const videoPath = path.join(evidenceDir, 'm3-verb-probe-8s-tracker.mp4')
const checks = []

function check(id, ok, detail) {
	checks.push({ id, status: ok ? 'PASS' : 'FAIL', detail })
}
function readJson(file) {
	try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch (error) { return { __error: error.message } }
}
function finite(value) { return Number.isFinite(Number(value)) }

const report = readJson(reportPath)
const trace = readJson(tracePath)
check('report-present', !report.__error, report.__error || reportPath)
check('trace-present', !trace.__error, trace.__error || tracePath)
check('video-present', fs.existsSync(videoPath) && fs.statSync(videoPath).size > 1000000,
	fs.existsSync(videoPath) ? `${fs.statSync(videoPath).size} bytes` : videoPath)
check('private-fail-closed-posture', report.publicEnablementAllowed === false && report.ownerApprovalNotInferred === true,
	`publicEnablementAllowed=${report.publicEnablementAllowed}; ownerApprovalNotInferred=${report.ownerApprovalNotInferred}`)
check('render-terminal-status', report.measurement?.renderStatus === 'CREATEVIDEO_STATUS_3_COMPLETE',
	`renderStatus=${report.measurement?.renderStatus}`)
check('perceptual-review-remains-open', report.measurement?.status === 'PERCEPTUAL_REVIEW_PENDING',
	`measurement.status=${report.measurement?.status}`)
check('trace-measured', trace.status === 'MEASURED' && Array.isArray(trace.slides) && trace.slides.length === 2,
	`trace.status=${trace.status}; slides=${trace.slides?.length}`)

const push = report.measurement?.push
const carry = report.measurement?.carry
check('push-metrics-finite', finite(push?.observedDistanceIn) && finite(push?.observedAngleDeg) && finite(push?.angleErrorDeg),
	JSON.stringify({ distance: push?.observedDistanceIn, angle: push?.observedAngleDeg, error: push?.angleErrorDeg }))
check('push-distance-envelope', Number(push?.observedDistanceIn) >= 2.0 && Number(push?.observedDistanceIn) <= 2.4,
	`observed=${push?.observedDistanceIn}; planned=${push?.plannedDistanceIn}`)
check('push-angle-envelope', Number(push?.angleErrorDeg) <= 2,
	`angleErrorDeg=${push?.angleErrorDeg}`)
check('push-timing-after-contact', finite(push?.observedFirstMotionMs) && Number(push.observedFirstMotionMs) >= Number(push.plannedContactMs),
	`firstMotion=${push?.observedFirstMotionMs}; contact=${push?.plannedContactMs}`)
check('carry-metrics-finite', finite(carry?.observedPathLengthIn) && finite(carry?.plannedTravelIn) && finite(carry?.pathLengthErrorIn),
	JSON.stringify({ observed: carry?.observedPathLengthIn, planned: carry?.plannedTravelIn, error: carry?.pathLengthErrorIn }))
check('carry-path-envelope', Math.abs(Number(carry?.pathLengthErrorIn)) <= 0.15,
	`pathLengthErrorIn=${carry?.pathLengthErrorIn}`)
check('carry-timing-ordered', finite(carry?.plannedGrabMs) && finite(carry?.plannedDropMs) && Number(carry.plannedDropMs) > Number(carry.plannedGrabMs),
	`grab=${carry?.plannedGrabMs}; drop=${carry?.plannedDropMs}`)

const failed = checks.filter(item => item.status === 'FAIL')
const output = {
	schemaVersion: 'betterpptx.m3-verb-metrology-verification.v1',
	status: failed.length ? 'FAIL' : 'PASS_M3_RENDERED_PERCEPTUAL_OPEN',
	publicEnablementAllowed: false,
	ownerApprovalNotInferred: true,
	evidenceDir: path.relative(repoRoot, evidenceDir).replaceAll('\\', '/'),
	checks,
}
console.log(JSON.stringify(output, null, 2))
if (failed.length) process.exitCode = 1
