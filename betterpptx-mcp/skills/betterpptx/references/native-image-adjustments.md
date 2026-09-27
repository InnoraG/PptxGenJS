# Native image corrections and adjustments

Picture corrections are editable semantic controls, not a single “picture look” preset. Use them when the author needs to tune the pixels of an image while keeping the picture object native and revisable. They apply to image objects only; they do not change the slide background, text, shapes, or charts.

The public JSON-spec path is `imageOptions.imageAdjustments`:

```json
{
  "kind": "image",
  "name": "hero-image",
  "image": "data:image/png;base64,…",
  "imageOptions": {
    "imageAdjustments": {
      "brightness": 0.15,
      "contrast": -0.1,
      "sharpness": 0.25,
      "saturation": 1.2,
      "temperature": 7200,
      "transparency": 12.5
    }
  },
  "altText": "Product team in the field"
}
```

The live `corrections` catalog exposes the complete typed contract:

| Parameter | Unit and domain | Default | Step |
| --- | --- | --- | --- |
| `brightness` | normalized `-1` to `1` | `0` | `0.00001` |
| `contrast` | normalized `-1` to `1` | `0` | `0.00001` |
| `sharpness` | normalized `-1` to `1` | `0` | `0.00001` |
| `saturation` | multiplier `0` to `4` | `1` | `0.00001` |
| `temperature` | Kelvin `1500` to `11500` | `6500` | `1` |
| `transparency` | percent `0` to `100` | `0` | `0.001` |

Values must stay in range and on the advertised step. The engine serializes the native picture adjustment payload at the corresponding precision; PowerPoint may canonicalize equivalent values on save/reopen, so exported readback is the authority for the final persisted value.

Reset all corrections with `imageAdjustments: null` (or omit the property). A sparse re-edit can then set one or more fields without rebuilding the slide. Verify the lifecycle as: fresh catalog discovery → dry-run → commit → exported readback → null reset → readback → sparse re-edit → readback → quality/preview/save. Invalid ranges and off-step values must be rejected before commit.

Corrections are independent from framing, color mode, duotone/recolor, artistic effects, picture effects, borders, and styles. Do not silently replace one family with another, and do not treat a preset as coverage for the underlying slider leaves. When a task asks for an image treatment, inspect each applicable family and expose every persistent control needed by the intended result.

Use inline bytes, HTTPS assets, or opaque public asset handles only. Never expose local source paths, implementation details, or raw XML to a public client. Keep the image editable and validate package integrity, meaningful alt text, PowerPoint reopen, render distinctness for meaningful five-point values, reset behavior, and unrelated-object regressions.
