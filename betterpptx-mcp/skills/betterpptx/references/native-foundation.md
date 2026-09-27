# Native foundation and durable authoring

The foundation family is the infrastructure every presentation capability depends on. It covers typed text boxes and basic text controls, action/hyperlink carriers, slide backgrounds, metadata, artifacts, package relationships, accessibility flags, notes, and the durable JSON-spec lifecycle. These are product capabilities, not implementation details.

## Authoring contract

Use the public catalog and workflow to discover capabilities, import or create a JSON spec, dry-run without mutation, commit, patch/re-edit, reset a component with `null`, validate quality/accessibility, preview, export authored source, save, and read back. A finalized spec is durable source code: it must be portable, content-addressed, inspectable, replayable, and safe to hand from one fresh AI client session to another.

Text foundation controls remain independently typed (font, size, color, weight, underline, spacing, alignment, direction, language, margins, wrapping, bullets, and vertical alignment). Action buttons, hyperlinks, sections, zooms, notes, and relationship carriers must retain semantic targets without exposing private paths. Decorative/hidden graphics and reading order are explicit accessibility data.

## Package and preservation rules

Native output must pass relationship/content-type validation, package audit, repair-free PowerPoint open, SaveCopyAs/reopen, and retained-value readback. Imported-only parts such as macros, ActiveX, VML, ink, custom XML, authors, tags, and digital signatures are preserved or reported as explicit boundaries; they are never silently flattened or executed. Public responses expose opaque handles and standard capability descriptions only.

The 193-row foundation inventory is classified as 159 structured-partial, 32 preserve-imported-only, and 2 not-applicable/missing by design. That classification is a coverage ledger, not a claim that every imported proprietary part is authorable. Archive the finalized JSON spec, lock/dependency manifest, proof, and hashes before advancing.
