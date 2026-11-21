import{randomUUID}from'node:crypto';import{ControlError,hash}from'./queue.mjs';
const check=(value,code='invalid_listing')=>{if(!value)throw new ControlError(code);};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function objectMetadata(blob){
 check(blob&&typeof blob.pathname==='string'&&blob.pathname.length<=4096&&blob.pathname.startsWith('career-workspaces/v1/')&&Number.isSafeInteger(blob.size)&&blob.size>=0);
 check(blob.uploadedAt instanceof Date||typeof blob.uploadedAt==='string');const date=new Date(blob.uploadedAt);check(Number.isFinite(date.getTime()));
 const match=blob.pathname.match(/^career-workspaces\/v1\/([a-f0-9]{64})\/(manifest\.json|files\/([a-f0-9]{64}))$/);
 return {key_hash:hash(blob.pathname),snapshot_id:match?.[1]||null,kind:match?(match[3]?'file':'manifest'):'unrecognized',file_hash:match?.[3]||null,bytes:blob.size,uploaded_at:date.toISOString()};
}
// Private operator capability. This module lists metadata and writes its own
// journal only; it cannot upload, read source files, assign owners or delete.
export class StorageReconciliation{
 constructor({queue,store}){this.queue=queue;this.store=store;}
 async start(){const id=randomUUID();await this.queue.pool.query('insert into storage_reconciliation_runs(id) values($1)',[id]);return id;}
 async page(id){
  check(uuid.test(id),'invalid_scan');
  const{rows:[run]}=await this.queue.pool.query('select * from storage_reconciliation_runs where id=$1',[id]);check(run,'invalid_scan');if(run.state==='complete')return {complete:true,pages:run.pages};
  if(run.pages>=1000){await this.queue.pool.query("update storage_reconciliation_runs set state='failed',error_code='scan_limit' where id=$1 and state<>'complete'",[id]);throw new ControlError('scan_limit');}
  let listing,records;
  try{listing=await this.store.listMetadata({cursor:run.cursor||undefined});check(Array.isArray(listing.blobs)&&listing.blobs.length<=1000&&typeof listing.hasMore==='boolean');check(!listing.hasMore||(typeof listing.cursor==='string'&&listing.cursor.length>0&&listing.cursor.length<=8000&&listing.cursor!==run.cursor));records=listing.blobs.map(objectMetadata);}
  catch(error){const code=error instanceof ControlError?error.code:'storage_list_failed';await this.queue.pool.query("update storage_reconciliation_runs set state='failed',error_code=$3 where id=$1 and cursor is not distinct from $2 and state<>'complete'",[id,run.cursor,['invalid_listing','scan_limit'].includes(code)?code:'storage_list_failed']);throw new ControlError(['invalid_listing','scan_limit'].includes(code)?code:'storage_list_failed');}
  return this.queue.transaction(async db=>{
   const{rows:[current]}=await db.query('select * from storage_reconciliation_runs where id=$1 for update',[id]);if(current.state==='complete')return {complete:true,pages:current.pages};check(current.cursor===run.cursor&&current.pages===run.pages,'scan_conflict');
   const unique=new Map();for(const row of records){const prior=unique.get(row.key_hash);if(prior){if(prior.bytes!==row.bytes||prior.uploaded_at!==row.uploaded_at)prior.changed_during_scan=true;}else unique.set(row.key_hash,{...row,changed_during_scan:false});}
   await db.query(`insert into storage_reconciliation_objects(run_id,key_hash,snapshot_id,kind,file_hash,bytes,uploaded_at,changed_during_scan)
    select $1,r.key_hash,r.snapshot_id,r.kind,r.file_hash,r.bytes,r.uploaded_at,r.changed_during_scan from jsonb_to_recordset($2::jsonb) as r(key_hash text,snapshot_id text,kind text,file_hash text,bytes bigint,uploaded_at timestamptz,changed_during_scan boolean)
    on conflict(run_id,key_hash) do update set changed_during_scan=storage_reconciliation_objects.changed_during_scan or excluded.changed_during_scan or storage_reconciliation_objects.bytes<>excluded.bytes or storage_reconciliation_objects.uploaded_at<>excluded.uploaded_at`,[id,JSON.stringify([...unique.values()])]);
   await db.query("update storage_reconciliation_runs set state=$2,cursor=$3,pages=pages+1,error_code=null,finished_at=case when $2='complete' then clock_timestamp() else null end where id=$1",[id,listing.hasMore?'scanning':'complete',listing.hasMore?listing.cursor:null]);
   return {complete:!listing.hasMore,pages:current.pages+1,observed:records.length};
  });
 }
 async report(id){
  check(uuid.test(id),'invalid_scan');return this.queue.transaction(async db=>{
   const{rows:[run]}=await db.query('select id,state,pages,started_at,finished_at,error_code from storage_reconciliation_runs where id=$1',[id]);check(run,'invalid_scan');
   const{rows:groups}=await db.query(`with refs as (select snapshot from tenants union select snapshot from workspace_versions union select base_snapshot from jobs where base_snapshot is not null),
    observed as (select snapshot_id,bool_or(kind='manifest') as manifest,count(*)::int as objects,sum(bytes)::text as bytes,bool_or(changed_during_scan) as changed,bool_or(uploaded_at>=$2) as recent from storage_reconciliation_objects where run_id=$1 group by snapshot_id),
    classified as (select o.*,case when o.snapshot_id is null then 'unrecognized_key' when o.changed or o.recent then 'changed_or_recent'
      when exists(select 1 from refs r where r.snapshot=o.snapshot_id) then 'committed_reference'
      when exists(select 1 from snapshot_captures c where c.snapshot_id=o.snapshot_id and c.state in ('preparing','uploading')) then 'unresolved_capture'
      when exists(select 1 from snapshot_captures c where c.snapshot_id=o.snapshot_id) then 'tracked_unpublished'
      else 'unattributed' end as category from observed o)
    select category,count(*)::int as snapshot_groups,sum(objects)::int as objects,sum(bytes::numeric)::text as bytes,count(*) filter(where not manifest and snapshot_id is not null)::int as groups_without_manifest from classified group by category order by category`,[id,run.started_at]);
   const{rows:[missing]}=await db.query(`with refs as (select snapshot from tenants union select snapshot from workspace_versions union select base_snapshot from jobs where base_snapshot is not null)
    select count(*)::int as committed_manifests_not_observed from refs r where not exists(select 1 from storage_reconciliation_objects o where o.run_id=$1 and o.snapshot_id=r.snapshot and o.kind='manifest')`,[id]);
   const{rows:[unresolved]}=await db.query("select count(*)::int as unresolved_captures,count(*) filter(where lease_until<=clock_timestamp())::int as expired_unresolved_captures from snapshot_captures where state in ('preparing','uploading')");
   return {run,groups,...missing,...unresolved,scope:'metadata-only observation; no ownership assignment or deletion authorization',deletionAuthorized:false};
  });
 }
}
