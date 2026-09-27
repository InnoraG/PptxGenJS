import fs from 'node:fs'
import path from 'node:path'
import strictAssert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import JSZip from 'jszip'
import { DOMParser } from '@xmldom/xmldom'
import { Box3, Matrix4, Quaternion, Vector3 } from 'three'

process.env.BETTERPPTX_MAINTAINER_MODE = '1'
// This is an isolated framing proof, not a billing/preview-limit test.
process.env.BETTERPPTX_BILLING_ENFORCE = '0'
process.env.BETTERPPTX_FORCE_PLAN = 'premium'
const { createMcpToolDispatcher, getDeck } = await import('../engine.mjs')

const dispatcher = createMcpToolDispatcher({ __skipDurableOperationLedger: true })
const context = { __skipDurableOperationLedger: true, clientInfo: { name: 'model3d-autofit-proof' } }

function assert(condition, message) {
	if (!condition) throw new Error(message)
}

const manualView = {
	camera: { fov: 50, pos: { x: 1200000, y: -800000, z: 90000000 } },
	trans: {
		meterPerModelUnit: { n: 3, d: 2 }, preTrans: { dx: 1200000, dy: -7800000, dz: 450000 },
		scale: { sx: 1.1, sy: 0.8, sz: 1.2 }, rot: { ax: 600000, ay: 1200000, az: -300000 },
		postTrans: { dx: 250000, dy: -500000, dz: 750000 },
	},
	objViewport: 2345678,
}

const spec = {
	schemaVersion: 'betterpptx.deck-spec.v1',
	title: 'Native 3D auto-fit proof',
	authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic', coordinateSystem: 'inches', objectIdentity: 'stable-names-required' },
	contentStory: { audience: 'presentation authors', outcome: 'prove native stock models fill semantic hosts', remember: 'the engine frames the selected asset' },
	visualDesign: { world: '3D product studio', framing: 'large native product proof' },
	motionTime: { masterClock: 'authored slide timeline', timingSource: 'Authoring Excellence plan', syncPolicy: 'engine-owned timing' },
	layout: 'LAYOUT_WIDE',
	slides: [{
		id: 'headphone-fit', title: 'A stock model fills its semantic host', layoutIntent: 'image-left-copy-right',
		content: [
			{ kind: 'title', name: 'fit-title', text: 'A stock model fills its semantic host' },
			{ kind: 'model3d', name: 'fit-headphones', region: 'left', model: 'model3d://microsoft-stock/55f4d622ae5b86d3/headphones', model3dViewPresetId: 'model3d-view-012', nativeOnly: true, altText: 'Editable native 3D headphones.' },
			{ kind: 'body', name: 'fit-reading', region: 'right', text: 'Asset-aware framing uses the engine-owned semantic host without AI-authored coordinates.' },
		],
	}],
	validation: { validateBeforeSave: true, requireAccessibility: true },
}

// Keep the original long-title fixture. Readability now reserves two 50pt
// title lines on slide one, so its host is legitimately shorter than in the
// Aug 16 test baseline. A short semantic title supplies the contrasting large
// host; no author coordinates or changed production font policy are required.
const largeHost = structuredClone(spec.slides[0])
largeHost.id = 'large-host-fit'
largeHost.title = largeHost.content[0].text = 'A larger native host'
spec.slides.push(largeHost)
const manualHost = structuredClone(largeHost)
manualHost.id = 'manual-host-fit'
manualHost.title = manualHost.content[0].text = 'Manual framing stays exact'
Object.assign(manualHost.content[1], structuredClone(manualView))
spec.slides.push(manualHost)

