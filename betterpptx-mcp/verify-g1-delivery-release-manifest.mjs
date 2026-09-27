import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'
import { validateAvatarNarrationPackage } from './avatar/validate.mjs'

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const manifestPath = path.join(repoRoot, 'betterpptx-mcp', 'docs', 'release-safety', 'G1-PRODUCTION-DELIVERY-RELEASE-MANIFEST.json')
const strict = process.argv.includes('--strict') || process.env.BETTERPPTX_G1_RELEASE_GATE === '1'
const privateTokens = ['x-pipeline', 'x-enhancement', 'x-restoreformer-seconds', 'x-restoreformer-segments', 'liveportrait', 'musetalk', 'restoreformer', 'providerexecutionid', 'executionid']
const privateRe = new RegExp(privateTokens.map(token => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'ig')
const textualPartRe = /\.(?:xml|rels|json|txt|vml)$/i

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
const checks = []
const check = (id, ok, detail) => checks.push({ id, status: ok ? 'PASS' : 'FAIL', detail })
const relative = value => path.relative(repoRoot, value).replaceAll('\\', '/')
const pathInsideRepo = value => {
	const resolved = path.resolve(repoRoot, value || '')
	return resolved === repoRoot || resolved.startsWith(`${repoRoot}${path.sep}`)
}
const approvedCandidate = manifest.approvedEvolvedCandidate || null
const ownerApproved = manifest.status === 'OWNER_APPROVED' &&
	manifest.ownerApproval?.status === 'APPROVED' &&
	manifest.ownerApproval?.decision === 'APPROVED' &&
	approvedCandidate?.approvalStatus === 'OWNER_APPROVED'
const activeArtifacts = ownerApproved && approvedCandidate ? [approvedCandidate] : (manifest.artifacts || [])
const artifactsByPath = new Map(activeArtifacts.map(item => [item.path, item]))

const playbackSchemaValid = manifest.playbackContract?.schema === 'betterpptx.avatar.playback-contract.v1' &&
	manifest.playbackContract?.requireAutoplay === true &&
	manifest.playbackContract?.talkingHeadFrame?.shape === 'ellipse' &&
	manifest.playbackContract?.talkingHeadFrame?.crop === 'centered-cover' &&
	manifest.playbackContract?.talkingHeadFrame?.canonicalWindowIn?.x === 10.993 &&
	manifest.playbackContract?.talkingHeadFrame?.canonicalWindowIn?.y === 5.16 &&
	manifest.playbackContract?.talkingHeadFrame?.canonicalWindowIn?.w === 2.25 &&
	manifest.playbackContract?.talkingHeadFrame?.canonicalWindowIn?.h === 2.25 &&
	manifest.playbackContract?.talkingHeadFrame?.sourceCropPolicy === 'source-aware-centered-cover' &&
	manifest.playbackContract?.talkingHeadFrame?.reference16By9CropPerSidePercent === 21.875 &&
	activeArtifacts.every(item => Array.isArray(item.playbackContract?.slides) && item.playbackContract.slides.length === Number(item.slides || item.playbackContract.slides.length))
check('manifest-schema', manifest.schema === 'betterpptx.g1-production-delivery-release-manifest.v1' && Array.isArray(manifest.artifacts) && activeArtifacts.length === 1 && playbackSchemaValid, 'Manifest schema, exact active artifact, and accepted presenter/playback contract are valid.')
check('manifest-owner-decision', ownerApproved && manifest.publicDeliveryAllowed === false, ownerApproved ? 'Exact G1 owner approval is recorded while broader public delivery remains fail-closed for parent gates.' : 'Exact G1 owner approval is missing or does not match the active artifact state.')
const supersededArtifactsValid = (manifest.artifacts || []).length > 0 && (manifest.artifacts || []).every(item =>
	item.path !== approvedCandidate?.path && String(item.approvalStatus || '').startsWith('SUPERSEDED_'))
check('superseded-artifacts-quarantined', supersededArtifactsValid, supersededArtifactsValid ? 'Earlier one-slide candidates remain explicitly superseded and outside the active delivery set.' : 'Historical candidates are not consistently quarantined as superseded.')

const ownerApprovalPath = path.resolve(repoRoot, manifest.ownerApproval?.evidence || '')
let ownerApprovalEvidence = null
try { ownerApprovalEvidence = JSON.parse(fs.readFileSync(ownerApprovalPath, 'utf8')) } catch { ownerApprovalEvidence = null }
const ownerApprovalEvidenceValid = pathInsideRepo(manifest.ownerApproval?.evidence) && ownerApprovalEvidence?.schema === 'betterpptx.g1.owner-approval.v1' &&
	ownerApprovalEvidence?.status === 'APPROVED' && ownerApprovalEvidence?.artifact?.path === approvedCandidate?.path &&
	ownerApprovalEvidence?.artifact?.sha256 === approvedCandidate?.sha256 && ownerApprovalEvidence?.artifact?.bytes === approvedCandidate?.bytes &&
	ownerApprovalEvidence?.artifact?.slides === approvedCandidate?.slides && ownerApprovalEvidence?.scope?.nativePresenter === true &&
	ownerApprovalEvidence?.scope?.notesOnlyNarrationSurface === true && ownerApprovalEvidence?.scope?.captionsAndSubtitles === 'removed-from-authoring-excellence' &&
	ownerApprovalEvidence?.scope?.canonicalPresenterWindowIn?.x === 10.993 && ownerApprovalEvidence?.scope?.canonicalPresenterWindowIn?.y === 5.16 &&
	ownerApprovalEvidence?.scope?.canonicalPresenterWindowIn?.w === 2.25 && ownerApprovalEvidence?.scope?.canonicalPresenterWindowIn?.h === 2.25
check('owner-approval-evidence', ownerApprovalEvidenceValid, ownerApprovalEvidenceValid ? 'Owner decision is hash-, byte-, slide-, frame-, and no-visible-caption scope-bound to the active evolved candidate.' : 'Owner approval evidence is missing, stale, or not bound to the active candidate.')

const reopenPath = path.resolve(repoRoot, manifest.powerPointReopenEvidence || '')
let reopenEvidence = null
try { reopenEvidence = JSON.parse(fs.readFileSync(reopenPath, 'utf8')) } catch { reopenEvidence = null }
const reopenIds = new Set(activeArtifacts.map(item => item.path))
const reopenValid = reopenEvidence?.schema === 'betterpptx.g1.powerpoint-reopen-evidence.v1' && reopenEvidence.pass === true &&
	Array.isArray(reopenEvidence.files) && reopenEvidence.files.length === reopenIds.size &&
	reopenEvidence.files.every(item => {
		const artifact = artifactsByPath.get(item.path)
		return item.status === 'PASS' && item.repaired === false && artifact && item.slides === artifact.slides && item.bytes === artifact.bytes && item.sha256 === artifact.sha256
	})
check('powerpoint-reopen-evidence', reopenValid, reopenValid ? 'PowerPoint COM reopened every exact delivery artifact without repair.' : 'Durable PowerPoint reopen evidence is missing, stale, or incomplete.')

const playbackEvidencePath = path.resolve(repoRoot, manifest.powerPointPlaybackEvidence || '')
let playbackEvidence = null
try { playbackEvidence = JSON.parse(fs.readFileSync(playbackEvidencePath, 'utf8')) } catch { playbackEvidence = null }
const playbackIds = new Set(activeArtifacts.map(item => item.path))
const acceptedPresenterShape = item => item?.visiblePresenterMedia === true && item?.singleNativePresenterVisual === true && item?.presenterShape?.mediaType === 3 && item?.presenterShape?.autoShapeType === 9 && item?.presenterShape?.playOnEntry === -1 && Math.abs(Number(item.presenterShape.leftPt) - 791.496) <= 0.2 && Math.abs(Number(item.presenterShape.topPt) - 371.52) <= 0.2 && Math.abs(Number(item.presenterShape.widthPt) - 162) <= 0.2 && Math.abs(Number(item.presenterShape.heightPt) - 162) <= 0.2
const playbackValid = playbackEvidence?.schema === 'betterpptx.g1.powerpoint-playback-evidence.v1' && playbackEvidence.pass === true &&
	Array.isArray(playbackEvidence.files) && playbackEvidence.files.length === playbackIds.size &&
	playbackEvidence.files.every(item => {
		const artifact = artifactsByPath.get(item.path)
		return item.status === 'PASS' && artifact && item.bytes === artifact.bytes && item.sha256 === artifact.sha256 && item.firstSlideCount === artifact.slides && item.secondSlideCount === artifact.slides && item.runningState === 1 && item.pausedState === 2 && item.resumedState === 1 && item.replayState === 1 && item.replayPosition === 1 && acceptedPresenterShape(item)
	})
check('powerpoint-playback-evidence', playbackValid, playbackValid ? 'PowerPoint COM verified the visible 162pt presenter video window, autoplay, run, pause, resume, and second-run replay for every exact delivery artifact.' : 'Durable PowerPoint playback evidence is missing, stale, or incomplete.')

const visualEvidencePath = path.resolve(repoRoot, manifest.powerPointVisualEvidence || '')
let visualEvidence = null
try { visualEvidence = JSON.parse(fs.readFileSync(visualEvidencePath, 'utf8')) } catch { visualEvidence = null }
const visualValid = visualEvidence?.schema === 'betterpptx.g1.powerpoint-visual-evidence.v1' && visualEvidence.pass === true &&
	Array.isArray(visualEvidence.files) && visualEvidence.files.length === playbackIds.size &&
	visualEvidence.files.every(item => {
		const artifact = artifactsByPath.get(item.path)
		const renders = Array.isArray(item.renders) ? item.renders : [{ path: item.render, bytes: item.renderBytes, sha256: item.renderSha256, width: item.width, height: item.height }]
		if (!artifact || item.status !== 'PASS' || item.bytes !== artifact.bytes || item.sha256 !== artifact.sha256 || renders.length !== artifact.slides) return false
		return renders.every((render, index) => {
			const renderPath = path.resolve(repoRoot, render.path || '')
			if (!pathInsideRepo(render.path) || !fs.existsSync(renderPath) || render.width !== 1600 || render.height !== 900 || Number(render.slide || index + 1) !== index + 1) return false
			const renderBytes = fs.statSync(renderPath).size
			const renderSha256 = crypto.createHash('sha256').update(fs.readFileSync(renderPath)).digest('hex')
			return renderBytes === render.bytes && renderSha256 === render.sha256
		})
	})
check('powerpoint-visual-evidence', visualValid, visualValid ? 'All six PowerPoint-native renders are hash-pinned to the exact approved artifact and visually inspected.' : 'Durable PowerPoint visual evidence is missing, stale, or incomplete.')

const results = []
for (const artifact of activeArtifacts) {
	const resolved = path.resolve(repoRoot, artifact.path)
	const insideRepo = resolved === repoRoot || resolved.startsWith(`${repoRoot}${path.sep}`)
	const exists = insideRepo && fs.existsSync(resolved) && fs.statSync(resolved).isFile()
	check(`${artifact.id}-path`, insideRepo && artifact.path.toLowerCase().endsWith('.pptx'), 'Artifact path is repo-contained and PPTX-shaped.')
	if (!exists) {
		check(`${artifact.id}-file`, false, 'Manifested delivery artifact is missing.')
		results.push({ id: artifact.id, path: artifact.path, status: 'MISSING' })
		continue
	}
	const bytes = fs.statSync(resolved).size
	const sha256 = crypto.createHash('sha256').update(fs.readFileSync(resolved)).digest('hex')
	check(`${artifact.id}-hash`, bytes === artifact.bytes && sha256 === artifact.sha256, `Measured ${bytes} bytes, sha256 ${sha256}.`)
	const zip = await JSZip.loadAsync(fs.readFileSync(resolved))
	const hits = []
	for (const [part, entry] of Object.entries(zip.files)) {
		if (entry.dir || !textualPartRe.test(part)) continue
		const text = await entry.async('string')
		const tokens = [...new Set((text.match(privateRe) || []).map(token => token.toLowerCase()))]
		if (tokens.length) hits.push({ part, tokens })
	}
	check(`${artifact.id}-blackbox-scan`, hits.length === 0, hits.length ? `Private vocabulary found in ${hits.length} package parts.` : 'Zero private-vocabulary hits across textual package parts.')
	let playback = null
	try {
		const playbackManifest = {
			playbackContract: {
				...(manifest.playbackContract || {}),
				...(artifact.playbackContract || {}),
				talkingHeadFrame: {
					...(manifest.playbackContract?.talkingHeadFrame || {}),
					...(artifact.playbackContract?.talkingHeadFrame || {}),
				},
			},
			slides: artifact.playbackContract?.slides || [],
		}
		playback = await validateAvatarNarrationPackage(resolved, playbackManifest)
	} catch (error) {
		playback = { ok: false, issues: [`validator error: ${error?.message || error}`] }
	}
	check(`${artifact.id}-playback-contract`, playback?.ok === true, playback?.ok === true
		? 'Engine-owned ellipse presenter frame and narration playback contract passed.'
		: `Presenter/playback contract failed: ${(playback?.issues || []).join(' | ') || 'unknown validation failure'}`)
	results.push({
		id: artifact.id,
		path: artifact.path,
		status: hits.length ? 'DIRTY' : (playback?.ok === true ? 'CLEAN' : 'INVALID_PLAYBACK_CONTRACT'),
		bytes,
		sha256,
		hits,
		playbackIssues: playback?.issues || [],
	})
}

const technicalReportPath = path.resolve(repoRoot, approvedCandidate?.technicalReport || '')
let technicalReport = null
try { technicalReport = JSON.parse(fs.readFileSync(technicalReportPath, 'utf8')) } catch { technicalReport = null }
const technicalReportValid = pathInsideRepo(approvedCandidate?.technicalReport) && technicalReport?.schema === 'betterpptx.g1-evolved-native-recordstudio-regeneration-report.v1' &&
	technicalReport?.artifact?.path === approvedCandidate?.path && technicalReport?.artifact?.bytes === approvedCandidate?.bytes &&
	technicalReport?.artifact?.sha256 === approvedCandidate?.sha256 && technicalReport?.artifact?.slideCount === approvedCandidate?.slides &&
	technicalReport?.nativeFirst?.status === 'PASS' && technicalReport?.nativeFirst?.noSilentSubstitution === true &&
	technicalReport?.recordStudio?.status === 'PASS' && technicalReport?.recordStudio?.slideCount === approvedCandidate?.slides &&
	technicalReport?.notesOwnership?.status === 'PASS' && technicalReport?.blackBox?.status === 'PASS_ZERO_PRIVATE_VOCABULARY' &&
	technicalReport?.validation?.package?.ok === true && technicalReport.validation.package.perSlide?.length === approvedCandidate?.slides &&
	technicalReport.validation.package.perSlide.every(slide => Array.isArray(slide.issues) && slide.issues.length === 0)
check('evolved-technical-report', technicalReportValid, technicalReportValid ? 'Evolved native Record Studio report matches the exact artifact and all six package/playback contracts.' : 'Evolved technical report is missing, stale, or inconsistent with the approved artifact.')
check('owner-approval', ownerApproved && ownerApprovalEvidenceValid, ownerApproved && ownerApprovalEvidenceValid ? 'The exact active evolved delivery artifact is owner-approved.' : 'The exact active delivery artifact is not owner-approved.')

const report = {
	schema: 'betterpptx.g1-delivery-release-manifest-report.v1',
	manifest: relative(manifestPath),
	mode: strict ? 'strict' : 'report-only',
	status: checks.every(item => item.status === 'PASS') ? 'PASS' : 'PENDING',
	releaseReady: checks.every(item => item.status === 'PASS'),
	checks,
	artifacts: results,
}
const outputDir = path.join(repoRoot, 'betterpptx-mcp', 'outputs')
fs.mkdirSync(outputDir, { recursive: true })
fs.writeFileSync(path.join(outputDir, 'g1-delivery-release-manifest-report.json'), JSON.stringify(report, null, 2) + '\n')
console.log(`G1 DELIVERY RELEASE MANIFEST: ${report.status} mode=${report.mode} checks=${checks.filter(item => item.status === 'PASS').length}/${checks.length}`)
for (const item of checks) console.log(`${item.status} ${item.id}: ${item.detail}`)
if (strict && report.status !== 'PASS') process.exitCode = 1
