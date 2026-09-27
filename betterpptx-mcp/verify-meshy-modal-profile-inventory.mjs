#!/usr/bin/env node
// Read-only Modal profile inventory for the native 3D presenter lane.
// This checks profile/app metadata only; it never deploys, invokes a worker,
// submits a generation job, or prints credentials/endpoints/app IDs.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { writeJsonReport } from './lib/atomic-report.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..')
const demo = path.join(repo, 'research-demos', '2026-07-18-meshy-avatar')
const output = path.join(demo, 'visual-artifacts', 'release-gates', 'meshy-modal-profile-inventory-20260718.json')
const requestedProfiles = ['betterxavatar1', 'betterxavatar2']
const configuredProfiles = ['betterxavatar', 'betterpptx']
const allProfiles = [...new Set([...requestedProfiles, ...configuredProfiles])]

function listApps(profile) {
	const result = spawnSync('python', ['-m', 'modal', 'app', 'list', '--json'], {
		cwd: repo,
		encoding: 'utf8',
		timeout: 30000,
		windowsHide: true,
		env: { ...process.env, MODAL_PROFILE: profile },
	})
	if (result.error?.code === 'ETIMEDOUT') return { profile, commandOk: false, errorClass: 'TIMEOUT' }
	if (result.status !== 0) return { profile, commandOk: false, errorClass: 'MODAL_PROFILE_QUERY_FAILED' }
	let apps
	try { apps = JSON.parse(String(result.stdout || '').trim() || '[]') } catch { return { profile, commandOk: false, errorClass: 'INVALID_MODAL_JSON' } }
	if (!Array.isArray(apps)) return { profile, commandOk: false, errorClass: 'UNEXPECTED_MODAL_RESPONSE' }
	const model3d = apps.filter(app => String(app.description || '') === 'betterpptx-model3d')
	return {
		profile,
		commandOk: true,
		appCount: apps.length,
		model3dAppCount: model3d.length,
		model3dStates: model3d.map(app => String(app.state || 'unknown')).sort(),
		model3dDeployed: model3d.some(app => String(app.state || '').toLowerCase() === 'deployed'),
	}
}

function listSecrets(profile) {
	const result = spawnSync('python', ['-m', 'modal', 'secret', 'list', '--json'], {
		cwd: repo,
		encoding: 'utf8',
		timeout: 30000,
		windowsHide: true,
		env: { ...process.env, MODAL_PROFILE: profile },
	})
	if (result.status !== 0) return { secretQueryOk: false, secretErrorClass: 'MODAL_SECRET_QUERY_FAILED' }
	let payload
	try { payload = JSON.parse(String(result.stdout || '').trim() || '[]') } catch { return { secretQueryOk: false, secretErrorClass: 'INVALID_MODAL_SECRET_JSON' } }
	const items = Array.isArray(payload) ? payload : (Array.isArray(payload?.secrets) ? payload.secrets : [])
	const names = items.map(item => String(item?.name || ''))
	return {
		secretQueryOk: true,
		secretCount: items.length,
		model3dTokenPresent: names.includes('betterpptx-model3d-token'),
		secretValuesRead: false,
	}
}

const profiles = allProfiles.map(profile => ({ profile, ...listApps(profile), ...listSecrets(profile) }))
const requested = profiles.filter(item => requestedProfiles.includes(item.profile))
const configured = profiles.filter(item => configuredProfiles.includes(item.profile))
const checks = {
	modalCliQueriesSucceeded: profiles.every(item => item.commandOk),
	requestedProfilesExistAndAreQueried: requested.length === requestedProfiles.length && requested.every(item => item.commandOk),
	requestedProfilesHaveModel3dDeployments: requested.length === requestedProfiles.length && requested.every(item => item.model3dDeployed === true),
	requestedProfilesHaveWorkerToken: requested.length === requestedProfiles.length && requested.every(item => item.secretQueryOk === true && item.model3dTokenPresent === true && item.secretValuesRead === false),
	configuredEndpointProfilesHaveModel3dDeployments: configured.length === configuredProfiles.length && configured.every(item => item.model3dDeployed === true),
	noGenerationOrDeploymentAttempted: true,
}
const report = {
	schemaVersion: 'betterpptx.native-3d-modal-profile-inventory.v1',
	status: checks.requestedProfilesHaveModel3dDeployments && checks.configuredEndpointProfilesHaveModel3dDeployments ? 'PASS_LIVE_PROFILE_COVERAGE' : checks.configuredEndpointProfilesHaveModel3dDeployments ? 'OPEN_REQUESTED_PROFILE_DEPLOYMENT' : 'OPEN_MODAL_PROFILE_DEPLOYMENT',
	scope: 'native-3d-presenter-only',
	developmentMode: 'premium',
	requestedProfiles,
	configuredEndpointProfiles: configuredProfiles,
	profiles,
	checks,
	ownerNextAction: 'Deploy the same immutable betterpptx-model3d worker revision under betterxavatar1 and betterxavatar2, record the real revision/image digests, then replace the current credential-store routes only after bounded health/canary/rollback evidence is captured.',
}
writeJsonReport(output, report)
console.log(JSON.stringify(report, null, 2))
if (report.status !== 'PASS_LIVE_PROFILE_COVERAGE') process.exitCode = 1
