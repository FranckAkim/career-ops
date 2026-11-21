import {requestReceiptCodec} from '../receipt-codec.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash,randomUUID} from 'node:crypto';
import {issueAdmissionReceipt,admissionEvidence,admissionPrefix} from '../admission-receipts.mjs';
import {issueCompletionReceipt,completionEvidence,completionPrefix} from '../completion-receipts.mjs';
import {RequestDrain} from '../request-drain.mjs';
const secret='synthetic-admission-secret-'.repeat(3),projectId='prj_SyntheticAdmission1234567890',deploymentId='dpl_SyntheticAdmission1234567890',instanceId=randomUUID();
test('completion protocol preserves its pre-refactor compatibility vector',()=>{
 const line=issueCompletionReceipt({secret:'synthetic-legacy-protocol-'.repeat(3),projectId:'prj_SyntheticCompletion123456789',deploymentId:'dpl_SyntheticCompletion123456789',activityId:'11111111-1111-4111-8111-111111111111',instanceId:'22222222-2222-4222-8222-222222222222',completedAt:'2026-11-21T00:00:00.000Z'});
 assert.equal(createHash('sha256').update(line).digest('hex'),'67f65d2b4dfb5573a7c2e4e7d3c1df9e03f52799610afd738176fa1e575ba07b');
});
test('admission signatures cannot establish completion or termination',()=>{
 const activity={id:randomUUID(),deployment_id:deploymentId,instance_id:instanceId},line=issueAdmissionReceipt({secret,projectId,activityId:activity.id,deploymentId,instanceId,admittedAt:new Date().toISOString()}),proof=admissionEvidence({secret,projectId,activity,logText:line})[0];
 assert.equal(proof.admitted,true);assert.equal(proof.resourcesDrained,undefined);assert.equal(proof.terminated,undefined);assert.deepEqual(completionEvidence({secret,projectId,activity,logText:line}),[]);assert.deepEqual(admissionEvidence({secret:'wrong-signing-material-'.repeat(3),projectId,activity,logText:line}),[]);
});
test('admission is logged before handler work; completion waits for handler and stream',async()=>{
 const events=[],drain=new RequestDrain({pool:{query:async()=>({rowCount:1})},deploymentId,instanceId,completion:{secret,projectId,report:line=>events.push(line.startsWith(admissionPrefix)?'admission':line.startsWith(completionPrefix)?'completion':'unknown')}});
 const response=await drain.run(async register=>{await register(randomUUID());events.push('handler');return new Response('synthetic');});assert.deepEqual(events,['admission','handler']);await response.text();assert.deepEqual(events,['admission','handler','completion']);
});

test('receipt kinds are a closed allowlist',()=>{for(const kind of ['__proto__','constructor','execution_terminated'])assert.throws(()=>requestReceiptCodec(kind),/receipt_configuration_required/);});
