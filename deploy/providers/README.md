# Provider deployment and cost-comparison track

## Deployment source of truth

GitHub is the intended source for release builds. The private repository is
`betterpptx/betterpptx-mcp`, with `main` as its default branch. The current
GitHub `main` is not yet a safe deployment source: its latest observed commit
is from 2026-06-06 and its MCP package version is `1.0.0`, while the local
working tree reports `1.10.44` and contains uncommitted changes. Do not run the
canary workflow until the reviewed release source is committed and merged to
that repository's protected `main`.

The GitHub workflows are deliberately separate from ordinary local builds:

- `betterpptx-mcp-ci.yml` runs tests and builds the container without publishing
  or deploying it.
- `Dockerfile.mcp.dockerignore` is a Dockerfile-specific build-context
  allowlist. It prevents local credentials, generated decks, caches, staging
  folders, and consented/generated identity media from entering the image
  build. The local checkout had multiple gigabytes of such data; the verified
  local test build context was about 373 MB.
- `betterpptx-mcp-canary.yml` requires an explicit `DEPLOY` selection, runs
  from the private repository's `main` only, uses GitHub OIDC instead of a
  saved cloud key, pushes a unique commit/run-tagged image, deploys by digest,
  refuses high/critical production dependency advisories, and verifies that
  the existing canary stays private. It hashes the exact committed Git archive
  into `BETTERPPTX_BUILD_SOURCE_DIGEST`; the same image records the source
  revision as an OCI label. The public runtime manifest can therefore report
  the attested source digest for a clean GitHub build. Local dirty builds remain
  explicitly unattested.
- `configure-github-actions-wif.ps1` defaults to plan-only. Applying it creates
  a repository/workflow-restricted identity and grants only the canary image
  repository, canary service, and its existing runtime identity. It does not
  create production access.

Before enabling the workflow, configure a protected GitHub environment named
`betterpptx-canary` with a required human reviewer, then set the two variables
printed by the WIF setup script. No service-account JSON secret is needed.

## What the supplied cost models actually compare

The spreadsheets are planning models, not production invoices or performance
benchmarks. Their headline values cannot be ranked as if they used identical
systems. The scale-to-zero workbook uses a common Cloudflare edge/API, queue,
and D1 foundation in every priced row, a user-reported existing 4-OCPU/24-GB
OCI A1, routes 80% of eligible work to that baseline, includes 5% retry
allowance, and compares paid overflow and storage combinations. The full
infrastructure workbook instead models two always-on OCI OCPUs, zero retries,
and a separately-entered $37/month operating provision. Both use a 15-MB
artifact, 30-day retention, three full downloads, and an unmeasured 60-second
generation assumption. Those differences explain why a provider's two rows
can diverge substantially even at the same monthly deck count.

For a fair live comparison, freeze one reviewed Git commit and one container
image digest, then record the same workload and actual metering for each
provider. The current artifact-delivery policy is 12 hours, not the models'
30 days; storage cost must be recalculated for that retention while download
volume stays separately measured. The observed 17.215008-MB artifact should
replace the models' 15-MB planning size for the first measured case. Record
actual CPU-seconds, wall time, peak memory, cold/warm request latency,
artifact byte-hours, uploads, downloads, transfer, retry count, and provider
bill/export rows. Keep external narration/avatar/presenter costs separate
from infrastructure cost.

## Candidate architecture rows

The workbooks identify alternatives, not deployed adapters. The first live
adapter is the existing private Cloud Run canary. The next candidates should
be implemented and compared as complete architectures rather than just
compute products:

| Candidate | Cost-model pairing | Main qualification before a live test |
| --- | --- | --- |
| Existing OCI A1 + R2 or B2 | Baseline/overflow with private artifact delivery | Measure real A1 spare capacity, ARM compatibility, worker launch time, and private-download path. |
| Cloud Run + GCS | Managed container and direct object downloads | The model's egress dominates at higher download volumes; verify actual user-region transfer and the required authenticated delivery behavior. |
| AWS Fargate or Lambda + S3/CloudFront | Managed container task or function plus delivery tier | Validate launch overhead, runtime/package constraints, actual CloudFront eligibility, and the same private-download semantics. |
| Azure Container Apps + Blob | Managed jobs and native storage | Rates are explicitly provisional in the workbook; obtain current regional quotes before comparing. |
| Cloudflare Containers + R2 | Edge plus sleeping container | Verify container sleep/egress charges and implement/measure the custom queue, scaling, and durable-state design first. |
| Blaxel sandbox or batch | Optional paid execution comparison | Measure full request-to-engine readiness and snapshot/image retention; do not substitute a sandbox resume claim for end-to-end latency. |

No alternative-provider adapter or provider benchmark is claimed as live yet.

The current local production dependency audit (2026-09-27) reports zero high or
critical advisories and seven moderate findings in the Google Cloud client
retry/UUID chain. The canary gate intentionally blocks high/critical findings;
it does not force a breaking major upgrade of `google-gax`/Firestore as an
unreviewed security workaround.
