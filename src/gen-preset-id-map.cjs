/**
 * gen-preset-id-map.cjs
 *
 * Generates dist/preset-id-map.json by:
 * 1. Compiling gen-animations-registry-merged.ts to CJS (temp file)
 * 2. require()-ing it directly
 * 3. Building the presetId → effectName map
 * 4. Writing dist/preset-id-map.json
 *
 * Run after tsc build: node src/gen-preset-id-map.cjs
 * Called by gulpfile.js 'presetIdMap' task after 'build'
 */

'use strict'

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const rootDir = path.resolve(__dirname, '..')
const tmpDir = path.join(rootDir, 'dist', '_tmp_registry')
const registryTs = path.join(rootDir, 'src', 'gen-animations-registry-merged.ts')
const typesTs = path.join(rootDir, 'src', 'gen-animations-registry-types.ts')

// Step 1: compile only the registry + types to CJS in a temp folder
fs.mkdirSync(tmpDir, { recursive: true })
fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ type: 'commonjs' }, null, 2))
execSync(
	`npx tsc ${registryTs} ${typesTs} --module commonjs --target es2016 --moduleResolution node --outDir "${tmpDir}" --allowSyntheticDefaultImports --declaration false --sourceMap false`,
	{ stdio: 'inherit', cwd: rootDir }
)

// Step 2: require the compiled registry
const registry = require(path.join(tmpDir, 'gen-animations-registry-merged.js'))
const ANIMATION_REGISTRY_MERGED = registry.ANIMATION_REGISTRY_MERGED

// Step 3: build the presetId_class → effectName map
const presetIdMap = {}

for (const [effectName, config] of Object.entries(ANIMATION_REGISTRY_MERGED)) {
	const pid = config.presetId
	if (!pid) continue

	const pc = config.presetClass || null

	if (pc) {
		// Motion paths / emphasis with explicit presetClass (e.g. 'path', 'emph')
		presetIdMap[`${pid}_${pc}`] = effectName
	} else {
		// Entrance/exit — register for both (same presetId reused for entrance and exit)
		presetIdMap[`${pid}_entr`] = effectName
		presetIdMap[`${pid}_exit`] = effectName
	}
}

// Step 4: add mediacall entries (PowerPoint internals, not in animation registry)
presetIdMap['1_mediacall'] = 'mediaplay'
presetIdMap['2_mediacall'] = 'mediapause'
presetIdMap['3_mediacall'] = 'mediastop'

// Step 4b: build the subtype direction map keyed by presetId_presetClass_subtype → directionName
// This is effect-specific — different effects use different direction names for the same subtype
const subtypeDirectionMap = {}

for (const [effectName, config] of Object.entries(ANIMATION_REGISTRY_MERGED)) {
	const pid = config.presetId
	if (!pid || !config.directions || config.directions.length === 0) continue

	const pc = config.presetClass || null
	const classes = pc ? [pc] : ['entr', 'exit']

	for (const cls of classes) {
		for (const dir of config.directions) {
			if (dir.presetSubtype !== undefined) {
				subtypeDirectionMap[`${pid}_${cls}_${dir.presetSubtype}`] = dir.name
			}
		}
	}
}

// Step 5: clean up temp folder
fs.rmSync(tmpDir, { recursive: true, force: true })

// Step 6: write preset-id-map.json
const outPath = path.join(rootDir, 'dist', 'preset-id-map.json')
fs.writeFileSync(outPath, JSON.stringify(presetIdMap, null, 2))
console.log(`✅ Generated dist/preset-id-map.json (${Object.keys(presetIdMap).length} entries)`)

// Step 7: write subtype-direction-map.json
const subtypePath = path.join(rootDir, 'dist', 'subtype-direction-map.json')
fs.writeFileSync(subtypePath, JSON.stringify(subtypeDirectionMap, null, 2))
console.log(`✅ Generated dist/subtype-direction-map.json (${Object.keys(subtypeDirectionMap).length} entries)`)

// Step 8: build and write default-duration-map.json
// Key format: "presetId_presetClass" → defaultDuration (ms)
// Used by decypher tool to look up canonical duration for complex animations (durationIsSubPart)
const defaultDurationMap = {}
for (const [effectName, config] of Object.entries(ANIMATION_REGISTRY_MERGED)) {
	const pid = config.presetId
	if (!pid || !config.defaultDuration) continue
	const pc = config.presetClass || null
	const classes = pc ? [pc] : ['entr', 'exit']
	for (const cls of classes) {
		const key = `${pid}_${cls}`
		// Only set if not already set, or if this entry is more specific (has explicit presetClass)
		if (!defaultDurationMap[key] || pc) {
			defaultDurationMap[key] = config.defaultDuration
		}
	}
}
const durationPath = path.join(rootDir, 'dist', 'default-duration-map.json')
fs.writeFileSync(durationPath, JSON.stringify(defaultDurationMap, null, 2))
console.log(`✅ Generated dist/default-duration-map.json (${Object.keys(defaultDurationMap).length} entries)`)
