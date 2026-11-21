import{ControlError}from'./queue.mjs';
const check=(value,code='purge_review_required')=>{if(!value)throw new ControlError(code);};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
// Private operator capability. Runtime drain verification is mandatory and must
// inspect the actual execution environment; database lease expiry is insufficient.
export class AccountPurger{
 constructor({queue,store,verifyDrained}){check(typeof verifyDrained==='function','drain_verifier_required');this.queue=queue;this.store=store;this.verifyDrained=verifyDrained;}
 async locked(db,id){check(uuid.test(id),'invalid_request');let request=(await db.query('select * from account_deletion_requests where id=$1',[id])).rows[0];check(request,'not_found');if(request.tenant_id)await db.query('select id from tenants where id=$1 for update',[request.tenant_id]);await db.query('select pg_advisory_xact_lock(hashtextextended($1::uuid::text,847292))',[request.user_id]);request=(await db.query('select * from account_deletion_requests where id=$1 for update',[id])).rows[0];return request;}
 async drained(db,r){
  check(!(await db.query("select 1 from account_request_activity where user_id=$1 and state='active' limit 1",[r.user_id])).rowCount,'requests_not_drained');
  check((await db.query('select 1 from account_tombstones where user_id=$1 and request_id=$2 and active',[r.user_id,r.id])).rowCount,'account_not_blocked');
  if(r.tenant_id){check((await db.query('select 1 from workspace_tombstones where tenant_id=$1 and request_id=$2 and active',[r.tenant_id,r.id])).rowCount,'account_not_blocked');check(!(await db.query('select 1 from memberships where tenant_id=$1 and user_id<>$2 limit 1',[r.tenant_id,r.user_id])).rowCount,'shared_workspace_review_required');}
  check(!(await db.query("select 1 from jobs where tenant_id=$1 and status in ('queued','running','cancel_requested') limit 1",[r.tenant_id])).rowCount,'execution_not_drained');
  check(!(await db.query("select 1 from snapshot_captures where (user_id=$1 or tenant_id=$2) and state in ('preparing','uploading') limit 1",[r.user_id,r.tenant_id])).rowCount,'captures_not_drained');
  check(!(await db.query("select 1 from worker_attempts a join jobs j on j.id=a.job_id where j.tenant_id=$1 and a.state<>'stopped' limit 1",[r.tenant_id])).rowCount,'execution_not_drained');
  check(!(await db.query('select 1 from snapshot_captures where tenant_id=$1 and user_id<>$2 limit 1',[r.tenant_id,r.user_id])).rowCount,'shared_workspace_review_required');
 }
 async prepare(id){
  const request=(await this.queue.pool.query('select * from account_deletion_requests where id=$1',[id])).rows[0];check(request,'not_found');if(request.state==='complete')return;
  check(await this.verifyDrained(request)===true,'execution_not_drained');
  await this.queue.transaction(async db=>{const r=await this.locked(db,id);if(r.state==='complete')return;check(['blocked_pending_review','purging'].includes(r.state),'request_not_purgeable');await this.drained(db,r);if(r.state==='purging')return;
   const{rows:snapshots}=await db.query('select snapshot as id from tenants where id=$1 union select snapshot from workspace_versions where tenant_id=$1 union select base_snapshot from jobs where tenant_id=$1 and base_snapshot is not null union select snapshot_id from snapshot_captures where user_id=$2 and snapshot_id is not null',[r.tenant_id,r.user_id]);check(snapshots.length<=1000);
   for(const {id:snapshot}of snapshots){const object=(await db.query('select * from snapshot_objects where id=$1',[snapshot])).rows[0];check(object&&!object.legacy&&object.state==='active'&&object.file_hashes!==null);check((await db.query('select 1 from snapshot_captures where user_id=$1 and snapshot_id=$2 limit 1',[r.user_id,snapshot])).rowCount);await db.query('insert into account_purge_items(request_id,snapshot_id,file_hashes) values($1,$2,$3)',[id,snapshot,object.file_hashes]);}
   await db.query("update account_deletion_requests set state='purging' where id=$1",[id]);
  });
 }
 async step(id){await this.prepare(id);
  const item=await this.queue.transaction(async db=>{const r=await this.locked(db,id);if(r.state==='complete')return null;await this.drained(db,r);const item=(await db.query("select * from account_purge_items where request_id=$1 and state in ('pending','deleting') order by snapshot_id limit 1 for update",[id])).rows[0];if(!item)return null;
   await db.query('select pg_advisory_xact_lock(hashtextextended($1,847293))',[item.snapshot_id]);const object=(await db.query('select * from snapshot_objects where id=$1 for update',[item.snapshot_id])).rows[0];
   const shared=await db.query(`select 1 where exists(select 1 from tenants where snapshot=$1 and id is distinct from $2::uuid)
    or exists(select 1 from workspace_versions where snapshot=$1 and tenant_id is distinct from $2::uuid)
    or exists(select 1 from jobs where base_snapshot=$1 and tenant_id is distinct from $2::uuid)
    or exists(select 1 from snapshot_captures where snapshot_id=$1 and user_id<>$3)
    or exists(select 1 from snapshot_legacy_references where snapshot_id=$1 and tenant_id is distinct from $2::uuid)`,[item.snapshot_id,r.tenant_id,r.user_id]);
   if(shared.rowCount){check(item.state==='pending'&&object.state==='active','shared_snapshot_changed');await db.query("update account_purge_items set state='shared' where request_id=$1 and snapshot_id=$2",[id,item.snapshot_id]);return {shared:true};}
   check(['active','deleting'].includes(object.state),'snapshot_unavailable');await db.query("update snapshot_objects set state='deleting' where id=$1",[item.snapshot_id]);await db.query("update account_purge_items set state='deleting' where request_id=$1 and snapshot_id=$2",[id,item.snapshot_id]);return item;
  });
  if(!item)return this.finalize(id);if(item.shared)return {state:'purging'};
  const keys=[...item.file_hashes,null],index=item.next_key;if(index<keys.length){await this.store.deleteInventoriedObject(item.snapshot_id,keys[index]);await this.queue.pool.query('update account_purge_items set next_key=greatest(next_key,$3) where request_id=$1 and snapshot_id=$2',[id,item.snapshot_id,index+1]);return {state:'purging'};}
  for(const key of keys)check(!await this.store.objectPresent(item.snapshot_id,key),'storage_verification_failed');
  await this.queue.transaction(async db=>{await db.query("update snapshot_objects set state='deleted' where id=$1 and state='deleting'",[item.snapshot_id]);await db.query("update account_purge_items set state='deleted' where request_id=$1 and snapshot_id=$2",[id,item.snapshot_id]);});return {state:'purging'};
 }
 async finalize(id){const request=(await this.queue.pool.query('select * from account_deletion_requests where id=$1',[id])).rows[0];check(request,'not_found');if(request.state==='complete')return {state:'complete',inventoriedDataRemoved:true,sharedSnapshotsRetained:(await this.queue.pool.query("select count(*)::int as count from account_purge_items where request_id=$1 and state='shared'",[id])).rows[0].count};check(await this.verifyDrained(request)===true,'execution_not_drained');return this.queue.transaction(async db=>{const r=await this.locked(db,id);await this.drained(db,r);check(!(await db.query("select 1 from account_purge_items where request_id=$1 and state not in ('deleted','shared') limit 1",[id])).rowCount,'purge_incomplete');
   if(r.tenant_id){await db.query('update tenants set active_job=null where id=$1',[r.tenant_id]);await db.query('delete from worker_attempts where job_id in (select id from jobs where tenant_id=$1)',[r.tenant_id]);await db.query('delete from job_events where tenant_id=$1',[r.tenant_id]);await db.query('delete from artifacts where tenant_id=$1',[r.tenant_id]);await db.query('delete from workspace_versions where tenant_id=$1',[r.tenant_id]);await db.query('delete from personal_workspaces where tenant_id=$1 and user_id=$2',[r.tenant_id,r.user_id]);await db.query('delete from jobs where tenant_id=$1',[r.tenant_id]);await db.query('delete from memberships where tenant_id=$1 and user_id=$2',[r.tenant_id,r.user_id]);await db.query('delete from snapshot_legacy_references where tenant_id=$1',[r.tenant_id]);await db.query('delete from tenants where id=$1',[r.tenant_id]);}
   await db.query('delete from account_request_activity where user_id=$1',[r.user_id]);await db.query('delete from profile_drafts where user_id=$1',[r.user_id]);await db.query('delete from snapshot_captures where user_id=$1',[r.user_id]);await db.query('delete from auth_sessions where "userId"=$1',[r.user_id]);await db.query('delete from auth_accounts where "userId"=$1',[r.user_id]);await db.query('delete from auth_users where id=$1',[r.user_id]);
   const remains=await db.query(`select 1 where exists(select 1 from account_request_activity where user_id=$1) or exists(select 1 from profile_drafts where user_id=$1) or exists(select 1 from snapshot_captures where user_id=$1)
    or exists(select 1 from memberships where user_id=$1) or exists(select 1 from personal_workspaces where user_id=$1)
    or exists(select 1 from auth_users where id=$1) or exists(select 1 from auth_accounts where "userId"=$1) or exists(select 1 from auth_sessions where "userId"=$1)
    or exists(select 1 from tenants where id=$2) or exists(select 1 from jobs where tenant_id=$2) or exists(select 1 from workspace_versions where tenant_id=$2)
    or exists(select 1 from artifacts where tenant_id=$2) or exists(select 1 from job_events where tenant_id=$2)`,[r.user_id,r.tenant_id]);check(!remains.rowCount,'purge_incomplete');
   const shared=(await db.query("select count(*)::int as count from account_purge_items where request_id=$1 and state='shared'",[id])).rows[0].count;await db.query("update account_deletion_requests set state='complete',completed_at=clock_timestamp() where id=$1",[id]);return {state:'complete',inventoriedDataRemoved:true,sharedSnapshotsRetained:shared};
  });}
}
