import {execFileSync} from 'node:child_process';
import {appendFileSync} from 'node:fs';
import {cloudRunReleaseCandidate,assertCloudRunReleaseTraffic} from './cloud-run-release-promotion.mjs';
const args=process.argv.slice(2),option=name=>{const index=args.indexOf(name);return index<0?undefined:args[index+1];};
const project=option('--project'),region=option('--region'),serviceName=option('--service'),imageRef=option('--image'),environmentKey=option('--environment-key');
if(!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(project??'')||!/^[-a-z0-9]{1,63}$/.test(region??'')||!/^[-a-z0-9]{1,63}$/.test(serviceName??'')||!imageRef||environmentKey!==undefined&&!/^[A-Z][A-Z0-9_]{1,63}$/.test(environmentKey))throw new Error('Explicit existing project, region, service and immutable image are required.');
const gcloud=command=>{
 try{return execFileSync('gcloud',command,{encoding:'utf8',maxBuffer:2*1024*1024,timeout:600000});}
 catch(error){throw new Error(`Cloud Run release action failed (${error.status??error.code??'unavailable'}).`);}
};
const location=['--project='+project,'--region='+region];
const service=()=>JSON.parse(gcloud(['run','services','describe',serviceName,...location,'--format=json']));
const current=service(),revisionName=current.status?.latestCreatedRevisionName;
if(typeof revisionName!=='string'||!revisionName)throw new Error('The newly created revision is missing.');
const revision=JSON.parse(gcloud(['run','revisions','describe',revisionName,...location,'--format=json']));
const candidate=cloudRunReleaseCandidate(current,revision,{serviceName,imageRef});
gcloud(['run','services','update-traffic',serviceName,...location,'--to-revisions='+candidate.revisionName+'=100','--quiet']);
assertCloudRunReleaseTraffic(service(),candidate);
if(environmentKey){if(!process.env.GITHUB_ENV)throw new Error('The runner environment output is missing.');appendFileSync(process.env.GITHUB_ENV,environmentKey+'='+candidate.revisionName+'\n');}
console.log(JSON.stringify({service:serviceName,revision:candidate.revisionName,image:imageRef,trafficPercent:100}));
