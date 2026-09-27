import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'
import { DOMParser } from '@xmldom/xmldom'

const all = (node, local) => Array.from(node.getElementsByTagName('*')).filter(item => item.localName === local)
const children = (node, local) => Array.from(node.childNodes || []).filter(item => item.nodeType === 1 && (!local || item.localName === local))
const relNamespace = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const widths = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 }
const bytesPerComponent = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }

function parseXml(xml, name) {
  const errors = []
  const doc = new DOMParser({ errorHandler: { warning: item => errors.push(item), error: item => errors.push(item), fatalError: item => errors.push(item) } }).parseFromString(xml, 'application/xml')
  assert.deepEqual(errors, [], `XML parse errors in ${name}`)
  return doc
}

function parseGlb(buffer) {
  assert.equal(buffer.readUInt32LE(0), 0x46546c67, 'GLB magic')
  assert.equal(buffer.readUInt32LE(4), 2, 'GLB version')
  assert.equal(buffer.readUInt32LE(8), buffer.length, 'GLB declared length')
  let cursor = 12, json, bin
  while (cursor < buffer.length) {
    const length = buffer.readUInt32LE(cursor), type = buffer.readUInt32LE(cursor + 4)
    assert.equal(length % 4, 0, 'GLB chunk alignment')
    assert.ok(cursor + 8 + length <= buffer.length, 'GLB chunk bounds')
    const data = buffer.subarray(cursor + 8, cursor + 8 + length)
    if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8').trim())
    if (type === 0x004e4942) bin = data
    cursor += 8 + length
  }
  assert.equal(cursor, buffer.length)
  assert.ok(json && bin, 'GLB must contain JSON and binary chunks')
  return { json, bin }
}

function accessorRows(glb, index) {
  const a = glb.json.accessors[index]
  assert.ok(a, `Missing accessor ${index}`)
  assert.equal(a.componentType, 5126, 'Animated sampler data must be FLOAT')
  assert.ok(!a.sparse, 'Composed sampler data must be fully materialized')
  const v = glb.json.bufferViews[a.bufferView], width = widths[a.type]
  assert.ok(v && width)
  const offset = (v.byteOffset || 0) + (a.byteOffset || 0), stride = v.byteStride || width * 4
  return Array.from({ length: a.count }, (_, i) => Array.from({ length: width }, (_, c) => glb.bin.readFloatLE(offset + i * stride + c * 4)))
}

function auditGlb(buffer, expected) {
  const glb = parseGlb(buffer), g = glb.json
  assert.equal(g.animations?.length, 1, 'A performance must have exactly one embedded animation')
  for (const [index, view] of (g.bufferViews || []).entries()) {
    assert.equal(view.buffer, 0, `Unexpected external buffer ${index}`)
    assert.ok(view.byteLength > 0, `Empty bufferView ${index}`)
    assert.ok((view.byteOffset || 0) + view.byteLength <= glb.bin.length, `Out-of-bounds bufferView ${index}`)
  }
  for (const [index, a] of (g.accessors || []).entries()) {
    if (a.bufferView === undefined) continue
    const view = g.bufferViews[a.bufferView], components = widths[a.type], componentBytes = bytesPerComponent[a.componentType]
    assert.ok(view && components && componentBytes, `Invalid accessor ${index}`)
    const stride = view.byteStride || components * componentBytes
    assert.ok((a.byteOffset || 0) + Math.max(0, a.count - 1) * stride + components * componentBytes <= view.byteLength, `Accessor ${index} overruns bufferView`)
  }
  const animation = g.animations[0], seen = new Set(), allTimes = new Set()
  let endSeconds = 0, translationTracks = 0, rotationTracks = 0, scaleTracks = 0
  for (const channel of animation.channels) {
    assert.ok(g.nodes[channel.target.node], 'Animation target node must exist')
    const key = `${channel.target.node}:${channel.target.path}`
    assert.ok(!seen.has(key), `Duplicate channel ownership ${key}`)
    seen.add(key)
    const sampler = animation.samplers[channel.sampler]
    assert.ok(sampler)
    const input = accessorRows(glb, sampler.input).map(row => row[0]), output = accessorRows(glb, sampler.output)
    assert.ok(input.length >= 2)
    const targetNode = g.nodes[channel.target.node], targetMesh = g.meshes?.[targetNode.mesh]
    const morphCount = channel.target.path === 'weights' ? targetNode.weights?.length || targetMesh?.weights?.length || targetMesh?.primitives?.[0]?.targets?.length : 1
    assert.ok(morphCount > 0, 'Morph animation must target an existing morph set')
    assert.equal(output.length, input.length * morphCount * (sampler.interpolation === 'CUBICSPLINE' ? 3 : 1), 'Sampler input/output lengths')
    input.forEach((time, i) => {
      assert.ok(Number.isFinite(time) && time >= 0)
      if (i) assert.ok(time > input[i - 1], 'Sampler times must be strictly ordered')
      allTimes.add(Math.round(time * 1000))
    })
    output.flat().forEach(value => assert.ok(Number.isFinite(value), 'Non-finite animated transform'))
    endSeconds = Math.max(endSeconds, input.at(-1))
    if (channel.target.path === 'translation') translationTracks++
    if (channel.target.path === 'scale') { scaleTracks++; output.filter((_, i) => sampler.interpolation !== 'CUBICSPLINE' || i % 3 === 1).flat().forEach(value => assert.ok(Math.abs(value) > 1e-12, 'Animated scale must not collapse a rig axis')) }
    if (channel.target.path === 'rotation') {
      rotationTracks++
      if (sampler.interpolation !== 'CUBICSPLINE') output.forEach(q => assert.ok(Math.abs(Math.hypot(...q) - 1) < 0.002, 'Rotation quaternion must stay normalized'))
    }
  }
  assert.ok(rotationTracks > 0, 'A performance must contain real articulated motion')
  if (expected.durationMs !== undefined) assert.ok(Math.abs(endSeconds * 1000 - expected.durationMs) < 1, `Embedded duration ${endSeconds * 1000} differs from authored ${expected.durationMs}`)
  for (const boundary of expected.actionBoundariesMs || []) assert.ok([...allTimes].some(time => Math.abs(time - boundary) <= 1), `Missing action-boundary sample at ${boundary}ms`)
  return { animations: 1, channels: animation.channels.length, durationMs: Math.round(endSeconds * 1000), translationTracks, rotationTracks, scaleTracks, nodes: g.nodes.length, skins: g.skins?.length || 0 }
}

