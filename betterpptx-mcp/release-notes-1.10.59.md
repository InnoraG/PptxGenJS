# BetterPPTX 1.10.59 — size-safe attachment offers

The 1.10.58 real ChatGPT Chat-mode test saved the existing native fixture and
reported a 22,527-byte package, one free publication and no rendering.
Its public link/replay checks preserved the operation, package hash, URL and
original expiry. Final allowance was one used, none reserved, two remaining;
effective customer price and queued customer credit usage were zero. Direct
resource retrieval was skipped because the numeric safe budget was not
discoverable. Independent downloaded-byte verification remains separately
scoped; a successful save is not proof of a ChatGPT attachment.

The shared protocol wrapper previously appended a resource_link even when
the reader had correctly selected link-only delivery for a large file. Hosts
can automatically materialize those attachment offers. The wrapper now uses
the same conservative 256 KiB policy as embedded delivery: only a known,
positive integer size within that budget may advertise an attachment.
Larger or unknown-size files retain the original URL and artifact metadata
in ordinary text/structured output without a resource_link or embedded blob.
The cutoff is product policy, not a measured universal ChatGPT limit.

Read-file responses now expose the numeric direct-resource budget, decoded
byte basis and larger-file link behavior from that same shared policy. A
client does not need to confuse chunk size with the resource budget or guess
whether a known small file is eligible. Actual HTTP/MCP serialization tests
use synthetic dispatcher results; they are not cloud compilation tests.

This change applies to save, operation recovery and file retrieval through
both HTTP and stdio. It does not change authorization, quotas, package bytes,
original 12-hour file/link expiry, or public input schemas. Small-file direct
delivery remains available. No new customer publication is needed to test
the protocol repair; read-only retrieval of the existing specimen is enough.

The independent browser attempt then reached a client-side storage-domain
block after the authorized redirect. This establishes a delivery limitation,
not an expired URL or its specific browser-policy cause. The existing edge
route now relays approved presentation bytes at the same public hostname:
the backend still validates the capability and original publication identity,
then the edge accepts only the configured bucket/prefix and matching filename
through one bounded signed GET. It does not expose the storage redirect,
forward browser credentials to storage, buffer the whole package, follow
another redirect, weaken browser protections, renew expiry or publish again.
GET/range/HEAD and negative-destination tests cover this separate boundary.
The relay adds an edge storage subrequest, not a new paid service or customer
charge authorization. Actual browser byte retrieval is verified separately.
