// Integration test for the "invalid effect / bad emission" class that dry-run cannot catch:
// for EVERY world, commit + SAVE a deck that exercises the auto-synced build (uses the world's
// build effect — brutalist/editorial are build:'none') AND a 3D model animation (turntable /
// arrive / swing / jumpAndTurn — must NOT be coerced by the animation guard). A world PASSES
// only if commit AND save succeed; exits non-zero if any world fails.
// Run: npm run test:worlds-save
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import JSZip from 'jszip'
import { readFileSync } from 'node:fs'

// The matrix is about authoring/world/3D serialization, not Piper deployment.
// Keep it deterministic by provisioning a local in-process WAV endpoint instead
// of accidentally depending on a developer's service at 127.0.0.1:5000.
function silentWav(durationMs = 900, sampleRate = 22050) {
  const samples = Math.max(1, Math.round(sampleRate * durationMs / 1000))
  const dataBytes = samples * 2
  const wav = Buffer.alloc(44 + dataBytes)
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + dataBytes, 4); wav.write('WAVE', 8)
  wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20)
  wav.writeUInt16LE(1, 22); wav.writeUInt32LE(sampleRate, 24)
  wav.writeUInt32LE(sampleRate * 2, 28); wav.writeUInt16LE(2, 32)
  wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(dataBytes, 40)
  return wav
}

const ttsWav = silentWav()
let ttsCalls = 0
const ttsServer = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/voices') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ voices: [] }))
    return
  }
  if (req.method === 'POST' && req.url === '/') {
    ttsCalls++
    req.resume()
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': ttsWav.length })
      res.end(ttsWav)
    })
    return
  }
  res.writeHead(404); res.end()
})
await new Promise((resolve, reject) => {
  ttsServer.once('error', reject)
  ttsServer.listen(0, '127.0.0.1', resolve)
})
const ttsAddress = ttsServer.address()
const env = { ...process.env, BETTERPPTX_ASSETS_ROOT: 'D:/PptxGenJS_Claude', BETTERPPTX_LOCAL_MAINTAINER: '1', BETTERPPTX_PUBLIC_BLACK_BOX: '0', BETTERPPTX_TOOL_TIMEOUT_MS: '550000', BETTERPPTX_TTS_PROVIDER: 'piper-http', BETTERPPTX_TTS_URL: `http://127.0.0.1:${ttsAddress.port}` }
const c = spawn(process.execPath, ['D:/PptxGenJS_Claude/betterpptx-mcp/cli.mjs'], { cwd: 'D:/PptxGenJS_Claude', env, stdio: ['pipe', 'pipe', 'pipe'] })
const pend = new Map(); let buf = ''
c.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!l) continue; let m; try { m = JSON.parse(l) } catch { continue } if (m.id != null && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } } })
c.stderr.on('data', () => {}); let id = 0
const rpc = (meth, par) => new Promise(res => { const my = ++id; pend.set(my, res); c.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: my, method: meth, params: par }) + '\n') })
const call = (n, a) => rpc('tools/call', { name: n, arguments: a }).then(r => { try { return JSON.parse(r.result.content[0].text) } catch { return r } })
const V = 'en_US-ljspeech-high'
const tb = (kind, name, text) => ({ kind, name, text })
const worlds = ['luxe', 'aurora', 'blueprint', 'editorial', 'brutalist', 'mist', 'atelier', 'meridian', 'chalkline', 'playbook', 'pulse', 'collage', 'observatory', 'storybook', 'candy', 'horizon', 'mono', 'botanical']
// Native 3D animation presets — turntable 37, swing 38, jumpAndTurn 39, leave 40, arrive 60.
// A model animation carrying one of these proves the 3D effect survived the guard (a coerced
// fade/pulse would NOT). This replaces the earlier (wrong) turntable-only animRot assumption.
const THREED_PRESET_RE = /presetID="(37|38|39|40|60)"/

await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'worlds', version: '1' } })
c.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n')

