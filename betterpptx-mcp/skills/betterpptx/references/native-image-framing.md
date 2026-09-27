# Native image framing

Image framing is a semantic, editable contract. A preset is only the starting choice; the author still controls the fit mode and can revise it without replacing the picture.

Use `imageOptions.sizing` on an image block:

```json
{
  "kind": "image",
  "name": "hero-image",
  "image": "data:image/png;base64,…",
  "imageOptions": { "sizing": { "type": "cover" } },
  "altText": "Product team in the field"
}
```

The typed `type` values are:

- `cover`: fill the AI-authored image frame and crop the excess source area.
- `contain`: keep the complete source visible and letterbox the remaining target area.
- `crop`: use native source cropping within the AI-authored image frame. Inspect the live contract for any authorable crop coordinates and keep frame geometry separate from source crop.

The public catalog surface is `imageFraming`, with parameter `framingMode` (`contain | cover | crop`, default `cover`) and semantic path `options.sizing.type`. Author the image object's slide-inch `rect`/`bbox` separately in original exact mode. Do not confuse sizing/crop parameters with object placement.

Reset the authored framing with `sizing: null` or by omitting `sizing`. A sparse re-edit can then set another mode. The lifecycle to verify is: fresh catalog discovery → dry-run → commit → exported readback → null reset → readback → re-edit → readback → quality/preview/save.

The native serializer writes editable picture `a:srcRect` plus `a:stretch`/`a:fillRect` data. Validate package relationships, meaningful alt text, PowerPoint reopen, and rendered output for all three modes. Do not rasterize a whole slide to simulate a crop, and do not expose local source paths; use inline bytes, HTTPS, or an opaque public asset handle.
