# Author motion and narration

The AI owns the words, exact object geometry, visual beats, cue-to-object mapping, and timing choices. BetterPPTX resolves the declared clock, serializes native PowerPoint timing/media, and reports whether each selected target and control was realized. Native narration, ordinary sound effects, talking-head video, and an editable 3-D presenter are distinct carriers.

## Choose one truthful motion policy

- Declare one explicit effective `motionPolicy`: `full`, `reduced`, or `static`. Keep any accessibility reduced-motion declaration consistent with it; resolve conflicts instead of accepting a silent override.
- Make every static slide complete without playback. No title, body, proof, or call to action may depend on an entrance, emphasis, exit, motion path, scene playback, or narration cue to become understandable.
- Keep the presenter supplemental. Narration, audio, or a presenter must never be the sole carrier of a slide's meaning.
- Use transitions sparingly as authored continuity. Static mode may retain a harmless slide transition, but not audience-facing object motion dependencies.

## Author native narration and captions deliberately

- Write narration deliberately and keep visible slide copy concise. Native narration stores media bytes in the PPTX, but it also requires narration-marked PowerPoint audio shapes (`p15:isNarration`), `<p:audio isNarration="1">` timing nodes, and scheduled media-play commands. File embedding alone does not prove native narration. Keep the script in speaker notes; do not create transcript text boxes as a substitute.
- Plan visual beats against measured segment timing. Choose named visual targets and relevant entrance, emphasis, path, exit, or re-entry actions where they improve the story. Verify the compiled target map and timing tree; audio cues alone do not prove meaningful object animation.
- Add `audio.closedCaptionTracks` with valid WebVTT only when subtitles are wanted. For a slide with multiple narration `segments`, attach `closedCaptionTracks` to **each segment**, with cue timestamps relative to that segment's audio start; one slide-level track cannot caption later clips. BetterPPTX does not create `.vtt` merely because narration exists. Verify a `.vtt` part and native track relationship for every captioned clip, plus `p173:tracksInfo`; rendering of caption glyphs still needs a PowerPoint slideshow check with CC enabled.
- Decide whether slides advance manually or automatically after narration. These are different choices. An audio-synchronized slide with no `advTm` does not auto-advance to the next slide.
- Use stable object names for semantic cue anchors. Bind cues to a phrase, word, or time only through fields advertised by the public schema.
- When TTS or another resolvable asset is required, run `phase:"resolve"`, review the public timing and cost readback, and accept the returned `lockedSpec` deliberately.
- Reuse that approved locked spec and its `asset://locked/...` handles for `lockedDryRun`, commit, validation, and the frozen release candidate. Do not resolve TTS again after timing approval; a new resolve can produce a different duration and plan digest.
- Run `betterpptx.deck.validate_narration` whenever narration is present. Also run the public avatar-narration validator only when that distinct representation is present.
- For a claimed pause/resume guarantee, test a released candidate in PowerPoint Slide Show: capture a narration player's running position/state, pause the show, confirm the player's position stops, resume, and confirm it advances again. Record the target PowerPoint version and scoped result. Structural package checks cannot establish audible quality or caption visibility.

Do not call paid talking-head generation for ordinary narration or an editable 3-D presenter. Use it only when the user explicitly requests and authorizes that separate representation.

## Direct an editable 3-D presenter

- Choose `joe` or `louise` explicitly for a built-in first-time-right presenter. Treat `presenterIdentity` as canonical; if `presenter.identity` is also present, make the alias match. Do not confuse the visible identity with the logical `presenter.id` used by motion references.
- Choose the presenter's role and frame through the active public geometry contract. Semantic stage labels may help describe intent, but do not let them silently replace an explicit AI-authored frame.
- Choose `presenter.stageTreatment` yourself from the unranked values `none` and `floor-ellipse`. The engine derives the geometry and never selects a treatment from the World.
- Query the executable `presenter-motion` family, choose exact `motion.*` IDs, include them in `motionTime.kineticSelection`, and bind each slide's `presenterMotion` to the same logical presenter ID. Never use raw animation indexes.
- Express interactions as semantic actor, verb, and stable target. Do not hand-author runtime scene operations or playback indexes.
- Under `release-powerpoint`, preview the actual PowerPoint render and confirm the static/edit view has an intentional complete pose and no orphan narration or motion cue. Under `production-non-rendering`, perform the applicable deterministic package/media/timing checks and do not claim individual PowerPoint playback. First-party `joe` and `louise` presenters seed that static pose from their idle clip; a T-pose in the still frame is a packaging defect, not an acceptable rest pose.
- Give the presenter a rhetorical job, not just a body on stage. The presenter should introduce, point, caution, compare scale, or punctuate a decision; if the slide reads the same with the presenter ignored, reduce its prominence or let another object carry the focus.
- Avoid letting the presenter occupy the same side and same visual weight on every slide. Across a narrated deck, alternate between presenter-led, object-led, and evidence-led slides so the sequence feels authored rather than templated.
- When a physical model or mechanism is the proof object, let it own the slide. The presenter should support the read, not compete with the model for first attention.

Continue with [review-release.md](review-release.md).
