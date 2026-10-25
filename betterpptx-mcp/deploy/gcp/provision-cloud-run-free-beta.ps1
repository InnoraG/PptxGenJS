param(
	[string]$Project = 'betterpptx-mcp-20260926',
	[string]$Region = 'us-central1',
	[string]$Bucket = 'betterpptx-mcp-20260926-artifacts',
	[string]$CatalogBucket = 'betterpptx-mcp-20260926-catalog',
	[string]$DeployerServiceAccount = 'github-free-beta-deployer'
)

$ErrorActionPreference = 'Stop'

function Invoke-Gcloud([string[]]$Arguments) {
	$output = & gcloud @Arguments 2>&1
	if ($LASTEXITCODE -ne 0) {
		$summary = (@($output | ForEach-Object { [string]$_ }) -join "`n").Trim()
		throw "gcloud $($Arguments[0..([Math]::Min(2, $Arguments.Length - 1))] -join ' ') failed: $summary"
	}
	return (@($output | ForEach-Object { [string]$_ }) -join "`n").Trim()
}

function Test-GcloudResource([string[]]$Arguments) {
	$output = & gcloud @Arguments 2>&1
	$exitCode = $LASTEXITCODE
	$text = (@($output | ForEach-Object { [string]$_ }) -join "`n").Trim()
	if ($exitCode -eq 0) { return -not [string]::IsNullOrWhiteSpace($text) }
	if ($text -match '(?i)(NOT_FOUND|not found|does not exist|was not found)') { return $false }
	throw "gcloud $($Arguments[0..([Math]::Min(2, $Arguments.Length - 1))] -join ' ') failed while checking resource existence: $text"
}

$runtimeId = 'betterpptx-public-runtime'
$runtimeEmail = "$runtimeId@$Project.iam.gserviceaccount.com"
$missionControlRuntimeId = 'betterpptx-mc-runtime'
$missionControlRuntimeEmail = "$missionControlRuntimeId@$Project.iam.gserviceaccount.com"
$sweeperInvokerId = 'betterpptx-maintenance-invoker'
$sweeperInvokerEmail = "$sweeperInvokerId@$Project.iam.gserviceaccount.com"
$deployerEmail = "$DeployerServiceAccount@$Project.iam.gserviceaccount.com"
$queues = @('betterpptx-deck-interactive', 'betterpptx-deck-batch', 'betterpptx-media-long')
$hmacSecret = 'betterpptx-install-hmac-secret'
$workerSecret = 'betterpptx-operation-worker-token'
$cloudflareDeploySecret = 'betterpptx-cloudflare-worker-deploy-token'

$projectNumber = Invoke-Gcloud @('projects', 'describe', $Project, '--format=value(projectNumber)')
if (-not $projectNumber -match '^\d+$') { throw 'GCP project number could not be resolved.' }
$tasksAgent = "service-$projectNumber@gcp-sa-cloudtasks.iam.gserviceaccount.com"
$schedulerAgent = "service-$projectNumber@gcp-sa-cloudscheduler.iam.gserviceaccount.com"

if (-not (Test-GcloudResource @('iam', 'service-accounts', 'describe', $runtimeEmail, "--project=$Project", '--format=value(email)'))) {
	Invoke-Gcloud @('iam', 'service-accounts', 'create', $runtimeId, "--project=$Project", '--display-name=BetterPPTX public runtime', '--description=Least-privilege identity for the public free-beta gateway, worker, and artifact maintenance job.', '--quiet') | Out-Null
}
if (-not (Test-GcloudResource @('iam', 'service-accounts', 'describe', $missionControlRuntimeEmail, "--project=$Project", '--format=value(email)'))) {
	Invoke-Gcloud @('iam', 'service-accounts', 'create', $missionControlRuntimeId, "--project=$Project", '--display-name=BetterPPTX private Mission Control runtime', '--description=Owner-only, scale-to-zero Mission Control service identity with access only to its explicitly selected secrets.', '--quiet') | Out-Null
}
if (-not (Test-GcloudResource @('iam', 'service-accounts', 'describe', $sweeperInvokerEmail, "--project=$Project", '--format=value(email)'))) {
	Invoke-Gcloud @('iam', 'service-accounts', 'create', $sweeperInvokerId, "--project=$Project", '--display-name=BetterPPTX maintenance job invoker', '--description=Cloud Scheduler-only identity allowed to invoke the artifact-retention job.', '--quiet') | Out-Null
}

