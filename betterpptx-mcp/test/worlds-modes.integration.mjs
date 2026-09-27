// Integration test: every named world in BOTH modes must commit + SAVE (the tuned light/dark
// variant renders and serializes). No narration → fast (no TTS). Exits non-zero if any cell fails.
// Run: npm run test:worlds-modes
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
const tb = (kind, name, text) => ({ kind, name, text })
await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'modes', version: '1' } })
c.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n')

const worlds = ['aurora', 'editorial', 'blueprint', 'brutalist', 'luxe', 'mist', 'atelier', 'meridian', 'chalkline', 'playbook', 'pulse', 'collage', 'observatory', 'storybook', 'candy', 'horizon', 'mono', 'botanical']
let failures = 0
const rows = []
for (const world of worlds) {
  for (const mode of ['light', 'dark']) {
    const spec = { schemaVersion: 'betterpptx.deck-spec.v1', title: `${world}-${mode}`,
      authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic', coordinateSystem: 'inches', layerModel: 'flat-object-array', objectIdentity: 'stable-names-required', geometryAuthority: 'engine', placementPolicy: 'semantic-layout-only', textPolicy: 'Semantic content only; the engine owns geometry, fit, and balance.' },
      contentStory: { audience: 'presentation authors', outcome: 'compare the same story across World modes', remember: 'mode changes value while preserving World character' },
      visualDesign: { world, framing: 'engine-owned title and metric layouts' },
      motionTime: { masterClock: 'authored slide timeline', timingSource: 'Authoring Excellence Motion/Time plan', syncPolicy: 'One governed clock coordinates builds and transitions.' },
      layout: 'LAYOUT_WIDE', styleIntent: { artDirection: world, mode }, slides: [
      { id: 'cover', title: `${world} ${mode}`, message: `${world} in ${mode}.`, layoutIntent: 'title-only', content: [tb('title', 'wm', world.toUpperCase()), tb('body', 't', `mode: ${mode}`)] },
      { id: 's2', title: 'Metrics', message: 'Metrics.', layoutIntent: 'metric-grid', content: [{ kind: 'metric-grid', name: 'metrics', items: [{ name: 'a', label: 'A', value: 'A', text: 'First signal.' }, { name: 'b', label: 'B', value: 'B', text: 'Second signal.' }, { name: 'c', label: 'C', value: 'C', text: 'Third signal.' }] }] },
    ] }
    let ok = false, resolvedMode = '', err = ''
    try {
      const g = await call('betterpptx.deck.generate_from_spec', { spec, phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'summary' })
      if (!g?.ok) { err = 'commit:' + JSON.stringify(g?.data?.errors || g?.error || g).slice(0, 120) }
      else {
        resolvedMode = g.data.appliedDefaults?.mode
        const q = await call('betterpptx.deck.validate_quality', { deckId: g.data.deckId, profile: 'modern' })
        if (!q?.ok) { err = 'quality:' + JSON.stringify(q?.data?.blockingIssues || q?.error || q).slice(0, 120) }
        else {
        const f = `D:/PptxGenJS_Claude/tmp_autonomous_test/mode_${world}_${mode}.pptx`
        const sv = await call('betterpptx.deck.save', { deckId: g.data.deckId, fileName: f })
        if (!sv?.ok) { err = 'save:' + JSON.stringify(sv?.error || sv).slice(0, 120) }
        else { await JSZip.loadAsync(readFileSync(f)); ok = resolvedMode === mode }
        }
      }
    } catch (e) { err = 'exception:' + e.message.slice(0, 120) }
    if (!ok) failures++
    rows.push(`${ok ? 'PASS' : 'FAIL'}  ${world.padEnd(10)} ${mode.padEnd(6)} resolved=${resolvedMode} ${err}`)
  }
}
console.log('=== every world × {light, dark} → commit+save ===')
for (const r of rows) console.log(r)
console.log(`\n${failures === 0 ? 'ALL ' + rows.length + ' CELLS PASS' : failures + ' CELL(S) FAILED'}`)
c.kill()
process.exit(failures === 0 ? 0 : 1)
