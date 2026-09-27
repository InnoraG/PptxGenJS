# BetterPPTX Public Authoring Environment

BetterPPTX helps an AI create, revise, validate, preview, and release a real
PowerPoint presentation through a public MCP product surface.

This repository is the public teaching environment for that AI. It contains
the BetterPPTX skill, workflow references, trust boundaries, and release
discipline. It contains no BetterPPTX implementation or private operating
material.

## Why this environment exists

General model training tends to describe ordinary slide-making. BetterPPTX can
execute a much richer native PowerPoint vocabulary. The public curriculum
bridges that gap without giving the AI private implementation access:

- the AI remains the creative director and chooses story, art direction,
  composition, native media, typography, motion, and timing;
- BetterPPTX resolves mechanics, checks factual constraints, and builds the
  package;
- public catalogs and help expose executable possibilities without choosing
  the design for the AI;
- full-slide previews and validators create an improvement loop before the
  release boundary;
- a blind critic can grade the released artifact but cannot rescue it.

## Start here

AI clients should read [AGENTS.md](AGENTS.md), then load
[the BetterPPTX skill](skills/betterpptx/SKILL.md). The skill routes to focused
references only when they are relevant.

Users can read:

- [MCP connection and workflow](MCP.md)
- [how the public authoring environment learns](docs/authoring-environment.md)
- [unranked public capability atlas](CAPABILITY_ATLAS.md)
- [communication-problem casebook](CASEBOOK.md)
- [developer-to-public teaching-gap ledger](TEACHING_GAP_LEDGER.md)
- [teaching-release integrity](docs/teaching-release.md)
- [cold-client forward tests](docs/forward-tests.md)
- [privacy boundary](PRIVACY.md)
- [security boundary](SECURITY.md)

## First-time-right means first public release

First-time-right does not mean the first compile or the first validation pass.
During development, the AI may iterate through semantic dry-runs, commits,
validators, and full-slide previews. The boundary is
`betterpptx.deck.save`: once the accepted candidate is frozen and saved, that
first public artifact should already be near-perfect and should not require the
user to enter a routine repair loop.

## Authority and freshness

The published skill teaches the workflow. The connected MCP's public tool
schemas, capabilities, and catalogs are the authority for currently executable
fields and IDs. If the two disagree, the AI must not invent a workaround; it
must follow the live public contract and report the teaching drift.

`betterpptx-public-manifest.json` binds every projected file by SHA-256. A
teaching release is eligible for cold certification only when its manifest,
repository revision, installed skill bytes, and public MCP fingerprints are
frozen for the entire run.