let failures = 0
const rows = []
for (const world of worlds) {
  const spec = {
    schemaVersion: 'betterpptx.deck-spec.v1', title: `save-${world}`,
    authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic', coordinateSystem: 'inches', layerModel: 'flat-object-array', objectIdentity: 'stable-names-required', geometryAuthority: 'engine', placementPolicy: 'semantic-layout-only', textPolicy: 'Semantic content only; the engine owns geometry, fit, and balance.' },
    contentStory: { audience: 'presentation authors', outcome: 'prove every World preserves narration, build, and native 3D motion', remember: 'one governed clock coordinates all layers' },
    visualDesign: { world, framing: 'engine-owned title, body, and model regions' },
    motionTime: { masterClock: 'narration-led Director timeline', timingSource: 'measured narration and semantic build cues', syncPolicy: 'Narration owns dwell; semantic cues compile onto the same clock.' },
    layout: 'LAYOUT_WIDE', styleIntent: { artDirection: world },
    slides: [
      { id: 'build', title: 'Build', message: 'Three points.', layoutIntent: 'title-body',
        content: [tb('title', 'title', 'Build'), tb('body', 'a', 'Alpha'), tb('body', 'b', 'Beta'), tb('body', 'g', 'Gamma')],
        narration: { voice: V, script: 'Alpha point here. Beta point here. Gamma point here.' } },
      { id: 'model', title: 'Model', message: 'The model animates.', layoutIntent: 'title-body',
        content: [tb('title', 'model-title', 'Model'), { kind: 'model3d', name: 'hero', query: 'rocket', region: 'hero' }],
        narration: { voice: V, script: 'And here the model animates in.' } },
    ],
  }
  let saveOk = false, slides = 0, wavs = 0, glbs = 0, has3D = false, buildEntrances = 0, err = ''
  try {
    const g = await call('betterpptx.deck.generate_from_spec', { spec, phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'summary' })
    if (!g?.ok) { err = 'commit:' + JSON.stringify(g?.data?.errors || g?.error || g).slice(0, 160) }
    else {
      const f = `D:/PptxGenJS_Claude/tmp_autonomous_test/save_${world}.pptx`
      const q = await call('betterpptx.deck.validate_quality', { deckId: g.data.deckId, profile: 'modern' })
      if (!q?.ok) { err = 'quality:' + JSON.stringify(q?.data?.blockingIssues || q?.error || q).slice(0, 160) }
      else {
      const sv = await call('betterpptx.deck.save', { deckId: g.data.deckId, fileName: f })
      if (!sv?.ok) { err = 'save:' + JSON.stringify(sv?.error || sv).slice(0, 160) }
      else {
        saveOk = true
        const zip = await JSZip.loadAsync(readFileSync(f))
        const files = Object.keys(zip.files)
        slides = files.filter(x => /slides\/slide\d+\.xml$/.test(x)).length
        wavs = files.filter(x => /media\/.+\.wav$/i.test(x)).length
        glbs = files.filter(x => /\.glb$/i.test(x)).length
        const s1 = await zip.file('ppt/slides/slide1.xml').async('string')
        const s2 = await zip.file('ppt/slides/slide2.xml').async('string')
        buildEntrances = (s1.match(/presetClass="entr"/g) || []).length  // auto-synced build revealed each object
        has3D = THREED_PRESET_RE.test(s2)                                // 3D effect survived the guard (not coerced)
      }
      }
    }
  } catch (e) { err = 'exception:' + e.message.slice(0, 160) }
  // PASS = saved + the auto-synced build fired (>=1 entrance, incl. build:'none' worlds coerced
  // to fade) + the 3D model kept a native preset (not coerced to fade/pulse).
  const pass = saveOk && slides === 2 && wavs >= 2 && buildEntrances >= 1 && has3D
  if (!pass) failures++
  rows.push(`${pass ? 'PASS' : 'FAIL'}  ${world.padEnd(10)} saveOk=${saveOk} slides=${slides} wavs=${wavs} glbs=${glbs} buildEntrances=${buildEntrances} 3Dpreset=${has3D} ${err}`)
}
console.log('\n=== worlds × (auto-build + 3D) → commit+save matrix ===')
for (const r of rows) console.log(r)
console.log(`\n${failures === 0 ? 'ALL WORLDS PASSED' : failures + ' WORLD(S) FAILED'} · local TTS fixture calls=${ttsCalls}`)
c.kill()
await new Promise(resolve => ttsServer.close(resolve))
process.exit(failures === 0 ? 0 : 1)
