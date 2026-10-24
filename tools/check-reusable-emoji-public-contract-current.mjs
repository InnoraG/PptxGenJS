// Local maintainer regression through the ordinary public MCP boundary.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {Client,InMemoryTransport} from '@modelcontextprotocol/client';
const out=path.resolve('emoji-native-current/catalog-integration-current');
Object.assign(process.env,{BETTERPPTX_PUBLIC_BLACK_BOX:'1',BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY:'1',BETTERPPTX_LOCAL_MAINTAINER:'0',BETTERPPTX_AUTH:'none',BETTERPPTX_BILLING_ENFORCE:'0',BETTERPPTX_PREMIUM:'1',BETTERPPTX_LOG:'',BETTERPPTX_ASSET_GRANT_STORE:'local',BETTERPPTX_ASSET_GRANT_DIR:path.join(out,'local-asset-grants'),BETTERPPTX_VERIFICATION_POLICY:'production-non-rendering'});
const {createBetterPptxMcpServer}=await import('../betterpptx-mcp/server.mjs');
const server=createBetterPptxMcpServer({sessionId:'local-emoji-contract',blackBox:true}),client=new Client({name:'local-emoji-contract',version:'1'},{capabilities:{}}),[ct,st]=InMemoryTransport.createLinkedPair(),checks=[];
const original=JSON.parse(fs.readFileSync(path.join(out,'Approved_Emoji_Catalogue.betterpptx-spec.json'),'utf8'));
const base=()=>({...structuredClone(original),slides:structuredClone(original.slides.slice(0,2))});
async function dryRun(spec){const r=await client.callTool({name:'betterpptx.deck.generate_from_spec',arguments:{spec,phase:'dryRun',detail:'summary'}});return r.structuredContent??JSON.parse(r.content.find(c=>c.type==='text').text);}
try{
 await server.connect(st);await client.connect(ct);
 const valid=await dryRun(base());assert.equal(valid.ok,true);checks.push({check:'opaque catalogue handles with default animations',passed:true});
 for(const slideIndex of[0,1]){
  const spec=base(),model=spec.slides[slideIndex].content.find(c=>c.kind==='model3d');model.animation=false;
  const result=await dryRun(spec);assert.equal(result.ok,false);checks.push({check:`explicit stopped registered motion rejected on slide ${slideIndex+1}`,passed:true,code:result.error?.code});
 }
 const mismatch=base(),hand=mismatch.slides[0].content.find(c=>c.kind==='model3d'),face=mismatch.slides[1].content.find(c=>c.kind==='model3d');hand.modelOptions.glbFile=face.modelAsset;
 const result=await dryRun(mismatch);assert.equal(result.ok,false);checks.push({check:'conflicting source reference rejected',passed:true,code:result.error?.code});
 console.log(JSON.stringify({passed:true,checks}));
}finally{fs.writeFileSync(path.join(out,'public-contract-check.json'),JSON.stringify({checks},null,2));await client.close();await server.close();}
