#!/usr/bin/env node
// Maintainer-only: summarize a V8 .cpuprofile by self time and by file.
// Usage: node analyze-cpuprofile-v1.mjs profile.cpuprofile [topN]

import fs from 'node:fs/promises'

const profilePath = process.argv[2]
const topN = Number(process.argv[3] || 25)
const profile = JSON.parse(await fs.readFile(profilePath, 'utf8'))

const nodesById = new Map(profile.nodes.map(node => [node.id, node]))
const selfMicros = new Map()
for (let i = 0; i < profile.samples.length; i += 1) {
	const id = profile.samples[i]
	const dt = profile.timeDeltas[i] || 0
	selfMicros.set(id, (selfMicros.get(id) || 0) + dt)
}

function label(node) {
	const frame = node.callFrame
	const url = String(frame.url || '').replace(/^file:\/\/\/?/, '').split(/[\\/]/).slice(-2).join('/')
	return `${frame.functionName || '(anonymous)'} @ ${url}:${(frame.lineNumber ?? -1) + 1}`
}

const byFunction = new Map()
const byFile = new Map()
let totalMicros = 0
for (const [id, micros] of selfMicros) {
	const node = nodesById.get(id)
	if (!node) continue
	totalMicros += micros
	const key = label(node)
	byFunction.set(key, (byFunction.get(key) || 0) + micros)
	const file = String(node.callFrame.url || '(v8)').replace(/^file:\/\/\/?/, '').split(/[\\/]/).slice(-1)[0] || '(v8)'
	byFile.set(file, (byFile.get(file) || 0) + micros)
}

console.log(`total sampled: ${Math.round(totalMicros / 1000)} ms\n`)
console.log('== top functions by self time ==')
for (const [key, micros] of [...byFunction.entries()].sort((a, b) => b[1] - a[1]).slice(0, topN)) {
	console.log(`${String(Math.round(micros / 1000)).padStart(8)} ms  ${key}`)
}
console.log('\n== top files by self time ==')
for (const [key, micros] of [...byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, topN)) {
	console.log(`${String(Math.round(micros / 1000)).padStart(8)} ms  ${key}`)
}
