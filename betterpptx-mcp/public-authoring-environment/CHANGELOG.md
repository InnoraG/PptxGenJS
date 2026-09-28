# Changelog

## Unreleased

- `1.10.54+2026-09-28.2`: new published files and browser links default to the same 12-hour expiry. Recovery and identical retries cannot extend the recorded file lifetime. Both storage backends have signing/ownership and exact-expiry boundary tests; public descriptions now state the bounded delivery window. Supported validation declarations no longer receive a misleading uncompiled-field repair notice. Release verification is reported separately from local tests.
- `1.10.33+2026-09-25.6`: removed the obsolete post-slide-two free-plan gradient/shadow downgrade from native composition. A 12-slide plan-parity test and a three-process premium-create/free-recovery regression verify native shadow survival. A ChatGPT Chat-mode audit after PM2 restart of the same 15-slide draft passed: 88/88 animation effects, 2/2 native shadows, 45/45 narration carriers, zero unexplained carriers and no selected-effect failures. The draft remains unsaved; PowerPoint appearance/playback and a second restart were not independently verified.
- `1.10.32+2026-09-25.5`: read-only source export no longer overwrites the durable recompilation source. A local three-process create/export/restart/revise/restart test retains the exact native shadow carrier; live ChatGPT restart verification of the new R4 draft is pending.
- `1.10.31+2026-09-25.4`: native audit expectations now include authored narration cues, matching 88 expected and serialized animation effects on the R4 draft. A restart check exposed an independent shadow persistence regression, so that build did not qualify R4 for delivery.
- `1.10.30+2026-09-25.3`: narration audio-segment carriers are attributed to their exact source declarations, with missing-carrier checks. Selected shadow failures identify exact author IDs and XML effect absence. The browser client confirmed a newly compiled R4 draft had 45/45 media carriers, both native shadows, and a passing package audit before restart.
- `1.10.29+2026-09-25.2`: corrected native-carrier reconciliation for decks with ten or more slides by using numeric slide-part order; animation expectations now compare with serialized effect owners rather than timing-tree containers. Unexplained carriers or deficits fail the native audit. A 15-slide, 19-effect regression and a removed-effect negative case pass locally; live connector revalidation remains a separate gate.
- `1.10.23+2026-09-24.5`: owner-authorized local artifacts now return ten-minute browser download links. Bare file URLs still require OAuth and ownership; expired links can be refreshed via the saved `operationId` without another deck publication or charge. Local ownership/HTTP tests and one live recovery-download hash check passed; a new-save live download under this build remains untested to avoid consuming another free slot.
- `1.10.22+2026-09-24.4`: narration exclusions now remove narration-specific controls from mixed picture/media discovery without hiding ordinary picture controls; reproduced from a fresh ChatGPT Chat-mode read-only test.
- `1.10.21+2026-09-24.3`: task-aware discovery now surfaces native gradient/shadow composition and story-beat transitions alongside picture treatment and layered motion. Added two exact-authoring lessons with public dry-run fixtures; suggestions remain optional and do not select a design or infer playback qualification.
- Prepared `1.10.19+2026-09-23.2` public-metadata correction after a Chrome
  Chat-mode dry run triggered a Suspicious Instruction warning. The authoring
  action now states its purpose and phase effects without directing the host's
  workflow or risk policy; server-side validation and authorization are unchanged.
- Prepared `1.10.18+2026-09-23.1` discovery update: original editable premium
  briefs remain new-deck authoring requests, excluded identity media does not
  suppress ordinary image storytelling, and optional contrasting lessons now
  resolve through the public catalog without prescribing a design.
- Reduced public startup guidance from 5,367 to 1,292 UTF-8 bytes, retaining
  AI-owned exact geometry, native-first output, authorization boundaries, and
  the discovery-to-delivery path. The measured compact premium help response
  is 15,519 bytes with a 2,437-token heuristic estimate, not host-token proof.
- Updated stale boundary fixtures to exercise opaque assets with AI-authored
  exact frames rather than deactivated engine-owned placement. Local HTTP and
  schema tests pass; public connector and fresh-client verification remain
  pending while the named Funnel lacks a public DNS record.
