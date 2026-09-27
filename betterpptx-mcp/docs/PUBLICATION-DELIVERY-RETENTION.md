# Publication delivery and retention (1.10.42)

The published PPTX is not stored in ChatGPT. An MCP result containing a large
file can exhaust a chat's context even when the server can transmit it. One
17,215,008-byte deck triggered ChatGPT's conversation-length error; this is
observed behavior, not a published universal ChatGPT file-size limit.

Normal `betterpptx.operation.read_file` delivery is `mode:"link"`: it returns
an owner-issued browser URL, byte count, SHA-256, file name, link expiry, and
artifact expiry without file bytes in the tool result. `mode:"resource"` is
only attempted for files at most 256 KiB; above that it falls back to the link.
This conservative threshold is a product safety setting, not a measured host
maximum. `mode:"chunk"` remains available for explicit bounded retrieval.

The link is a short-lived bearer grant (10 minutes) for a single owned file.
ChatGPT currently appends `utm_source=chatgpt.com` to rendered Markdown links;
the download route ignores only that non-authorizing field and still verifies
the exact signed permit. Other unexpected query fields remain rejected.
The underlying file has a separate retention expiry. `operation.status` or
`operation.read_file` can mint a fresh link while the file is retained,
without another save, charge, or publication. The durable operation ID is the
recovery reference. A link must not be described as permanently valid.

New local publications default to 30 days of retention. Existing files keep
their issued expiry. A configured `BETTERPPTX_ARTIFACT_TTL_MS` may override the
default; public results must report the actual per-file expiry. The local
storage budget defaults to 2 GiB. Reaching it now refuses new publication
storage instead of silently evicting unexpired files. Physical disk failure,
lost backups, or an operator changing retention can still affect availability.

This is a bounded low-cost policy, not free perpetual hosting. The user should
download and keep an owned copy after publication; BetterPPTX should preserve
portable source and media separately for authorized regeneration. A durable
owner-authenticated library, monitored replicated storage, retention notices,
and optional user-owned export are needed before promising longer-term
availability. Any extension must budget bytes, egress, backups, and recovery;
short-lived link renewal cannot substitute for retained bytes.

Production safety: public URLs never expose server paths; bare file routes
require the verified owner; browser grants are scoped and expire; capacity
failure must not debit or consume a publication. Test link recovery and final
bytes through a supported ChatGPT Chat-mode client before calling this path
fully verified.
