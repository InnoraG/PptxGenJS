# The public authoring environment

BetterPPTX treats advanced presentation quality as a learned public workflow,
not as a hidden developer trick.

## Four information-isolated roles

The same underlying AI model may perform several roles. Certification requires
each role to have a fresh context and an enforced input boundary. Development
curriculum canaries may use a self-attested boundary only when they are clearly
labelled non-certifying.

| Role | Allowed inputs | Responsibility |
| --- | --- | --- |
| Cold author | User request, frozen public curriculum, public MCP results | Create the release candidate |
| Developer | Product source, tests, diagnostics, calibration evidence | Improve general product behavior |
| Blind critic | Original request, immutable released PPTX, PowerPoint renders | Grade without editing or rescue |
| Curriculum curator | Generalized findings and public-safe evidence | Improve the next public teaching release |

Developer-only knowledge cannot assist a certified cold author directly. A
useful insight must first become one of:

- a public capability, schema, catalog, example, or skill instruction;
- a factual public dry-run, validation, preview, or readback;
- an engine invariant applied automatically to every client.

Deck-specific answers, benchmark prompts, private diagnostics, aesthetic
rankings, and hidden coaching are never curriculum.

## The improvement loop

1. A cold AI authors through the current frozen teaching release and public MCP.
2. Objective checks and blind review classify any weakness as AI judgment,
   execution, validator coverage, or subjective alternative.
3. The developer improves the smallest reusable product or public-teaching
   surface.
4. The curator publishes only generalized, black-box-safe learning.
5. A fresh cold AI must demonstrate the improvement without private context.

The developer-to-public teaching-gap ledger binds each proposed lesson to its
evidence, target public artifact or universal invariant, fresh-context test,
and teaching-release manifest. A lesson remains unverified until that test
passes through the public boundary.

This loop lets the AI become an evolved authoring expert beyond generic model
training while keeping the MCP a real public product boundary.

## Authoritative preview dependency

Public FTR certification also has an external infrastructure boundary. The
connected deployment must be able to render the exact frozen PPTX through an
approved PowerPoint-capable service. Cold authors read this status from
`help.capabilities.releaseInfrastructure.authoritativePreview`.

When that status is `external-infrastructure-required`, preview and save remain
fail-closed. The candidate may continue through authoring and validation, but it
must stay unsaved and cannot be called release-ready. Package inspection, a
contact sheet, or a non-authoritative renderer cannot substitute for this gate.
