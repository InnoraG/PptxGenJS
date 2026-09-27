# A4a — Early Platform-Risk Probe (evidence matrix + product decision)

Status: **PROBE RUN 2026-07-14.** Two Windows-desktop surfaces measured on this box; the live
fullscreen slideshow could not be auto-captured here (foreground-lock, see below); Mac/web/mobile
have no access on this machine. Per the roadmap, every unmeasured surface defaults to the designed
static output — no optimistic capability inheritance.

Actor/probe: kinetic-joe (`outputs/render-oracle/c7ba3481b6da/`), oracle probe window (5×5 in, m1),
static-poster slide + two playScene slides. PowerPoint Click-to-Run `16.0.20131.20126` /
client `16.0.20131.20112`, screen 1280×720.

## The matrix

| Surface | Status | Evidence | Fallback if unverified |
|---|---|---|---|
| **Windows desktop — CreateVideo (export)** | **MEASURED** | A1 oracle: held-out marker median **0.1471 in ≤ 0.15**; 17 clip timelines; live 3D plays and is projection-accurate (`calibration.json` / `timelines.json`) | n/a (this is the measured baseline) |
| **Windows desktop — edit / save / reopen** | **MEASURED — PASS** | `roundtrip-probe.ps1`: open RW → PowerPoint `SaveAs` pptx → reopen = **3/3 slides, 3/3 am3d model shapes survive, repair-free**; resaved package 30/30 XML parts well-formed, content-types present, 6 parts retain am3d refs (`roundtrip-info.json`) | n/a |
| **Windows desktop — LIVE fullscreen slideshow** | **BLOCKED_ON_THIS_BOX** | `live-probe.ps1` launches the show via COM but Windows **foreground-lock** prevents a background process from focusing it: `foregrounded:false`, frontmost window was `…base.xlsx - Excel` (capture confirmed by eye — the screenshots show Excel, not the show). The "3.4 in live-vs-export" number the extractor produced is an **Excel-chrome false positive, discarded.** Not a tool defect — the harness is correct and ready for an interactive/owner run. | **declared static fallback** until measured: the deck must communicate via the static poster + native content, never depending on live 3D playback (D5 policy) |
| **Mac desktop** | **UNTESTED** | no access on this machine | declared static fallback + owner-run kit |
| **Web (PowerPoint for the web / Microsoft 365 online)** | **UNTESTED** | no access on this machine; am3d live playback on web is historically limited | declared static fallback + owner-run kit |
| **Mobile (iOS/Android PowerPoint)** | **UNTESTED** | no access on this machine | declared static fallback + owner-run kit |

## The measured finding that matters

**The edit surface is safe** — a generated deck with am3d presenters opens, edits, resaves through
PowerPoint, and reopens repair-free with the models intact. That retires the biggest package-level
platform risk (that our am3d graphicFrames would be dropped or trigger repair on a user re-save).

**Live-vs-export could not be auto-measured here**, and the reason is environmental, not a product
gap: background COM cannot steal foreground focus. This is exactly the surface A4a exists to flag —
so the honest posture is to treat live fullscreen playback as UNVERIFIED and fall back to static
until it is measured on an interactive desktop.

## Product decision: **CONTINUE, with a declared surface envelope**

- **Ship on the measured envelope:** Windows-desktop CreateVideo (proven) and the edit/save/reopen
  round-trip (proven). B1/B2 performer work may proceed against these.
- **Do NOT advertise live fullscreen 3D playback** as verified. The compiler already treats the
  poster as the designed static fallback (square poster, L5) and D5 mandates that no fact depends on
  live playback — so an unverified live surface degrades safely by construction.
- **Owner-run kit (interactive session, ~2 min):** from an interactive desktop,
  `node tools/render-oracle/live-probe-deck.mjs --oracle outputs/render-oracle/<hash>` then
  `powershell tools/render-oracle/live-probe.ps1 -Pptx <deck> -OutDir <dir>` then
  `py tools/render-oracle/live-extract.py <dir> <oracleDir> --out live-report.json`. With the show
  actually foregrounded, `played` and `plateauErrIn` become real live-vs-export numbers. The
  harness records `foregrounded` so a bad capture can never be mistaken for a measurement.

## Follow-ups (A4b / G6 own the full matrix)

- Live slideshow numbers from an interactive Windows session (owner or CI with a real desktop).
- Mac / web / mobile capability rows — A4b's cross-platform probe with real devices.
- Until then, the versioned capability statement is: **Windows desktop export + edit round-trip =
  supported/measured; all live-playback and non-Windows surfaces = static-fallback, unverified.**

measuredAt: 2026-07-14 · profile: windows-desktop `16.0.20131.20126`
