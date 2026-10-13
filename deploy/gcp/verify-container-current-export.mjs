// Disposable native edit regression for the image's actual service user.
// Read on stdin by node inside the CI container; this is not live-client proof.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
assert.notEqual(process.getuid(), 0, 'Exercise the actual non-root service user');
assert.equal(path.resolve(process.env.BETTERPPTX_LOCKED_ASSET_ROOT), '/out/locked-assets');
Object.assign(process.env, {
 NODE_ENV:'test', BETTERPPTX_ENV:'test', BETTERPPTX_DEPLOYMENT_STAGE:'test',
 BETTERPPTX_PUBLIC_BLACK_BOX:'1', BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY:'1',
 BETTERPPTX_FORCE_PLAN:'premium', BETTERPPTX_BILLING_ENFORCE:'0',
 BETTERPPTX_REQUIRE_FREE_VALUE_IDENTITY:'0', BETTERPPTX_REQUIRE_QUOTE_BINDING:'0',
 BETTERPPTX_OPERATION_EXECUTION_MODE:'inline', BETTERPPTX_DURABLE_OPERATION_STORE:'disabled',
 BETTERPPTX_DURABLE_DECK_STATE_STORE:'disabled', BETTERPPTX_REQUIRE_SHARED_STORES:'0',
 BETTERPPTX_REQUIRE_DURABLE_OPERATIONS:'0', BETTERPPTX_REQUIRE_DURABLE_DECK_STATE:'0',
 BETTERPPTX_DECK_SNAPSHOT_STORE:'local', BETTERPPTX_DECK_SNAPSHOT_DIR:'/out/smoke-specs',
 BETTERPPTX_ASSET_GRANT_STORE:'local', BETTERPPTX_ASSET_GRANT_DIR:'/out/smoke-grants',
 BETTERPPTX_LOCKED_ASSET_STORE:'local', BETTERPPTX_LOCKED_ASSET_SHARED_DIR:'/out/smoke-shared',
 BETTERPPTX_INSTALL_USAGE_FILE:'/out/smoke-usage.json', BETTERPPTX_USAGE_AUTO_FLUSH:'0',
 BETTERPPTX_LOG:'',
});
const {createMcpToolDispatcher,getDeck}=await import('/app/betterpptx-mcp/engine.mjs');
const {withResourceAuthorization}=await import('/app/betterpptx-mcp/auth/resource-authorization.mjs');
const context={installHash:'install_'+ 'c'.repeat(64),sessionId:'container-current-source-smoke',blackBox:true};
const mcp=createMcpToolDispatcher(context);
const spec={schemaVersion:'betterpptx.deck-spec.v1',title:'Current native source',layout:'LAYOUT_WIDE',
 authoringContract:{workflow:'ai-sovereign-v1',creativeAuthority:'ai',directorMode:'off',verificationMode:'complete',geometryAuthority:'ai',placementPolicy:'ai-authored-geometry-v1',coordinateSystem:'inches'},
 slides:[{id:'current',title:'Current native source',content:[{kind:'title',name:'headline',text:'Current native source',rect:{x:1,y:0.5,w:10,h:1},style:{fontSize:50}}]}]};
const committed=await mcp.call('betterpptx.deck.generate_from_spec',{spec,phase:'commit',commitMode:'createNew',saveAfterCommit:false,idempotencyKey:'container-current-source'});
assert.equal(committed.ok,true,JSON.stringify(committed.error));
const deckId=committed.data.deckId;
// Simulate a genuine native edit with no authored source block. It must retain
// preservation, while the original authored headline uses its exact source map.
withResourceAuthorization(context,()=>getDeck(deckId).pptx.slides[0].addText('A native edit',{x:1,y:3,w:8,h:1,fontSize:24,objectName:'native-edit'}));
const current=await mcp.call('betterpptx.deck.export_spec',{deckId,mode:'current',detail:'summary',download:false});
assert.equal(current.ok,true,JSON.stringify(current.error));
const content=current.data.spec.slides[0].content;
const headline=content.find(block=>block.name==='headline');
assert.ok(headline,'The exact authored identity survives current export');
assert.equal(headline.nativePreservation,undefined,'Do not create redundant snapshots for authored objects');
const nativeEdit=content.find(block=>block.name==='native-edit'||block.objectName==='native-edit');
assert.match(nativeEdit?.nativePreservation?.handle||'',/^asset:\/\/locked\//,'Keep genuine native edits through a real preservation snapshot');
const files=await fs.readdir('/out/locked-assets');
assert.ok(files.length>0,'Actual export wrote a preservation asset as the service user');
assert.equal(current.data.privacy.localPathsIncluded,false);
console.log('CONTAINER CURRENT EXPORT: PASS non-root, authored identity, native-edit preservation, private cache writable');