function effectStart(effect) {
  let startMs = 0, clickGated = false
  for (let cursor = effect; cursor; cursor = cursor.parentNode) {
    if (cursor.localName !== 'cTn') continue
    for (const list of children(cursor, 'stCondLst')) {
      const conditions = children(list, 'cond'), auto = conditions.some(condition => condition.getAttribute('evt') === 'onBegin')
      for (const condition of conditions) {
        if (condition.hasAttribute('evt')) continue
        const delay = condition.getAttribute('delay')
        if (delay === 'indefinite') { if (!auto) clickGated = true }
        else startMs += Number(delay || 0)
      }
    }
  }
  return { startMs, clickGated }
}

export async function auditPresenterPerformancePackage(input, expected = {}) {
  const bytes = Buffer.isBuffer(input) ? input : await fs.readFile(input)
  const zip = await JSZip.loadAsync(bytes, { checkCRC32: true })
  const names = Object.keys(zip.files).filter(name => !zip.files[name].dir), namesSet = new Set(names), documents = new Map()
  for (const name of names.filter(name => name.endsWith('.xml') || name.endsWith('.rels'))) documents.set(name, parseXml(await zip.file(name).async('string'), name))
  const relationships = new Map()
  let relationshipCount = 0
  for (const [name, doc] of documents) {
    if (!name.endsWith('.rels')) continue
    const marker = name.lastIndexOf('/_rels/')
    const source = name === '_rels/.rels' ? '' : `${name.slice(0, marker)}/${name.slice(marker + 7, -5)}`
    const byId = new Map()
    for (const rel of all(doc, 'Relationship')) {
      const id = rel.getAttribute('Id')
      assert.ok(id && !byId.has(id), `Duplicate relationship ID in ${name}`)
      byId.set(id, rel)
      relationshipCount++
      if (rel.getAttribute('TargetMode') === 'External') continue
      const target = decodeURIComponent(rel.getAttribute('Target').split('#')[0])
      const resolved = target.startsWith('/') ? target.slice(1) : path.posix.normalize(path.posix.join(path.posix.dirname(source), target))
      assert.ok(namesSet.has(resolved), `Dangling relationship ${name}: ${target}`)
    }
    relationships.set(source, byId)
  }
  for (const [name, doc] of documents) {
    if (!name.endsWith('.xml')) continue
    for (const node of Array.from(doc.getElementsByTagName('*'))) {
      for (const attr of Array.from(node.attributes || [])) {
        if (attr.namespaceURI === relNamespace) assert.ok(relationships.get(name)?.has(attr.value), `Unresolved ${attr.name}=${attr.value} in ${name}`)
      }
    }
  }
  const contentTypes = documents.get('[Content_Types].xml')
  assert.ok(contentTypes)
  const defaults = new Set(all(contentTypes, 'Default').map(item => item.getAttribute('Extension').toLowerCase()))
  const overrides = new Set(all(contentTypes, 'Override').map(item => item.getAttribute('PartName').replace(/^\//, '')))
  for (const name of names.filter(name => name !== '[Content_Types].xml')) assert.ok(overrides.has(name) || defaults.has(name.endsWith('.rels') ? 'rels' : path.posix.extname(name).slice(1).toLowerCase()), `Missing content type for ${name}`)
  const slideNames = names.filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
  assert.equal(slideNames.length, expected.slideCount ?? 1)
  const slideName = `ppt/slides/slide${expected.slideNumber || 1}.xml`, doc = documents.get(slideName)
  assert.ok(doc)
  const models = all(doc, 'model3d')
  assert.equal(models.length, 1, 'Performance must compile to one native 3D object')
  const ids = new Set(all(doc, 'cNvPr').map(item => item.getAttribute('id')))
  for (const target of all(doc, 'spTgt')) assert.ok(ids.has(target.getAttribute('spid')), 'Dangling slide animation target')
  const timingIds = all(doc, 'cTn').map(item => item.getAttribute('id'))
  assert.equal(timingIds.length, new Set(timingIds).size, 'Timing node IDs must be unique')
  const sceneAttributes = all(doc, 'attrName').filter(item => /^embedded\d+$/.test(item.textContent))
  assert.equal(sceneAttributes.length, 1, 'Exactly one native playScene prevents successive-scene freezes')
  let sceneEffect = sceneAttributes[0]
  while (sceneEffect && !(sceneEffect.localName === 'cTn' && sceneEffect.hasAttribute('presetClass'))) sceneEffect = sceneEffect.parentNode
  assert.ok(sceneEffect, 'playScene must belong to a native timing effect')
  const start = effectStart(sceneEffect)
  assert.equal(start.clickGated, false, 'Performance must autoplay')
  if (expected.startMs !== undefined) assert.equal(start.startMs, expected.startMs, 'Scene must use authored absolute start')
  if (expected.durationMs !== undefined) assert.ok(all(sceneEffect, 'cTn').some(item => Number(item.getAttribute('dur')) === expected.durationMs), 'Native playScene duration differs from the composed action duration')
  const sceneTarget = all(sceneEffect, 'spTgt')[0]?.getAttribute('spid')
  const actorEffects = all(doc, 'cTn').filter(item => item.hasAttribute('presetClass') && all(item, 'spTgt').some(target => target.getAttribute('spid') === sceneTarget)).map(item => ({ presetClass: item.getAttribute('presetClass'), ...effectStart(item), durations: all(item, 'cTn').map(n => Number(n.getAttribute('dur'))).filter(Number.isFinite) }))
  if (expected.entryRequired) assert.ok(actorEffects.some(item => item.presetClass === 'entr' && (expected.startMs === undefined || item.startMs === expected.startMs)), 'Entry must have a native visibility effect at the performance start')
  if (expected.exitStartMs !== undefined) assert.ok(actorEffects.some(item => item.presetClass === 'exit' && item.startMs === expected.exitStartMs), 'Exit must use the authored absolute cue')
  const dwellValues = all(doc, 'transition').filter(item => item.hasAttribute('advTm')).map(item => Number(item.getAttribute('advTm')))
  assert.ok(dwellValues.length)
  if (expected.minimumDwellMs !== undefined) dwellValues.forEach(value => assert.ok(value >= expected.minimumDwellMs, 'Slide dwell cuts off the performance'))
  if (expected.dwellMs !== undefined) dwellValues.forEach(value => assert.equal(value, expected.dwellMs, 'Slide dwell differs from semantic readback'))
  const modelFiles = names.filter(name => name.endsWith('.glb'))
  assert.equal(modelFiles.length, 1, 'Only the composed model should be packaged for a one-performer slide')
  const model = auditGlb(await zip.file(modelFiles[0]).async('nodebuffer'), expected)
  return { status: 'PASS', bytes: bytes.length, xmlParts: documents.size, relationships: relationshipCount, slides: slideNames.length, native3DModels: models.length, nativePlayScenes: sceneAttributes.length, startMs: start.startMs, dwellMs: dwellValues[0], actorEffects, model }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const input = process.argv[2]
  assert.ok(input, 'Usage: node presenter-performance-package-audit.mjs input.pptx [expectations.json]')
  const expected = process.argv[3] ? JSON.parse(await fs.readFile(process.argv[3], 'utf8')) : {}
  console.log(JSON.stringify(await auditPresenterPerformancePackage(input, expected), null, 2))
}
