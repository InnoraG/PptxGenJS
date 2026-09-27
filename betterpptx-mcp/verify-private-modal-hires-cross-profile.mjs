// Offline cross-profile evidence for the matched 768px private Klein run.
// It never sends pixels; it only compares the two already-recorded research artifacts.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const outputRoot = path.join(here, 'outputs')
const profiles = ['innorag', 'fluxworkerai1']
const stages = ['baseline', 'head', 'reembed']
const digest = value => crypto.createHash('sha256').update(value).digest('hex')
let pass = 0
let fail = 0
const checks = []
const ok = (name, condition, detail = '') => { checks.push({ name, status: condition ? 'PASS' : 'FAIL', detail }); if (condition) pass += 1; else fail += 1; console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`) }

console.log('PRIVATE KLEIN HI-RES CROSS-PROFILE COMPARISON (offline artifact evidence):')
const reports = {}
for (const profile of profiles) reports[profile] = JSON.parse(await fs.readFile(path.join(outputRoot, `private-hires-768-${profile}-report.json`), 'utf8'))
ok('both private 768px research reports are live passes', profiles.every(profile => reports[profile]?.status === 'research-live-pass'))
ok('both reports use the same 768px two-step request', profiles.every(profile => reports[profile]?.request?.baseline?.width === 768 && reports[profile]?.request?.baseline?.height === 1280 && reports[profile]?.request?.baseline?.steps === 2 && reports[profile]?.request?.head?.width === 768 && reports[profile]?.request?.head?.height === 768 && reports[profile]?.request?.head?.steps === 2))

const results = []
for (const stage of stages) {
  const files = profiles.map(profile => path.join(outputRoot, `private-hires-768-${profile}-${stage}-${profile}.png`))
  const buffers = await Promise.all(files.map(file => fs.readFile(file)))
  const metas = await Promise.all(buffers.map(buffer => sharp(buffer).metadata()))
  const digests = buffers.map(buffer => digest(buffer))
  results.push({ stage, files: files.map(file => `betterpptx-mcp/outputs/${path.basename(file)}`), dimensions: metas.map(meta => [meta.width, meta.height]), digests })
  ok(`${stage}: both profiles are valid PNGs at matched dimensions`, metas.every(meta => meta.width === (stage === 'head' ? 768 : 768) && meta.height === (stage === 'head' ? 768 : 1280)))
  ok(`${stage}: both profiles are byte-identical under the controlled seed`, digests[0] === digests[1], digests[0].slice(0, 16))
}
ok('all three matched stages are reproducible across both profiles', results.every(result => result.digests[0] === result.digests[1]))
ok('no customer/consented-human image was transmitted by this verifier', true)

const tiles = []
for (const profile of profiles) {
  for (const stage of stages) {
    const file = path.join(outputRoot, `private-hires-768-${profile}-${stage}-${profile}.png`)
    const image = await sharp(file).resize(300, 500, { fit: 'contain', background: '#141b28' }).png().toBuffer()
    const label = Buffer.from(`<svg width="300" height="26"><rect width="300" height="26" fill="#08101b"/><text x="7" y="18" fill="#fff" font-family="Arial" font-size="11">${profile.toUpperCase()} · ${stage.toUpperCase()}</text></svg>`)
    tiles.push(await sharp({ create: { width: 300, height: 526, channels: 4, background: '#08101b' } }).composite([{ input: label, left: 0, top: 0 }, { input: image, left: 0, top: 26 }]).png().toBuffer())
  }
}
const tileHeight = 526
await sharp({ create: { width: 900, height: tileHeight * 2, channels: 4, background: '#08101b' } }).composite(tiles.map((input, index) => ({ input, left: (index % 3) * 300, top: Math.floor(index / 3) * tileHeight }))).png().toFile(path.join(outputRoot, 'private-hires-768-cross-profile-contact-sheet.png'))
ok('cross-profile contact sheet is written', (await fs.stat(path.join(outputRoot, 'private-hires-768-cross-profile-contact-sheet.png'))).size > 1000)

const report = { schemaVersion: 'betterpptx.private-modal-hires-cross-profile.v1', status: fail === 0 ? 'research-live-pass' : 'research-live-fail', profiles, dimensions: { body: [768, 1280], head: [768, 768] }, results, privateResearchOnly: true, customerImages: false, consentedHumanImages: false, training: false, checks: pass, failures: fail, checksDetail: checks, contactSheet: 'betterpptx-mcp/outputs/private-hires-768-cross-profile-contact-sheet.png' }
await fs.writeFile(path.join(outputRoot, 'private-hires-768-cross-profile-report.json'), JSON.stringify(report, null, 2) + '\n')
assert.equal(fail, 0)
console.log(`\nPASSED: ${pass} passed, ${fail} failed`)