const NS = { p: 'http://schemas.openxmlformats.org/presentationml/2006/main', a: 'http://schemas.openxmlformats.org/drawingml/2006/main', m: 'http://schemas.microsoft.com/office/drawing/2017/model3d', r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships' }
const first = (node, ns, name) => node.getElementsByTagNameNS(ns, name)[0]
const attrs = (node, names) => {
	assert(node, `Missing required native node for ${names.join(', ')}`)
	return Object.fromEntries(names.map(name => { assert(node.hasAttribute(name), `Missing native attribute ${name}`); return [name, Number(node.getAttribute(name))] }))
}

// Independent geometry oracle: decode actual POSITION values and use Three's
// scene matrices, not the production auto-fit helper or accessor min/max. This
// catches a wrong embedded asset, scale/center regression, or stale bounds too.
function geometryBounds(bytes) {
	assert(bytes.readUInt32LE(0) === 0x46546c67 && bytes.readUInt32LE(4) === 2, 'The native model is not a version-2 GLB')
	assert(bytes.readUInt32LE(8) === bytes.length, 'The native GLB length is invalid')
	let json, bin
	for (let offset = 12; offset < bytes.length;) {
		const size = bytes.readUInt32LE(offset), type = bytes.readUInt32LE(offset + 4)
		assert(offset + 8 + size <= bytes.length, 'A native GLB chunk is out of bounds')
		const chunk = bytes.subarray(offset + 8, offset + 8 + size)
		if (type === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8'))
		if (type === 0x004e4942) bin = chunk
		offset += 8 + size
	}
	assert(json && bin, 'Native GLB geometry chunks are missing')
	const scene = json.scenes?.[json.scene ?? 0]
	assert(scene?.nodes?.length, 'The native GLB has no default scene')
	const box = new Box3(), seen = new Set()
	function visit(index, parent) {
		assert(!seen.has(index), 'The model fixture contains a cycle or shared scene node'); seen.add(index)
		const node = json.nodes[index]
		assert(node && node.skin === undefined, 'This independent static fixture must contain unskinned nodes')
		const local = node.matrix ? new Matrix4().fromArray(node.matrix) : new Matrix4().compose(new Vector3(...(node.translation || [0, 0, 0])), new Quaternion(...(node.rotation || [0, 0, 0, 1])), new Vector3(...(node.scale || [1, 1, 1])))
		const world = parent.clone().multiply(local)
		for (const primitive of json.meshes?.[node.mesh]?.primitives || []) {
			const accessor = json.accessors[primitive.attributes.POSITION], view = json.bufferViews[accessor.bufferView]
			assert(accessor.type === 'VEC3' && accessor.componentType === 5126 && !accessor.sparse && !view.buffer, 'Unexpected position encoding in the static fixture')
			const start = (view.byteOffset || 0) + (accessor.byteOffset || 0), stride = view.byteStride || 12
			assert(start + (accessor.count - 1) * stride + 12 <= bin.length, 'The native vertex data is out of bounds')
			for (let i = 0; i < accessor.count; i++) box.expandByPoint(new Vector3(bin.readFloatLE(start + i * stride), bin.readFloatLE(start + i * stride + 4), bin.readFloatLE(start + i * stride + 8)).applyMatrix4(world))
		}
		for (const child of node.children || []) visit(child, world)
	}
	for (const root of scene.nodes) visit(root, new Matrix4())
	assert(!box.isEmpty(), 'The native model has no measurable vertices')
	return { center: box.getCenter(new Vector3()).toArray(), extents: box.getSize(new Vector3()).toArray() }
}

async function readNativeModel(zip, slideNumber) {
	const slidePath = `ppt/slides/slide${slideNumber}.xml`
	const xml = await zip.file(slidePath).async('string')
	assert(!/caption/i.test(xml), 'Model 3D auto-fit proof unexpectedly emitted a visible caption object')
	const doc = new DOMParser().parseFromString(xml, 'application/xml')
	assert(doc.getElementsByTagNameNS(NS.m, 'model3d').length === 1, 'Each proof slide must contain exactly one native model')
	const model = first(doc, NS.m, 'model3d')
	let graphic = model.parentNode
	while (graphic && !(graphic.namespaceURI === NS.p && graphic.localName === 'graphicFrame')) graphic = graphic.parentNode
	assert(graphic, 'Native model has no graphic frame')
	const frameExtent = attrs(first(first(graphic, NS.p, 'xfrm'), NS.a, 'ext'), ['cx', 'cy'])
	const relationships = new DOMParser().parseFromString(await zip.file(`ppt/slides/_rels/slide${slideNumber}.xml.rels`).async('string'), 'application/xml')
	const rid = model.getAttributeNS(NS.r, 'embed')
	const relation = Array.from(relationships.getElementsByTagName('Relationship')).find(item => item.getAttribute('Id') === rid)
	assert(relation && relation.getAttribute('Type').endsWith('/model3d') && relation.getAttribute('TargetMode') !== 'External', 'Native model relationship is missing or external')
	const mediaPath = path.posix.normalize(path.posix.join(path.posix.dirname(slidePath), relation.getAttribute('Target')))
	assert(mediaPath.startsWith('ppt/media/') && zip.file(mediaPath), 'Native model relationship is dangling')
	const bytes = await zip.file(mediaPath).async('nodebuffer')
	const nativeTrans = first(model, NS.m, 'trans'), nativeCamera = first(model, NS.m, 'camera')
	assert(!Array.from(doc.getElementsByTagNameNS(NS.p, 'cNvPr')).some(node => /caption/i.test(node.getAttribute('name'))), 'Model 3D auto-fit proof unexpectedly emitted a visible caption object')
	return {
		frame: { w: frameExtent.cx / 914400, h: frameExtent.cy / 914400 }, geometry: geometryBounds(bytes),
		sha256: createHash('sha256').update(bytes).digest('hex'), viewport: attrs(first(model, NS.m, 'objViewport'), ['viewportSz']).viewportSz,
		mpu: attrs(first(nativeTrans, NS.m, 'meterPerModelUnit'), ['n', 'd']), pre: attrs(first(nativeTrans, NS.m, 'preTrans'), ['dx', 'dy', 'dz']),
		post: attrs(first(nativeTrans, NS.m, 'postTrans'), ['dx', 'dy', 'dz']), rot: attrs(first(nativeTrans, NS.m, 'rot'), ['ax', 'ay', 'az']),
		scale: Object.fromEntries(['sx', 'sy', 'sz'].map(axis => [axis, attrs(first(nativeTrans, NS.m, axis), ['n', 'd'])])),
		camera: { ...attrs(first(nativeCamera, NS.m, 'pos'), ['x', 'y', 'z']), fov: attrs(first(nativeCamera, NS.m, 'perspective'), ['fov']).fov },
	}
}

function expectedViewport({ frame, geometry }) {
	const [x, y, z] = geometry.extents, max = Math.max(x, y, z)
	// These are the independently asserted native calibration and governed
	// bounds, intentionally not imported from the implementation under test.
	return Math.max(750000, Math.min(10500000, Math.round(Math.min(frame.w / (Math.max(x, z) / max), frame.h / (y / max)) * 1454545 * .94)))
}
function assertAutoFit(actual) {
	const max = Math.max(...actual.geometry.extents), mpu = 1 / max
	strictAssert.deepEqual(actual.mpu, { n: Math.round(mpu * 1000000), d: 1000000 })
	const expectedPre = Object.fromEntries(['dx', 'dy', 'dz'].map((axis, i) => [axis, Math.round(-actual.geometry.center[i] * mpu * 36000000)]))
	for (const axis of ['dx', 'dy', 'dz']) assert(Math.abs(actual.pre[axis] - expectedPre[axis]) <= 1, `Auto-fit center differs from embedded geometry on ${axis}`)
	// Frame coordinates are rounded to one native EMU on serialization. Permit
	// only its possible one-unit viewport rounding difference, not a size range.
	assert(Math.abs(actual.viewport - expectedViewport(actual)) <= 1, `Viewport ${actual.viewport} differs from the embedded geometry/host oracle ${expectedViewport(actual)}`)
	assert(actual.viewport >= 750000 && actual.viewport <= 10500000, `Native Model 3D auto-fit exceeded governed bounds: ${actual.viewport}`)
}

const generated = await dispatcher.call('betterpptx.deck.generate_from_spec', { mode: 'expressive', outputName: 'model3d-autofit-proof.pptx', spec }, context)
assert(generated?.ok, `Model 3D auto-fit generation failed: ${generated?.error?.message || 'unknown error'}`)
try {
	const entry = getDeck(generated.data.deckId)
	fs.mkdirSync('outputs/mcp-model3d-autofit-verification', { recursive: true })
	const outputPath = 'outputs/mcp-model3d-autofit-verification/product-model3d-autofit.pptx'
	await entry.pptx.writeFile({ fileName: outputPath })
	const zip = await JSZip.loadAsync(fs.readFileSync(outputPath), { checkCRC32: true })
	const original = await readNativeModel(zip, 1), large = await readNativeModel(zip, 2), manual = await readNativeModel(zip, 3)
	strictAssert.equal(original.sha256, large.sha256, 'The host comparison must use identical model bytes')
	strictAssert.equal(original.sha256, manual.sha256, 'Manual framing must not mutate model bytes')
	assertAutoFit(original); assertAutoFit(large)
	assert(large.frame.h > original.frame.h + .5, 'The contrasting semantic host must actually be taller')
	assert(large.viewport > original.viewport, 'A larger host must get a larger native viewport')
	assert(large.viewport >= 6500000, `Large semantic Model 3D host retained a specimen-sized viewport: ${large.viewport}`)
	// Negative controls ensure this is stricter than the old absolute floor:
	// neither specimen-size framing, stale resized framing, nor over-zoom passes.
	strictAssert.throws(() => assertAutoFit({ ...original, viewport: 2867650 }), /Viewport/)
	strictAssert.throws(() => assertAutoFit({ ...large, viewport: original.viewport }), /Viewport/)
	strictAssert.throws(() => assertAutoFit({ ...large, viewport: 10500001 }), /Viewport/)
	strictAssert.equal(manual.viewport, manualView.objViewport)
	strictAssert.deepEqual(manual.mpu, manualView.trans.meterPerModelUnit)
	strictAssert.deepEqual(manual.pre, manualView.trans.preTrans)
	strictAssert.deepEqual(manual.post, manualView.trans.postTrans)
	strictAssert.deepEqual(manual.rot, manualView.trans.rot)
	for (const axis of ['sx', 'sy', 'sz']) strictAssert.deepEqual(manual.scale[axis], { n: Math.round(manualView.trans.scale[axis] * 1000000), d: 1000000 })
	strictAssert.deepEqual(manual.camera, { ...manualView.camera.pos, fov: manualView.camera.fov * 60000 })
	console.log(JSON.stringify({ status: 'PASS', outputPath, contract: 'asset-aware-frame-fill',
		original: { frame: original.frame, viewport: original.viewport, expectedViewport: expectedViewport(original) },
		large: { frame: large.frame, viewport: large.viewport, expectedViewport: expectedViewport(large), minimumRetained: 6500000 },
		manual: { viewport: manual.viewport, allNativeFieldsPreserved: true }, negativeControlsRejected: 3,
	}, null, 2))
} finally {
	await dispatcher.call('betterpptx.deck.dispose', { deckId: generated.data.deckId }, context)
}
