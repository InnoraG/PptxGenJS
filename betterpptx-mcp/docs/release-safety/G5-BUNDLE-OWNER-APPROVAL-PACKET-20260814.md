# G5 exact product-bundle owner approval packet — 14 August 2026

Status: **APPROVED BY OWNER 2026-08-14 / HASH BOUND**.

The explicit decision is recorded in `G5-BUNDLE-OWNER-DECISION-20260814.json`. It approves all three exact rows
below at the stated distribution boundaries and preserves every scope exclusion in this packet.

This packet is deliberately G5-only. It was prepared on the isolated branch
`codex/g5-bundle-approval-20260814` so it does not modify or depend on the ongoing G1 approval work.

## Decision requested

Approve or reject each of the following exact asset bytes for the stated product distribution boundary.
Approval is hash-bound; a rebake, replacement, path change, or broader distribution form requires a new decision.

| Stable ID | Owner-facing meaning | Exact SHA-256 | Bytes | Distribution boundary |
|---|---|---|---:|---|
| `ordinary-18-gesture-library` | **Curated 18-clip presenter deployment bundle**. The stable ID is historical; this is not the complete gesture library. | `3363308deb44806bc6f6914ec88b09e32f4e04985355e1c32081d6a5a21765f3` | 7,545,976 | Server-side skeletal-motion source used to construct project presenters; no standalone/raw library download or reusable-source resale. |
| `default-presenter-joe` | Joe default native-3D presenter with the curated 18 clips | `105594811c8b979af8cd4918e972961ae12fb7e22fa76e3e115542bb2b4cb151` | 8,899,436 | Server-side product asset embedded only in generated presentation projects; no standalone/raw GLB download or reusable-source resale. |
| `default-presenter-louise` | Louise default native-3D presenter with the curated 18 clips | `de219e1f6ef01d9612a2464652a2d7a4bd089526b9691e1057cc68675c2789c4` | 6,487,668 | Server-side product asset embedded only in generated presentation projects; no standalone/raw GLB download or reusable-source resale. |

## What was verified without touching PowerPoint/COM

`node betterpptx-mcp/verify-g5-bundle-candidates.mjs` verifies the exact hashes and byte sizes, parses each GLB,
checks the canonical animation names/order, and confirms the intended content boundary:

- The curated deployment bundle is skeletal-only: one skin, 18 animations, and no mesh/material/texture payload.
- Joe and Louise are visible rigged presenters and each carries the same 18 canonical animation names and durations.
- The 18 names are `00_idle`, `01_talk`, `02_greet`, `03_point`, `04_emphasize`, `05_magnitude`,
  `06_contrast`, `07_enumerate`, `08_ask`, `09_present`, `10_agree`, `11_bow`, `12_think`,
  `13_disagree`, `14_happy`, `15_surprise`, `16_walk`, and `17_clap`.
- The ordinary product-bundle verifier already confirms presence, SHA-256, and byte size for all three candidates.

## Existing visual/runtime evidence

- Joe's exact current hash `105594…151` has an 18-slide Windows PowerPoint 16.0 render-oracle run dated
  1 August 2026. The run created both PPTX and MP4 evidence, measured all 18 clips, and passed its held-out
  placement gate (`0.0264 in` median against a `0.15 in` threshold).
- Louise's fresh-worker proof PPTX embeds the exact current `de219…89c4` GLB. It opened without repair,
  passed package/design/accessibility checks, exported through PowerPoint, and its native slideshow motion
  oracle passed with changed fraction `0.033056`.
- The current tracked posters are `betterpptx-mcp/assets/default-presenter-joe.png` and
  `betterpptx-mcp/assets/default-presenter-louise.png`.
- Older July Joe/Louise proof decks embed predecessor hashes. They remain historical evidence and are not
  represented here as proof of today's exact bytes.

## Gesture architecture — explicit boundary

- **60** planned master kinetic catalog entries.
- **31** clips currently baked in the already owner-approved `kinetic-clips.glb` server-side pool.
- **At most 18** clips selected/embedded per presenter or deck because that is the measured PowerPoint ceiling.
- The three candidates in this packet use one curated **18-clip deployment bundle**; it is not the master pool.
- The separate authoring-v3 contract has **18 semantic interaction slots** and remains **18/18 `TO_SOURCE`**.
  Approving this packet does not approve or complete authoring-v3.

## Licensing/provenance boundary

The source ledger records Mixamo commercial-in-project use and prohibits treating the source takes as a reusable
asset library for resale. Raw FBX/BVH inputs remain build-time-only and are not shipped. This decision is therefore
for the exact in-project forms above, not raw-source redistribution. The existing source-row manifest independently
hash-pins 19/19 listed raw inputs; that integrity measurement is not itself a license decision.

## Explicitly outside this decision

This decision does **not** approve G1, G4, public enablement, the 60-entry future catalog, the separate
authoring-v3 bundle, raw-source/standalone-asset resale, or the remaining worker dependency/SBOM/transitive-PoC
pinning work. The already approved 31-clip kinetic pool is not being re-decided here.

## Owner response recorded

The owner replied:

> I approve the three exact G5 product bundles in `G5-BUNDLE-OWNER-APPROVAL-PACKET-20260814.md` at their listed hashes and stated distribution boundaries. I understand this closes only the hash-bound G5 bundle-approval gate and does not approve G1, G4, public enablement, authoring-v3, or raw/reusable-source resale.

The manifest and strict verifier now bind that decision to each stable ID, exact hash, byte size, and approval artifact.
