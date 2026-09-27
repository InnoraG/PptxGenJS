param(
	[string]$ProjectId = 'betterpptx-mcp-20260926',
	[string]$Region = 'us-central1',
	[string]$Repository = 'betterpptx/betterpptx-mcp',
	[string]$Environment = 'betterpptx-canary',
	[string]$WorkflowPath = '.github/workflows/betterpptx-mcp-cloudrun-free-beta.yml',
	[string]$PoolId = 'github-betterpptx-free-beta',
	[string]$ProviderId = 'betterpptx-free-beta',
	[string]$DeployerServiceAccountId = 'github-free-beta-deployer',
	[string]$RunRoleId = 'betterpptxFreeBetaDeployer',
	[string]$SchedulerRoleId = 'betterpptxFreeBetaScheduler',
	[string]$QueueRoleId = 'betterpptxFreeBetaQueueReader',
	[string]$SecretMetadataRoleId = 'betterpptxFreeBetaSecretMetadataReader',
	[switch]$Apply
)

$ErrorActionPreference = 'Stop'

function Invoke-Gcloud([string[]]$Arguments, [string]$Description) {
	Write-Host "- $Description"
	if (-not $Apply) { return }
	$previousErrorAction = $ErrorActionPreference
	try {
		$ErrorActionPreference = 'Continue'
		$output = & gcloud @Arguments 2>&1
		$exitCode = $LASTEXITCODE
	} finally {
		$ErrorActionPreference = $previousErrorAction
	}
	if ($exitCode -ne 0) {
		$summary = (@($output | ForEach-Object { [string]$_ }) -join "`n").Trim()
		throw "$Description failed: $summary"
	}
}

function Get-GcloudValue([string[]]$Arguments, [string]$Description) {
	$previousErrorAction = $ErrorActionPreference
	try {
		$ErrorActionPreference = 'Continue'
		$value = & gcloud @Arguments 2>&1
		$exitCode = $LASTEXITCODE
	} finally {
		$ErrorActionPreference = $previousErrorAction
	}
	$valueText = (@($value | ForEach-Object { [string]$_ }) -join "`n").Trim()
	if ($exitCode -ne 0 -or [string]::IsNullOrWhiteSpace($valueText)) {
		throw "Could not read $Description. Confirm gcloud access and the exact free-beta resources."
	}
	return $valueText
}

if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) { throw 'gcloud is required; this script does not install or authenticate the CLI.' }
if ($Repository -cne 'betterpptx/betterpptx-mcp') { throw 'Refusing to trust a repository other than betterpptx/betterpptx-mcp.' }
if ($Environment -cne 'betterpptx-canary') { throw 'The GitHub environment must be betterpptx-canary.' }
if ($WorkflowPath -cne '.github/workflows/betterpptx-mcp-cloudrun-free-beta.yml') { throw 'The trusted workflow path must match the free-beta workflow exactly.' }

$projectNumber = Get-GcloudValue @('projects', 'describe', $ProjectId, '--format=value(projectNumber)') 'project number'
$poolResource = "projects/$projectNumber/locations/global/workloadIdentityPools/$PoolId"
$providerResource = "$poolResource/providers/$ProviderId"
$deployerEmail = "$DeployerServiceAccountId@$ProjectId.iam.gserviceaccount.com"
$runtimeEmail = "betterpptx-public-runtime@$ProjectId.iam.gserviceaccount.com"
$schedulerInvokerEmail = "betterpptx-maintenance-invoker@$ProjectId.iam.gserviceaccount.com"
$artifactRepository = 'betterpptx-canary'
$queues = @('betterpptx-deck-interactive', 'betterpptx-deck-batch', 'betterpptx-media-long')
$secrets = @('betterpptx-install-hmac-secret', 'betterpptx-operation-worker-token')

$null = Get-GcloudValue @('iam', 'service-accounts', 'describe', $runtimeEmail, "--project=$ProjectId", '--format=value(email)') 'runtime service account'
$null = Get-GcloudValue @('iam', 'service-accounts', 'describe', $schedulerInvokerEmail, "--project=$ProjectId", '--format=value(email)') 'scheduler invocation service account'
$null = Get-GcloudValue @('artifacts', 'repositories', 'describe', $artifactRepository, "--project=$ProjectId", "--location=$Region", '--format=value(name)') 'Artifact Registry repository'
foreach ($secret in $secrets) {
	$null = Get-GcloudValue @('secrets', 'describe', $secret, "--project=$ProjectId", '--format=value(name)') "Secret Manager secret $secret"
}
foreach ($queue in $queues) {
	$null = Get-GcloudValue @('tasks', 'queues', 'describe', $queue, "--project=$ProjectId", "--location=$Region", '--format=value(name)') "Cloud Tasks queue $queue"
}

