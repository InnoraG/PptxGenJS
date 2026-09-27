# Avatar worker paired-rotation owner runbook

Status: **executed and reverified for staging; repeatable owner runbook** (2026-07-18)

This runbook rotates the two private LivePortrait + MuseTalk worker pairs without
printing or committing secret values. It is an owner-only procedure. The current
read-only preflight is:

```powershell
node betterpptx-mcp\verify-avatar-rotation-preflight.mjs
```

It must pass before any mutation. The expected accounts are `telcomgapp` and
`fluxworkerai`; the current preflight confirms both are configured and distinct.

## Owner prerequisites

- Owner/admin access to both product accounts: `telcomgapp` and `fluxworkerai`.
  The authenticated local Modal profile names are `telcomgapp` and
  `betterpptx-fluxworkerai` respectively.
- Owner/admin access to the Google Cloud project containing the private MCP service.
- The target service is `betterpptx-mcp-staging` in `us-central1` unless the owner
  explicitly changes the deployment target.
- The Modal worker source is deployed with stable non-secret billing tags for product,
  service, pipeline, and product account. These are app/hour metadata, not request IDs.
- Before production promotion, choose and record the owner-approved daily GPU-second
  budget for each worker pool. The reviewed template uses Firestore quota state and
  fails closed when `BETTERPPTX_AVATAR_WORKER_DAILY_GPU_SECONDS` is absent or zero.
  The owner may explicitly choose `unlimited` for an unbounded-metered production
  mode; this removes the hard daily rejection but keeps every reservation and
  settlement in Firestore for cost and abuse visibility.
  the estimate (`BETTERPPTX_AVATAR_WORKER_ESTIMATED_GPU_SECONDS=120`) is only a
  reservation guard and actual worker GPU seconds settle the ledger.
- Do not paste a token into chat, commit it, put it in a command line argument, or
  print it in CI logs.
- The reviewed Cloud Run overlay accepts `--daily-gpu-seconds <positive-budget>`
  only when the owner has recorded that budget; omitting the flag intentionally
  leaves production rendering fail-closed. Validate the overlay input contract
  without network or deployment traffic:

  ```powershell
  node betterpptx-mcp\verify-avatar-quota-overlay-input.mjs
  ```

## Rotation order

1. Retain the currently active worker secret/version for rollback.
2. Generate a new random worker token in an owner-controlled ephemeral environment.
3. Update the Modal worker secret for each approved profile, without printing the value.
4. Update the owner-managed Google Secret Manager bundle
   `betterpptx-avatar-worker-credentials` with the two matching client entries.
5. Redeploy both Modal worker apps with the rotated secret and the account tag so
   existing containers cannot retain the superseded credential.
6. Deploy the reviewed Cloud Run template with the avatar provider, media tools,
   Firestore job/state/quota stores, GCS artifact store, shared-store enforcement,
   and the owner-approved finite budget or explicit `unlimited` mode.

Production rotation remains enabled so a healthy alternate authenticated
provider profile can take over if the active profile is unavailable. It is an
availability/redundancy control and is tracked by health, credential version,
and per-profile metrology. Development-only credit rotation is separate: keep
each authenticated development profile at or above the $15 floor, but never
interpret that floor as a customer budget or production spend limit.
   The deployment overlay must be invoked with the recorded positive budget;
   otherwise it deliberately omits the value and remains fail-closed.
7. Verify the active revision before traffic is considered valid:

   ```powershell
   node betterpptx-mcp\verify-avatar-deployed-revision.mjs
   ```

   This must show all runtime settings, the secret-backed credential-store mount,
   the worker-credential volume, an immutable image digest, and 100% traffic on the
   audited revision.

8. Run authenticated health checks and one short canary against **each** worker,
   then run the full private MCP canary:

   ```powershell
   node betterpptx-mcp\verify-avatar-runtime.mjs --check-worker-health
   node betterpptx-mcp\verify-private-avatar-worker-canary.mjs
   node betterpptx-mcp\verify-private-avatar-mcp-canary.mjs
   ```

   The final canary must complete `render_job -> status -> attach_result -> validate -> save`,
   embed valid MP4 media, and open in PowerPoint without repair.

9. Only after both worker canaries and the MCP/PPTX canary pass, revoke the prior
   worker secret versions. Keep the new version and the deployment/image rollback
   identifiers in the private owner audit record.
10. Re-run the aggregate and retain the redacted reports:

   ```powershell
   node betterpptx-mcp\verify-avatar-production-readiness.mjs
   ```

The quota ledger can be checked without network/provider traffic before any deploy:

```powershell
node betterpptx-mcp\verify-avatar-worker-quota.mjs
node betterpptx-mcp\verify-avatar-worker-quota-integration.mjs
```

## Abort and rollback

Abort if any health check, revision setting, canary, package validation, or PowerPoint
open check fails. Restore the previous credential bundle and worker secret/version,
then repeat the authenticated canary before reattempting deployment. Never revoke the
old version before the new pair is proven end-to-end.

## Evidence boundary

This procedure proves credential continuity and deployment wiring; it does not grant
commercial model rights. Public model-backed rendering remains fail-closed until the
separate license ledger is approved and `BETTERPPTX_AVATAR_LICENSE_APPROVED=1` is set
through the owner-controlled production configuration.
