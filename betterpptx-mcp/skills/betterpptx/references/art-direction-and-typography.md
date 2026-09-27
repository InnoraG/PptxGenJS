# Direct the visual language and typography

Choose an explicit art-direction World as a coherent grammar, not a colour preset. Make the selection yourself from unranked descriptions by weighing audience, subject, emotional posture, brand constraints, delivery setting, and the story's required energy.

## Write a visual thesis

Define the intended visual language in one sentence that connects:

- emotional posture: assured, urgent, curious, humane, playful, rigorous, or reflective;
- material character: editorial paper, luminous glass, technical drawing, cinematic image, tactile craft, or another coherent surface language;
- contrast strategy: bright and open, dark and focused, soft and atmospheric, or crisp and analytical;
- image treatment, shape language, typography, and motion temperament.

Use this thesis to choose the explicit World and mode, then make every surface support it. Do not accept an omitted-World fallback as creative direction.

## Build a role-based palette

- Assign colours by role: canvas, primary ink, secondary ink, focal accent, supporting accent, success, caution, and risk when needed.
- Spend the focal accent sparingly. Repetition creates recognition; scarcity creates emphasis.
- Keep sufficient tonal separation between text and every surface behind it, including native chart, table, SmartArt, and model-stage surfaces.
- Let gradients, transparency, shadows, outlines, corner language, and image treatment express the same material system. Avoid mixing unrelated effects because they are available.
- Preserve brand colours without forcing every brand colour into every slide. Use neutrals to protect hierarchy and legibility.

## Design the type system

- Choose headline and body families for rhetorical fit, character coverage, readability, and likely availability. Use one family with purposeful weights or a disciplined two-family pairing.
- Declare the intended theme font explicitly. Ensure native charts, tables, SmartArt, annotations, and supporting equation labels participate in the same typographic system rather than falling back to an unrelated default face.
- Define roles before sizes: display, slide title, section marker, body, annotation, data label, source, and metadata. Make adjacent roles visibly distinct through scale, weight, case, spacing, or colour.
- Keep body measures concise, line spacing comfortable, and line breaks intentional. Avoid long all-caps copy, excessive weights, faux-small text, and shrinking content to preserve a crowded layout.
- Use expressive type or native WordArt as a semantic voice for short phrases, never as a substitute for hierarchy or legibility.

### Author WordArt beyond the gallery

Treat a WordArt transform as a starting selector, not a finished treatment. Author `style.wordArt` or `wordArt` with a canonical `transform` plus one integer `adjustments[0]` in the native 0..100000 guide range (1/100000 of the shape dimension) only when the selected warp is listed as guide-applicable by the public catalog. PowerPoint rejects invented second `adj1` guides and rejects guides on several no-slider warp families, so the engine validates applicability instead of emitting unsafe XML. Omit or set `adjustments` to `null` to reset the guide. The engine serializes the supported guide as editable `a:prstTxWarp/a:avLst/a:gd`, preserves it through export/readback and PowerPoint reopen, and reports the exact transform boundary. Gallery tiles remain conveniences; the independent guide value is the authoring control where Office actually persists it.

### Author text fill beyond presets

Use `style.textFill` or `textFill` for the character/glyph fill, separately from `style.fill` (the text-box panel). Its `transparency` is a typed 0–100 percent value with a 0.001-point step, and it serializes to the editable text-run alpha. `null` resets the authored character fill to the theme/default; sparse patches may change only transparency while preserving color. The same surface applies to ordinary text and WordArt, and is discoverable as `textFill` through the public options catalog.

For a native gradient inside the letters, use `textFill:{type:"gradient",gradientDirection:"linear",gradientAngle:90,gradientStops:[{position:0,color:"F5FCFF"},{position:100,color:"63CFFF"}]}`. Stops are ordered, bounded to 2–32, and carry their own optional `transparency`; positions and transparency use 0–100 percent in 0.001 steps. Linear angles use degrees from 0 up to but not including 360. Path gradients use `circle`, `rect`, or `shape`, with optional `fillToRect`; all gradients can use `gradientFlip`, `rotateGradientWithShape`, and `tileRect`. The closed options catalog defines each field. This is editable glyph fill, not a text image, and it works inside rich runs, text shapes, and groups. `type:"none"` hides the fill while preserving the outline; `null` restores inherited fill. Same-type sparse patches preserve omitted controls, replace the entire stop array when supplied, and discard the previous kind's fields on an explicit type change. A run-local `textFill:null` overrides an inherited parent gradient.

Typography should help the audience hear the deck. A serif can feel reflective or authoritative; a geometric sans can feel engineered or contemporary; a humanist sans can feel open or instructive. Treat these as tendencies, not automatic mappings.

## Hold the system together

- Repeat a few recognizable devices—rule, frame, crop logic, numeral treatment, annotation style—rather than repeating one layout.
- Make decorative depth subordinate to content. Shadows, bevels, glow, and 3-D treatment should clarify layer or focus, not advertise effects.
- Integrate photographs and illustrations through consistent crop, lighting, colour treatment, and edge behavior.
- Preserve hierarchy without colour: the composition and type roles should still read when accents are muted.
- Check every native surface for accidental defaults, mismatched fonts, weak label contrast, and style choices that break the visual thesis.

Choose coherence over novelty and specificity over generic polish. The World supplies a vocabulary; the AI remains responsible for the sentence it writes with that vocabulary.
