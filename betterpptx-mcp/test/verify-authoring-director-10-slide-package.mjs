import fs from 'node:fs/promises'
import path from 'node:path'
import JSZip from 'jszip'

const pptx = process.argv[2] || 'betterpptx-mcp/outputs/commercial-poc/final-authoring-excellence-20260728/betterpptx-authoring-director-final-10-slide.pptx'
const reportPath = process.argv[3] || 'betterpptx-mcp/outputs/commercial-poc/final-authoring-excellence-20260728/authoring-director-10-slide-package-report.json'
const z = await JSZip.loadAsync(await fs.readFile(pptx))
const names = Object.keys(z.files).filter(name => !z.files[name].dir)
const slideNames = names.filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort()
const slideXml = await Promise.all(slideNames.map(name => z.file(name).async('string')))
const presProps = await z.file('ppt/presProps.xml').async('string')
const media = names.filter(name => /^ppt\/media\//.test(name))
const avatarSlideXml = slideXml.find(xml => /native-talking-head-video/.test(xml)) || ''
const native3dSlideXml = slideXml[slideNames.findIndex(name => /slide5\.xml$/.test(name))] || ''
const visualQaDir = path.resolve(path.dirname(reportPath), 'visual-qa-10-slide')
const visualQaSlides = []
for (let index = 1; index <= 10; index += 1) {
  const file = path.join(visualQaDir, `slide-${String(index).padStart(2, '0')}.png`)
  try { if ((await fs.stat(file)).isFile()) visualQaSlides.push(file) } catch {}
}
const report = {
  schemaVersion: 'betterpptx.authoring-director.final-10-slide-package.v1',
  status: 'PASS', pptx: path.resolve(pptx), slideCount: slideNames.length,
  checks: {
    tenSlides: slideNames.length === 10,
    nativeNarrationOnEverySlide: slideXml.filter(xml => /isNarration="1"/.test(xml)).length === 10,
    timingOnEverySlide: slideXml.filter(xml => /<p:timing>/.test(xml)).length === 10,
    nativeVideo: media.some(name => /\.mp4$/i.test(name)) && slideXml.some(xml => /p14:media|a:videoFile/.test(xml)),
    mutedAvatar: /<p:video>[\s\S]*?<p:cMediaNode\b[^>]*\bvol="0"/.test(avatarSlideXml),
    avatarInteractivePlayback: /togglePause|playFrom\(0\.0\)/.test(avatarSlideXml),
    native3d: media.some(name => /\.glb$/i.test(name)) && slideXml.some(xml => /model3d|director-native-3d-presenter/i.test(xml)),
    native3dTurntableAnimation: /<p:cNvPr[^>]*id="10"[^>]*name="director-native-3d-presenter"/.test(native3dSlideXml) && /presetClass="emph"[^>]*presetID="37"|presetID="37"[^>]*presetClass="emph"/.test(native3dSlideXml) && /presetID="37"[\s\S]*?<p:spTgt\s+spid="10"\s*\/>/.test(native3dSlideXml),
    editableInk: slideXml.some(xml => /director-ink-highlighter/.test(xml)),
    editableLaser: slideXml.some(xml => /director-laser-pointer/.test(xml)),
    showNarration: /showNarration="1"/.test(presProps),
    useTimings: /useTimings="1"/.test(presProps),
    mediaPayloads: media.length >= 12,
    visualQaCoverage: visualQaSlides.length === 10,
  },
  media,
  visualQa: { directory: visualQaDir, slideCount: visualQaSlides.length, slides: visualQaSlides },
}
if (Object.values(report.checks).some(value => value !== true)) report.status = 'FAIL'
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
if (report.status !== 'PASS') process.exitCode = 1
