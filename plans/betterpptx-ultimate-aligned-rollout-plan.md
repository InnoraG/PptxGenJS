# BetterPPTX Ultimate Aligned Rollout Plan

Date: 2026-06-04

Status: PRIVATE / INTERNAL. Do not publish this file or its contents.

This is the alignment document for full rollout. It reconciles:

- `plans/betterpptx-definitive-ai-first-adoption-plan.md`
- `plans/betterpptx-executor-alignment-rollout-plan.md`
- `plans/betterpptx-private-track-a-executor-plan-claude.md`
- `ops/betterpptx-mission-control.html`

## Executive Decision

BetterPPTX rollout is split into two tracks:

```text
Track A: private implementation, security, reliability, deployment, billing,
artifacts, entitlements, telemetry, and ops.

Track B: public AI-facing discovery, connector guidance, product capability,
tool reference, gallery proof, trust docs, website, and registry listings.
```

Both tracks are required, but they have different publication rules.

```text
Track A is never public.
Track B is public only after disclosure review.
```

The public strategy remains:

```text
Expose capability clearly.
Hide implementation completely.
```

The private safety strategy is:

```text
Do not announce a keyless public connector URL until Track A gates prove the
endpoint cannot become a cost, data, or infrastructure compromise.
```

## Non-Negotiable Boundary

Public surfaces may expose:

- product name
- hosted MCP connector guidance
- public `betterpptx.*` tool names
- public parameter names and schemas
- safe workflows
- public-safe screenshots
- public-safe sample decks
- validation notes
- registry listings
- non-implementation trust badges

Public surfaces must not expose:

- server source
- MCP handler internals
- generation/decypher implementation
- dependencies or package internals
- cloud provider details
- deployment commands
- Docker/container details
- billing provider API internals
- storage/session internals
- private env vars
- local paths
- logs or stack traces
- process metadata
- private decks, prompts, or customer material

## Current Containment State

The previously exposed public implementation repository was deleted. Treat its
contents and history as disclosed anyway.

Immediate containment work remains Track A:

1. Rotate actual secrets that appeared in the exposed repo or its history:
   - URL-path secrets
   - Bearer tokens
   - Dodo/API keys
   - Tailscale/funnel secret URLs
   - `.env` values
   - any service-account JSON key if one was ever exposed
2. Treat project IDs, service names, and regions as disclosed metadata. They are
   not secrets, but they should not be used as public trust or discovery
   material.
3. Sweep for residue:
   - GitHub forks/cache/search
   - npm packages or tarballs
   - search engine caches
   - Wayback/archive snapshots
4. Confirm old secrets fail after rotation.
5. Keep all implementation and deployment history private.

Acceptance:

```text
old exposed secrets are invalid
no public repo contains implementation
no public package contains implementation
public docs are not pushed until disclosure review passes
```

## Rollout Ordering

Track B can be drafted in parallel, but public announcement is gated by Track A.

Recommended order:

1. Finish containment.
2. Harden private endpoint security and cost controls.
3. Move artifacts and entitlements to shared production stores.
4. Enforce black-box public outputs.
5. Add privacy-safe telemetry.
6. Wire private mission-control dashboard to telemetry.
7. Draft public docs/tool reference/gallery.
8. Lock canonical identity/domain/MCP URL.
9. Validate with real AI clients.
10. Publish public docs.
11. Submit registries.
12. Scale gradually using canary and rollback.

## Track A - Private Implementation And Security

Track A owns everything that makes the hosted MCP safe, reliable, and
operationally controlled.

### A0. Containment And Incident Hygiene

Tasks:

- rotate exposed secrets
- revoke old URL-path and endpoint tokens
- rotate Dodo/API credentials if exposed
- rotate service-account keys if any existed
- remove local packed implementation tarballs from public paths
- scrub public release candidates
- scan for old product names and public implementation references

Correction to Claude note:

```text
Do not describe cloud project identifiers as secrets to rotate. Treat them as
disclosed metadata. Rotate credentials and secret URLs.
```

### A1. SSRF And Safe Egress

This is a launch blocker.

All server-side fetches must route through a safe fetch layer.

Required behavior:

- allow only `http:` and `https:`
- reject `file:`, `ftp:`, `gopher:`, custom schemes, and local paths
- resolve DNS before connect
- deny any resolved IP in private, loopback, link-local, carrier NAT,
  multicast/reserved, IPv6 local/link-local, and IPv4-mapped private ranges
