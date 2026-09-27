# Native object transforms

Treat the common 2-D object transform as an editable control, not as a gallery preset or a browser-only visual effect.

`rotate` is authored on the semantic object (or under its style/options surface when that carrier uses an options bag). Its public contract is:

- signed range `-360..360` degrees;
- default `0` degrees;
- native serialization precision `1/60000` degree in `a:xfrm/@rot` (and the model graphic-frame `p:xfrm/@rot`);
- `null` or omission removes the authored rotation and restores the native zero-degree orientation;
- applicable carriers include ordinary text, WordArt, shapes, pictures, equations, custom geometry, and the 2-D frame of a 3-D model;
- Text3D/scene3d camera axes and model pose rotations are separate controls and must not be conflated with this 2-D frame rotation.

The same common frame contract also exposes `flipH` and `flipV` as independent typed boolean controls:

- values are exactly `false` or `true`, with `false` as the neutral/default state;
- `null` or omission removes the authored flip and restores the native orientation;
- horizontal and vertical flips compose independently with rotation and with each other;
- the controls apply to ordinary text, WordArt, shapes, pictures, equations, custom geometry, and the 2-D frame of a 3-D model;
- the native serializer writes `a:xfrm/@flipH` and `a:xfrm/@flipV` (and the corresponding model graphic-frame transform), while Text3D/scene3d pose remains a separate domain.

Use the public option catalog before authoring:

```json
{"surface":"objectRotation","format":"full"}
```

The returned `rotationDegrees` parameter is the authority for bounds, step, serializer, reset behaviour, and applicability. Author a semantic JSON spec, dry-run it, commit without saving, export the current spec to verify the rotation, then use a patch with `rotate:null` followed by a sparse re-edit to prove that reset does not erase unrelated style. Validate and preview before saving.

For flips, discover the typed contract with:

```json
{"surface":"objectFlip","format":"full"}
```

Then author `flipH`/`flipV` on the semantic object, run the same dry-run → commit → export → null-reset → sparse-re-edit lifecycle, and verify both values independently in the public readback. A catalog entry is not complete unless its domain, default, serializer, reset semantics, applicability, and Office canonicalization are explicit.

Do not infer success from an SVG/CSS preview alone. The proof boundary is native package inspection, repair-free PowerPoint open, SaveCopyAs/reopen, retained semantic readback, and a visible render. A full turn or explicit zero may be canonicalized by Office to an omitted native attribute; treat that as the documented default, not as a reason to invent a second rotation vocabulary.