- Preserved explicit click-only advancement for measured segmented narration.
  `autoplay.enabled:false` or `showSettings.useTimings:false` now retains native
  audio/cue playback without injecting automatic slide transitions, and selected
  per-slide clips are checked against their own manifest records.
- Added first-class per-slide binding for one multi-slide measured narration
  preparation. Each slide can select exact prepared clips with
  `preparedNarration.segmentIds` or `preparedNarration.slideId`; dry-run timing,
  quotation, dependency locking, and final execution now use only those clips.
  Narration carriers remain nonvisual and do not require authored visual frames.
- Added deterministic PCM post-processing for synthesized narration: provider
  output is peak-normalized, de-clicked per channel, and edge-faded before the
  unchanged crackle/clipping gate. The repaired bytes and before/after evidence
  are used for the durable narration asset rather than merely suppressing the
  finding.
- Added three secured, replay-safe measured narration preparations per rolling
  30-day window. This sponsored allowance is accounted independently from the
  three downloadable presentation slots and from consented identity-media
  generation; read-only estimates expose zero customer charge without hiding
  the absorbed operational cost.
- Corrected free OAuth account readback so the top-level authentication state
  agrees with the verified identity-assurance state.
- Accepted the standards-valid singleton-array JWT `aud` form emitted by the
  self-hosted OAuth authority while retaining exact one-resource binding;
  empty, different, and multi-resource audiences still fail closed. Added
  bounded rejection diagnostics that expose only claim shape and policy-match
  booleans to private server logs, never tokens, subjects, or claim values.
- Added the access-token subject mapper required for stable account ownership,
  pinned Keycloak `azp` to ChatGPT's official CIMD client identifier, and
  aligned the advertised OIDC/UserInfo scope without broadening BetterPPTX
  resource permissions.
- Replaced Keycloak's generic `Passkey (Default Label)` with
  `Passkey BetterPPTX` for future WebAuthn registration, and migrated only
  credentials that still had an untouched generic default label.
- Added one-field self-hosted beta enrollment: a new user chooses only a
  BetterPPTX username and must immediately create a user-verifying discoverable
  passkey. Password registration/reset, external identity providers and public
  client registration remain disabled; ChatGPT still authenticates at token
  exchange with signed CIMD.
- Added a minimal ChatGPT connection path: entering only the canonical BetterPPTX
  MCP URL now discovers the self-hosted authorization server, signed CIMD client,
  S256 PKCE policy and `betterpptx` scope without manual OAuth fields. Dynamic
  registration remains closed and protected calls still require a verified account.
- Canonicalized the OAuth resource/audience to the named server origin while
  retaining `/mcp` as the transport endpoint, and aligned every supported RFC 8414,
  OIDC and protected-resource discovery alias to one contract.
- Completed the self-hosted OAuth discovery document with OIDC scopes and
  endpoints, and added standards-compatible discovery aliases for supported
  clients that probe either RFC 8414 or OIDC well-known locations. The
  canonical issuer, CIMD client identity and S256 PKCE policy are unchanged.
- Added first-class `animated-table` authoring: an explicit editable grouped-shape
  carrier with stable row/cell identities, row/column/cell reveal timing,
  reduced-motion-safe static structure, and nested Synergy presenter targets.
  The public readback never misreports this composite as a native PowerPoint
  table, and merged cells fail closed in v1.
- Added interaction `startMs` so presenter contact can be intentionally sequenced
  after table reveals, with the actor timeline extended through measured contact.
- Corrected grouped-table coordinate serialization and first-`withPrevious`
  slide-start timing; both the table-only and presenter-combined fixtures now
  open without repair and carry hash-bound native PowerPoint playback evidence.
- Added an unranked, manifest-bound capability atlas that routes communication
  needs to exact live public selectors and opaque handles.
- Added a communication-problem casebook index with six planned evidence lanes
  and no fabricated accepted cases.
- Added a sanitized machine-readable developer-to-public teaching-gap ledger,
  its schema and empty template, plus deterministic manifest fingerprints and
  focused safety tests.
- Rebuilt the repository as a generated cold-AI authoring environment.
- Made semantic JSON-spec authoring the only taught creation and revision path.
- Defined first-time-right at the first public `deck.save`, after iterative
  pre-save validation and full-slide review.