- deny metadata hosts, including cloud metadata hostnames
- re-check after redirects or disable redirects
- prevent DNS rebinding by pinning to resolved IP or revalidating on connect
- cap response size
- enforce hard timeout
- restrict image fetches to image content types
- default public posture: disable generic `betterpptx.http.fetch`; allow only
  guarded image/media fetches that are needed for PPTX authoring

Verifier requirements:

```text
fetch metadata host -> structured refusal
fetch private IP -> structured refusal
redirect public -> private -> structured refusal
oversized response -> structured refusal
non-image media for image fetch -> structured refusal
```

### A2. Rate Limits, Quotas, Size Caps, And Cost Controls

This is a launch blocker.

Required controls:

- per-IP token bucket
- per-session deck/hour quota
- free-tier daily abuse cap if needed
- upload base64 size cap, initially 25-40 MB
- zip bomb and decompression ratio guard for uploaded decks
- image byte size cap
- per-tool-call timeout below platform request timeout
- global concurrency guard returning structured `BUSY`
- kill switch returning structured maintenance error
- read-only mode if needed
- max-instances ceiling
- budget alerts plus operational containment

Correction to Claude note:

```text
Budgets alert. Hard containment comes from max instances, quotas, rate limits,
kill switch, and optional automation.
```

Header rule:

```text
Do not blindly trust X-Forwarded-For. Trust only the platform/proxy headers
that are guaranteed by the deployment path, and normalize the client identity
inside one private middleware.
```

Verifier requirements:

```text
flood -> RATE_LIMITED
oversize upload -> structured error
timeout -> structured recoverable error
concurrency pressure -> BUSY
kill switch -> maintenance structured error
```

### A3. CORS And Public Connector Mode

If public connector auth is keyless:

- CORS should be either `*` or a configurable allowlist
- no cookies should be used for keyless public auth
- browser-origin checks must not be treated as the main security layer
- server-side MCP clients are not CORS-bound

### A4. Secrets And CI

Private implementation only:

- use workload identity / application default credentials in runtime
- use keyless CI deployment where available
- do not store service-account JSON keys in repo secrets
- use Secret Manager or equivalent for Dodo/API keys and admin secrets
- run secret scanning in private CI
- run secret scanning on public-sanitization pipeline before copying docs to
  public repo

Scanner patterns must include:

- API key prefixes
- Bearer tokens
- URL-path secrets
- Tailscale/private endpoint fragments
- cloud project/service identifiers
- private env var names
- raw license keys

### A5. Artifact Reliability

Local `/tmp` downloads are not safe for multi-instance production.

Production behavior:

- upload saved `.pptx` artifacts to a private object store
- return short-lived signed download URLs
- use crypto-random object names
- sanitize `downloadName`
- block header injection in `Content-Disposition`
- lifecycle-delete artifacts after TTL
- never expose bucket names or object internals publicly

Cloud-specific detail belongs only in private Track A. If using GCS, remember
that signed URL generation from Cloud Run may require service-account signing
permission.

Verifier requirements:

```text
save -> signed URL
cold GET from different instance -> 200 ZIP bytes
expired URL -> controlled expiry
artifact object path is not guessable
downloadName cannot inject headers
```

### A6. Entitlement Reliability

Production entitlements must be shared across instances.

Required behavior:

- store license-key fingerprint only
- never store raw license keys
- store provider ID, plan, credits/cache/grace state, expiry, and revocation
  status as needed
- support local file adapter for dev
- support shared production adapter for deployed endpoint
- fetch/refresh provider state at session start and at premium-gate moments
- cache for performance with revocation/grace policy

Verifier requirements:

```text
activate on instance A -> premium operation on instance B succeeds
revoked/expired provider state -> premium access refused after refresh/grace
raw key is absent from logs, telemetry, stores, and final responses
```

### A7. Idempotency And Retry Semantics

Do not claim `retry_safe: true` unless the operation is genuinely safe to retry.

Required behavior:

- mutating tools accept an optional idempotency key, or have internal dedup
- duplicate retries do not create duplicate slides/shapes/assets
- non-idempotent operations must return `retry_safe: false`
- transient failures must preserve valid artifact state where possible

