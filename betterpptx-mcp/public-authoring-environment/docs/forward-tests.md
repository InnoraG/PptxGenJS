# Cold-client forward tests

Every teaching release should be tested in a fresh client profile with empty
caches and no access to the developer workspace, private repository, or prior
conversation.

## Minimum canaries

1. New deck: discover capabilities, choose a non-basic visual treatment, build
   through the semantic spec lifecycle, review every slide, and stop before
   save unless the candidate is approved.
2. Bounded revision: open an uploaded deck, export its semantic model, change
   one exact target, and prove unrelated slides, notes, native objects, and
   design inheritance remain unchanged.
3. Motion and narration: choose native motion and narration deliberately,
   freeze resolved timing, prove a complete reduced/static reading mode, and
   invoke no talking-head generation.

## Evidence

Record only public inputs and results: teaching manifest, tool fingerprints,
prompt hash, tool calls, semantic choice trace, validation reports, preview
hashes, plan digests, save count, PPTX hash, PowerPoint renders, and blind review.

The test author must not provide an expected deck, hidden style answer, source
hint, or developer conversation. Success means the public environment taught a
fresh AI enough to make the decisions itself.

## Promotion rule

Run forward tests against a release candidate, then publish that exact tested
revision. Never test one curriculum and silently publish another.

## Local executable pre-save protocol canary

Development includes one executable, non-certifying canary for the basic
new-deck protocol. It starts a fresh client process in an empty temporary
workspace containing only a frozen public teaching environment and an original,
unsealed prompt fixture. The client records environment, skill, help, and tool
fingerprints; checks that prohibited introspection and direct-edit names are not
callable; then performs discovery, dry run, commit, validators, and disposal.
The harness independently observes the public tool transcript and requires zero
save calls, zero provider-capable calls, and zero presentation artifacts.

The canary follows the published progressive route: authentication status,
summary capability and workflow discovery, then one focused semantic-spec
recipe before composition. It does not request broad capability help merely to
obtain an example.

This canary deliberately fails closed at preview when authoritative preview
infrastructure is absent. That result proves only that unavailable preview is
not silently accepted; it is not a preview acceptance result and proves no
visual quality.

The file-read boundary is enforced and observed by the client application, not
by an operating-system filesystem sandbox. Runtime system calls are not audited.
The executor is deterministic and composes a fixed basic protocol specimen from
the public skill guidance, so it does not evaluate a fresh AI's authoring
judgment. These limitations always set certification eligibility to false.

This is one basic new-deck protocol canary, not the full W12 held-out forward-test
matrix. It does not prove uploaded-deck revision preservation, data-driven
storytelling, image or native 3D authoring, motion, narration, presenter
authoring, broad accessibility quality, successful authoritative preview, or
the one-save release boundary. Those remain separate held-out certification
lanes.
