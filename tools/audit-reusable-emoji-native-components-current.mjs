// Reuse native playback evidence only when the delivered visual/motion input
// is identical. Keep hashes rather than duplicate model/package readbacks.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import JSZip from 'jszip';
import {DOMParser} from '@xmldom/xmldom';
const root=path.resolve('emoji-native-current/catalog-integration-current'),file=path.join(root,'native-component-identities.json');
const sha=b=>createHash('sha256').update(b).digest('hex');
async function inputs(pptx){
 const bytes=fs.readFileSync(pptx),zip=await JSZip.loadAsync(bytes),result=[],mediaHashes=new Map();
 for(const part of Object.keys(zip.files).filter(n=>/^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a,b)=>Number(a.match(/slide(\d+)/)[1])-Number(b.match(/slide(\d+)/)[1]))){
  const doc=new DOMParser().parseFromString(await zip.file(part).async('string'),'application/xml'),relsPart=path.posix.join(path.posix.dirname(part),'_rels',path.posix.basename(part)+'.rels'),rels=new Map();
  if(zip.file(relsPart)){const d=new DOMParser().parseFromString(await zip.file(relsPart).async('string'),'application/xml');for(const r of Array.from(d.getElementsByTagName('Relationship'))){const target=r.getAttribute('Target'),name=path.posix.normalize(path.posix.join(path.posix.dirname(part),target));if(zip.file(name)&&!mediaHashes.has(name))mediaHashes.set(name,sha(await zip.file(name).async('nodebuffer')));rels.set(r.getAttribute('Id'),mediaHashes.get(name)??target);}}
  const canonical=n=>{
   if(n.nodeType===3)return n.nodeValue.trim()||null;
   if(n.nodeType!==1||n.localName==='creationId'||n.localName==='modId')return null;
   const attrs=Array.from(n.attributes).filter(a=>a.prefix!=='xmlns'&&a.name!=='xmlns').map(a=>[a.namespaceURI||'',a.localName,a.namespaceURI?.includes('/relationships')?(rels.get(a.value)||a.value):a.value]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
   return[n.namespaceURI||'',n.localName,attrs,Array.from(n.childNodes).map(canonical).filter(x=>x!==null)];
  };
  const models=Array.from(doc.getElementsByTagName('am3d:model3d')).map(n=>{while(n.parentNode?.nodeType===1&&n.localName!=='graphicFrame')n=n.parentNode;return canonical(n);});
  const timing=doc.getElementsByTagName('p:timing')[0];result.push({slide:result.length+1,modelCount:models.length,modelVisualSha256:sha(JSON.stringify(models)),modelMotionSha256:sha(JSON.stringify(timing?canonical(timing):null))});
 }
 return{packageSha256:sha(bytes),slides:result};
}
if(process.argv.includes('--capture')){
 const current=await inputs(path.join(root,'Approved_Emoji_Catalogue.pptx')),proof=JSON.parse(fs.readFileSync(path.join(root,'final-native-current/normal-native-review.json'),'utf8'));
 assert.equal(proof.sourceSha256,current.packageSha256);assert.equal(proof.status,'PASS_FINAL_NATIVE_HAND_AND_ALL70_FACES');assert.equal(proof.visualReview.firstVisibleIdentityAndPropsPassedAll70,true);assert.equal(proof.visualReview.approvedHandshakeFrontAndTop90Passed,true);assert.equal(proof.timestampGapCount,0);
 assert.equal(current.slides.length,11);assert.equal(current.slides.reduce((n,s)=>n+s.modelCount,0),72);
 fs.writeFileSync(file,JSON.stringify({qualifiedPackageSha256:current.packageSha256,nativeProof:'final-native-current/normal-native-review.json',expected:current.slides},null,2));console.log('Captured 72 current native-qualified model visual/motion component identities.');
}else{
 const expected=JSON.parse(fs.readFileSync(file,'utf8')),actual=await inputs(path.join(root,'Approved_Emoji_Catalogue.pptx'));assert.deepEqual(actual.slides,expected.expected);
 const report={status:'PASS_ALL72_NATIVE_VISUAL_AND_MOTION_INPUTS_MATCH_QUALIFIED_BASELINE',currentPackageSha256:actual.packageSha256,qualifiedPackageSha256:expected.qualifiedPackageSha256,nativeProof:expected.nativeProof,models:actual.slides.reduce((n,s)=>n+s.modelCount,0),slides:actual.slides.length,scope:'Native 3D visual trees, referenced media bytes, full native timing trees and shape target bindings. Nonvisual creation/modification IDs are excluded. Text styling and slide advance timing are outside this component hash; final-deck native opening is checked separately.'};fs.writeFileSync(path.join(root,'native-component-verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
