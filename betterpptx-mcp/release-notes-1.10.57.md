# BetterPPTX 1.10.57 — durable result and cold-save parity

## Browser-reproduced defect

The 1.10.56 Chat-mode compile reached materialization, but recording its result
failed because an optional billing operation label was undefined. No save was
invoked and no publication was consumed. A worker draft may have persisted;
an empty in-memory deck listing is not proof of rollback.

Operation persistence now applies one explicit JSON representation to both
local and distributed records: absent optional object fields are omitted,
array positions are retained as null, and explicit null/false/zero survive.
Invalid non-JSON payloads reject. Quote and request digest generation is not
changed, and global database field validation is not relaxed.
Completion failures return an owned operation recovery anchor, not provider
field paths or a false claim that materialization was rolled back.
Lost acknowledgements recover a confirmed stored success only when owner,
tool, and immutable request identities match. Unknown outcomes remain explicitly
unconfirmed and do not recommend blindly repeating a mutation with a new key.

## Separate cold-worker save regression

A strict gateway validation could not survive as in-memory evidence on a cold
save worker. An authenticated queued worker now validates its actual owned,
version-checked rehydrated deck strictly before the existing save gates when
production uses deterministic non-rendering validation. Evidence is newly
measured for that materialization, not copied from the gateway. Failed checks
still block save. Stronger rendering-required policies remain unchanged.

The strict distributed-store fixture rejects undefined values, and a separate
process exercises gateway validation followed by cold-worker save. These are
local conformance tests, not a claim of browser delivery or PowerPoint review.

## Delivery policy unchanged

Direct embedded delivery is conservatively bounded; larger resource requests
return a download link without embedding file bytes. The 256 KiB safety budget
is BetterPPTX policy, not an established universal ChatGPT attachment limit.
The link and retained file share the original 12-hour publication window.
Re-download and identical save replay do not grant a new window/publication.

No user quota reset, paid work, authentication relaxation, hosted renderer,
or independently assembled presentation is part of this repair. Public tool
schemas are unchanged; the release version advances to 1.10.57.
