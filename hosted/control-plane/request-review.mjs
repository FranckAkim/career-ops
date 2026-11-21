import {ControlError,hash} from './queue.mjs';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const digest=/^[a-f0-9]{64}$/;
const check=(value,code='invalid_request')=>{if(!value)throw new ControlError(code);};

// Operator-only capability. The verifier must establish actual termination of
// the identified execution, never infer it from age, lease expiry or READY state.
// Native timeout correlation lives in vercel-termination.mjs; completion
// receipts remain a separate verifier and cannot establish termination.
export class RequestReview {
 constructor({queue,verifyTermination,verifyCompletion}){check(typeof verifyTermination==='function'||typeof verifyCompletion==='function','termination_verifier_required');this.queue=queue;this.verifyTermination=verifyTermination;this.verifyCompletion=verifyCompletion;}
 async scope(db,requestId){
  check(uuid.test(requestId));let request=(await db.query('select * from account_deletion_requests where id=$1',[requestId])).rows[0];check(request,'not_found');
  if(request.tenant_id)await db.query('select id from tenants where id=$1 for update',[request.tenant_id]);
  await db.query('select pg_advisory_xact_lock(hashtextextended($1::uuid::text,847292))',[request.user_id]);
  request=(await db.query('select * from account_deletion_requests where id=$1 for update',[requestId])).rows[0];
  check(['blocked_pending_review','purging'].includes(request.state),'request_not_reviewable');
  check((await db.query('select 1 from account_tombstones where user_id=$1 and request_id=$2 and active',[request.user_id,requestId])).rowCount,'account_not_blocked');
  const {rows:activity}=await db.query("select id,user_id,deployment_id,instance_id,started_at from account_request_activity where user_id=$1 and state='active' order by id limit 1001",[request.user_id]);
  check(activity.length<=1000,'scope_review_required');
  const body={schema:1,requestId,userId:request.user_id,requestState:request.state,activity};
  return {...body,reviewHash:hash(JSON.stringify(body)),unknownExecutions:activity.filter(row=>!row.deployment_id||!row.instance_id).length,deploymentCoverageVerified:false};
 }
 async preview(requestId){return this.queue.transaction(db=>this.scope(db,requestId));}
 async resolve({requestId,activityId,expectedReviewHash,evidenceHash,acknowledged,confirmation,evidenceKind='execution_terminated'}){
  check(['execution_terminated','resource_work_complete'].includes(evidenceKind));
  check(uuid.test(activityId)&&digest.test(expectedReviewHash||'')&&digest.test(evidenceHash||''));
  check(acknowledged===true&&confirmation===(evidenceKind==='execution_terminated'?'RESOLVE TERMINATED REQUEST':'RESOLVE COMPLETED REQUEST'),'confirmation_required');
  const review=await this.preview(requestId);check(review.reviewHash===expectedReviewHash,'review_conflict');
  const activity=review.activity.find(row=>row.id===activityId);check(activity,'not_found');
  check(activity.deployment_id&&activity.instance_id,'termination_evidence_unavailable');
  const verifier=evidenceKind==='execution_terminated'?this.verifyTermination:this.verifyCompletion;check(typeof verifier==='function','evidence_verifier_required');
  let proof;try{proof=await verifier(Object.freeze({...activity,evidenceHash}));}catch{throw new ControlError('termination_not_verified');}
  check((evidenceKind==='execution_terminated'?proof?.terminated===true:proof?.resourcesDrained===true)&&proof.activityId===activity.id&&proof.deploymentId===activity.deployment_id&&proof.instanceId===activity.instance_id&&proof.evidenceHash===evidenceHash,'termination_not_verified');
  return this.queue.transaction(async db=>{
   const current=await this.scope(db,requestId);check(current.reviewHash===expectedReviewHash,'review_conflict');
   await db.query('insert into account_request_resolutions(activity_id,request_id,user_id,deployment_id,instance_id,review_hash,evidence_hash,evidence_kind) values($1,$2,$3,$4,$5,$6,$7,$8)',[activityId,requestId,review.userId,activity.deployment_id,activity.instance_id,expectedReviewHash,evidenceHash,evidenceKind]);
   const changed=await db.query("update account_request_activity set state=$3,settled_at=clock_timestamp() where id=$1 and user_id=$2 and state='active'",[activityId,review.userId,evidenceKind==='execution_terminated'?'terminated':'settled']);
   check(changed.rowCount===1,'review_conflict');return {resolved:true,activityId,deploymentCoverageVerified:false};
  });
 }
}
