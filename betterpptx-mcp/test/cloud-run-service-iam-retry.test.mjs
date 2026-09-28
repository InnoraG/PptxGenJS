import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(new URL('../deploy/gcp/retry-cloud-run-service-add-iam-binding.sh', import.meta.url))
const bash = process.platform === 'win32' ? null : spawnSync('bash', ['--version'], { encoding: 'utf8' })
const canRunBash = bash?.status === 0 && /GNU bash/i.test(bash.stdout)

test('Cloud Run IAM add retries transient ETag conflicts with bounded exponential backoff', { skip: !canRunBash }, () => {
	const result = spawnSync('bash', ['-c', `
		set -euo pipefail
	count=0
	waits=''
	function gcloud() { count=$((count + 1)); [[ $count -ge 3 ]]; }
	function sleep() { waits="${'${waits}'}$1,"; }
	source "$1"
	retry_cloud_run_service_add_iam_binding worker project region member role --condition=None
	printf 'CALLS=%s;WAITS=%s\\n' "$count" "$waits"
	`, 'bash', script], { encoding: 'utf8' })
	assert.equal(result.status, 0, result.stderr)
	assert.match(result.stdout, /CALLS=3;WAITS=1,2,/)
})

test('Cloud Run IAM add stops after six attempts when the policy keeps conflicting', { skip: !canRunBash }, () => {
	const result = spawnSync('bash', ['-c', `
		set -euo pipefail
	count=0
	waits=''
	function gcloud() { count=$((count + 1)); return 1; }
	function sleep() { waits="${'${waits}'}$1,"; }
	source "$1"
	if retry_cloud_run_service_add_iam_binding worker project region member role; then exit 99; else status=$?; fi
	printf 'STATUS=%s;CALLS=%s;WAITS=%s\\n' "$status" "$count" "$waits"
	`, 'bash', script], { encoding: 'utf8' })
	assert.equal(result.status, 0, result.stderr)
	assert.match(result.stdout, /STATUS=1;CALLS=6;WAITS=1,2,4,8,16,/)
})
