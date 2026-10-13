// Maintainer release checks. Bind readiness and traffic to the pushed image,
// rather than pairing a new service template with a stale ready revision.
const fail=message=>{throw new Error(message);};
const digest=image=>{
 const value=String(image??'').split('@').at(-1);
 if(!/^sha256:[a-f0-9]{64}$/.test(value))fail('An immutable release image is required.');
 return value;
};
export function cloudRunReleaseCandidate(service,revision,{serviceName,imageRef}){
 const name=service?.status?.latestCreatedRevisionName;
 if(service?.metadata?.name!==serviceName||typeof name!=='string'||!name||revision?.metadata?.name!==name||revision?.metadata?.labels?.['serving.knative.dev/service']!==serviceName)fail('The release revision does not match the newly created service revision.');
 if(!revision?.status?.conditions?.some(condition=>condition.type==='Ready'&&condition.status==='True'))fail('The new release revision is not ready.');
 if(service?.spec?.template?.spec?.containers?.[0]?.image!==imageRef||revision?.spec?.containers?.[0]?.image!==imageRef||digest(revision?.status?.imageDigest)!==digest(imageRef))fail('The ready revision does not contain the pushed release image.');
 return Object.freeze({serviceName,revisionName:name,imageRef});
}
export function assertCloudRunReleaseTraffic(service,candidate){
 if(service?.metadata?.name!==candidate.serviceName||service?.status?.latestCreatedRevisionName!==candidate.revisionName||service?.status?.latestReadyRevisionName!==candidate.revisionName||service?.spec?.template?.spec?.containers?.[0]?.image!==candidate.imageRef)fail('The routed service is not bound to the verified release revision.');
 const positive=(service.status.traffic??[]).filter(row=>Number(row.percent)>0);
 if(positive.length!==1||positive[0].revisionName!==candidate.revisionName||positive[0].percent!==100)fail('The verified release revision is not receiving all service traffic.');
 return candidate;
}
