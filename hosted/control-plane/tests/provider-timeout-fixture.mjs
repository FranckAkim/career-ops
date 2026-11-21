import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
// Generates source only. Deploy manually to a separate protected preview using
// a fresh synthetic key; never attach production databases, stores or OAuth.
export async function providerTimeoutFixture({activityId=randomUUID(),instanceId=randomUUID()}={}){
 const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
 if(!uuid.test(activityId)||!uuid.test(instanceId))throw Error('invalid_fixture_identity');
 const handler=`import {requestReceiptCodec} from '../lib/receipt-codec.mjs';
const codec=requestReceiptCodec('resource_work_admitted');
export default async function(req,res){
 res.setHeader('Cache-Control','private, no-store');
 if(req.method!=='POST'){res.statusCode=405;res.end('synthetic probe requires POST');return;}
 console.info(codec.issue({secret:process.env.PROBE_RECEIPT_KEY,projectId:process.env.VERCEL_PROJECT_ID,deploymentId:process.env.VERCEL_DEPLOYMENT_ID,activityId:'${activityId}',instanceId:'${instanceId}',admittedAt:new Date().toISOString()}));
 await new Promise(resolve=>setTimeout(resolve,15000));
 console.info('SYNTHETIC_AFTER_MAX_DURATION ${activityId}');
 res.end('synthetic late completion');
}
`;
 const sources={
  'package.json':JSON.stringify({private:true,type:'module',engines:{node:'24.x'}},null,2),
  'vercel.json':JSON.stringify({functions:{'api/probe.mjs':{maxDuration:5}}},null,2),
  'api/probe.mjs':handler,
  'lib/receipt-codec.mjs':await fs.readFile(new URL('../receipt-codec.mjs',import.meta.url),'utf8')
 };
 return {activityId,instanceId,maxDurationSeconds:5,files:Object.entries(sources).map(([file,data])=>({file,data,encoding:'utf-8'}))};
}
