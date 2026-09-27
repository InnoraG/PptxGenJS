param(
  [string]$ProjectId = "betterpptx-mcp-20260926",
  [string]$Region = "us-central1",
  [string]$ArtifactRepository = "betterpptx-canary",
  [string]$CloudRunService = "betterpptx-canary",
  [string]$Repository = "betterpptx/betterpptx-mcp",
  [string]$WorkflowPath = ".github/workflows/betterpptx-mcp-canary.yml",
  [string]$PoolId = "github-betterpptx-canary",
  [string]$ProviderId = "betterpptx-mcp-canary",
  [string]$DeployerServiceAccountId = "github-canary-deployer",
  [string]$CustomRoleId = "betterpptxCanaryDeployer",
  [switch]$Apply
)

$ErrorActionPreference = "Stop"

function Invoke-Gcloud([string[]]$Arguments, [string]$Description) {
  Write-Host "- $Description"
  if (-not $Apply) { return }
  & gcloud @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Description failed with exit code $LASTEXITCODE."
  }
}

function Get-GcloudValue([string[]]$Arguments, [string]$Description) {
  $value = & gcloud @Arguments
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace([string]$value)) {
    throw "Could not read $Description. Confirm gcloud access and the exact canary resources."
  }
  return ([string]$value).Trim()
}

if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
  throw "gcloud is required. This script does not install or authenticate the Google Cloud CLI."
}
if ($Repository -cne "betterpptx/betterpptx-mcp") {
  throw "This bootstrap is narrowly bound to betterpptx/betterpptx-mcp. Do not broaden it to an organization or another repository."
}
if ($WorkflowPath -cne ".github/workflows/betterpptx-mcp-canary.yml") {
  throw "The trusted workflow path must match .github/workflows/betterpptx-mcp-canary.yml exactly."
}

$projectNumber = Get-GcloudValue @(
  "projects", "describe", $ProjectId, "--format=value(projectNumber)"
) "project number"
$runtimeServiceAccount = Get-GcloudValue @(
  "run", "services", "describe", $CloudRunService,
  "--project=$ProjectId", "--region=$Region",
  "--format=value(spec.template.spec.serviceAccountName)"
) "Cloud Run runtime service account"
$null = Get-GcloudValue @(
  "artifacts", "repositories", "describe", $ArtifactRepository,
  "--project=$ProjectId", "--location=$Region", "--format=value(name)"
) "Artifact Registry repository"

$deployerEmail = "$DeployerServiceAccountId@$ProjectId.iam.gserviceaccount.com"
$poolResource = "projects/$projectNumber/locations/global/workloadIdentityPools/$PoolId"
$providerResource = "$poolResource/providers/$ProviderId"
$principalSet = "principalSet://iam.googleapis.com/$poolResource/attribute.repository/$Repository"
$roleResource = "projects/$ProjectId/roles/$CustomRoleId"
$workflowRef = "$Repository/$WorkflowPath`@refs/heads/main"
$attributeMapping = "google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref,attribute.workflow_ref=assertion.workflow_ref"
$attributeCondition = "assertion.repository == '$Repository' && assertion.ref == 'refs/heads/main' && assertion.workflow_ref == '$workflowRef'"
$permissions = @(
  "resourcemanager.projects.get",
  "run.locations.list",
  "run.operations.get",
  "run.revisions.get",
  "run.revisions.list",
  "run.services.get",
  "run.services.getIamPolicy",
  "run.services.update"
) -join ","

Write-Host "Target project      : $ProjectId ($projectNumber)"
Write-Host "Target Cloud Run    : $Region/$CloudRunService"
Write-Host "Artifact repository : $Region/$ArtifactRepository"
Write-Host "Runtime identity    : $runtimeServiceAccount"
Write-Host "Trusted GitHub repo : $Repository"
Write-Host "Trusted workflow    : $workflowRef"
Write-Host "Deployment identity : $deployerEmail"
Write-Host "Workload provider   : $providerResource"
Write-Host "Mode                : $(if ($Apply) { 'APPLY' } else { 'PLAN ONLY; pass -Apply to create or bind the listed resources' })"
Write-Host "Planned Google Cloud changes:"

