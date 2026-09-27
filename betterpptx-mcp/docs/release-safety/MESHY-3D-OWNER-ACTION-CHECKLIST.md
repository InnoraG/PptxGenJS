# Meshy native 3D presenter — owner action checklist

Status: **READY FOR OWNER ACTION · no live request or deployment made**

This checklist covers only the native 3D model presenter. It excludes narration video, talking-head avatars, LivePortrait, MuseTalk, MP4, and lip-sync.

## Non-negotiable runtime contract

- Meshy owns the visible body, face, hair, clothing, UVs, materials, textures, and generated geometry.
- The frozen Mixamo-compatible library owns the 65-joint runtime skeleton and 18 semantic animation clips.
- Joe or Louise is selected only when the user does not provide or does not want to provide personal images.
- `betterxavatar1` and `betterxavatar2` are the required target profiles. The legacy `betterxavatar`/`betterpptx` pair must not be silently substituted.
- Every live action is one bounded attempt. No automatic retry, cross-profile retry, or approval inference is allowed.

## 1. Confirm the local handoff is ready

Run these no-network checks from `D:\PptxGenJS_Claude`:

```powershell
node betterpptx-mcp/verify-meshy-presenter-owner-preflight.mjs
node betterpptx-mcp/verify-meshy-owner-decision-worksheet.mjs
node betterpptx-mcp/verify-meshy-presenter-goal-audit.mjs
# Optional exact-sample local regression; never contacts Meshy or Modal:
node betterpptx-mcp/verify-meshy-supplied-sample-acceptance.mjs
```

Expected local state:

- owner preflight: `READY_FOR_OWNER_ACTION` and `networkAttempted: false` with 11/11 local checks;
- worksheet: `OWNER_DECISIONS_OPEN` until the owner completes it;
- goal audit: `INCOMPLETE_OWNER_GATES` and `completionClaimAllowed: false`.
- supplied-sample regression: `PASS`, with Meshy source → frozen Mixamo hybrid → PowerPoint repair/open → native export → native motion evidence; no network and no automatic retry.

## 2. Complete the seven owner decisions

Edit only [`MESHY-3D-OWNER-DECISION-WORKSHEET.json`](MESHY-3D-OWNER-DECISION-WORKSHEET.json) after reviewing the linked evidence. Keep every decision `OPEN` unless the owner has a durable evidence reference.

1. Meshy account plan and commercial terms.
2. External image processing, likeness-generation, tenant scope, retention/deletion, and no-training consent.
3. Mixamo/Adobe distribution rights for the frozen 65-joint/18-clip library.
4. Joe/Louise fallback GLB and poster distribution rights.
5. A new owner-approved 1–4 image input set of the same subject from different angles. Do not reuse the local research-only human-image set.
6. One paid live Meshy canary.
7. Live `betterxavatar1`/`betterxavatar2` immutable revision, health, promotion, and rollback evidence.

The worksheet must contain no credentials, raw images, image bytes, or personal data. Run the worksheet verifier again; only `OWNER_DECISIONS_CLEARED` unlocks live execution.

## 3. Configure the account through the owner-controlled path

Use private Mission Control to add/test/rotate the Meshy credential binding. The raw value must never be written to this repository, worksheet, report, telemetry, public tool result, or normal log. The local contract is recorded in `meshy-owner-control-20260718.json`.

## 4. Deploy the requested private profiles once

After the worksheet reports `OWNER_DECISIONS_CLEARED`, the owner may invoke the guarded target deployment runner. It is dry-run by default and requires both explicit confirmation signals; it stops on the first failure and never retries automatically. Deploy the same pinned worker revision under both requested profiles, then capture real health/revision/image digests before changing any provider route.

Do not update the credential-store route until both targets have bounded health evidence and the rollback record exists.

## 5. Run exactly one live canary and downstream acceptance

Use only the new owner-approved inputs and the existing bounded runbook [`MESHY-3D-COLD-CANARY.md`](MESHY-3D-COLD-CANARY.md). The canary must produce a hybrid GLB, poster, hash-only report, and downstream GLB → PPTX → repair/open → native export → motion evidence. A failure is diagnosed and stopped; it is not repeated across profiles.

## 6. Close the goal only after the final audit

Run the release gate and goal audit again. Completion requires:

- the live Meshy request, target-profile deployment, health, revision, rollback, billing, and downstream proof to be real rather than mocked;
- all seven worksheet decisions cleared with evidence;
- `completionClaimAllowed: true`;
- no unresolved red/amber acceptance item in the visual tracker.

Until then, keep the goal active and report the exact remaining owner gates.
