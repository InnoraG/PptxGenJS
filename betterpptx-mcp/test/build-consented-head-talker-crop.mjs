#!/usr/bin/env node
// Private consented-research fixture only. Spatial crop and deterministic
// resize; no retouching, enhancement, relighting, or identity modification.
import path from 'node:path'
import sharp from 'sharp'

const source = path.resolve('consentedHumanAsset/IMG_20231114_163611_751.jpg.jpeg')
const output = path.resolve('betterpptx-mcp/outputs/consented-head-talker-face-crop-long.png')
await sharp(source)
	.extract({ left: 0, top: 380, width: 1440, height: 1800 })
	.resize(512, 640, { fit: 'fill' })
	.png()
	.toFile(output)
console.log(output)
