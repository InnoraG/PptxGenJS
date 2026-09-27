# Native theme, master, layout, and inheritance authoring

Treat the theme/master/layout layer as editable presentation source, not as a
single template name. Discover the public contract with
`betterpptx.options.catalog` using `surface:"layouts-themes-masters"` and
`format:"full"` before authoring a reusable canvas or master.

The typed surface covers independent theme font/language leaves, custom layout
name/width/height/type/activation, per-slide `layoutName` and `masterName`
bindings, per-slide hidden/show-master-shapes/show-master-placeholder-animation
policies and slide-number fields, master title/background/margin/slide-number/header-footer visibility/object ownership,
typed master placeholder variants, and layout-contract policy
(`allowedLayouts`, `defaultLayout`, `strictLayout`, `placeholderBindings`,
and `safeContentAreas`). Layouts and masters also accept a native
`headerFooter` policy (`date`, `header`, `footer`, `slideNumber`; `show*`
aliases are accepted) that controls inherited PowerPoint `p:hf` visibility
flags independently from the positioned slide-number field. These controls are semantic
native bindings; they do not force a gallery choice and they remain durable in
`layouts[]`, `masters[]`, `layoutContract`, and slide fields in the JSON spec.

For a fully native reusable canvas, put editable placeholder variants on the
layout itself. `layouts[].placeholders[]` is serialized as a real PowerPoint
`slideLayout` part and can be selected by `slides[].layoutName`;
`masters[].placeholders[]` remains the master-owned carrier. If both
`layoutName` and the legacy `masterName` are present, the explicit
`layoutName` relationship wins and `masterName` is retained as semantic
metadata.

Use `layouts[].placeholders[]` or `masters[].placeholders[]` for real native placeholder definitions. Each
entry has a stable semantic `name`, an Office `type` (`title`, `body`, `pic`,
`chart`, `tbl`, `media`, or the supported header/footer/date variants), and
optional `idx`, `size`, position, and margin. Bind authored content by role:

```json
{
  "layoutContract": {
    "placeholderBindings": {
      "title": { "name": "heroTitle", "type": "title", "idx": 1, "size": "full" },
      "body": { "name": "bodyContent", "type": "body", "idx": 2, "size": "full" }
    }
  },
  "layouts": [{
    "name": "EditorialWide", "width": 13.333333, "height": 7.5,
    "headerFooter": { "date": true, "header": true, "footer": false, "slideNumber": true },
    "placeholders": [
      { "name": "heroTitle", "type": "title", "idx": 0, "x": 0.7, "y": 0.55, "w": 12, "h": 0.8 },
      { "name": "bodyContent", "type": "body", "idx": 1, "x": 0.7, "y": 1.7, "w": 12, "h": 5.2 }
    ]
  }],
  "masters": [{
    "title": "Editorial Master",
    "headerFooter": { "date": false, "header": false, "footer": true, "slideNumber": true },
    "placeholders": [
      { "name": "heroTitle", "type": "title", "idx": 1, "x": 0.7, "y": 0.55, "w": 12, "h": 0.8 },
      { "name": "bodyContent", "type": "body", "idx": 2, "x": 0.7, "y": 1.7, "w": 12, "h": 5.2 }
    ]
  }]
}
```

Set `role:"title"` or `role:"body"` on a text/image block to use the
matching binding. An object-level `placeholder` or `placeholderBinding`
overrides the role map. Set a named binding to `null`, or remove it, to restore
native placeholder matching; reset the master `placeholders` array to remove
the authored variants.

Precedence is explicit: an authored slide value wins over its master, the
master wins over the theme/default, and omission or `null` removes only the
authored override. In particular, `slides[].background:null` restores the
master/theme carrier, while `masters[].background:null` restores the theme
carrier. Use `strictLayout:true` only when the listed layout set is complete;
otherwise keep the contract permissive and let the client inspect the served
layout audit before binding a slide.

`slides[].showMasterShapes` and `slides[].showMasterPhAnim` map directly to the
native `p:sld` visibility attributes and accept `null` through a semantic
`betterpptx.deck.generate_from_spec` patch to restore the host default. The
public `slides[].showMasterBackground` field is a
semantic alias for `slides[].showMasterShapes` (PowerPoint's **Hide Background
Graphics** control): both serialize to the same native `p:sld@showMasterSp`
carrier. PowerPoint has no standalone boolean `showMasterBackground` attribute
in `p:sld`, so clients must not invent one. Setting either alias to `null` (or
the default `true`) removes the authored override and restores inherited master
background-graphics visibility; `showMasterPhAnim` remains a separate policy.

