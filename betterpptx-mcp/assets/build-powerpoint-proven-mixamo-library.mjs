import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { NodeIO } from '@gltf-transform/core'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.dirname(path.dirname(here))
const source = process.argv[2] || path.join(repo, 'research-demos', '2026-07-12-presenter-cofire', 'joe-slim.glb')
const output = process.argv[3] || path.join(here, 'powerpoint-proven-mixamo-library.glb')
const io = new NodeIO()
const doc = await io.readBinary(readFileSync(source))
const root = doc.getRoot()
for (const node of root.listNodes()) if (node.getMesh()) node.setMesh(null)
for (const mesh of root.listMeshes().slice()) mesh.dispose()
for (const material of root.listMaterials().slice()) material.dispose()
for (const texture of root.listTextures().slice()) texture.dispose()
writeFileSync(output, Buffer.from(await io.writeBinary(doc)))
console.log(JSON.stringify({
	output,
	skins: root.listSkins().length,
	joints: root.listSkins()[0]?.listJoints().length || 0,
	animations: root.listAnimations().map(animation => animation.getName()),
	meshes: root.listMeshes().length,
	materials: root.listMaterials().length,
	textures: root.listTextures().length,
}, null, 2))
