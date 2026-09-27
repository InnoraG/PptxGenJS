# Native structural authoring

Structural authoring covers connectors, groups, custom geometry, actions, comments, zooms, notes, and relationship-bearing objects. Keep these objects native and semantically editable; do not flatten a connected diagram or execute imported code to make it look right.

Connectors expose routing, begin/end connection IDs, line style, and arrow controls. Groups preserve IDs and nested transforms. Custom geometry uses typed paths and adjustment data; boolean operations are explicit custom-geometry operations. Actions and hyperlinks retain target semantics while public responses use opaque handles and never expose private paths.

Imported comments, threaded comments, relationship edges, and package parts are preserve-only unless the catalog explicitly exposes a safe mutation surface. Macro, ActiveX, VML, ink, and other imported payloads are not executed. `null` resets an authored component; exact source reset restores the preserved carrier.

Use the standard lifecycle: discover, create/import, dry-run, commit, patch/re-edit, reset, validate, preview, export authored JSON, save, and read back. Prove package relationships, repair-free PowerPoint open, SaveCopyAs/reopen, retained semantics, and visual geometry. The 76-row inventory remains explicitly split between 28 structured-partial, 6 preserve-imported-only, and 42 preset-only-incomplete rows.
