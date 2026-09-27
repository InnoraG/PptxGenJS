#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import {
	applyMatteMaterialProfile,
	applyMixamoNonMetalMaterialProfile,
	inspectMaterialProfile,
} from './glb-material-profile.mjs'

function parseArgs(argv) {
	const args = {}
	for (let index = 0; index < argv.length; index++) {
		const key = argv[index]
		if (!key.startsWith('--')) continue
		const value = argv[index + 1]
		if (!value || value.startsWith('--')) args[key.slice(2)] = true
		else {
			args[key.slice(2)] = value
			index++
		}
	}
	return args
}

const sha256 = buffer => createHash('sha256').update(buffer).digest('hex')
const args = parseArgs(process.argv.slice(2))
if (!args.input || !args.output) {
	throw new Error('Usage: apply-glb-material-profile.mjs --input <glb> --output <glb> [--profile mixamo-source-specular|mixamo-strict-matte|matte] [--report <json>]')
}

const input = path.resolve(args.input)
const output = path.resolve(args.output)
const profile = args.profile || 'mixamo-source-specular'
const source = readFileSync(input)
let result
if (profile === 'mixamo-source-specular') result = applyMixamoNonMetalMaterialProfile(source, { keepSourceSpecular: true })
else if (profile === 'mixamo-strict-matte') result = applyMixamoNonMetalMaterialProfile(source, { keepSourceSpecular: false })
else if (profile === 'matte') result = applyMatteMaterialProfile(source)
else throw new Error(`Unknown material profile: ${profile}`)

mkdirSync(path.dirname(output), { recursive: true })
writeFileSync(output, result.buffer)
const report = {
	schemaVersion: 'betterpptx.glb-material-profile.v1',
	input,
	output,
	profile,
	beforeBytes: source.length,
	afterBytes: result.buffer.length,
	beforeSha256: sha256(source),
	afterSha256: sha256(result.buffer),
	changed: result.changed,
	materialCount: result.materialCount,
	beforeMaterials: inspectMaterialProfile(source),
	afterMaterials: inspectMaterialProfile(result.buffer),
}
const reportPath = path.resolve(args.report || `${output}.report.json`)
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
console.log(JSON.stringify(report, null, 2))
