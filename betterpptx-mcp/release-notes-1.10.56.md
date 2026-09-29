# BetterPPTX 1.10.56 — queued authoring authority

## Public-client regression

The existing ChatGPT Chat-mode acceptance conversation in Chrome Person 1
confirmed release 1.10.55, schema 2026-09-29.1, and corrected callable delivery
contracts (`link | resource | chunk`, default `link`, original 12-hour expiry).
The original recovered compilation and a fresh authorized replacement both
terminally failed with `MCP_AUTHORING_PIPELINE_REQUIRED`. No deck or saved
artifact was produced, and allowance remained used 0 / reserved 0 / remaining 3.
These are bounded observed failures, not a general compiler certification.

## Fix

- Restore module-private authoring authority only inside the private worker
  when it resumes the server-owned persisted operation. JSON persistence cannot
  retain the original Symbol capability. Public argument flags remain unable to
  grant authority; owner, quotation, asset, revision, and validation gates still run.
- Reject inconsistent ownership between the stored operation and its request
  before obtaining an execution lease.
- Make the admission error describe the authorized public workflow without
  exposing private execution details or requiring Director authorship.
- Keep tool schema 2026-09-29.1: no tool definitions or public input fields changed.
  Package and responding build identity advance to 1.10.56.
- Add the real admission → JSON persistence → queued worker regression to the
  release workflow, including unchanged issued binding, missing/tampered quotes,
  owner isolation, identical replay, and rejected direct-call flags.

## Preserved delivery behavior and evidence boundaries

Small files remain eligible for resource delivery. Oversized resource requests
return a browser link before file bytes enter a model-visible result. The 256 KiB
chat-resource threshold is a conservative BetterPPTX policy, not an independently
measured universal ChatGPT limit. Link retrieval and identical save replay do not
extend the original 12-hour artifact window or create another publication.

Local conformance, release CI, deployed discovery, actual ChatGPT execution, and
independent downloaded-byte verification must be reported separately. This note
does not assert that the repaired public workflow has delivered a file, that a
12-hour interval has elapsed, or that PowerPoint appearance/playback was inspected.
