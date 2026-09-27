# Native image colour, recolour, duotone, and Artistic Effects

Picture colour and Artistic Effects are editable native controls. A gallery preset is only a starting point; the authored JSON must retain the applicable endpoint transforms and every persistent effect slider needed by the result.

Use `imageOptions.imageAdjustments`:

```json
{
  "kind": "image",
  "name": "hero-image",
  "image": "data:image/png;base64,…",
  "imageOptions": {
    "imageAdjustments": {
      "colorMode": "recolor",
      "recolor": {
        "dark": { "scheme": "dk1", "tint": 0.125, "shade": 0.2, "saturation": 1.25, "opacity": 0.8 },
        "light": { "scheme": "accent4", "tint": 0.45, "saturation": 2.5, "opacity": 0.9 }
      },
      "artisticEffect": { "type": "paintStrokes", "transparency": 0.12, "intensity": 8 }
    }
  },
  "altText": "Product team in the field"
}
```

The public catalog families are `duotone`, `recolor`, and `artisticEffect`. `colorMode` is `normal | grayscale | duotone | recolor`. A duotone/recolour mapping has `dark` and `light` endpoints. Each endpoint can use a hex/preset color or one of the live DrawingML theme tokens (`tx1`, `tx2`, `bg1`, `bg2`, `dk1`, `lt1`, `dk2`, `lt2`, `accent1`–`accent6`, `hlink`, `folHlink`, `phClr`) and exposes these exact transform leaves:

| Endpoint leaf | Domain | Default | Step |
| --- | --- | --- | --- |
| `tint` | normalized `0` to `1` | `0` | `0.00001` |
| `shade` | normalized `0` to `1` | `0` | `0.00001` |
| `saturation` | multiplier `0` to `4` | `1` | `0.00001` |
| `opacity` | normalized `0` to `1` | `1` | `0.00001` |

`artisticEffect` has 23 canonical effects. Read its nested parameter catalog; every persistent leaf is continuous and includes its own minimum, maximum, default, unit, and serializer step. Normalized DrawingML leaves use a `0.00001` step; integer/point/Kelvin leaves use a `1` step. Do not invent a slider for an effect that does not expose one, and do not hide a persistent slider behind the effect name.

Reset one family with `recolor: null`, `duotone: null`, or `artisticEffect: null`; reset the complete picture adjustment surface with `imageAdjustments: null`. Sparse patching must preserve unrelated framing and correction fields. Verify fresh catalog discovery → dry-run → commit → exported readback → null reset → readback → sparse re-edit → readback → quality/preview/save. Invalid range, invalid step, unsupported effect type, and unsupported theme token must be rejected before commit.

The native serializer writes DrawingML `a:grayscl`, `a:duotone` endpoint transforms, and Office picture-effect extension payloads. Validate package integrity, PowerPoint reopen/SaveCopyAs retention, rendered checkpoints, meaningful alt text, and no unrelated-object changes. Use only inline bytes, HTTPS assets, or opaque public asset handles; never expose local paths, XML, or implementation details.
