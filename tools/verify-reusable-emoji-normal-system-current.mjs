// Maintainer-only local integration through the ordinary public MCP server.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Client,InMemoryTransport} from '@modelcontextprotocol/client';
import JSZip from 'jszip';
import {DOMParser} from '@xmldom/xmldom';
const handOnly=process.argv.includes('--hand-only'),baseName=handOnly?'Approved_Handshake_Pilot':'Approved_Emoji_Catalogue';
const out=path.resolve('emoji-native-current/catalog-integration-current',handOnly?'hand-native-pilot':'.');fs.mkdirSync(out,{recursive:true});
Object.assign(process.env,{BETTERPPTX_INSTALL_USAGE_STORE:'local',BETTERPPTX_INSTALL_USAGE_FILE:path.join(out,'local-install-usage.json'),BETTERPPTX_ARTIFACT_STORE:'local',BETTERPPTX_ASSET_GRANT_STORE:'local',BETTERPPTX_ASSET_GRANT_DIR:path.join(out,'local-asset-grants'),BETTERPPTX_PUBLIC_BLACK_BOX:'1',BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY:'1',BETTERPPTX_LOCAL_MAINTAINER:'0',BETTERPPTX_AUTH:'none',BETTERPPTX_BILLING_ENFORCE:'0',BETTERPPTX_PREMIUM:'1',BETTERPPTX_LOG:'',BETTERPPTX_VERIFICATION_POLICY:'production-non-rendering'});
const {createBetterPptxMcpServer}=await import('../betterpptx-mcp/server.mjs');
const {getDeck}=await import('../betterpptx-mcp/engine.mjs');
const {publicCatalogAssetHandle}=await import('../betterpptx-mcp/blackbox.mjs');
const {reusableAnimatedModelCatalogEntries}=await import('../betterpptx-mcp/assets/reusable-animated-model-library.mjs');
const server=createBetterPptxMcpServer({sessionId:'reusable-emoji-local-acceptance',quotaIdentityHash:'local-acceptance-'+createHash('sha256').update('local-reusable-emoji-acceptance').digest('hex'),blackBox:true}),client=new Client({name:'reusable-emoji-normal-system',version:'1'},{capabilities:{}}),[ct,st]=InMemoryTransport.createLinkedPair(),receipts=[];
const sha=b=>createHash('sha256').update(b).digest('hex');
async function call(name,args={}){const r=await client.callTool({name,arguments:args});let p=r.structuredContent;if(!p){try{p=JSON.parse(r.content.find(c=>c.type==='text').text)}catch{throw Error(name+': unreadable response');}}if(p.ok!==true)throw Object.assign(Error(name+': '+JSON.stringify(p)),{tool:name});return p.data??p;}
try{
 await server.connect(st);await client.connect(ct);
 const auth=await call('betterpptx.auth.status');receipts.push({stage:'local-auth',result:auth});
 const cap=await call('betterpptx.help.capabilities',{intent:'Generate an editable native PowerPoint from reusable approved handshake and identity-preserving face emoji catalogue selections, with synchronized animations.',detail:'summary'});receipts.push({stage:'capabilities',result:cap});
 const workflow=await call('betterpptx.help.workflow',{detail:'summary'});receipts.push({stage:'workflow',result:workflow});
 const faces=await call('betterpptx.assets.catalog',{query:'ceramic satin',source:'betterpptx-face-motions',kind:'model3d',sizePolicy:'large-ok',maxResults:60,includeDuplicates:true});
 const hands=await call('betterpptx.assets.catalog',{query:'approved handshake',source:'betterpptx-emoji-motions',kind:'model3d',sizePolicy:'standard',maxResults:20});
 receipts.push({stage:'catalog-faces',result:faces},{stage:'catalog-handshake',result:hands});
 fs.writeFileSync(path.join(out,'normal-system-discovery.json'),JSON.stringify(receipts,null,2));
 console.log(JSON.stringify({stage:'discovered',faces:faces.count,faceRows:faces.results?.length,handRows:hands.results?.length,firstFace:faces.results?.[0],hand:hands.results?.[0]}));
 if(process.argv.includes('--discover'))process.exitCode=0;
 else{
 const entries=reusableAnimatedModelCatalogEntries(),known=new Map([...faces.results,...hands.results].map(r=>[r.handle,r]));
 for(const e of entries){const handle=publicCatalogAssetHandle(e.handle,'model3d');if(!known.has(handle)){const r=await call('betterpptx.assets.catalog',{query:e.title,source:e.source,kind:'model3d',sizePolicy:'large-ok',maxResults:60,includeDuplicates:true});for(const row of r.results)known.set(row.handle,row);receipts.push({stage:'catalog-additional-selection',query:e.title,result:r});}assert.ok(known.has(handle),'Catalogue selection not discoverable: '+e.title);}
 const handle=e=>publicCatalogAssetHandle(e.handle,'model3d'),hand=entries.find(e=>e.reusableMotion.id==='motion.hand.handshake-approved'),faceEntries=entries.filter(e=>e.source==='betterpptx-face-motions');assert.equal(faceEntries.length,70);
 const text=(name,value,x,y,w,h,fontSize=20)=>({kind:'textBox',name,text:value,rect:{x,y,w,h},style:{fontSize,color:'263246',fontFace:'Aptos'},altText:value});
 const lighting={ambientLight:{color:{r:50000,g:50000,b:50000},illuminance:.5},ptLights:[{color:{r:100000,g:75000,b:50000},intensity:9.765625,pos:{x:21959998,y:70920001,z:16344003}},{color:{r:40000,g:60000,b:95000},intensity:12.25,pos:{x:-37964106,y:51130435,z:57631972}}]};
 const faceView={camera:{pos:{x:0,y:0,z:72274889},fov:45},trans:{meterPerModelUnit:{n:224373,d:1000000},preTrans:{dx:-1,dy:-1170769,dz:-4601599},scale:{sx:1.5,sy:1.5,sz:1.5},rot:{ax:0,ay:0,az:0},postTrans:{dx:0,dy:0,dz:0}},objViewport:2657795,...lighting};
 const {createSceneEvaluator}=await import('../betterpptx-mcp/tools/audit-paired-hand-surface-contact.mjs'),ev=createSceneEvaluator(fs.readFileSync('betterpptx-mcp/assets/approved-hand-motions/handshake-approved.glb'),0),times=[...ev.keyTimes,...ev.keyTimes.slice(1).map((t,i)=>(t+ev.keyTimes[i])/2)],bounds=[Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity];
 for(const t of times)for(const h of ev.evaluate(t))for(let i=0;i<h.P.length;i+=3)for(let k=0;k<3;k++){bounds[k]=Math.min(bounds[k],h.P[i+k]);bounds[k+3]=Math.max(bounds[k+3],h.P[i+k]);}
 const extent=Math.max(...[0,1,2].map(k=>bounds[k+3]-bounds[k])),n=Math.floor(1000000/extent),pre=[0,1,2].map(k=>Math.round(-(bounds[k]+bounds[k+3])/2*n/1000000*36000000)),handView={camera:{pos:{x:0,y:0,z:72274889},fov:45},trans:{meterPerModelUnit:{n,d:1000000},preTrans:{dx:pre[0],dy:pre[1],dz:pre[2]},scale:{sx:1,sy:1,sz:1},rot:{ax:0,ay:-1109798,az:0},postTrans:{dx:0,dy:0,dz:0}},objViewport:7200000,...lighting};
 fs.writeFileSync(path.join(out,'authored-hand-view-bounds.json'),JSON.stringify({sourceSha256:hand.sha256,bounds,sampleCount:times.length,view:handView},null,2));
 const model=(name,e,rect,view)=>({kind:'model3d',name,modelAsset:handle(e),rect,altText:e.title,modelOptions:{...view,nativeOnly:true}});
 const slides=[{id:'approved-handshake',title:'The approved handshake',message:'The approved movement is selected from the reusable catalogue.',notes:'Native editable 3D models from the maintained catalogue. Both views use the exact approved motion and source timing; no video substitute.',transition:{type:'fade',duration:0,advanceAfterTime:6000,advanceOnClick:false},content:[text('title','The approved handshake',.6,.35,11.9,.6,28),text('front-label','Front',.8,1.15,5.5,.4,18),text('top-label','Top · 90°',7,1.15,5.5,.4,18),model('handshake-front',hand,{x:.5,y:1.8,w:6.1,h:4.9},handView),model('handshake-top',hand,{x:6.75,y:1.8,w:6.1,h:4.9},{...handView,trans:{...handView.trans,rot:{ax:5400000,ay:0,az:-1109798}}})]}];
 if(!handOnly)for(let start=0;start<70;start+=7){const batch=faceEntries.slice(start,start+7),content=[text('title','Reusable face expressions',.6,.35,10.2,.6,28),text('page',`${start+1}–${start+batch.length} / 70`,11,.4,1.9,.6,16)];batch.forEach((e,i)=>{const row=i<4?0:1,col=i<4?i:i-4,x=.45+col*3.2+(row?1.6:0),y=1.2+row*2.85;content.push(model('face-'+(start+i+1),e,{x,y,w:2.7,h:2.2},faceView),text('label-'+i,e.reusableMotion.label,x,y+2.25,2.7,.6,16));});slides.push({id:'faces-'+(start+1),title:'Reusable face expressions',message:'Each selected expression keeps its identity before and after motion.',notes:batch.map(e=>e.reusableMotion.label).join('; '),transition:{type:'fade',duration:0,advanceAfterTime:6000,advanceOnClick:false},content});}
 const spec={schemaVersion:'betterpptx.deck-spec.v1',title:'Approved Emoji Catalogue',layout:'LAYOUT_WIDE',authoringContract:{workflow:'ai-sovereign-v1',creativeAuthority:'ai',directorMode:'off',verificationMode:'complete',geometryAuthority:'ai',placementPolicy:'ai-authored-geometry-v1',coordinateSystem:'inches'},contentStory:{audience:'Catalogue owner',outcome:'Review approved native hand and face emoji selected through the normal reusable catalogue.',remember:'Reusable emoji remain native editable models with their own identity and motion.'},visualDesign:{world:'Clear product review',framing:'White canvas, readable labels, native emoji as the visual proof.'},styleIntent:{artDirection:'editorial',mode:'light',density:'minimal'},theme:{fontFace:'Aptos',palette:['FFFFFF','263246','5072A6','F3F5F8']},motionTime:{masterClock:'authored',timingSource:'registered reusable source movements',syncPolicy:'synchronized native model animations'},validation:{validateBeforeSave:true},slides};
 fs.writeFileSync(path.join(out,baseName+'.betterpptx-spec.json'),JSON.stringify(spec,null,2));
 const dry=await call('betterpptx.deck.generate_from_spec',{spec,phase:'dryRun',detail:'summary'});receipts.push({stage:'dryRun',result:dry});console.log(JSON.stringify({stage:'dryRun',result:dry}));
 if(process.argv.includes('--dry-run')){}
 else{
 const commit=await call('betterpptx.deck.generate_from_spec',{spec,phase:'commit',commitMode:'createNew',saveAfterCommit:false,detail:'summary',idempotencyKey:'approved-reusable-emoji-local-catalogue-v1'});receipts.push({stage:'commit',result:commit});console.log(JSON.stringify({stage:'commit',result:commit}));
 const deckId=commit.deckId;assert.ok(deckId,'No committed deck');
 for(const name of ['betterpptx.deck.validate','betterpptx.deck.validate_design','betterpptx.deck.validate_accessibility','betterpptx.deck.validate_native_visuals','betterpptx.deck.validate_quality']){const result=await call(name,{deckId});receipts.push({stage:name,result});console.log(JSON.stringify({stage:name,result}));}
 const exported=await call('betterpptx.deck.export_spec',{deckId,detail:'full'});fs.writeFileSync(path.join(out,baseName+'.exported-spec.json'),JSON.stringify(exported,null,2));
 const saved=await call('betterpptx.deck.save',{deckId,fileName:baseName+'.pptx',idempotencyKey:'approved-reusable-emoji-local-save-v1'});receipts.push({stage:'save',result:saved});
 const bytes=fs.readFileSync(getDeck(deckId).lastSavedPath),target=path.join(out,baseName+'.pptx');fs.writeFileSync(target,bytes);
 const zip=await JSZip.loadAsync(bytes),glbs=Object.values(zip.files).filter(f=>f.name.endsWith('.glb')),hashes=[];for(const f of glbs)hashes.push({part:f.name,sha256:sha(await f.async('nodebuffer'))});
 let modelCount=0;for(const file of Object.values(zip.files).filter(f=>/^ppt\/slides\/slide\d+\.xml$/.test(f.name))){const doc=new DOMParser().parseFromString(await file.async('string'),'application/xml');modelCount+=doc.getElementsByTagName('am3d:model3d').length;}
 const audit={stage:'normal-system-package',deckId,path:target,sha256:sha(bytes),bytes:bytes.length,embeddedBanks:hashes,nativeModels:modelCount,embeddedVideoParts:Object.keys(zip.files).filter(f=>/\.(mp4|wmv|webm)$/i.test(f)).length,generatedThrough:'ordinary betterpptx.deck.generate_from_spec public MCP dryRun/commit',deployed:false};receipts.push(audit);console.log(JSON.stringify(audit));
 }
 }
}catch(e){receipts.push({stage:'failure',tool:e.tool,message:e.message});console.error(e.message);process.exitCode=1;}
finally{fs.writeFileSync(path.join(out,'normal-system-generation-receipt.json'),JSON.stringify(receipts,null,2));await client.close();await server.close();}
