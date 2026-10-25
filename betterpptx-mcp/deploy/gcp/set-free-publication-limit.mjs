#!/usr/bin/env node
// Owner command: show or set the free-tier limits read by the running service
// (within about a minute, no redeploy). Usage records are not touched; flags
// that are not given keep their current value.
//   gcloud auth application-default login
//   node betterpptx-mcp/deploy/gcp/set-free-publication-limit.mjs --project betterpptx-mcp-20260926 --show
//   node betterpptx-mcp/deploy/gcp/set-free-publication-limit.mjs --project betterpptx-mcp-20260926 --limit 5 --talking-heads 1 --personas 1
const args = process.argv.slice(2)
const option = name => {
	const index = args.indexOf(name)
	return index < 0 ? undefined : args[index + 1]
}
const project = option('--project')
if (!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(project || '')) throw new Error('An explicit --project is required.')
process.env.BETTERPPTX_OWNER_CONFIG_STORE = 'firestore'
process.env.BETTERPPTX_GCP_PROJECT = project
if (option('--database')) process.env.BETTERPPTX_FIRESTORE_DATABASE = option('--database')

const { resolveFreeTierConfig, setFreeTierLimits } = await import('../../billing/free-tier-config.mjs')

if (args.includes('--show')) {
	console.log(JSON.stringify(await resolveFreeTierConfig({ force: true }), null, 2))
} else {
	const limits = {}
	for (const [flag, field] of [['--limit', 'publicationsPerWindow'], ['--talking-heads', 'talkingHeadsPerWindow'], ['--personas', 'customPersonasPerWindow']]) {
		if (option(flag) !== undefined) limits[field] = Number(option(flag))
	}
	const result = await setFreeTierLimits(limits, { actor: 'owner-cli', note: option('--note') || '' })
	console.log(JSON.stringify(result, null, 2))
}