Verifier requirements:

```text
retry slide.add with same idempotency key -> one slide
retry save with same idempotency key -> one artifact or stable replacement
non-idempotent tool does not claim retry_safe
```

### A8. Black-Box Output Contract

Every public tool result must be product-level only.

Public outputs may include:

- product name
- public build marker
- policy summary
- tool result summary
- opaque handles
- signed/download URLs
- structured errors
- next actions

Public outputs must not include:

- source code
- local file paths
- cwd, pid, argv, runtime version
- stack traces
- dependencies
- provider endpoints
- bucket/object internals
- billing request/response payloads
- raw keys
- private debug logs

Error shape:

```json
{
  "code": "REQUIRES_UPGRADE",
  "message": "Concise product-level explanation.",
  "recoverable": true,
  "next_actions": [],
  "retry_safe": true,
  "artifact_state": "work_so_far_valid"
}
```

### A9. Privacy-Safe Telemetry

Telemetry must measure adoption and reliability without collecting deck content.

Allowed event fields:

- tool name
- success/failure
- error code
- latency
- gate hit/recovered
- hashed session ID
- slide count
- artifact size bucket
- plan tier
- public build marker

Forbidden event fields:

- deck text
- prompt text
- raw license keys
- user PII
- local paths
- file bytes
- uploaded deck names if user-derived
- stack traces

Hashing rule:

```text
Use salted hashes. Prefer rotating salt windows for public telemetry so event
correlation is useful operationally without becoming long-term user tracking.
```

Dashboard metrics should derive from telemetry:

- time to first successful artifact
- one-shot valid rate
- per-tool success rate
- gate recovery rate
- reuse rate
- download success rate
- cost per successful deck
- rate-limit and abuse signals

### A9.1 Functional Quality Telemetry

Telemetry must also capture functional quality failures, not only uptime and
tool-call success.

Required quality events:

- package validation passed/failed
- package scan failed (`NaN`, `Infinity`, `[object Object]`, local path)
- PowerPoint repair prompt detected
- PowerPoint open failed
- PowerPoint export failed
- slide/image/chart/media relationship anomaly
- malformed animation/timing structure detected
- generated artifact could not be downloaded
- validation was skipped because oracle was unavailable

Allowed quality event fields:

- public build marker
- tool/workflow name
- validation stage
- pass/fail
- normalized failure code
- slide count
- file size bucket
- anonymized session/build IDs
- retention bucket for quarantined artifact, if retained

Forbidden quality event fields:

- deck text
- prompt text
- raw file bytes
- raw license keys
- user names or email addresses
- local paths
- screenshots containing private content unless explicitly approved for
  internal debugging

Artifact retention rule:

```text
Keep failed artifacts only in a private quarantine store with short TTL, access
logging, and operator-only access. Prefer retaining only generated BetterPPTX
artifacts, not arbitrary user uploads. Never expose quarantined artifacts through
public docs, telemetry, or dashboard exports.
```

### A9.2 PowerPoint Repair Oracle

Normal validators are not enough for the repair-prompt class of bugs.

Required oracle tiers:

1. Static/package checks:
   - ZIP integrity
   - content types
   - relationships
   - XML parse
   - known-bad string scan
   - focused OOXML structural checks
2. Conversion/render smoke:
   - optional PDF/image conversion through a trusted converter
   - useful signal, but not proof that desktop PowerPoint will avoid repair
3. Desktop PowerPoint oracle:
   - opens the generated `.pptx` in desktop PowerPoint
   - detects repair prompt, open failure, export failure, or crash
   - optionally exports PDF/images to force document load
   - returns only normalized quality telemetry

Best current plan:

```text
Run the desktop PowerPoint oracle on this Windows machine, or a dedicated
Windows validation machine, reachable only through the private Tailscale
operator network.
```

Do not run this as a public synchronous production dependency. Desktop Office
automation is useful as an oracle, but it is brittle and not recommended as a
general server-side Office architecture. Use it asynchronously, in CI/release
gates, and as sampled post-launch quality monitoring.

Proposed flow:

1. Cloud endpoint saves generated artifact.
2. Private validator queue records artifact handle and build/session metadata.
3. Tailscale-only Windows repair-oracle worker pulls the job.
4. Worker downloads artifact from private/signed URL.
5. Worker opens it in desktop PowerPoint under an isolated operator account.
6. Worker detects:
   - repair prompt
   - open failure
   - export failure
   - timeout/hang
   - successful open/export
