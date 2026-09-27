# BetterPPTX release-version rule

`betterpptx-mcp/package.json` is the authoritative semantic release-version source.

For every BetterPPTX release:

1. Update `package.json` with `npm version <major|minor|patch|x.y.z> --no-git-tag-version`, or update `package.json` and both root entries in `package-lock.json` together.
2. Increment `TOOL_SCHEMA_VERSION` in `public-manifest.mjs` whenever an advertised tool record, public schema, or public response contract changes.
3. Run `npm run verify:release-version` before deployment.
4. Restart the named BetterPPTX MCP and verify `initialize.serverInfo.version`, `/health`, and `betterpptx.help.capabilities` through the public endpoint.
5. Rescan or reinstall a private plugin connection. For a published listing, create, review, and publish a new plugin version when listing metadata changes.

The MCP initialization version is generated as:

```text
<package semantic version>+<tool schema version>
```

`BETTERPPTX_PUBLIC_VERSION` is retained only as a deployment consistency assertion. If supplied, it must exactly match `package.json`; it cannot override the release version silently.

Build identity, source identity, capability digests, and tool-schema digests remain separate evidence and must not be substituted for the human-facing semantic release version.
