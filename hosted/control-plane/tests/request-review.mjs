import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {Queue,hash} from '../queue.mjs';
import {createAuth} from '../auth.mjs';
import {AccountLifecycle} from '../account-lifecycle.mjs';
import {RequestDrain} from '../request-drain.mjs';
import {RequestReview} from '../request-review.mjs';
export async function verifyRequestReview({pool}){
 const queue=new Queue(pool,{accountLifecycle:true}),lifecycle=new AccountLifecycle({queue}),userId=randomUUID(),instanceId=randomUUID(),deploymentId='dpl_SyntheticRequestReview123456';
 const auth=createAuth({pool,origin:'http://localhost:3000',secret:'synthetic-request-review-'.repeat(4),accountLifecycle:true}),ctx=await auth.$context;
 await ctx.adapter.create({model:'user',forceAllowId:true,data:{id:userId,name:'Synthetic Request Review',email:`${userId}@example.test`,emailVerified:false,createdAt:new Date(),updatedAt:new Date()}});
 const session=await ctx.internalAdapter.createSession(userId,false,{expiresAt:new Date(Date.now()+600000)},true);
 const settleKnown=await new RequestDrain({pool,deploymentId,instanceId}).begin(userId),settleUnknown=await new RequestDrain({pool}).begin(userId),scope=await lifecycle.preview(userId),blocked=await lifecycle.request({userId,sessionId:session.id,expectedScopeHash:scope.scopeHash,acknowledged:true,confirmation:'DELETE MY ACCOUNT'});
 assert.throws(()=>new RequestReview({queue}),/termination_verifier_required/);
 const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{windowsHide:true,stdio:'ignore'});await once(child,'spawn');
 try{
  const verifier=async activity=>({terminated:child.exitCode!==null||child.signalCode!==null,activityId:activity.id,deploymentId:activity.deployment_id,instanceId:activity.instance_id,evidenceHash:activity.evidenceHash});
  const service=new RequestReview({queue,verifyTermination:verifier});let review=await service.preview(blocked.requestId);
  assert.equal(review.unknownExecutions,1);assert.equal(review.deploymentCoverageVerified,false);
  const known=review.activity.find(row=>row.deployment_id),unknown=review.activity.find(row=>!row.deployment_id),evidenceHash=hash('Synthetic isolated child termination evidence');
  const input={requestId:blocked.requestId,activityId:known.id,expectedReviewHash:review.reviewHash,evidenceHash,acknowledged:true,confirmation:'RESOLVE TERMINATED REQUEST'};
  await assert.rejects(service.resolve({...input,acknowledged:false}),/confirmation_required/);
  await assert.rejects(service.resolve({...input,expectedReviewHash:'a'.repeat(64)}),/review_conflict/);
  await assert.rejects(service.resolve({...input,activityId:unknown.id}),/termination_evidence_unavailable/);
  await assert.rejects(service.resolve(input),/termination_not_verified/);
  await assert.rejects(pool.query("update account_request_activity set state='terminated',settled_at=clock_timestamp() where id=$1",[known.id]),/termination_evidence_required/);
  const web=await pool.connect();try{await web.query('begin');await web.query('set local role career_web');await assert.rejects(web.query("update account_request_activity set state='terminated',settled_at=clock_timestamp() where id=$1",[known.id]),/permission denied/);}finally{await web.query('rollback');web.release();}
  await assert.rejects(new RequestReview({queue,verifyTermination:async()=>{throw Error('private provider details');}}).resolve(input),/termination_not_verified/);
  await assert.rejects(new RequestReview({queue,verifyTermination:async activity=>({...await verifier(activity),terminated:true,instanceId:randomUUID()})}).resolve(input),/termination_not_verified/);
  const exited=once(child,'exit');child.kill();await exited;
  await assert.rejects(new RequestReview({queue,verifyTermination:async activity=>{await settleUnknown();return verifier(activity);}}).resolve(input),/review_conflict/);
  assert.equal((await pool.query('select 1 from account_request_resolutions where activity_id=$1',[known.id])).rowCount,0);
  review=await service.preview(blocked.requestId);assert.equal(review.unknownExecutions,0);
  assert.equal((await service.resolve({...input,expectedReviewHash:review.reviewHash})).resolved,true);
  assert.equal((await pool.query('select state from account_request_activity where id=$1',[known.id])).rows[0].state,'terminated');
  assert.equal((await pool.query('select evidence_hash from account_request_resolutions where activity_id=$1',[known.id])).rows[0].evidence_hash,evidenceHash);
  await settleKnown();assert.equal((await service.preview(blocked.requestId)).activity.length,0);
  await assert.rejects(service.resolve({...input,expectedReviewHash:review.reviewHash}),/review_conflict/);
  await lifecycle.cancel(blocked.requestId);await assert.rejects(service.preview(blocked.requestId),/request_not_reviewable/);
  await pool.query('delete from account_request_activity where user_id=$1',[userId]);await pool.query('delete from auth_users where id=$1',[userId]);
  assert.equal((await pool.query('select 1 from account_request_resolutions where activity_id=$1',[known.id])).rowCount,1,'minimal opaque audit is retained');
  console.log('PASS interrupted-request review: real child termination, alive/unknown/foreign evidence refusal, stale review rollback, restricted runtime access and opaque audit retention; no platform coverage inferred');
 }finally{if(child.exitCode===null&&child.signalCode===null){const done=once(child,'exit');child.kill();await done;}}
}