$secretNames = (Invoke-Gcloud @('secrets', 'list', "--project=$Project", '--format=value(name)')) -split "\r?\n" | ForEach-Object { ($_ -split '/')[-1] }
if ($hmacSecret -notin $secretNames) { throw "Required pre-existing identity secret is missing: $hmacSecret" }
if ($workerSecret -notin $secretNames) {
	Invoke-Gcloud @('secrets', 'create', $workerSecret, "--project=$Project", '--replication-policy=automatic', '--quiet') | Out-Null
	$tempSecretFile = [System.IO.Path]::GetTempFileName()
	try {
		$random = [byte[]]::new(48)
		$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
		try { $rng.GetBytes($random) } finally { $rng.Dispose() }
		$token = [Convert]::ToBase64String($random).TrimEnd('=').Replace('+', '-').Replace('/', '_')
		[System.IO.File]::WriteAllText($tempSecretFile, $token, [System.Text.UTF8Encoding]::new($false))
		Invoke-Gcloud @('secrets', 'versions', 'add', $workerSecret, "--project=$Project", "--data-file=$tempSecretFile", '--quiet') | Out-Null
	} finally {
		if (Test-Path -LiteralPath $tempSecretFile) { Remove-Item -LiteralPath $tempSecretFile -Force }
	}
}
if ($cloudflareDeploySecret -notin $secretNames) {
	Invoke-Gcloud @('secrets', 'create', $cloudflareDeploySecret, "--project=$Project", '--replication-policy=automatic', '--quiet') | Out-Null
}

# Firestore access is limited by IAM condition to this database, and enqueue
# access is granted per queue. The task identity can invoke only through the
# private worker's service-level binding, added after that service is created.
$firestoreCondition = "expression=resource.name == 'projects/$Project/databases/(default)',title=betterpptx-default-firestore,description=Runtime access to the BetterPPTX default Firestore database"
Invoke-Gcloud @('projects', 'add-iam-policy-binding', $Project, "--member=serviceAccount:$runtimeEmail", '--role=roles/datastore.user', "--condition=$firestoreCondition", '--quiet') | Out-Null

Invoke-Gcloud @('storage', 'buckets', 'add-iam-policy-binding', "gs://$Bucket", "--member=serviceAccount:$runtimeEmail", '--role=roles/storage.objectAdmin', '--quiet') | Out-Null
# The read-only asset catalogue (Microsoft Stock 3D and the open library) is a private
# bucket mounted read-only into the gateway and worker. The runtime may only read it;
# publish-asset-catalog-bundle.sh fills it and writes its precomputed inventory.
if (-not (Test-GcloudResource @('storage', 'buckets', 'describe', "gs://$CatalogBucket", '--format=value(name)'))) {
	Invoke-Gcloud @('storage', 'buckets', 'create', "gs://$CatalogBucket", "--project=$Project", "--location=$Region", '--default-storage-class=STANDARD', '--uniform-bucket-level-access', '--public-access-prevention', '--soft-delete-duration=0', '--quiet') | Out-Null
}
Invoke-Gcloud @('storage', 'buckets', 'add-iam-policy-binding', "gs://$CatalogBucket", "--member=serviceAccount:$runtimeEmail", '--role=roles/storage.objectViewer', '--quiet') | Out-Null
foreach ($secret in @($hmacSecret, $workerSecret)) {
	Invoke-Gcloud @('secrets', 'add-iam-policy-binding', $secret, "--project=$Project", "--member=serviceAccount:$runtimeEmail", '--role=roles/secretmanager.secretAccessor', '--quiet') | Out-Null
}
$cloudflarePolicy = (Invoke-Gcloud @('secrets', 'get-iam-policy', $cloudflareDeploySecret, "--project=$Project", '--format=json')) | ConvertFrom-Json
$legacyRuntimeAccess = @($cloudflarePolicy.bindings | Where-Object { $_.role -eq 'roles/secretmanager.secretAccessor' -and $_.members -contains "serviceAccount:$runtimeEmail" })
if ($legacyRuntimeAccess.Count -gt 0) {
	Invoke-Gcloud @('secrets', 'remove-iam-policy-binding', $cloudflareDeploySecret, "--project=$Project", "--member=serviceAccount:$runtimeEmail", '--role=roles/secretmanager.secretAccessor', '--quiet') | Out-Null
}
Invoke-Gcloud @('secrets', 'add-iam-policy-binding', $cloudflareDeploySecret, "--project=$Project", "--member=serviceAccount:$deployerEmail", '--role=roles/secretmanager.secretAccessor', '--quiet') | Out-Null
Invoke-Gcloud @('secrets', 'add-iam-policy-binding', $cloudflareDeploySecret, "--project=$Project", "--member=serviceAccount:$deployerEmail", '--role=roles/secretmanager.viewer', '--quiet') | Out-Null
foreach ($role in @('roles/secretmanager.viewer', 'roles/secretmanager.secretAccessor', 'roles/secretmanager.secretVersionAdder')) {
	Invoke-Gcloud @('secrets', 'add-iam-policy-binding', $cloudflareDeploySecret, "--project=$Project", "--member=serviceAccount:$missionControlRuntimeEmail", "--role=$role", '--quiet') | Out-Null
}