$workflowRef = "$Repository/$WorkflowPath@refs/heads/main"
$attributeMapping = 'google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref,attribute.workflow_ref=assertion.workflow_ref'
$attributeCondition = "assertion.repository == '$Repository' && assertion.ref == 'refs/heads/main' && assertion.environment == '$Environment' && assertion.workflow_ref == '$workflowRef'"

$runPermissions = @(
	'resourcemanager.projects.get',
	'run.jobs.create', 'run.jobs.get', 'run.jobs.getIamPolicy', 'run.jobs.list', 'run.jobs.setIamPolicy', 'run.jobs.update',
	'run.locations.list', 'run.operations.get', 'run.revisions.get', 'run.revisions.list',
	'run.services.create', 'run.services.get', 'run.services.getIamPolicy', 'run.services.list', 'run.services.setIamPolicy', 'run.services.update'
) -join ','
$schedulerPermissions = 'cloudscheduler.jobs.create,cloudscheduler.jobs.get,cloudscheduler.jobs.list,cloudscheduler.jobs.update'
$queuePermissions = 'cloudtasks.queues.get'
$secretMetadataPermissions = 'secretmanager.secrets.get,secretmanager.versions.get'

Write-Host "Project              : $ProjectId ($projectNumber)"
Write-Host "Trusted repository   : $Repository"
Write-Host "Trusted workflow     : $workflowRef"
Write-Host "Required environment : $Environment"
Write-Host "Workload pool        : $poolResource"
Write-Host "Workload provider    : $providerResource"
Write-Host "Deployer identity    : $deployerEmail"
Write-Host "Mode                 : $(if ($Apply) { 'APPLY' } else { 'PLAN ONLY; pass -Apply to configure' })"
Write-Host 'Planned access is limited to non-deleting Cloud Run service/job deployment, scheduler job create/read/update, queue metadata reads, named-secret metadata reads, and image publishing to the BetterPPTX repository.'

$existingPools = @(& gcloud iam workload-identity-pools list "--project=$ProjectId" '--location=global' '--format=value(name)')
if ($LASTEXITCODE -ne 0) { throw 'Could not list Workload Identity pools.' }
$poolExists = $existingPools -contains $poolResource
if (-not $poolExists) {
	Invoke-Gcloud @('iam', 'workload-identity-pools', 'create', $PoolId, "--project=$ProjectId", '--location=global', '--display-name=GitHub BetterPPTX free beta') 'create the separate free-beta Workload Identity pool'
} else {
	Write-Host "- reuse separate Workload Identity pool $PoolId"
}

$providerExists = $false
if ($poolExists) {
	$existingProviders = @(& gcloud iam workload-identity-pools providers list "--project=$ProjectId" '--location=global' "--workload-identity-pool=$PoolId" '--format=value(name)')
	if ($LASTEXITCODE -ne 0) { throw 'Could not list providers in the dedicated free-beta pool.' }
	$providerExists = $existingProviders -contains $providerResource
}
$providerVerb = if ($providerExists) { 'update-oidc' } else { 'create-oidc' }
Invoke-Gcloud @('iam', 'workload-identity-pools', 'providers', $providerVerb, $ProviderId, "--project=$ProjectId", '--location=global', "--workload-identity-pool=$PoolId", '--issuer-uri=https://token.actions.githubusercontent.com', "--attribute-mapping=$attributeMapping", "--attribute-condition=$attributeCondition", '--display-name=BetterPPTX free beta deploy') "$providerVerb the provider restricted to the exact repository, main branch, environment, and workflow"

$serviceAccounts = @(& gcloud iam service-accounts list "--project=$ProjectId" "--filter=email=$deployerEmail" '--format=value(email)')
if ($LASTEXITCODE -ne 0) { throw 'Could not list project service accounts.' }
if ($serviceAccounts -notcontains $deployerEmail) {
	Invoke-Gcloud @('iam', 'service-accounts', 'create', $DeployerServiceAccountId, "--project=$ProjectId", '--display-name=GitHub BetterPPTX free beta deployer', '--description=Keyless GitHub deployer for the BetterPPTX free-publication Cloud Run release only.') 'create the dedicated free-beta deployer identity'
} else {
	Write-Host "- reuse dedicated deployer identity $deployerEmail"
}

