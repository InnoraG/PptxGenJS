#!/usr/bin/env node
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const sourcePath = fileURLToPath(new URL('./verify-public-smartart-family-v1.mjs', import.meta.url))
const source = await fs.readFile(sourcePath, 'utf8')
const needle = "const bad={...spec,title:'SmartArt boundary'};bad.slides[0].content[0].fontSize=400.1;"
const replacement = "const bad={...spec,title:'SmartArt boundary',slides:spec.slides.map(slide=>({...slide,content:slide.content.map((item,index)=>index===0?({...item,fontSize:400.1,style:{...(item.style||{}),fontSize:400.1}}):item)}))};"
if (!source.includes(needle)) throw new Error('SmartArt boundary probe source shape changed')
await import(`data:text/javascript;base64,${Buffer.from(source.replace(needle, replacement)).toString('base64')}`)