$poolName = & gcloud iam workload-identity-pools describe $PoolId `
  "--project=$ProjectId" "--location=global" "--format=value(name)" 2>$null
$poolExists = ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace([string]$poolName))
if (-not $poolExists) {
  Invoke-Gcloud @(
    "iam", "workload-identity-pools", "create", $PoolId,
    "--project=$ProjectId", "--location=global", "--display-name=GitHub BetterPPTX canary"
  ) "create the repository-scoped GitHub Workload Identity pool"
} else {
  Write-Host "- reuse existing Workload Identity pool $PoolId"
}

$providerName = & gcloud iam workload-identity-pools providers describe $ProviderId `
  "--project=$ProjectId" "--location=global" "--workload-identity-pool=$PoolId" "--format=value(name)" 2>$null
$providerExists = ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace([string]$providerName))
$providerVerb = if ($providerExists) { "update-oidc" } else { "create-oidc" }
Invoke-Gcloud @(
  "iam", "workload-identity-pools", "providers", $providerVerb, $ProviderId,
  "--project=$ProjectId", "--location=global", "--workload-identity-pool=$PoolId",
  "--issuer-uri=https://token.actions.githubusercontent.com",
  "--attribute-mapping=$attributeMapping", "--attribute-condition=$attributeCondition",
  "--display-name=BetterPPTX canary deploy"
) "$providerVerb the provider restricted to the repository, main branch, and one workflow"

$serviceAccountName = & gcloud iam service-accounts describe $deployerEmail `
  "--project=$ProjectId" "--format=value(email)" 2>$null
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace([string]$serviceAccountName)) {
  Invoke-Gcloud @(
    "iam", "service-accounts", "create", $DeployerServiceAccountId,
    "--project=$ProjectId", "--display-name=GitHub BetterPPTX canary deployer",
    "--description=Keyless GitHub Actions deployer limited to the private BetterPPTX canary"
  ) "create the keyless canary deployment service account"
} else {
  Write-Host "- reuse existing deployment service account $deployerEmail"
}

$customRole = & gcloud iam roles describe $CustomRoleId `
  "--project=$ProjectId" "--format=value(name)" 2>$null
$roleVerb = if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace([string]$customRole)) { "update" } else { "create" }
Invoke-Gcloud @(
  "iam", "roles", $roleVerb, $CustomRoleId,
  "--project=$ProjectId", "--title=BetterPPTX canary deployer",
  "--description=Update and inspect only the BetterPPTX canary Cloud Run service without public IAM mutation or interactive shell permissions",
  "--permissions=$permissions", "--stage=GA"
) "$roleVerb the minimal canary-only Cloud Run role"

Invoke-Gcloud @(
  "iam", "service-accounts", "add-iam-policy-binding", $deployerEmail,
  "--project=$ProjectId", "--role=roles/iam.workloadIdentityUser", "--member=$principalSet"
) "allow only this repository's federated workflow to impersonate the deployer account"
Invoke-Gcloud @(
  "run", "services", "add-iam-policy-binding", $CloudRunService,
  "--project=$ProjectId", "--region=$Region", "--role=$roleResource", "--member=serviceAccount:$deployerEmail"
) "bind the limited deploy role only on the existing canary service"
Invoke-Gcloud @(
  "artifacts", "repositories", "add-iam-policy-binding", $ArtifactRepository,
  "--project=$ProjectId", "--location=$Region", "--role=roles/artifactregistry.writer",
  "--member=serviceAccount:$deployerEmail"
) "allow image publishing only to the canary Artifact Registry repository"
Invoke-Gcloud @(
  "iam", "service-accounts", "add-iam-policy-binding", $runtimeServiceAccount,
  "--project=$ProjectId", "--role=roles/iam.serviceAccountUser", "--member=serviceAccount:$deployerEmail"
) "allow attaching only the existing canary runtime identity"

Write-Host ""
Write-Host "GitHub repository/environment variables to set after review:"
Write-Host "GCP_WORKLOAD_IDENTITY_PROVIDER=$providerResource"
Write-Host "GCP_DEPLOY_SERVICE_ACCOUNT=$deployerEmail"
Write-Host "No long-lived key or credential secret is created."
