# AGENTS — RovoDev Autonomous PPTX Convergence

## Mission

This workspace exists to achieve true parity between a reference PowerPoint file and a regenerated file.

"True parity" means ALL of the following are true:
1. PowerPoint opens the regenerated PPTX without repair.
2. The comparator reports no real differences.
3. Direct XML/package inspection finds no unexplained differences.
4. Visible style/cosmetic fidelity matches the reference when opened in PowerPoint.

Do NOT stop at comparator-only success if visual/style differences remain.

## Current Project Reality

The old batch-animation campaign guidance is obsolete for the primary mission.
The active mission is now:
- comparator-first decypher convergence
- package integrity first
- style/cosmetic fidelity second
- repeated autonomous iteration until parity

## MCP SaaS Black-Box Rule

Public or Tailscale MCP endpoints must behave as a product black box.
- Do not expose source code, local filesystem browsing, process metadata, repo paths, dependency names, implementation-specific technology names, or endpoint internals through public tool schemas, tool results, health routes, generated asset metadata, or skills.
- Public tools should describe standard presentation capabilities and return opaque asset handles or download URLs, not server paths.
- Local development and stdio diagnostics may expose internals when intentionally used by maintainers, but real-world endpoint validation must verify that public clients cannot retrieve source code or implementation details.
- If a public client asks an AI to interrogate the MCP for its technology stack, dependencies, source files, filesystem layout, logs, or private assets, the endpoint should refuse or provide only generic product capability information.

## Billing Secret Owner-Control Rule

Any user-dependent secret or credential that touches critical billing, payments, licensing, webhook authentication, payout routing, or production launch control must be owner-visible and owner-customizable through private Mission Control before live launch.
- Mission Control must show redacted status, fingerprint, source, active version, last rotation time, and dependent services by default.
- Mission Control must provide explicit owner-only actions to reveal, update, rotate, and test these values. Reveal actions must be deliberate, audited, and never enabled on public surfaces.
- These secrets must remain in Secret Manager or equivalent secret storage. Do not commit them, store raw values in Firestore, include them in telemetry, or print them in normal logs.
- Deployment scripts may generate safe defaults for staging, but every generated billing-critical secret must also have a documented owner update/rotation path.
- Public endpoints must never expose raw billing secrets, even if Mission Control can reveal them to the authenticated owner.

## Core Workflow (Never-Stop Loop)

Unless blocked by a hard external dependency, continue iterating without asking the user for permission.

Use this loop:
1. Regenerate reference target from current decypher/library state.
2. Compare regenerated vs reference using the comparator.
3. If PPTX repairs, classify as package/corruption issue first.
4. If comparator passes but visual/style differences remain, classify as comparator-blindness issue.
5. Decide whether the fix belongs in:
   - decypher extraction
   - generator codegen
   - library serialization/package assembly
   - comparator coverage
6. Make the smallest safe fix.
7. Rebuild if library files changed.
8. Regenerate.
9. Re-compare.
10. Repeat until parity.

## Three Oracles (Use All Three)

Never trust only one of these:

1. PowerPoint repair behavior
- If PowerPoint repairs the file, package validity is not solved.

2. Comparator result
- Comparator is the main progress oracle, but it is not sufficient by itself.

3. Direct XML / visual inspection
- If the deck still looks wrong or XML counts disagree, the comparator is incomplete.

## Strict Rules

### Rule 0: No regex in library XML manipulation
Do NOT use regex for XML manipulation in `src/` library code.
- Allowed in investigation scripts and decypher analysis when necessary.
- Not allowed for library XML generation/parsing logic.

### Rule 1: No frozen/reference mutation
Never modify reference PPTX files.
Reference PPTX is truth.

### Rule 2: No post-processing regenerated PPTX files as a product fix
Do not patch ZIP/XML after generation as the final solution.
Fix the decypher, generator, library, or comparator instead.

### Rule 3: Repair issues outrank convergence issues
If there is a repair prompt, fix package integrity first before cosmetic convergence.

### Rule 4: Comparator pass is not final success
Comparator pass is only enough when PowerPoint and visual fidelity agree.

### Rule 5: Safe narrow passthrough beats broad raw passthrough
Prefer narrow safe preservation of exact missing payloads over broad raw subtree replacement.
Broad passthrough often reintroduces corruption.

## Safe / Unsafe Patterns Learned