- Added progressive BetterPPTX skill references for catalog choice, new
  authoring, revision preservation, motion and narration, and review/release.
- Added focused native Picture Format teaching: presets are convenience
  selectors rather than capability ceilings; clients discover and bind exact
  correction, colour, transparency, Artistic Effect, and expanded-option
  parameters from the live public catalog and report truthful decomposition
  gaps back into the builder loop.
- Added information-isolated author, developer, critic, and curriculum roles.
- Added deterministic file manifests, doctrine checks, and cold-client forward
  test guidance.
- Replaced heavyweight first-call guidance with compact progressive help and
  focused unranked discovery.
- Bound complete PowerPoint preview batches and the one certifying save attempt
  to one exact `packageSha256`; same-key transport recovery is explicitly
  non-certifying.
# 2026-09-20 — AI capability augmentation

- Added a canonical individual-control registry derived from the executable public baseline catalog.
- Added ordinary-language capability interpretation with explicit exclusion handling and direct control/lesson lookup.
- Added executable lessons for dimensional typography, picture treatment, layered motion, custom process construction, chart emphasis, connected identity, and restrained flat design.
- Added exact original AI-authored geometry to the public deck schema alongside semantic placement and observed-reference reconstruction.
- Added a portable capability-use plan, required-feature blocking, actual-use readback, and non-mutating opportunity guidance.
- Added a versioned visual learning gallery with exact source specifications, native PPTX artifacts, PowerPoint-rendered thumbnails, hashes, evidence, and MCP text/image resources.
- Compact first discovery now targets roughly 2,500 proxy tokens while preserving the complete family index and critical boundaries.
- Fixed native WordArt/Text3D representation readback so dedicated kinds no longer fail as generic text.
- Added PCM narration quality validation for clipping, crackle-like discontinuities, DC offset, silence, and unsupported formats.
# 1.8.0+2026-09-21.3

- Closed the quote issuer/client/server loop: complete issued bindings validate unchanged in a mutation-free generation preflight, while protected-field changes fail before artifact creation.
- Added one canonical workflow-stage entitlement matrix across auth and billing; free preview now explicitly means drafting and inspection, not promised downloadable delivery.
- Added quote cost-input reconciliation for authored objects, transitions, deterministic accessibility support carriers, and projected save bytes.
- Current source now retains ordinary authored shape identity and editable timelines; native audits classify transparent title placeholders as non-visible accessibility support excluded from content pricing.
- Added slide-scoped author/native identity maps and direct repeated-name motion resolution.
- Removed presenter placement fallback: sovereign and assisted presenters require exact AI-authored slide-inch geometry or AI-observed reference pixels.
- Removed unrelated `fit:shrink` advice from generic and angle-normalization findings.

# 1.7.0+2026-09-21.2

- Deactivated engine-owned `semantic-layout-only` placement for sovereign and Director-assisted authoring.
- Required AI-authored exact frames or AI-observed visual-reference pixels for every public composition.
- Added fail-closed contract and post-compile checks for engine-placed objects.
- Updated presenter-performance staging, recipes, schemas, discovery, and readback to retain AI geometry authority.
# 1.10.38+2026-09-26.1

- Added bounded owner-scoped complete-file MCP retrieval for previously saved presentations up to 20 MiB. The server checks the publication size before loading, verifies final SHA-256, and keeps Base64 out of model-visible text and structured data. ChatGPT attachment materialization for the larger file remains a separate public-client gate; no new publication is required to test a retained artifact.
# 1.10.39+2026-09-26.2

- Raised the complete-file MCP resource boundary from 20 MiB to 25 MiB after the real-client save estimate for the narrated 15-slide regression returned 21.4 MB. This changes only owner-scoped retrieval; it does not create a publication or imply ChatGPT accepts the resulting resource.
# 1.10.40+2026-09-26.3

- Owner-scoped save replays now recover and return the original durable operation ID, so direct file retrieval remains possible when an MCP host retries after a materialization approval. Fresh saves expose the same operation ID in their public result and recent-operation record; no extra publication is required.
# 1.10.41+2026-09-26.4

- A completed save can now replay from its owner-bound durable record before current-version validation, including after server restart. Exact arguments are required; changed requests still conflict. This restores the original operation ID without creating another publication.
