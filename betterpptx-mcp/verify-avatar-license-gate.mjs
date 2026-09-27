// Verify public model-backed avatar rendering fails closed until explicit owner/legal approval.
// Private research mode remains available for the existing canary path.
import fs from 'node:fs'
import path from 'node:path'

process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
delete process.env.BETTERPPTX_AVATAR_LICENSE_APPROVED
const { renderAvatarNarrationVideo, avatarLicenseApprovalReadiness } = await import('./avatar/service.mjs')
let blockedCode = ''
try {
	await renderAvatarNarrationVideo({ provider: 'liveportrait-musetalk', avatar: { source: 'default' }, audioPath: path.join(process.cwd(), 'missing-license-gate.wav'), durationMs: 1000 })
} catch (error) { blockedCode = error?.code || '' }
const blocked = blockedCode === 'AVATAR_LICENSE_REVIEW_REQUIRED'
process.env.BETTERPPTX_AVATAR_LICENSE_APPROVED = '1'
const approved = avatarLicenseApprovalReadiness().approved === true
process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'
const researchMode = avatarLicenseApprovalReadiness().publicBlackBox === false
const report = {
	schemaVersion: 'betterpptx.avatar-license-gate.v1',
	status: blocked && approved && researchMode ? 'PASS' : 'FAIL',
	publicModelPathFailsClosed: blocked,
	ownerApprovalExplicit: approved,
	privateResearchModePreserved: researchMode,
	legalClearanceClaimed: false,
}
const output = path.resolve('betterpptx-mcp/outputs/avatar-license-gate-report.json')
fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n')
console.log(`AVATAR LICENSE GATE: ${report.status} failClosed=${blocked} explicitApproval=${approved} researchMode=${researchMode}`)
process.exit(report.status === 'PASS' ? 0 : 1)