7. Worker reports normalized result back to private telemetry.
8. Mission Control shows aggregate quality status and urgent failures.

Sampling policy:

- pre-launch: validate every release-candidate artifact and gallery artifact
- early launch: sample a meaningful percentage of generated artifacts
- after stability: reduce sampling or disable the Windows oracle
- always keep static/package validation in the normal save path

Privacy policy:

- do not send arbitrary customer uploads to third-party online validators
  without explicit consent
- do not keep successful decks longer than normal artifact TTL
- failed generated artifacts may be quarantined privately for short TTL
- dashboard shows failure codes and counts by default, not deck contents

Online validator policy:

```text
Third-party validators or Microsoft Graph conversion may be useful secondary
signals, but they are not the canonical repair-prompt oracle. The canonical
oracle is desktop PowerPoint open/export behavior.
```

### A9.3 Pre-Launch AI Synthetic Workload Harness

Early launch quality should be proven before public exposure, not discovered
only from live users.

Add a private synthetic workload harness where AI agents generate and edit many
decks through the same MCP surface that real clients will use.

Target model:

```text
Codex and Claude act as synthetic AI clients.
They execute a large prompt matrix against the Tailscale/private endpoint.
The endpoint runs the exact Docker/runtime image intended for public Cloud Run.
Every generated artifact is validated by static checks and desktop PowerPoint.
```

This is stronger than normal telemetry because it creates pre-launch quality
data under controlled load and controlled coverage.

Runtime parity requirement:

- the Tailscale/private endpoint and Cloud Run candidate must run the same
  container image digest
- the runtime must expose a private build fingerprint for validators
- validators compare:
  - image digest
  - public build marker
  - tool schema hash
  - auth policy hash
  - generator/runtime hash
  - bundled asset/version hash if applicable
- public tools may expose only safe product-level `publicBuild`; private
  validator/admin status may expose deeper hashes

Do not treat a local source checkout as equivalent to the deployed runtime.
Pre-launch tests must hit the same HTTP/MCP surface and runtime image that will
serve real clients.

Prompt coverage matrix:

- create new deck from vague prompt
- create new deck from detailed prompt
- edit uploaded/existing deck
- improve readability and text visibility
- animate existing objects
- use slide 2 Morph where useful
- trigger slide 3+ premium gate
- activate premium and retry
- charts, tables, shapes, images, media
- narration/captions/autoplay
- long text, multilingual text, special characters
- small decks, medium decks, large decks
- image-heavy decks
- invalid/hostile URLs and blocked fetch attempts
- oversize uploads
- repeated/retried mutating calls
- save/download/reopen workflows
- validation failure recovery

Coverage policy:

```text
"Exhaustive" means a tracked combinatorial coverage matrix with explicit
required scenarios, not the impossible claim that every possible prompt has been
tested.
```

Every synthetic run should record:

- prompt category, not raw prompt text unless the prompt is public-safe
- client identity class (`codex-sim`, `claude-sim`, etc.)
- runtime hash set
- tool sequence summary
- artifact size bucket
- slide count
- static validation result
- desktop PowerPoint open/export result
- repair prompt result
- normalized failure code if any

Pre-launch pass criteria:

- zero PowerPoint repair prompts in release-candidate suite
- zero package corruption failures
- zero `[object Object]`, `NaN`, `Infinity`, local-path leaks
- no public-output black-box leaks
- premium gate behavior matches policy
- activation retry path succeeds
- no duplicate artifacts/slides from retried idempotent calls
- download links return valid ZIP bytes
- all gallery artifacts pass the same oracle

Post-launch policy:

- keep the synthetic suite running on every release candidate
- run a smaller daily/weekly regression suite after launch
- keep the Tailscale PowerPoint oracle available during early stability period
- reduce sampling or disable the Windows oracle only after the owner accepts the
  measured repair-free stability window

Mission Control should show:

- current release-candidate suite status
- repair-free rate
- last repair prompt failure
- coverage matrix progress
- runtime hash parity status
- top normalized functional failures
- trend since last build

### A10. Deployment Safety

Private deployment requirements:

