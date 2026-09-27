# Independent reviewer handoff — superseded historical artifact

> Current policy (2026-07-26): this handoff is retained for historical compatibility only. The final talking-head lane uses the authorized project owner's one-time LP/MT quality acceptance. Use `betterpptx-mcp/outputs/visualizations/avatar-owner-closure-form.html` and the current `avatar-lpmt-identity-review.html` packet; no separate reviewer is required. The gate remains fail-closed until the owner records an explicit PASS or FAIL.

Status: **awaiting two independent human exports**  
Scope: private research calibration only; no launch or production approval.

For the PowerPoint-native avatar packet, the local visual review page is
`thread-visualization/avatar-identity-quality-review.html`. It now has a
download button that emits `avatar-identity-quality-review-decision.json`.
The maintainer validates that file with:

```powershell
$env:BETTERPPTX_AVATAR_IDENTITY_REVIEW_FILE = 'D:\path\avatar-identity-quality-review-decision.json'
node D:\PptxGenJS_Claude\betterpptx-mcp\verify-avatar-identity-review-decision.mjs
```

Without that external file the validator returns `OPEN_REVIEWER_FILE_REQUIRED`
and keeps the release fail-closed; automation never infers PASS.

## What reviewers must do

1. Open `betterpptx-mcp/outputs/photorealistic-pairwise-review.html` locally.
2. Reviewer 1 and Reviewer 2 work independently. They must not compare answers or inspect model,
   provider, account, prompt, or source metadata.
3. For each of the four blinded comparisons, choose only one answer:

   - `Candidate A`: the left visual is the better contextual/design fit.
   - `Candidate B`: the right visual is the better contextual/design fit.
   - `No clear winner`: neither is clearly better.

4. Do not rate identity, attractiveness, sensitive traits or real-person likeness. Leave no field blank.
5. Use the appropriate export button. The form emits:

   - `photorealistic-pairwise-review-1.json`
   - `photorealistic-pairwise-review-2.json`

   Each export contains schema `betterpptx.pairwise-review-labels.v1`, its reviewer slot, the frozen packet
   digest and exactly four choices. Candidate identity is hidden while reviewing; the maintainer-only packet
   maps the choices back to create-versus-edit lanes.

## Owner/maintainer verification

Place both files anywhere local and run:

```powershell
$env:BETTERPPTX_PAIRWISE_REVIEWER_ONE = 'D:\path\photorealistic-pairwise-review-1.json'
$env:BETTERPPTX_PAIRWISE_REVIEWER_TWO = 'D:\path\photorealistic-pairwise-review-2.json'
node D:\PptxGenJS_Claude\betterpptx-mcp\verify-photorealistic-pairwise-review.mjs
```

The verifier rejects wrong packet digests, unknown or duplicate IDs, incomplete coverage, invalid choices
and weak agreement. The current acceptance threshold is categorical Cohen's kappa ≥ 0.65 across the
four comparisons.

The former 1–5 rubric form remains in the repository as a legacy research instrument; it is no longer
the primary completion-audit input.

## What this does not authorize

Passing human-human agreement only makes the calibration intake valid. It does not itself enable semantic
auto-accept. The private judge still requires judge-versus-human calibration, deterministic hard gates and
the separate exact-runtime/legal/owner review. No customer image is used, no training occurs and no
external Claude/GPT-style API is called.

The judge-calibration stage now uses the same pairwise vocabulary (`left`, `right`, `tie`) rather than the
legacy 1–5 rubric. It requires at least 20 complete judge/human pairwise records and categorical kappa ≥
0.75; this is a maintainer-side record import, not another reviewer form.
