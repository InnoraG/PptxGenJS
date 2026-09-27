#!/usr/bin/env node
// Compatibility entry point: Director gating is now proven at the stronger
// live-MCP + JSON-spec boundary.
await import('./verify-live-mcp-authoring-pipeline-v1.mjs')
