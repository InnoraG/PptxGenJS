# BetterPPTX Multilingual TTS Voice Expansion - 2026-06-06

## Status

Done for current production-safe Piper runtime: 24 approved voices / 24 working languages.

This expands the previous runtime bundle from only:

- `en_US-ljspeech-high`
- `fr_FR-gilles-low`

to one best verified commercially allowed voice per working language.

## Selection Rule

Runtime approval is not the same as being present in the broad candidate manifest.

For this pass, a voice was eligible only when:

- `commercialUse` is `allowed`
- `reviewStatus` was `candidate` or already `approved`
- attribution, unknown-license, and forbidden voices are excluded
- direct Piper synthesis smoke can return valid WAV

Best-per-language ranking:

1. Piper quality tier: `high` > `medium` > `low` > `x_low`
2. Clean lineage preferred as a tie-break
3. Existing approval preferred as a tie-break
4. Default-for-locale preferred as a tie-break
5. Deterministic voice id tie-break

This is an objective automated selector, not a human listening-quality verdict. Human audition scoring is still needed before final live pricing and public marketing claims.

## Approved Runtime Voices

| Language | Voice | Quality | License | Notes |
|---|---|---:|---|---|
| bg | `bg_BG-dimitar-medium` | medium | CC0-1.0 | lineage flag retained |
| cs | `cs_CZ-jirka-medium` | medium | CC0-1.0 | lineage flag retained |
| da | `da_DK-talesyntese-medium` | medium | CC0-1.0 | lineage flag retained |
| de | `de_DE-thorsten-high` | high | CC0-1.0 | best quality selected over default medium |
| el | `el_GR-rapunzelina-medium` | medium | CC0-1.0 | clean lineage |
| en | `en_US-ljspeech-high` | high | CC0-1.0 | default retained |
| es | `es_MX-claude-high` | high | Apache-2.0 | best Spanish allowed candidate |
| fa | `fa_IR-ganji-medium` | medium | CC0-1.0 | clean lineage |
| fi | `fi_FI-harri-medium` | medium | CC0-1.0 | best quality selected |
| fr | `fr_FR-gilles-low` | low | CC0-1.0 | higher French variants remain attribution/candidate |
| hu | `hu_HU-anna-medium` | medium | CC0-1.0 | lineage flag retained |
| lv | `lv_LV-aivars-medium` | medium | CC0-1.0 | clean lineage |
| ne | `ne_NP-chitwan-medium` | medium | CC0-1.0 | lineage flag retained |
| nl | `nl_BE-rdh-medium` | medium | CC0-1.0 | clean lineage |
| no | `no_NO-talesyntese-medium` | medium | CC0-1.0 | verified after longer timeout |
| pl | `pl_PL-darkman-medium` | medium | CC0-1.0 | verified after longer timeout |
| pt | `pt_BR-cadu-medium` | medium | CC0-1.0 | best Portuguese allowed candidate |
| ro | `ro_RO-mihai-medium` | medium | CC0-1.0 | lineage flag retained |
| ru | `ru_RU-denis-medium` | medium | CC0-1.0 | lineage flag retained |
| sk | `sk_SK-lili-medium` | medium | CC0-1.0 | lineage flag retained |
| sq | `sq_AL-edon-medium` | medium | CC0-1.0 | lineage flag retained |
| sv | `sv_SE-nst-medium` | medium | CC0-1.0 | clean lineage |
| uk | `uk_UA-mykyta-high` | high | Apache-2.0 | clean lineage |
| ur | `ur_PK-fasih-medium` | medium | MIT | clean lineage |

## Verification

- Runtime builder: `BETTERPPTX_REQUIRED_VOICE_LANGS=approved node betterpptx-mcp/narration/download-approved-voices.mjs`
- Runtime manifest: `betterpptx-mcp/narration/voices/runtime/runtime-manifest.json`
- Runtime bundle size: 49 files, 1.555 GiB
- Local Piper `/voices`: 24 voices, no `zh`
- MCP-side `betterpptx.narration.voices`: 24 voices, no `modelPath`/`configPath` leak
- `resolveVoice({})`: `en_US-ljspeech-high`
- `resolveVoice({ lang })`: resolves every approved language to the intended voice
- Direct synthesis smoke: all 24 approved voices returned valid WAV. `no_NO` and `pl_PL` require longer timeout than the initial 120s probe.

## Chinese/CJK Status

`zh_CN-chaowen-medium` remains a candidate, not runtime-approved.

Reason: the voice license is machine-classified as commercially allowed, but synthesis is not deterministic in the current Piper sidecar. Piper's Chinese phonemizer imports `g2pw`; `g2pw` then requires `requests`, `torch`, `unicode-rbnf`, and a full `G2PWModel-v2-onnx` resource. The full model artifact is about 589 MB compressed before extraction, and runtime attempts to fetch Google-hosted model files failed inside the container.

Do not approve Chinese until one of these is implemented and costed:

- a separate CJK-capable TTS image profile with offline `g2pw`/Torch/model resources warmed at build time
- a different commercially usable Chinese TTS provider
- an explicit no-Chinese launch scope

## Next Steps

- Build a human voice audition scorecard before final pricing/public launch.
- Decide whether attribution voices can be used with durable in-deck/product attribution.
- Decide whether Chinese/CJK should be supported through a heavier sidecar profile or external provider.
- Re-run MC3 narration-heavy testing with the 24-language bundle before billing/pricing conclusions.
