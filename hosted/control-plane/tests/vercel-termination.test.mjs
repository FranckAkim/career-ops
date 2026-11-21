import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {issueAdmissionReceipt} from '../admission-receipts.mjs';
import {timeoutEvidence,vercelTerminationVerifier} from '../vercel-termination.mjs';
const secret='synthetic-timeout-secret-'.repeat(3),projectId='prj_SyntheticTimeout12345678901',deploymentId='dpl_SyntheticTimeout12345678901';
function fixture(){
 const activity={id:randomUUID(),deployment_id:deploymentId,instance_id:randomUUID()},requestId='synthetic-1795281704490-abcd12345678',row={deploymentId,requestId,invocationId:'01M7ZJ1NNM6SE29K7HY1PCQBEA',errorCode:'timeout',httpStatus:'504',vercel_function_invocation_count_count:1};
 const logRecords=[{projectId,deploymentId,requestId,source:'function',isSystemLog:false,truncated:false,message:issueAdmissionReceipt({secret,projectId,activityId:activity.id,deploymentId,instanceId:activity.instance_id,admittedAt:new Date().toISOString()})}];
 const invocationResponse={projectId,complete:true,response:{query:{metric:'vercel.function_invocation.count',aggregation:'count',groupBy:['deploymentId','requestId','invocationId','errorCode','httpStatus']},meta:{outputs:{vercel_function_invocation_count_count:{metric:'vercel.function_invocation.count',aggregation:'count'}}},summary:[row]}};
 return {secret,projectId,activity,logRecords,invocationResponse};
}
test('joins signed admission to exact provider request/invocation timeout evidence',async()=>{
 const f=fixture(),proof=timeoutEvidence(f)[0];assert.equal(proof.terminated,true);assert.equal(proof.activityId,f.activity.id);
 const verify=vercelTerminationVerifier({secret,projectId,readAdmissionLogs:async scope=>{assert.equal(scope.activityId,f.activity.id);return f.logRecords;},readInvocationRecords:async scope=>{assert.equal(scope.requestId,f.logRecords[0].requestId);return f.invocationResponse;}});
 assert.deepEqual(await verify({...f.activity,evidenceHash:proof.evidenceHash}),proof);assert.equal(await verify({...f.activity,evidenceHash:'a'.repeat(64)}),null);
});
test('ordinary HTTP errors and textual timeout claims cannot establish termination',()=>{
 for(const patch of [{errorCode:'',httpStatus:'200'},{errorCode:'FUNCTION_INVOCATION_FAILED',httpStatus:'500'},{errorCode:'',httpStatus:'504'},{vercel_function_invocation_count_count:0},{vercel_function_invocation_count_count:2}]){const f=fixture();Object.assign(f.invocationResponse.response.summary[0],patch);assert.deepEqual(timeoutEvidence(f),[]);}
 const f=fixture();f.logRecords[0].message='FUNCTION_INVOCATION_TIMEOUT';assert.deepEqual(timeoutEvidence(f),[]);
});
test('foreign, ambiguous, truncated and incomplete evidence fails closed',()=>{
 for(const mutate of [f=>f.invocationResponse.projectId='prj_ForeignTimeout1234567890123',f=>f.invocationResponse.complete=false,f=>f.logRecords[0].truncated=true,f=>f.logRecords[0].source='middleware',f=>f.invocationResponse.response.summary[0].requestId='foreign-request-123456789',f=>f.invocationResponse.response.summary.push({...f.invocationResponse.response.summary[0]}),f=>f.invocationResponse.response.query.groupBy=['deploymentId'],f=>f.activity.instance_id=randomUUID()]){const f=fixture();mutate(f);assert.deepEqual(timeoutEvidence(f),[]);}
});
test('provider reader failures are sanitized and never clear a marker',async()=>{
 const f=fixture(),verify=vercelTerminationVerifier({secret,projectId,readAdmissionLogs:async()=>{throw Error('private provider credentials');},readInvocationRecords:async()=>{throw Error('unexpected');}});await assert.rejects(verify(f.activity),/termination_not_verified/);
});
