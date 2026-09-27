#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const packageJson = JSON.parse(await readFile(new URL('package.json', root), 'utf8'))
const packageLock = JSON.parse(await readFile(new URL('package-lock.json', root), 'utf8'))
const releaseVersion = String(packageJson.version || '').trim()

assert.match(releaseVersion, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, 'package.json version must be valid SemVer')
assert.equal(packageLock.version, releaseVersion, 'package-lock.json top-level version must match package.json')
assert.equal(packageLock.packages?.['']?.version, releaseVersion, 'package-lock.json root-package version must match package.json')

const { PUBLIC_SEMANTIC_VERSION, TOOL_SCHEMA_VERSION, publicServerVersion } = await import('../public-manifest.mjs')
assert.equal(PUBLIC_SEMANTIC_VERSION, releaseVersion, 'public semantic version must be derived from package.json')
assert.equal(publicServerVersion(), `${releaseVersion}+${TOOL_SCHEMA_VERSION}`, 'MCP server version must bind the release and tool-contract versions')

console.log(JSON.stringify({
	status: 'PASS',
	releaseVersion,
	toolSchemaVersion: TOOL_SCHEMA_VERSION,
	mcpServerVersion: publicServerVersion(),
	authoritativeSource: 'betterpptx-mcp/package.json',
}, null, 2))
