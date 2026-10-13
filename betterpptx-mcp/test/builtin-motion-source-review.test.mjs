import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {Client,InMemoryTransport} from '@modelcontextprotocol/client'
import {createBetterPptxMcpServer} from '../server.mjs'
import {initializeMotionSourceReviewCatalogs} from '../motion-source-review-startup.mjs'
import {publicMotionSourceReviews,ownedMotionSourceReview} from '../motion-source-authoring-reviews.mjs'
import {withResourceAuthorization,resourceOwnerForContext,assertResourceAccess} from '../auth/resource-authorization.mjs'

process.env.BETTERPPTX_PUBLIC_BLACK_BOX='1'
process.env.BETTERPPTX_LOCAL_MAINTAINER='0'

const publisherContext={sessionId:'builtin-presenter-product-publisher'}
const publisher=resourceOwnerForContext(publisherContext)
const record=(name,term)=>({
  sourceSha256:createHash('sha256').update(name).digest('hex'),
  sourceObservation:{clock:{durationMs:1000,fps:24,frameCount:25,sampleCount:25,temporalCoverage:'every-integer-frame'},coordinateSpace:'source-motion-space',units:{state:'unverified',value:null},confidence:'direct-source-measurement',rigBoneCount:65,measuredLandmarks:['root','head','leftHand','rightHand','leftFoot','rightFoot'],geometricBasis:{pelvisVerifiedSamples:25,pelvisUnknownSamples:0,chestVerifiedSamples:25,chestUnknownSamples:0}},
  authoredDescription:'An observed presenter motion requiring semantic review.',
  authoredSearchTerms:[term],suggestedChecks:['Verify hand and continuous hold before promising a pointing action.'],
})

test('ordinary MCP discovery shares the full built-in library between customers without sharing private reviews or granting assets',async()=>{
  const records=Array.from({length:520},(_,n)=>record(`builtin-${n}`,'builtinmotionfixture'))
  const startup={trustedMotionSourceReviewCatalogs:[
    {resourceOwner:publisher,records,catalogScope:'built-in'},
    {resourceOwner:publisher,records:[record('private-review','privatepublisherfixture')]},
  ]}
  const ids=[]
  for(const sessionId of ['builtin-customer-one','builtin-customer-two']){
    const server=createBetterPptxMcpServer({sessionId,blackBox:true},startup)
    const client=new Client({name:'builtin-catalog-contract-test',version:'1'},{capabilities:{}})
    const [clientTransport,serverTransport]=InMemoryTransport.createLinkedPair()
    try{
      await server.connect(serverTransport);await client.connect(clientTransport)
      const call=async arguments_=>{
        const result=await client.callTool({name:'betterpptx.authoring.catalog',arguments:arguments_})
        const payload=result.structuredContent??JSON.parse(result.content.find(item=>item.type==='text').text)
        assert.equal(payload.ok,true);return payload.data
      }
      const catalog=await call({view:'controls',family:'presenter-motion',query:'builtinmotionfixture',motionRequirements:{owningHand:'right',minimumHoldMs:500},limit:8})
      assert.equal(catalog.pagination.total,520)
      assert.equal(catalog.controls.length,8)
      assert.equal(catalog.motionQuery.status,'no-proven-match')
      assert.equal(catalog.motionQuery.counts.reviewRequired,520)
      assert.ok(catalog.controls.every(row=>row.selectable===false))
      ids.push(catalog.controls.map(row=>row.id))
      assert.doesNotMatch(JSON.stringify(catalog),/sourceSha256|resourceOwner|file:/)
      const privateCatalog=await call({view:'controls',family:'presenter-motion',query:'privatepublisherfixture',limit:8})
      assert.equal(privateCatalog.pagination.total,0)
      await withResourceAuthorization({sessionId},()=>{
        const source=ownedMotionSourceReview(ids.at(-1)[0])
        assert.equal(source.catalogScope,'built-in')
        assert.deepEqual(source.resourceOwner,publisher)
        // Shared review metadata is not an authorization bypass for the
        // publisher's original asset, candidate or generated output.
        assert.throws(()=>assertResourceAccess({resourceOwner:publisher}),{code:'RESOURCE_NOT_FOUND'})
      })
    }finally{await client.close();await server.close()}
  }
  assert.deepEqual(ids[0],ids[1])
  assert.equal(publicMotionSourceReviews().length,520)
  await withResourceAuthorization(publisherContext,()=>{
    assert.equal(publicMotionSourceReviews().length,521)
    assert.throws(()=>initializeMotionSourceReviewCatalogs([{resourceOwner:publisher,records:[],catalogScope:'built-in'}]),{code:'SOURCE_REVIEW_STARTUP_UNAVAILABLE'})
  })
  assert.throws(()=>initializeMotionSourceReviewCatalogs([{resourceOwner:publisher,records:[],catalogScope:'all-owners'}]),{code:'SOURCE_REVIEW_STARTUP_UNAVAILABLE'})
})
