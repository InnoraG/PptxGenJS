# Commercial talking-head production promotion

Date: 2026-07-22

## Decision

The owner has cleared the commercial evaluation master for production use. The
final three-minute proof of concept passed end to end:

- upstream LivePortrait with low pose-only motion;
- upstream MuseTalk 1.5 jaw parsing with `bbox_shift=0`;
- 180-second H.264/AAC output;
- validated native PowerPoint media package, poster relationship, autoplay,
  and 180-second slide timing.

Here “native talking head” means an embedded MP4 represented by PowerPoint's
native video/media XML and playback timeline. It is not PowerPoint's literal
Cameo object: Cameo is a live-camera placeholder and cannot host a prerecorded
avatar MP4. The square acceptance artifact is the Cameo-style product layout:
a 216pt × 216pt native video frame with autoplay and 180-second timing.

Evidence: `outputs/commercial-poc/final-commercial-avatar-3min-report.json`.

The immutable artifact hashes and the current routing/gate state are recorded
in `AVATAR-COMMERCIAL-PROMOTION-PREFLIGHT-2026-07-22.json`.

## Current serving boundary

The existing rotating HTTP accounts (`telcomgapp` and `fluxworkerai`) still
point to the resale-safe worker revision. A dedicated authenticated commercial
HTTP endpoint is now implemented in
`deploy/avatar-worker/modal_avatar_commercial_eval.py` under the production
candidate app name, but it is not yet deployed or inserted into the credential
store. It must not be aliased to the resale-safe endpoint.

## Promotion steps

1. Deploy the implemented dedicated commercial Modal HTTP worker from the
   pinned LivePortrait and MuseTalk revisions used by the final POC.
2. Add owner-controlled bearer authentication and a private `/healthz` probe.
3. Deploy one candidate per approved Modal profile, then run authenticated
   200/MP4, rotation, idempotency, billing, and 180-second playback canaries.
4. Generate a fresh immutable SBOM/provenance packet and attach the written
   commercial clearance to the license ledger.
5. Only after both candidates pass, update the two credential-store accounts
   and roll the MCP serving revision; keep the resale-safe endpoints as the
   rollback lane.

BiSeNet retraining was explicitly stopped. No EasyPortrait dataset or trained
checkpoint is part of this promotion.

## Current verification

- PowerPoint COM open check: PASS.
- Avatar package validator: PASS; one MP4 media part, poster relationship,
  autoplay, and `advTm=180000`.
- Commercial HTTP worker implementation: PASS in source; authenticated
  multipart endpoint, upstream InsightFace + BiSeNet lane, and metrology headers
  are present in the production-candidate Modal app.
- No commercial Modal serving app is currently deployed.
- Credential-store routing was intentionally left unchanged; both current
  accounts remain the resale-safe rollback lane (`e3b56934`).
- The supplied Recording Studio reference was inspected. The avatar proof now
  carries the same `p15:isNarration=1` recorded-video marker, `showNarration`,
  `useTimings`, square frame, autoplay, and slide timing. Ink capture is not
  part of the avatar pipeline.
- The engine path was triple-checked and corrected: `slide.add_avatar_narration`
  now marks combined video+audio avatar media as native narration; the
  `mutedVideoPlusNativeAudio` mode keeps the narration marker on its separate
  audio object. The engine-generated square deck passed package and COM checks.
