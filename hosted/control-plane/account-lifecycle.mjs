import{randomUUID}from'node:crypto';import{ControlError,hash}from'./queue.mjs';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const check=(value,code='invalid_request')=>{if(!value)throw new ControlError(code);};
export async function accountBlocked(db,userId){return !!(await db.query('select 1 from account_tombstones where user_id=$1 and active',[userId])).rowCount;}
export async function assertAccountActive(db,userId,tenantId=null){check(!await accountBlocked(db,userId),'account_deleting');if(tenantId)check(!(await db.query('select 1 from workspace_tombstones where tenant_id=$1 and active',[tenantId])).rowCount,'account_deleting');}

// Operator-only foundation. No public request/cancel API or physical purge.
export class AccountLifecycle{
 constructor({queue}){this.queue=queue;}
 async scope(db,userId){
  check(uuid.test(userId));const{rows:memberships}=await db.query('select tenant_id,role from memberships where user_id=$1 order by tenant_id',[userId]);
  check(memberships.length<=1&&memberships.every(row=>row.role==='owner'),'shared_workspace_review_required');
  let tenant=null;if(memberships.length){const id=memberships[0].tenant_id;check((await db.query('select 1 from personal_workspaces where user_id=$1 and tenant_id=$2',[userId,id])).rowCount,'shared_workspace_review_required');check((await db.query('select count(*)::int as count from memberships where tenant_id=$1',[id])).rows[0].count===1,'shared_workspace_review_required');tenant=(await db.query('select id,generation,snapshot,recovery_required from tenants where id=$1',[id])).rows[0];}
  const{rows:drafts}=await db.query('select id,revision,review_hash,confirmed_at from profile_drafts where user_id=$1 order by id limit 1001',[userId]);
  const{rows:jobs}=tenant?await db.query('select id,status,fence from jobs where tenant_id=$1 order by id limit 10001',[tenant.id]):{rows:[]};
  const{rows:captures}=await db.query('select id,snapshot_id,state from snapshot_captures where user_id=$1 order by id limit 20001',[userId]);
  check(drafts.length<=1000&&jobs.length<=10000&&captures.length<=20000,'scope_review_required');
  const body={schema:1,userId,tenant,drafts,jobs,captures};return {scopeHash:hash(JSON.stringify(body)),tenantId:tenant?.id||null,counts:{profileVersionsAndDrafts:drafts.length,jobs:jobs.length,captures:captures.length,activeJobs:jobs.filter(row=>['running','cancel_requested'].includes(row.status)).length},physicalDeletionAvailable:false};
 }
 async preview(userId){return this.queue.transaction(db=>this.scope(db,userId));}
 async request({userId,sessionId,expectedScopeHash,acknowledged,confirmation}){
  check(acknowledged===true&&confirmation==='DELETE MY ACCOUNT','confirmation_required');check(uuid.test(userId)&&uuid.test(sessionId)&&/^[a-f0-9]{64}$/.test(expectedScopeHash||''));
  return this.queue.transaction(async db=>{
   // Existing-workspace lock precedes the user lock, matching queue/profile writers.
   const personal=(await db.query('select tenant_id from personal_workspaces where user_id=$1',[userId])).rows[0];if(personal)await db.query('select id from tenants where id=$1 for update',[personal.tenant_id]);
   await db.query('select pg_advisory_xact_lock(hashtextextended($1::uuid::text,847292))',[userId]);
   const prior=(await db.query("select id,state,scope_hash,session_fingerprint from account_deletion_requests where user_id=$1 and state in ('blocked_pending_review','fencing','purging')",[userId])).rows[0];
   if(prior){check(prior.scope_hash===expectedScopeHash&&prior.session_fingerprint===hash(sessionId),'review_conflict');return {requestId:prior.id,state:prior.state,replayed:true,deleted:false};}
   const recent=await db.query('select 1 from auth_sessions where id=$1 and "userId"=$2 and "createdAt">=clock_timestamp()-interval \'10 minutes\' and "expiresAt">clock_timestamp()',[sessionId,userId]);check(recent.rowCount,'reauthentication_required');
   const scope=await this.scope(db,userId);check(scope.scopeHash===expectedScopeHash,'review_conflict');const requestId=randomUUID();
   await db.query('insert into account_deletion_requests(id,user_id,tenant_id,scope_hash,session_fingerprint) values($1,$2,$3,$4,$5)',[requestId,userId,scope.tenantId,scope.scopeHash,hash(sessionId)]);
   await db.query('insert into account_tombstones(user_id,request_id,active) values($1,$2,true) on conflict(user_id) do update set request_id=excluded.request_id,active=true',[userId,requestId]);
   if(scope.tenantId){await db.query('insert into workspace_tombstones(tenant_id,request_id,active) values($1,$2,true) on conflict(tenant_id) do update set request_id=excluded.request_id,active=true',[scope.tenantId,requestId]);
    await db.query("update jobs set status=case when status='queued' then 'cancelled' else 'cancel_requested' end,finished_at=case when status='queued' then clock_timestamp() else finished_at end where tenant_id=$1 and status in ('queued','running')",[scope.tenantId]);}
   await db.query('delete from auth_sessions where "userId"=$1',[userId]);return {requestId,state:'blocked_pending_review',replayed:false,deleted:false};
  });
 }
 async cancel(requestId){check(uuid.test(requestId));return this.queue.transaction(async db=>{
  const row=(await db.query('select * from account_deletion_requests where id=$1',[requestId])).rows[0];check(row,'not_found');if(row.tenant_id)await db.query('select id from tenants where id=$1 for update',[row.tenant_id]);await db.query('select pg_advisory_xact_lock(hashtextextended($1,847292))',[row.user_id]);
  const current=(await db.query('select state from account_deletion_requests where id=$1 for update',[requestId])).rows[0];check(['blocked_pending_review','cancelled'].includes(current.state),'cancellation_not_available');
  await db.query('update account_tombstones set active=false where request_id=$1',[requestId]);await db.query('update workspace_tombstones set active=false where request_id=$1',[requestId]);await db.query("update account_deletion_requests set state='cancelled',cancelled_at=coalesce(cancelled_at,clock_timestamp()) where id=$1",[requestId]);return {state:'cancelled',sessionsRestored:false,jobsRestarted:false};
 });}
}
