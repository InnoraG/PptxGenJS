import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createHash } from 'node:crypto'
import { parseNativeBvhSourceCliArgs, convertNativeBvhSourceFiles } from '../scripts/convert-native-bvh-motion-source.mjs'

const source=Buffer.from(`HIERARCHY
ROOT Hips
{
 OFFSET 0 1 0
 CHANNELS 6 Xposition Yposition Zposition Zrotation Xrotation Yrotation
 JOINT Head
 {
  OFFSET 0 1 0
  CHANNELS 3 Zrotation Xrotation Yrotation
 }
}
MOTION
Frames: 2
Frame Time: 0.25
0 0 0 0 0 0 0 0 0
1 0 2 30 20 10 5 10 15
`)
const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
function workspace(t){const folder=fs.mkdtempSync(path.join(os.tmpdir(),'native-bvh-cli-'));t.after(()=>fs.rmSync(folder,{recursive:true,force:true}));const input=path.join(folder,'original.bvh');fs.writeFileSync(input,source);return{folder,input,output:path.join(folder,'out/source-v1.glb')}}

test('maintainer BVH CLI requires explicit destinations and rejects duplicate or unknown options',()=>{
  assert.deepEqual(parseNativeBvhSourceCliArgs(['--help']),{help:true})
  assert.deepEqual(parseNativeBvhSourceCliArgs(['--input','a.bvh','--animation','take','--output','b.glb','--unit-scale','.01']),{input:'a.bvh',animation:'take',output:'b.glb',unitScale:.01})
  for(const args of [[],['--input','a.bvh'],['--input','a.bvh','--animation','take','--output','b.glb','--overwrite','yes'],['--input','a.bvh','--input','b.bvh']])assert.throws(()=>parseNativeBvhSourceCliArgs(args),error=>error.code==='NATIVE_BVH_SOURCE_CLI_INVALID')
})
test('maintainer conversion writes a versioned source and private lineage without changing input or approving activation',t=>{
  const files=workspace(t),mapping=path.join(files.folder,'mapping.json');fs.writeFileSync(mapping,JSON.stringify({Hips:'rig:Hips',Head:'rig:Head'}))
  const report=convertNativeBvhSourceFiles({...files,animation:'take',unitScale:.01,boneMap:mapping})
  assert.equal(hash(fs.readFileSync(files.input)),hash(source));assert.equal(report.outputSha256,hash(fs.readFileSync(files.output)))
  assert.equal(report.outputDurationMs,250);assert.equal(report.declaredCaptureSpanMs,500);assert.equal(report.namesExplicitlyMapped,2)
  assert.equal(report.activationStatus,'NOT_ACTIVATED');assert.equal(report.nativePlaybackStatus,'NOT_VERIFIED')
  assert.equal(JSON.parse(fs.readFileSync(report.reportFile)).sourceSha256,hash(source))
})
test('existing output/report and destination collisions are refused before any overwrite',t=>{
  const files=workspace(t),options={...files,animation:'take'}
  fs.mkdirSync(path.dirname(files.output));fs.writeFileSync(files.output,'keep')
  assert.throws(()=>convertNativeBvhSourceFiles(options),error=>error.code==='NATIVE_BVH_SOURCE_CLI_INVALID');assert.equal(fs.readFileSync(files.output,'utf8'),'keep')
  const second=path.join(files.folder,'second.glb'),report=`${second}.conversion.json`;fs.writeFileSync(report,'keep report')
  assert.throws(()=>convertNativeBvhSourceFiles({...options,output:second}),error=>error.code==='NATIVE_BVH_SOURCE_CLI_INVALID');assert.equal(fs.existsSync(second),false);assert.equal(fs.readFileSync(report,'utf8'),'keep report')
  const map=path.join(files.folder,'map.json');fs.writeFileSync(map,'{}')
  assert.throws(()=>convertNativeBvhSourceFiles({...options,output:path.join(files.folder,'third.glb'),boneMap:map,report:map}),error=>error.code==='NATIVE_BVH_SOURCE_CLI_INVALID');assert.equal(fs.readFileSync(map,'utf8'),'{}')
})
