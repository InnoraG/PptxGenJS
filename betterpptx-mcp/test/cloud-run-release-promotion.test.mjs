import test from 'node:test';
import assert from 'node:assert/strict';
import {cloudRunReleaseCandidate,assertCloudRunReleaseTraffic} from '../../deploy/gcp/cloud-run-release-promotion.mjs';
const image='us-central1-docker.pkg.dev/example/project/app@sha256:'+'a'.repeat(64);
function fixture(){return {service:{metadata:{name:'example'},spec:{template:{spec:{containers:[{image}]}}},status:{latestCreatedRevisionName:'example-new',latestReadyRevisionName:'example-old',conditions:[{type:'Ready',status:'True'}],traffic:[{revisionName:'example-old',percent:100}]}},revision:{metadata:{name:'example-new',labels:{'serving.knative.dev/service':'example'}},spec:{containers:[{image}]},status:{imageDigest:image,conditions:[{type:'Ready',status:'True'}]}}};}
test('an old ready service and a new template cannot certify release traffic',()=>{
 const {service,revision}=fixture(),candidate=cloudRunReleaseCandidate(service,revision,{serviceName:'example',imageRef:image});
 assert.equal(candidate.revisionName,'example-new');assert.throws(()=>assertCloudRunReleaseTraffic(service,candidate));
 service.status.latestReadyRevisionName='example-new';assert.throws(()=>assertCloudRunReleaseTraffic(service,candidate));
 service.status.traffic=[{revisionName:'example-new',percent:100},{revisionName:'example-old',tag:'retained-reference'}];
 assert.equal(assertCloudRunReleaseTraffic(service,candidate),candidate);
});
test('unready, wrong-image and wrong-service revisions reject before promotion',()=>{
 for(const change of [f=>f.revision.status.conditions[0].status='False',f=>f.revision.status.imageDigest=image.replace(/a{64}$/,'b'.repeat(64)),f=>f.revision.spec.containers[0].image=image.replace(/a{64}$/,'b'.repeat(64)),f=>f.revision.metadata.labels['serving.knative.dev/service']='another-service']){
  const f=fixture();change(f);assert.throws(()=>cloudRunReleaseCandidate(f.service,f.revision,{serviceName:'example',imageRef:image}));
 }
});
test('split traffic and a concurrently replaced release cannot pass',()=>{
 const f=fixture(),candidate=cloudRunReleaseCandidate(f.service,f.revision,{serviceName:'example',imageRef:image});f.service.status.latestReadyRevisionName='example-new';
 f.service.status.traffic=[{revisionName:'example-new',percent:99},{revisionName:'example-old',percent:1}];assert.throws(()=>assertCloudRunReleaseTraffic(f.service,candidate));
 f.service.status.traffic=[{revisionName:'example-new',percent:100}];f.service.status.latestCreatedRevisionName='example-concurrent';assert.throws(()=>assertCloudRunReleaseTraffic(f.service,candidate));
});
