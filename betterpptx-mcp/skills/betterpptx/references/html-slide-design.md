# Secondary automatic HTML conversion

This route is optional and must be selected explicitly. The principal BetterPPTX workflow remains client-AI reconstruction through `spec.visualReference`.

For inline HTML, use:

```json
{
  "htmlConversion": {
    "html": "<section class=\"slide\">...</section>"
  }
}
```

For a ZIP containing `index.html` and assets, upload it with `betterpptx.assets.upload` using `kind:"htmlPackage"`, optionally inspect the returned handle, and pass it under `spec.htmlConversion.package`. `assetMap` is only an override for unresolved sources.

Never combine `visualReference` and `htmlConversion` in one compile. An htmlConversion artifact is not evidence that the AI reconstruction workflow succeeded. Preview all converted slides at full size and validate the native/editability result before saving.