$existingRoles = @(& gcloud iam roles list "--project=$ProjectId" '--format=value(name)')
if ($LASTEXITCODE -ne 0) { throw 'Could not list project custom IAM roles.' }
foreach ($role in @(
	@{ Id = $RunRoleId; Title = 'BetterPPTX free beta deployer'; Description = 'Non-deleting Cloud Run service and job deployment/readback for the dedicated BetterPPTX project.'; Permissions = $runPermissions },
	@{ Id = $SchedulerRoleId; Title = 'BetterPPTX free beta scheduler'; Description = 'Create, inspect, list, and update BetterPPTX artifact-sweep schedules without deleting or manually running jobs.'; Permissions = $schedulerPermissions },
	@{ Id = $QueueRoleId; Title = 'BetterPPTX free beta queue reader'; Description = 'Read Cloud Tasks queue metadata only.'; Permissions = $queuePermissions },
	@{ Id = $SecretMetadataRoleId; Title = 'BetterPPTX free beta secret metadata reader'; Description = 'Read named Secret Manager metadata and version state without reading secret payloads.'; Permissions = $secretMetadataPermissions }
)) {
	$roleResource = "projects/$ProjectId/roles/$($role.Id)"
	$verb = if ($existingRoles -contains $roleResource) { 'update' } else { 'create' }
	Invoke-Gcloud @('iam', 'roles', $verb, $role.Id, "--project=$ProjectId", "--title=$($role.Title)", "--description=$($role.Description)", "--permissions=$($role.Permissions)", '--stage=GA') "$verb the narrowly scoped $($role.Title) role"
}

$repositoryPrincipal = "principalSet://iam.googleapis.com/$poolResource/attribute.repository/$Repository"
$runRole = "projects/$ProjectId/roles/$RunRoleId"
$schedulerRole = "projects/$ProjectId/roles/$SchedulerRoleId"
$queueRole = "projects/$ProjectId/roles/$QueueRoleId"
$secretMetadataRole = "projects/$ProjectId/roles/$SecretMetadataRoleId"
Invoke-Gcloud @('iam', 'service-accounts', 'add-iam-policy-binding', $deployerEmail, "--project=$ProjectId", '--role=roles/iam.workloadIdentityUser', "--member=$repositoryPrincipal", '--quiet') 'allow only the separate free-beta pool to impersonate its deployer'
Invoke-Gcloud @('iam', 'service-accounts', 'add-iam-policy-binding', $deployerEmail, "--project=$ProjectId", "--member=serviceAccount:$deployerEmail", '--role=roles/iam.serviceAccountTokenCreator', '--quiet') 'allow the deployer to mint its own short-lived Cloud Run preflight identity token'
Invoke-Gcloud @('projects', 'add-iam-policy-binding', $ProjectId, "--member=serviceAccount:$deployerEmail", "--role=$runRole", '--condition=None', '--quiet') 'grant non-deleting Cloud Run deployment access within the dedicated project'
Invoke-Gcloud @('projects', 'add-iam-policy-binding', $ProjectId, "--member=serviceAccount:$deployerEmail", '--role=roles/serviceusage.serviceUsageConsumer', '--condition=None', '--quiet') 'allow use of already-enabled Google Cloud services'
Invoke-Gcloud @('projects', 'add-iam-policy-binding', $ProjectId, "--member=serviceAccount:$deployerEmail", "--role=$schedulerRole", '--condition=None', '--quiet') 'grant only create/read/update access to Cloud Scheduler jobs'
Invoke-Gcloud @('artifacts', 'repositories', 'add-iam-policy-binding', $artifactRepository, "--project=$ProjectId", "--location=$Region", "--member=serviceAccount:$deployerEmail", '--role=roles/artifactregistry.writer', '--quiet') 'allow publishing images only to the BetterPPTX Artifact Registry repository'
Invoke-Gcloud @('iam', 'service-accounts', 'add-iam-policy-binding', $runtimeEmail, "--project=$ProjectId", "--member=serviceAccount:$deployerEmail", '--role=roles/iam.serviceAccountUser', '--quiet') 'allow attaching only the BetterPPTX runtime identity'
Invoke-Gcloud @('iam', 'service-accounts', 'add-iam-policy-binding', $schedulerInvokerEmail, "--project=$ProjectId", "--member=serviceAccount:$deployerEmail", '--role=roles/iam.serviceAccountUser', '--quiet') 'allow attaching only the artifact-sweep invocation identity'

foreach ($queue in $queues) {
	Invoke-Gcloud @('tasks', 'queues', 'add-iam-policy-binding', $queue, "--project=$ProjectId", "--location=$Region", "--member=serviceAccount:$deployerEmail", "--role=$queueRole", '--quiet') "allow metadata-only inspection of queue $queue"
}
foreach ($secret in $secrets) {
	Invoke-Gcloud @('secrets', 'add-iam-policy-binding', $secret, "--project=$ProjectId", "--member=serviceAccount:$deployerEmail", "--role=$secretMetadataRole", '--quiet') "allow metadata-only inspection of secret $secret"
}

Write-Host ''
Write-Host 'Set these GitHub environment variables in betterpptx-canary:'
Write-Host "GCP_FREE_BETA_WORKLOAD_IDENTITY_PROVIDER=$providerResource"
Write-Host "GCP_FREE_BETA_DEPLOY_SERVICE_ACCOUNT=$deployerEmail"
Write-Host 'The existing canary workflow identity and permissions are not changed.'
if (-not $Apply) { Write-Host 'No changes were applied. Re-run with -Apply after reviewing the plan.' }
