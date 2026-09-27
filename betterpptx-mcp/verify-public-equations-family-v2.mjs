#!/usr/bin/env node
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
const sourcePath = fileURLToPath(new URL('./verify-public-equations-family-v1.mjs', import.meta.url))
const source = await fs.readFile(sourcePath, 'utf8')
const needle = "({...item,parameters:{lower:'t=1',upper:'n',body:'x'.repeat(4001)}})"
const replacement = "({...item,equationGalleryPresetId:'not-a-real-equation-preset'})"
if (!source.includes(needle)) throw new Error('Equation boundary probe source shape changed')
await import(`data:text/javascript;base64,${Buffer.from(source.replace(needle, replacement)).toString('base64')}`)
