#!/usr/bin/env node
// Compatibility entry point: the Authoring Excellence contract is now embedded
// in generate_from_spec and enforced through the live MCP transport.
await import('./verify-live-mcp-authoring-pipeline-v1.mjs')
