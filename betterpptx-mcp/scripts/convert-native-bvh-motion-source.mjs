#!/usr/bin/env node
// Private maintainer conversion only; no source activation or public paths.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { nativeBvhMotionSource } from '../assets/native-bvh-motion-source.mjs'

const fail=message=>Object.assign(new Error(message),{code:'NATIVE_BVH_SOURCE_CLI_INVALID'})
const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
const help=`Convert an original BVH take to a native-axis skeletal GLB.

Usage:
  node betterpptx-mcp/scripts/convert-native-bvh-motion-source.mjs --input original.bvh --animation exact_name --output staging/source-v1.glb

Required: --input, --animation, --output
Optional: --unit-scale (default 1), --bone-map (JSON source-name to output-name map),
          --report (default OUTPUT.conversion.json), --help

Existing outputs are refused. Original source bytes, joint offsets, ordered
rotation channels, hierarchy and source time keys are preserved. The endpoint
is (frameCount - 1) * frameTime; no extra final frame is invented.
Use explicit world-delta retargeting only for source/target shared world axes.
Numerical source/target checks and native playback proof remain mandatory before
governed activation. This command does not activate, publish or approve assets.
`
export function parseNativeBvhSourceCliArgs(args){
  if(args.length===1&&args[0]==='--help')return{help:true}
  const keys=new Map([['--input','input'],['--animation','animation'],['--output','output'],['--unit-scale','unitScale'],['--bone-map','boneMap'],['--report','report']]),result={}
  for(let index=0;index<args.length;index++){
    const key=keys.get(args[index]),value=args[++index]
    if(!key||Object.hasOwn(result,key)||typeof value!=='string'||!value||value.startsWith('--'))throw fail('Use each supported option with one value; see --help.')
    result[key]=key==='unitScale'?Number(value):value
  }
  if(!result.input||!result.animation||!result.output)throw fail('--input, --animation and --output are required.')
  return result
}
export function convertNativeBvhSourceFiles({input,animation,output,unitScale=1,boneMap,report:reportOption}){
  if(![input,animation,output].every(value=>typeof value==='string'&&value))throw fail('Explicit input, animation and output are required.')
  const inputFile=fs.realpathSync(path.resolve(input)),outputFile=path.resolve(output),reportFile=path.resolve(reportOption||`${outputFile}.conversion.json`)
  if(path.extname(inputFile).toLowerCase()!=='.bvh'||path.extname(outputFile).toLowerCase()!=='.glb'||path.extname(reportFile).toLowerCase()!=='.json')throw fail('Use BVH input, GLB output and JSON report files.')
  const canonical=file=>process.platform==='win32'?file.toLowerCase():file
  const mapFile=boneMap?fs.realpathSync(path.resolve(boneMap)):null
  const immutable=[inputFile,...(mapFile?[mapFile]:[])],destinations=[outputFile,reportFile]
  if(new Set([...immutable,...destinations].map(canonical)).size!==immutable.length+destinations.length)throw fail('Input, mapping, output and report must be different files.')
  const absent=file=>{try{fs.lstatSync(file)}catch(error){if(error.code==='ENOENT')return;throw error}throw fail(`Refusing to overwrite existing file: ${file}`)}
  destinations.forEach(absent)
  const stat=fs.statSync(inputFile)
  if(!stat.isFile()||stat.size<=0||stat.size>32*1024*1024)throw fail('Input must be a nonempty regular BVH file within32MiB.')
  const original=fs.readFileSync(inputFile),mapBytes=mapFile?fs.readFileSync(mapFile):null,boneNameMap=mapBytes?JSON.parse(mapBytes):{}
  const result=nativeBvhMotionSource(original,{animationName:animation,unitScale,boneNameMap})
  if(hash(fs.readFileSync(inputFile))!==result.report.sourceSha256||(mapFile&&hash(fs.readFileSync(mapFile))!==hash(mapBytes)))throw fail('An original input changed during conversion; no output was written.')
  const report={...result.report,privateMaintainerEvidence:true,inputFile,outputFile,reportFile,...(mapFile?{boneMapFile:mapFile,boneMapSha256:hash(mapBytes)}:{}),activationStatus:'NOT_ACTIVATED',nativePlaybackStatus:'NOT_VERIFIED'}
  destinations.forEach(file=>fs.mkdirSync(path.dirname(file),{recursive:true}))
  const resolved=destinations.map(file=>path.join(fs.realpathSync(path.dirname(file)),path.basename(file)))
  if(new Set([...immutable,...resolved].map(canonical)).size!==immutable.length+destinations.length)throw fail('Resolved input, mapping, output and report must be different files.')
  destinations.forEach(absent)
  fs.writeFileSync(outputFile,result.buffer,{flag:'wx'});fs.writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n',{flag:'wx'})
  return report
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  try{const options=parseNativeBvhSourceCliArgs(process.argv.slice(2));if(options.help)console.log(help);else{const report=convertNativeBvhSourceFiles(options);console.log(JSON.stringify({status:'CONVERTED_NOT_ACTIVATED',outputFile:report.outputFile,reportFile:report.reportFile,sourceSha256:report.sourceSha256,outputSha256:report.outputSha256,durationMs:report.outputDurationMs},null,2))}}
  catch(error){console.error(`${error.code||'NATIVE_BVH_SOURCE_CLI_FAILED'}: ${error.message}`);process.exitCode=1}
}
