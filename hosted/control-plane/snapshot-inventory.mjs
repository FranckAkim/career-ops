import {randomUUID} from 'node:crypto';
import {ControlError} from './queue.mjs';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i,digest=/^[a-f0-9]{64}$/;
const check=(value,code='invalid_capture')=>{if(!value)throw new ControlError(code);};

export async function assertCapturePublication(db,{snapshot,captureId,userId,tenantId=null,jobId=null,kind,jobFence=null}){
 check(uuid.test(captureId||''),'capture_required');
 const{rows}=await db.query(`select c.id from snapshot_captures c join snapshot_objects o on o.id=c.snapshot_id
 where c.id=$1 and c.snapshot_id=$2 and c.user_id=$3 and c.tenant_id is not distinct from $4::uuid
 and c.job_id is not distinct from $5::uuid and c.kind=$6 and c.job_fence is not distinct from $7::bigint
 and c.state='ready' and o.state='active' for share of c,o`,[captureId,snapshot,userId,tenantId,jobId,kind,jobFence]);
 check(rows.length,'capture_not_publishable');
}
export class SnapshotInventory{
 constructor({queue,leaseSeconds=60,heartbeatMs=10000}){check(Number.isInteger(leaseSeconds)&&leaseSeconds>=5&&leaseSeconds<=300&&heartbeatMs>=100&&heartbeatMs<leaseSeconds*500);this.queue=queue;this.leaseSeconds=leaseSeconds;this.heartbeatMs=heartbeatMs;}
 async begin({userId,tenantId=null,jobId=null,kind,jobFence=null}){
  check(uuid.test(userId)&&(!tenantId||uuid.test(tenantId))&&(!jobId||uuid.test(jobId))&&['onboarding','profile','job'].includes(kind));
  check(kind==='onboarding'?!tenantId&&!jobId:!!tenantId);check(kind==='job'?!!jobId&&/^\d+$/.test(String(jobFence)):!jobId&&jobFence===null);
  return this.queue.transaction(async db=>{
   if(tenantId)await this.queue.authorize(db,tenantId,userId);
   if(kind==='job')check((await db.query("select 1 from jobs where id=$1 and tenant_id=$2 and requested_by=$3 and fence=$4 and status='running' and lease_until>clock_timestamp()",[jobId,tenantId,userId,jobFence])).rowCount,'lease_lost');
   const id=randomUUID(),token=randomUUID();await db.query('insert into snapshot_captures(id,user_id,tenant_id,job_id,job_fence,kind,lease_token,lease_until) values($1,$2,$3,$4,$5,$6,$7,clock_timestamp()+make_interval(secs=>$8))',[id,userId,tenantId,jobId,jobFence,kind,token,this.leaseSeconds]);return {id,token};
  });
 }
 async heartbeat(capture){const{rowCount}=await this.queue.pool.query("update snapshot_captures set lease_until=clock_timestamp()+make_interval(secs=>$3) where id=$1 and lease_token=$2 and state in ('preparing','uploading') and lease_until>clock_timestamp()",[capture.id,capture.token,this.leaseSeconds]);check(rowCount,'capture_lease_lost');}
 async register(capture,{id,files}){
  check(digest.test(id)&&Array.isArray(files)&&files.length<=10000&&files.every(file=>digest.test(file.sha256)&&Number.isSafeInteger(file.bytes)&&file.bytes>=0));
  const hashes=[...new Set(files.map(file=>file.sha256))].sort(),bytes=files.reduce((sum,file)=>sum+file.bytes,0);check(bytes<=100000000);
  await this.queue.transaction(async db=>{
   const owner=(await db.query('select tenant_id from snapshot_captures where id=$1 and lease_token=$2',[capture.id,capture.token])).rows[0];
   if(owner?.tenant_id)await db.query('select id from tenants where id=$1 for key share',[owner.tenant_id]);
   const{rows:[record]}=await db.query("select *,lease_until>clock_timestamp() as live from snapshot_captures where id=$1 and lease_token=$2 for update",[capture.id,capture.token]);check(record?.live&&['preparing','uploading'].includes(record.state),'capture_lease_lost');check(!record.snapshot_id||record.snapshot_id===id);
   await db.query('insert into snapshot_objects(id,file_hashes,file_count,total_bytes) values($1,$2,$3,$4) on conflict(id) do nothing',[id,hashes,files.length,bytes]);
   const{rows:[object]}=await db.query('select * from snapshot_objects where id=$1 for update',[id]);check(object.state==='active','snapshot_unavailable');
   if(object.file_hashes===null)await db.query('update snapshot_objects set file_hashes=$2,file_count=$3,total_bytes=$4 where id=$1',[id,hashes,files.length,bytes]);
   else check(JSON.stringify(object.file_hashes)===JSON.stringify(hashes)&&object.file_count===files.length&&object.total_bytes===String(bytes),'snapshot_corrupt');
   await db.query("update snapshot_captures set snapshot_id=$3,state='uploading' where id=$1 and lease_token=$2",[capture.id,capture.token,id]);
  });
 }
 async finish(capture,id){const{rowCount}=await this.queue.pool.query("update snapshot_captures set state='ready',lease_token=null,finished_at=clock_timestamp() where id=$1 and lease_token=$2 and snapshot_id=$3 and state='uploading' and lease_until>clock_timestamp()",[capture.id,capture.token,id]);check(rowCount,'capture_lease_lost');}
 async capture({store,workspace,...owner}){
  const capture=await this.begin(owner);let timer,pending,lost=false,registered=null;
  const schedule=()=>{timer=setTimeout(()=>{pending=this.heartbeat(capture).catch(()=>{lost=true;}).finally(()=>{if(!lost)schedule();});},this.heartbeatMs);};
  const stop=async()=>{clearTimeout(timer);if(pending)await pending;clearTimeout(timer);};
  schedule();
  try{
   const saved=await store.capture(workspace,{beforeStore:async metadata=>{check(!lost,'capture_lease_lost');await this.register(capture,metadata);registered=metadata.id;},assertActive:()=>check(!lost,'capture_lease_lost')});
   await stop();check(!lost,'capture_lease_lost');check(registered===saved.id,'capture_hook_required');await this.finish(capture,saved.id);return {...saved,captureId:capture.id};
  }catch(error){
   await stop();await this.queue.pool.query("update snapshot_captures set state='failed',lease_token=null,finished_at=clock_timestamp(),error_code=$3 where id=$1 and lease_token=$2 and state in ('preparing','uploading')",[capture.id,capture.token,lost?'capture_interrupted':'capture_failed']).catch(()=>{});throw error;
  }finally{await stop();}
 }
}
