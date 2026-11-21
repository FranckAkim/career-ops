import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {completionPrefix,issueCompletionReceipt,completionEvidence,vercelCompletionVerifier} from '../completion-receipts.mjs';
import {RequestDrain} from '../request-drain.mjs';
const secret='synthetic-completion-secret-'.repeat(3),projectId='prj_SyntheticCompletion123456789',deploymentId='dpl_SyntheticCompletion123456789',instanceId=randomUUID();
function fixture(){const id=randomUUID(),started_at=new Date(Date.now()-1000),activity={id,deployment_id:deploymentId,instance_id:instanceId,started_at},token=issueCompletionReceipt({secret,projectId,activityId:id,deploymentId,instanceId,completedAt:new Date().toISOString()});return {activity,token};}
test('signed receipts bind project, activity, deployment and instance with bounded parsing',async()=>{
 const {activity,token}=fixture(),input={secret,projectId,activity,logText:token};const proof=completionEvidence(input)[0];assert.equal(proof.resourcesDrained,true);assert.equal(proof.terminated,undefined);assert.equal(completionEvidence({...input,activity:{...activity,started_at:new Date('2100-01-01')}}).length,1,'clock differences neither grant nor revoke authentic identity-bound evidence');
 assert.deepEqual(completionEvidence({...input,secret:'wrong-secret-'.repeat(5)}),[]);
 for(const wrong of [{...activity,id:randomUUID()},{...activity,instance_id:randomUUID()},{...activity,deployment_id:'dpl_ForeignCompletion123456789'}])assert.deepEqual(completionEvidence({...input,activity:wrong}),[]);
 assert.deepEqual(completionEvidence({...input,projectId:'prj_ForeignCompletion123456789'}),[]);
 const envelope=JSON.parse(Buffer.from(token.split(' ').at(-1),'base64url'));envelope.payload.kind='execution_terminated';assert.deepEqual(completionEvidence({...input,logText:completionPrefix+activity.id+' '+Buffer.from(JSON.stringify(envelope)).toString('base64url')}),[]);
 assert.throws(()=>completionEvidence({...input,logText:'x'.repeat(1000001)}),/completion_not_verified/);
 assert.deepEqual(completionEvidence({...input,logText:'status=200 FUNCTION_INVOCATION_TIMEOUT'}),[]);
 const verify=vercelCompletionVerifier({secret,projectId,readLogs:async scope=>{assert.equal(scope.activityId,activity.id);return 'provider output\n'+token;}});
 assert.deepEqual(await verify({...activity,evidenceHash:proof.evidenceHash}),proof);assert.equal(await verify({...activity,evidenceHash:'a'.repeat(64)}),null);
 await assert.rejects(vercelCompletionVerifier({secret,projectId,readLogs:async()=>{throw Error('private provider payload');}})({...activity,evidenceHash:proof.evidenceHash}),/completion_not_verified/);
});
test('resource completion is reported before a failed database settlement, after pending cleanup',async()=>{
 let id,finish;const gate=new Promise(r=>finish=r),reports=[];
 const pool={async query(sql,args){if(sql.startsWith('insert')){id=args[0];return {rowCount:1};}throw Error('synthetic_database_outage');}};
 const drain=new RequestDrain({pool,deploymentId,instanceId,completion:{secret,projectId,report:receipt=>reports.push(receipt)}});
 const response=await drain.run(async register=>{await register(randomUUID());return new Response(new ReadableStream({async cancel(){await gate;}}));});
 const cancelling=response.body.cancel();await new Promise(r=>setImmediate(r));assert.equal(reports.length,0);finish();await assert.rejects(cancelling,/synthetic_database_outage/);assert.equal(reports.length,1);
 const proofs=completionEvidence({secret,projectId,activity:{id,deployment_id:deploymentId,instance_id:instanceId,started_at:new Date(0)},logText:reports[0]});assert.equal(proofs.length,1);
});
test('uncertain cleanup never emits a resource-completion receipt',async()=>{
 const reports=[],drain=new RequestDrain({pool:{query:async()=>({rowCount:1})},deploymentId,instanceId,completion:{secret,projectId,report:r=>reports.push(r)}});
 const response=await drain.run(async register=>{await register(randomUUID());return new Response(new ReadableStream({cancel(){throw Error('synthetic_cleanup_failure');}}));});
 await assert.rejects(response.body.cancel(),/synthetic_cleanup_failure/);assert.equal(reports.length,0);
});
