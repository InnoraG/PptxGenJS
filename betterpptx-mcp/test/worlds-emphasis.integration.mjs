// Integration test: in EVERY world, a type:"emphasis" with NO named effect must render as the
// world's real emphasis DEFAULT (an actual emphasis, never a fade) — the guarantee that emphasis
// is first-class, not a dead descriptor. Asserts appliedDefaults.animationPalette.worldDefaults +
// the committed OOXML (presetClass="emph" + the effect's preset id). Fast: no narration/TTS.
// Run: npm run test:worlds-emphasis
import { spawn } from 'node:child_process'
import JSZip from 'jszip'
import { readFileSync } from 'node:fs'
const env = { ...process.env, BETTERPPTX_ASSETS_ROOT: 'D:/PptxGenJS_Claude', BETTERPPTX_LOCAL_MAINTAINER: '1', BETTERPPTX_PUBLIC_BLACK_BOX: '0', BETTERPPTX_TOOL_TIMEOUT_MS: '120000' }
const c = spawn(process.execPath, ['D:/PptxGenJS_Claude/betterpptx-mcp/cli.mjs'], { cwd: 'D:/PptxGenJS_Claude', env, stdio: ['pipe', 'pipe', 'pipe'] })
const pend = new Map(); let buf = ''
c.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!l) continue; let m; try { m = JSON.parse(l) } catch { continue } if (m.id != null && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } } })
c.stderr.on('data', () => {}); let id = 0
const rpc = (meth, par) => new Promise(res => { const my = ++id; pend.set(my, res); c.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: my, method: meth, params: par }) + '\n') })
const call = (n, a) => rpc('tools/call', { name: n, arguments: a }).then(r => { try { return JSON.parse(r.result.content[0].text) } catch { return r } })
await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'emph', version: '1' } })
c.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n')

// Expected restrained default per world, and the pptxgen preset id each effect renders as.
const expectedEffect = {
	luxe: 'pulse', aurora: 'pulse', blueprint: 'pulse', editorial: 'pulse', mist: 'pulse', brutalist: 'boldFlash',
	atelier: 'pulse', meridian: 'pulse', chalkline: 'pulse', playbook: 'pulse', pulse: 'boldFlash', collage: 'teeter',
	observatory: 'pulse', storybook: 'teeter', candy: 'pulse',
	horizon: 'pulse', mono: 'pulse', botanical: 'pulse',
}
const effectPreset = { pulse: '26', boldflash: '10', teeter: '32' }

let failures = 0
const rows = []
for (const world of Object.keys(expectedEffect)) {
  const spec = { schemaVersion: 'betterpptx.deck-spec.v1', title: `emph-${world}`,
    authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic', coordinateSystem: 'inches', layerModel: 'flat-object-array', objectIdentity: 'stable-names-required', geometryAuthority: 'engine', placementPolicy: 'semantic-layout-only', textPolicy: 'Semantic content only; the engine owns geometry, fit, and balance.' },
    contentStory: { audience: 'presentation authors', outcome: 'make one important number memorable', remember: 'one governed emphasis beat' },
    visualDesign: { world, framing: 'single semantic KPI with generous reading space' },
    motionTime: { masterClock: 'authored slide timeline', timingSource: 'Authoring Excellence Motion/Time plan', syncPolicy: 'One governed clock coordinates builds and emphasis.' },
    layout: 'LAYOUT_WIDE', styleIntent: { artDirection: world }, slides: [
    { id: 's', title: 'Emphasis', message: 'Emphasis.', layoutIntent: 'title-body',
      content: [{ kind: 'kpi', name: 'kpi', text: '9,800', value: '9,800', label: 'Emphasis', trend: 'governed beat' }],
      timeline: [{ objectName: 'kpi', type: 'emphasis', trigger: 'afterPrevious', durationMs: 600 }] },  // NO effect → world default
  ] }
  let wdEmphasis = '', isEmph = false, presetOk = false, err = ''
  try {
    const g = await call('betterpptx.deck.generate_from_spec', { spec, phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'full' })
    if (!g?.ok) { err = 'commit:' + JSON.stringify(g?.data?.errors || g?.error || g).slice(0, 120) }
    else {
      wdEmphasis = g.data.appliedDefaults?.animationPalette?.worldDefaults?.emphasis
      const q = await call('betterpptx.deck.validate_quality', { deckId: g.data.deckId, profile: 'modern' })
      if (!q?.ok) { err = 'quality:' + JSON.stringify(q?.data?.blockingIssues || q?.error || q).slice(0, 120) }
      else {
      const f = `D:/PptxGenJS_Claude/tmp_autonomous_test/emphT_${world}.pptx`
      const sv = await call('betterpptx.deck.save', { deckId: g.data.deckId, fileName: f })
      if (!sv?.ok) { err = 'save:' + JSON.stringify(sv?.error || sv).slice(0, 120) }
      else {
        const s1 = await (await JSZip.loadAsync(readFileSync(f))).file('ppt/slides/slide1.xml').async('string')
        isEmph = /presetClass="emph"/.test(s1)   // an emphasis, not a fade/entrance
        const wantPreset = effectPreset[String(expectedEffect[world]).toLowerCase()]
        presetOk = new RegExp(`presetID="${wantPreset}"`).test(s1)
      }
      }
    }
  } catch (e) { err = 'exception:' + e.message.slice(0, 120) }
  const pass = wdEmphasis === expectedEffect[world] && isEmph && presetOk
  if (!pass) failures++
  rows.push(`${pass ? 'PASS' : 'FAIL'}  ${world.padEnd(10)} worldDefault=${wdEmphasis} rendersEmphasis=${isEmph} presetMatch=${presetOk} ${err}`)
}
console.log('=== every world: no-effect emphasis → the world emphasis DEFAULT (not fade) ===')
for (const r of rows) console.log(r)
console.log(`\n${failures === 0 ? 'ALL ' + rows.length + ' WORLDS PASS' : failures + ' WORLD(S) FAILED'}`)
c.kill()
process.exit(failures === 0 ? 0 : 1)
