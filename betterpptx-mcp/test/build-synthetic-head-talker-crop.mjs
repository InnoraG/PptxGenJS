#!/usr/bin/env node
// Deterministic spatial crop only: no enhancement, restyling, or face edit.
// This is the dedicated head-talker input for the motion A/B comparison.
import path from 'node:path'
import sharp from 'sharp'

const source = path.resolve('research-demos/2026-07-18-meshy-avatar/visual-artifacts/meshy-poster/meshy-native-poster.png')
const output = path.resolve('betterpptx-mcp/outputs/presenter-head-talker-face-crop.png')
// Poster is 640x640; retain head, neck, and only a tiny shoulder transition.
// This is intentionally not a bust/full-body frame: the native MuseTalk face
// region is 256x256 and the surrounding canvas should remain head-talker scale.
await sharp(source).extract({ left: 195, top: 82, width: 110, height: 112 }).resize(512, 512, { fit: 'contain', background: { r: 8, g: 14, b: 26 } }).png().toFile(output)
console.log(output)