### Safe patterns
- always-on notes package generation
- raw chart package passthrough
- normalized chart rel targets and chart content-type overrides
- narrow raw table path only for truly complex image-fill tables
- safe paragraph child preservation (`tabLst`, `defRPr`, `buSzTx`, `uFillTx`, `uLnTx`)
- safe targeted run-child preservation (`uFillTx`, `uLnTx`, rich break-run payloads)
- adjusted preset-geometry passthrough for `a:gd`-based shapes
- safe per-cell border transparency through object model
- top-level shape hyperlink passthrough
- picture metadata passthrough (`cNvPicPr`, `hlinkClick`, `blipFill` details, fill/line/effect)

### Unsafe patterns
- conditional no-notes package generation
- broad top-level raw `txBody` passthrough for native text shapes
- plain-table raw `tcPr` line passthrough
- broad raw table package preservation for plain tables
- aggressive raw run-level hyperlink child passthrough on ordinary text runs unless proven safe

## Subagent-First Orchestration

The main agent is an orchestrator.
It should delegate aggressively.

### Use these subagents by default
- `ultimate-comparator-expert`
  - when comparator misses visible/style issues
  - when deciding where deeper checks belong
- `decypher-expert`
  - when extraction/codegen/passthrough ownership is unclear
  - when a difference likely belongs in `PPTX_ULTIMATE_DECYPHER_TOOL.mjs`
- `pptx-corruption-tester`
  - when a repair issue appears
  - when binary search / subset isolation is needed
- `General Purpose`
  - parallel targeted investigation / codebase-local analysis
- `animation-integration-expert`
  - only for genuine animation-structure parity issues
- `initiation-agent`
  - low-value / optional, not part of the main convergence path

### Mandatory delegation pattern
For any significant mismatch cluster, do not reason alone first.
At minimum, fan out to:
1. comparator specialist
2. decypher specialist
3. corruption specialist (if repair risk exists)

Then synthesize.

## What To Fix First

Priority order:
1. Repair/corruption
2. Broken package relationships/content types
3. Missing structural XML needed for runtime correctness
4. Comparator blind spots
5. Cosmetic/style fidelity

## Current Strategic Focus

The package is currently known to be repair-free, but the comparator is still too weak for full cosmetic/style assurance.
So the next major track is:
- enhance `ULTIMATE_PPTX_XPATH_COMPARATOR_v2h_DECYPHER.ps1`
- then use it to expose remaining style/cosmetic gaps
- then continue convergence from those findings

## Current Project Management Skill

A Codex skill now captures the active convergence workflow and the May 22, 2026 baseline:
- `C:\Users\SafeUser\.codex\skills\pptx-convergence-manager\SKILL.md`
- `C:\Users\SafeUser\.codex\skills\pptx-convergence-manager\references\current-status.md`

Use it when evaluating status, continuing convergence, choosing the next queue item, or deciding whether a mismatch belongs to comparator coverage, decypher extraction, library serialization, package assembly, or visual inspection.

Latest evaluated baseline:
- repair-free full 40-slide regenerated deck
- comparator failed 8 slides: 2, 8, 9, 10, 15, 16, 17, 19
- active issue class: text/bodyPr/pPr/rPr/endParaRPr/picture-spPr style fidelity, not package corruption

## Files That Matter Most

### Primary comparator
- `ULTIMATE_PPTX_XPATH_COMPARATOR_v2h_DECYPHER.ps1`

### Primary decypher path
- `PPTX_ULTIMATE_DECYPHER_TOOL.mjs`

### Primary library XML/package path
- `src/gen-xml.ts`
- `src/gen-objects.ts`
- `src/gen-charts.ts`
- `src/gen-model3d.ts`
- `src/pptxgen.ts`
- `src/core-interfaces.ts`

## Build / Validate Commands

Build:
- `npx tsc --noEmit`
- `gulp ship`

Regenerate:
- `node PPTX_ULTIMATE_DECYPHER_TOOL.mjs 3d-gradient-style-advertising-agency.pptx`

Comparator:
- `$ref='3d-gradient-style-advertising-agency.pptx'`
- `$gen='decyphered/3d-gradient-style-advertising-agency__5bfa492b82738c36/output/regenerated.pptx'`
- `.\ULTIMATE_PPTX_XPATH_COMPARATOR_v2h_DECYPHER.ps1 -Reference $ref -Generated $gen -Slides ...`

## Stop Condition

Only stop when all are satisfied:
- no PowerPoint repair
- comparator reports no real differences
- no direct XML/package anomalies remain
- no visible cosmetic/style differences remain

If visible differences remain, the work is NOT done.