For `multiple slide masters`, preserve the source template as a typed carrier
set rather than flattening it into one master. A portable spec should use
`template.preserveLayouts:true`, inspect `nativeTemplateLayouts` and
`nativeTemplateMasters`, and bind each slide with its audited `layoutName` (or
the legacy `masterName`). Every layout-to-master relationship, source identity,
background, placeholder set, and relationship-kind count stays separate. Sparse
edits belong in `patchPlan.templateCarriers`; `reset:true` restores the exact
source carrier and its relationship graph. This is the generic path for Office
themes, corporate masters, and any future template gallery—not a hard-coded
two-master special case.

Use opaque template or asset handles on public surfaces. Never put a local
filesystem path, private master part name, or server implementation detail in a
shared spec. `placeholderBindings` and `safeContentAreas` are policy/readback
contracts: they describe how content may bind to a template, while the engine
keeps native relationships, geometry, and package assembly safe. The public
catalog reports `layout.placeholderVariants` as structured-partial because
exhaustive Office gallery/template variants are still open—not because the
semantic carrier is flattened. Custom layout placeholder definitions now
create native slide-layout parts; imported template layouts remain the exact
carrier when a source template is supplied.

When a portable spec supplies an opaque `template.handle`, or an allowed
`template.data`/remote template source, the builder first promotes that source
to a deterministic opaque template handle and audits
the complete source gallery and materializes every authored slide-layout
carrier—not just the canvas size. Each source layout keeps its native number,
name, type, master binding, and placeholder variants in the readback contract;
new slides can select any audited layout by `layoutName`, while the source
package remains the authoritative Office carrier. Inspect the returned
`nativeTemplateLayouts`, `nativeTemplateMasters`, `templateRelationshipBindings`,
and `layoutAudit` before choosing a strict policy. The readback includes fixed
layout/master object identities, persisted background references, slide-number
fields, linked master-layout object carriers, and source slide-to-layout bindings; values that PowerPoint does not
persist (such as a template margin policy) are returned as an explicit null
boundary rather than guessed. This is the generic template-import path for
multi-layout decks; do not rebuild a template by guessing coordinates or by
copying a single preset.

Each audited fixed object also exposes typed native visual descriptors when
PowerPoint persisted them: `fill` (solid, gradient, or pattern colour/stops),
`line` (width, colour, and dash), `picture` (relationship identity, crop, and
tile/stretch placement), and `effects.components` (blur, glow, shadow,
reflection, and related effect attributes). These descriptors are readback
metadata for the editable carrier; an omitted descriptor means the source did
not persist that component, not that a default was invented. Picture media
handles and private relationship targets remain opaque on public surfaces.

Imported layout and linked master-owned carriers are re-editable through the
governed JSON-spec patch front door. Put
`templateCarriers:[{name, kind, objects, background, margin, slideNumber, headerFooter}]`
under `patchPlan` (or `edits`/`edition`); omit `kind` for a layout, or set
`kind:"master"`/`carrierType:"master"` for the linked master carrier. A
targeted edit removes only that carrier's raw XML, materializes untouched
source shapes as narrow native passthrough objects, and emits the changed
carrier through the normal editable serializer. Multiple entries are applied
as one sparse patch transaction. Set `reset:true` to restore the exact source
carrier and its relationship part. The response reports typed carrier
readback, stable source identity, linked-layout metadata, and reset/re-edit
state. Public clients use the opaque carrier name/handle only; never author
package paths or relationship IDs. Relationship-bearing master objects are
preserved generically: retained source image/chart/tag/external relationship
edges are remapped away from generated IDs when a single-master carrier is
materialized, and remain byte-preserved in the opaque master carrier for a
multi-master source. The typed readback reports relationship-kind counts for
image, chart, external, tag/custom-XML, embedded, and future/other edges; it
never reports relationship targets or server paths. New relationship families
still require their own proof case.

When the source package contains more than one Office-authored master, keep
the master set and each layout-to-master binding as separate carriers. The
generated layout relationship must continue to point to its audited source
master; never collapse all layouts onto the library's primary editable master.
For a single-master source, the primary master may use the normal native
serializer. When more than one Office-authored master is present, the primary
and additional masters are edited through opaque raw carriers that preserve
their source XML and relationship graphs, support sparse native object edits,
and restore the exact source parts on `reset:true`. This keeps chart, tag,
external, embedded, image, and future relationship edges attached to the
correct source carrier instead of collapsing them onto master1. This is still
generic carrier behavior: the public client sees only master names, numbers,
typed readback, and relationship-kind counts, not package paths or
relationship IDs.

This family is currently `structured-partial`: the semantic controls are
executable and resettable, but exhaustive Office gallery/theme/master inventory
and every template-specific placeholder rendering variant still require
PowerPoint-authored comparison evidence. Do not report this local proof as
universal 2,258-row closure.