- revision starts at 0% traffic
- canary ramp before 100%
- rollback command/runbook exists
- public build marker exposed through black-box status only
- max instances capped before public URL announcement
- concurrency starts conservatively
- raise scaling only after artifact and entitlement multi-instance checks pass

### A11. Dodo And Billing

Dodo details remain private.

Private implementation may include:

- endpoint mapping
- response normalization
- webhook verification
- cache/grace logic
- revocation handling
- test keys
- provider IDs

Public surfaces may say only:

```text
Premium features activate with a BetterPPTX license key. License status is
verified by the billing provider. Do not repeat raw keys in final answers.
```

### A12. Private Validation Harness

Required private validators:

- public black-box verifier
- endpoint status/auth policy verifier
- safe fetch / SSRF verifier
- rate-limit verifier
- upload cap verifier
- freemium gate verifier
- activation verifier with mock and real provider modes
- cross-instance entitlement verifier
- signed download verifier
- package scan for `NaN`, `Infinity`, `[object Object]`, local paths
- PowerPoint open/export validation
- public disclosure scan for generated docs/assets

## Track B - Public AI Adoption

Track B owns adoption and discovery only.

Required public repo content:

- `README.md`
- `AGENTS.md`
- `llms.txt`
- `MCP.md`
- `FOR_AI_AGENTS.md`
- `SECURITY.md`
- `PRIVACY.md`
- `SUPPORT.md`
- `CHANGELOG.md`
- `docs/tools.md`
- `docs/capabilities.md`
- `docs/use-this-github-link.md`
- `docs/when-to-use-betterpptx.md`
- `docs/ai-client-playbook.md`
- `docs/install-request-templates.md`
- `docs/workflows/create-new-deck.md`
- `docs/workflows/edit-existing-deck.md`
- `docs/workflows/animate-deck.md`
- `docs/workflows/narrated-deck.md`
- `docs/workflows/validate-and-save.md`
- `docs/examples/prompts.md`
- `docs/examples/gallery.md`
- `docs/examples/assets/*.png`
- `docs/examples/decks/*.pptx` when public-safe

Required public proof:

1. `animated AI history deck` gallery entry:
   - prompt
   - public workflow/tool sequence
   - screenshots
   - public-safe `.pptx`
   - validation notes
   - PowerPoint open-without-repair note when verified
2. `before/after existing-deck edit` gallery entry as the next proof asset.

Required public identity:

- final product name
- final domain
- final hosted MCP URL under that domain
- final GitHub public docs repo
- final website `llms.txt`
- final registry listing text

Track B must not publish until disclosure scan passes.

## Mission Control Dashboard

`ops/betterpptx-mission-control.html` is private only.

Purpose:

- owner decision queue
- AI-team task dispatch concept
- Track A launch gates
- security/reliability/adoption/cost telemetry
- kill switch visibility
- rollout readiness

Current status:

```text
mock UI, not connected to live controls
```

Reachability decision:

```text
Mission Control must not be public. It should be reachable only through a
private operator network, preferably Tailscale with ACL/group membership for
BetterPPTX operators.
```

Do not expose Mission Control through:

- the public BetterPPTX product domain
- the public MCP connector URL
- a public Cloud Run/hosting URL
- Tailscale Funnel or any equivalent public internet sharing mode
- unauthenticated static hosting

Preferred access model:

- private admin hostname on the operator network
- Tailscale ACL/group restricts access to approved operators only
- HTTPS if served over the private network
- separate admin service or admin route, isolated from public MCP routes
- no public DNS or public registry/documentation reference

Wiring stage:

```text
Stage MC0: local mock dashboard, current state.
Stage MC1: private read-only dashboard wired to privacy-safe telemetry.
Stage MC2: private admin dashboard with authenticated, audited controls.
```

Billing-critical owner secrets are in scope for MC2 before live launch. Any
user-dependent value that affects payments, licensing, Dodo webhooks, payout
routing, or launch control must be visible and customizable by the owner in
Mission Control. Default views should show redacted status, fingerprint, active
Secret Manager version, last rotation time, and dependent services. Explicit
owner-only controls must support reveal, update, rotate, and test. Raw values
must never appear in public endpoints, telemetry, normal logs, or Firestore
business records.