Invoke-Gcloud @('iam', 'service-accounts', 'add-iam-policy-binding', $runtimeEmail, "--project=$Project", "--member=serviceAccount:$deployerEmail", '--role=roles/iam.serviceAccountUser', '--quiet') | Out-Null
Invoke-Gcloud @('iam', 'service-accounts', 'add-iam-policy-binding', $missionControlRuntimeEmail, "--project=$Project", "--member=serviceAccount:$deployerEmail", '--role=roles/iam.serviceAccountUser', '--quiet') | Out-Null
Invoke-Gcloud @('iam', 'service-accounts', 'add-iam-policy-binding', $runtimeEmail, "--project=$Project", "--member=serviceAccount:$tasksAgent", '--role=roles/iam.serviceAccountUser', '--quiet') | Out-Null
# The gateway itself creates OIDC-authenticated tasks. Permission granted only
# to the Tasks service agent does not authorize that task-creating principal.
# Scope actAs to its existing runtime identity, never to the whole project.
Invoke-Gcloud @('iam', 'service-accounts', 'add-iam-policy-binding', $runtimeEmail, "--project=$Project", "--member=serviceAccount:$runtimeEmail", '--role=roles/iam.serviceAccountUser', '--quiet') | Out-Null
# Keyless artifact signing needs signBlob, not general token creation. Bind the
# single permission on this identity only; do not grant project-wide minting.
$signerRoleId = 'betterpptxArtifactSigner'
$signerVerb = if (Test-GcloudResource @('iam', 'roles', 'describe', $signerRoleId, "--project=$Project", '--format=value(name)')) { 'update' } else { 'create' }
Invoke-Gcloud @('iam', 'roles', $signerVerb, $signerRoleId, "--project=$Project", '--title=BetterPPTX artifact signer', '--description=Keyless signing for the selected artifact runtime identity only.', '--permissions=iam.serviceAccounts.signBlob', '--stage=GA', '--quiet') | Out-Null
Invoke-Gcloud @('iam', 'service-accounts', 'add-iam-policy-binding', $runtimeEmail, "--project=$Project", "--member=serviceAccount:$runtimeEmail", "--role=projects/$Project/roles/$signerRoleId", '--quiet') | Out-Null
Invoke-Gcloud @('iam', 'service-accounts', 'add-iam-policy-binding', $sweeperInvokerEmail, "--project=$Project", "--member=serviceAccount:$deployerEmail", '--role=roles/iam.serviceAccountUser', '--quiet') | Out-Null
Invoke-Gcloud @('iam', 'service-accounts', 'add-iam-policy-binding', $sweeperInvokerEmail, "--project=$Project", "--member=serviceAccount:$schedulerAgent", '--role=roles/iam.serviceAccountTokenCreator', '--quiet') | Out-Null

foreach ($queue in $queues) {
	Invoke-Gcloud @('tasks', 'queues', 'add-iam-policy-binding', $queue, "--location=$Region", "--project=$Project", "--member=serviceAccount:$runtimeEmail", '--role=roles/cloudtasks.enqueuer', '--quiet') | Out-Null
}

Write-Output "Cloud Run free-beta runtime access is provisioned for project $Project in $Region."
Write-Output "Runtime identity: $runtimeEmail"
Write-Output "Private Mission Control identity: $missionControlRuntimeEmail"
Write-Output "Scheduled-sweeper invoker: $sweeperInvokerEmail"
Write-Output "Scoped Firestore database, artifact bucket, runtime secrets, and $($queues.Count) task queues are configured. The Cloudflare credential has no public-runtime access; its Secret Manager access is limited to the owner-only Mission Control service and deploy identity."
Write-Output 'The worker run.invoker binding and public gateway exposure are intentionally deferred to deployment verification.'
