import {ControlError,hash} from './queue.mjs';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const digest=/^[a-f0-9]{64}$/;
const check=(value,code)=>{if(!value)throw new ControlError(code);};
// Read-only operator diagnostic. Presence/absence is an observation, never
// evidence that a provider-side upload has settled. No resolution capability.
export class CaptureReview {
 constructor({queue,store}){check(typeof queue?.transaction==='function'&&typeof store?.objectPresent==='function','capture_review_configuration_required');this.queue=queue;this.store=store;}
 async scope(db,requestId){
  check(uuid.test(requestId||''),'invalid_request');
  const r=(await db.query('select id,user_id,tenant_id,state from account_deletion_requests where id=$1',[requestId])).rows[0];check(r,'not_found');
  check(['blocked_pending_review','purging'].includes(r.state),'request_not_reviewable');
  check((await db.query('select 1 from account_tombstones where user_id=$1 and request_id=$2 and active',[r.user_id,r.id])).rowCount,'account_not_blocked');
  const captures=(await db.query("select c.id,c.user_id,c.tenant_id,c.snapshot_id,c.state,c.error_code,o.state as object_state,o.legacy,o.file_hashes from snapshot_captures c left join snapshot_objects o on o.id=c.snapshot_id where (c.user_id=$1 or c.tenant_id=$2) and c.state in ('preparing','uploading','failed') order by c.id limit 1001",[r.user_id,r.tenant_id])).rows;
  check(captures.length<=1000,'scope_review_required');
  const body={schema:1,request:r,captures};return {...body,reviewHash:hash(JSON.stringify(body))};
 }
 async inspect(requestId){
  const before=await this.queue.transaction(db=>this.scope(db,requestId)),objects=new Map(),unresolved=[];
  let keys=0;
  for(const c of before.captures){
   if(c.state!=='failed'||!c.snapshot_id){unresolved.push({captureId:c.id,reason:c.state==='failed'?'no_registered_snapshot':'capture_not_finished'});continue;}
   if(c.user_id!==before.request.user_id||!digest.test(c.snapshot_id)||c.object_state!=='active'||c.legacy||!Array.isArray(c.file_hashes)||c.file_hashes.length>10000||c.file_hashes.some(h=>!digest.test(h))||new Set(c.file_hashes).size!==c.file_hashes.length){unresolved.push({captureId:c.id,reason:'inventory_review_required'});continue;}
   if(objects.has(c.snapshot_id))continue;
   keys+=c.file_hashes.length+1;check(keys<=10000,'scope_review_required');objects.set(c.snapshot_id,[...c.file_hashes,null]);
  }
  const observations=[];
  for(const [snapshotId,hashes] of objects){
   let present=0,missing=0;
   for(const fileHash of hashes){
    let metadata;try{metadata=await this.store.objectPresent(snapshotId,fileHash);}catch{throw new ControlError('storage_verification_failed');}
    // The storage capability must distinguish typed absence (null) from errors.
    check(metadata===null||(typeof metadata==='object'&&metadata!==null&&typeof metadata.etag==='string'&&metadata.etag.length>0&&Number.isSafeInteger(metadata.size)&&metadata.size>=0),'storage_verification_failed');
    if(metadata===null)missing++;else present++;
   }
   observations.push({snapshotId,expectedObjects:hashes.length,present,missing,uploadSettlementVerified:false});
  }
  const after=await this.queue.transaction(db=>this.scope(db,requestId));check(after.reviewHash===before.reviewHash,'review_conflict');
  return {schema:1,requestId,reviewHash:before.reviewHash,captureCount:before.captures.length,observations,unresolved,readOnly:true,uploadSettlementVerified:false,purgeAuthorized:false};
 }
}
