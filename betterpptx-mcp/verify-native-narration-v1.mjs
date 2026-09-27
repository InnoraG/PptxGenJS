#!/usr/bin/env node

// Maintainer evidence check only.  This verifier intentionally does not create
// a deck or import the private engine: current narration proof must come from
// artifacts regenerated through the public MCP Authoring Excellence route.
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateAvatarNarrationPackage } from './avatar/validate.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const manifestPath = path.join(here, 'docs', 'release-safety', 'G1-PRODUCTION-DELIVERY-RELEASE-MANIFEST.json')

function fail(message, detail = {}) {
	console.error('NATIVE NARRATION V1 VERIFY: FAIL')
	console.error(message)
	if (Object.keys(detail).length) console.error(JSON.stringify(detail, null, 2))
	process.exitCode = 1
}

const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
const artifacts = Array.isArray(manifest.artifacts) ? manifest.artifacts : []
const results = []
for (const artifact of artifacts) {
	const filePath = path.resolve(here, '..', artifact.path)
	try {
		const stat = await fs.stat(filePath)
		const scopedManifest = {
			...manifest,
			slides: artifact.playbackContract?.slides || undefined,
		}
		const validation = await validateAvatarNarrationPackage(filePath, scopedManifest)
		const nativeMarker = validation.perSlide.length > 0 && validation.perSlide.every(slide => slide.hasNativeNarrationMarker === true)
		const result = {
			id: artifact.id,
			bytes: stat.size,
			packageValid: validation.ok,
			nativeNarrationMarker: nativeMarker,
			issues: validation.issues,
		}
		results.push(result)
		if (!validation.ok || !nativeMarker) fail(`MCP-regenerated artifact ${artifact.id} is missing the native narration contract.`, result)
	} catch (error) {
		fail(`Could not validate MCP-regenerated artifact ${artifact.id}.`, { error: error?.message || String(error) })
	}
}

if (artifacts.length === 0) fail('Release manifest contains no narration artifacts.')
if (process.exitCode) process.exit(process.exitCode)
console.log('NATIVE NARRATION V1 VERIFY: PASS')
console.log(JSON.stringify({
	schemaVersion: 'betterpptx.native-narration-package-proof.v2',
	route: manifest.regeneration?.route || null,
	artifacts: results,
}, null, 2))
