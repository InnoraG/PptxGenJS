# Native SmartArt with typed controls

Treat a SmartArt gallery tile as a starting treatment, not the authoring ceiling. Discover `smartArtLayout` before writing a spec: the public catalog exposes layout, quick-style, color-style, direction, typography, palette, node topology, title, and accessibility controls.

Use stable semantic names and a native `smartart` object. `layoutId`, `quickStyleId`, and `colorStyleId` select persisted native families; `nodes` supplies the editable topology; `rightToLeft`, `fontFace`, `fontSize`, `color`, `textColors`, and `palette` are typed overrides. Omitted values retain the selected family. Set a selector or component to `null` to reset it to SmartArt defaults, then dry-run again before re-editing.

Keep structured-partial and preserve-imported-only boundaries explicit. Picture-node or unsupported imported payloads must remain editable through the retained native object rather than being flattened into an image. The proof boundary is fresh public discovery, JSON-spec upload, mutation-free dryRun, commit, quality, preview, save, numeric boundary rejection, package inspection, and PowerPoint reopen/render. Never provide coordinates, private source paths, or implementation details to the public client.