MC1 should be completed after Track A telemetry exists and before announcing the
public connector URL. MC2 is optional for launch; if kill switch or dispatch
controls are wired, they must be server-side, authenticated, audited, and
restricted to the private operator network.

Rules before real wiring:

- admin-only access
- no public hosting
- Tailscale/private-operator-network access only
- server-side authenticated actions
- audited kill switch
- telemetry-only read paths by default
- no raw logs, raw keys, deck text, prompts, local paths, or PII
- clear mock/live state indicator
- no client-side-only control for production operations

Dashboard corrections required:

- replace `env production` with `env mock/private`
- replace `SEAM` labels with `source`
- show a visible mock-data banner
- avoid simulated events that contradict gate state
- label dispatch as mock until connected to a real task system

## Global Launch Gates

Before announcing public connector URL:

```text
[ ] exposed secrets rotated or confirmed absent
[ ] public residue sweep completed
[ ] SSRF safe fetch live and verified
[ ] rate limits live and verified
[ ] upload/zip/image caps live and verified
[ ] per-call timeout and concurrency guard live
[ ] kill switch live and tested
[ ] black-box output contract verified
[ ] no source/paths/process/dependency/provider details in public outputs
[ ] MC1 private read-only Mission Control reachable only through operator network
[ ] repair-oracle path validates every release-candidate/gallery artifact
[ ] Tailscale/private endpoint image hash matches Cloud Run candidate image hash
[ ] Codex/Claude synthetic workload suite passes required pre-launch coverage
[ ] release-candidate suite has zero PowerPoint repair prompts
[ ] public docs are docs-only and disclosure-scanned
```

Before raising max instances above one:

```text
[ ] artifact store supports cross-instance download
[ ] entitlement store supports cross-instance activation
[ ] no raw keys stored
[ ] idempotency backs retry_safe for mutating tools
[ ] telemetry emits privacy-safe metrics
[ ] functional quality telemetry captures repair/open/export failures
[ ] dashboard reads telemetry privately through Tailscale/operator-network access
[ ] desktop PowerPoint repair oracle is sampled or explicitly disabled by owner
[ ] synthetic regression suite remains available for every release candidate
[ ] canary and rollback process tested
```

Before public repo publication:

```text
[ ] Track B docs contain no implementation/deployment/billing internals
[ ] public `docs/tools.md` documents schemas only
[ ] public gallery assets are metadata-scanned
[ ] sample decks are public-safe
[ ] sample decks pass desktop PowerPoint open-without-repair oracle
[ ] canonical identity/domain/MCP URL are final
[ ] public repo says guidance only, not source
[ ] AGENTS.md says use hosted MCP, do not reimplement
```

Before registry submission:

```text
[ ] public repo approved
[ ] website approved
[ ] website llms.txt live
[ ] connector URL under canonical domain
[ ] gallery proof available
[ ] registry copy reviewed for disclosure
```

## Ultimate Definition Of Done

Rollout is ready when all are true:

1. Track A endpoint is hardened against SSRF, abuse, cost runaway, cross-instance
   artifact failure, cross-instance entitlement failure, and public-output leaks.
2. Track A validation harness proves the security/reliability gates.
3. Functional quality telemetry captures repair/open/export failures.
4. Release-candidate and gallery artifacts pass the desktop PowerPoint
   open-without-repair oracle.
5. Codex/Claude synthetic workload suite passes the required pre-launch coverage
   matrix against the same runtime image intended for public deployment.
6. Runtime hash parity proves the private Tailscale endpoint and Cloud Run
   candidate are equivalent for the tested release.
7. Track B public docs expose capability clearly without implementation detail.
8. Track B public proof assets demonstrate validated native `.pptx` output.
9. Mission Control is private, clearly marked, and reads only privacy-safe
   operational data unless authenticated admin actions are intentionally wired.
10. The user approves the final public repo, website, and registry copy before
   anything is pushed, deployed publicly, or submitted.

## Immediate Next Executor Tasks

1. Patch `ops/betterpptx-mission-control.html` mock/private labels.
2. Update the executor alignment plan to point to this ultimate plan.
3. Draft Track A implementation tickets from sections A1-A12.
4. Draft Track B public repo tickets from the public adoption plan.
5. Draft the synthetic workload coverage matrix and hash-parity verifier.
6. Do no public push, npm publish, registry submission, or public URL
   announcement until the launch gates pass.
