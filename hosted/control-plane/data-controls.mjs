import {ControlError,hash} from './queue.mjs';
import {Onboarding} from './onboarding.mjs';
const check=(value,code='invalid_request')=>{if(!value)throw new ControlError(code);};
export class DataControls{
 constructor({queue,store}){this.queue=queue;this.store=store;}
 async authorize(db,{tenantId,userId}){
  await this.queue.authorize(db,tenantId,userId,true);
  check((await db.query('select 1 from personal_workspaces where tenant_id=$1 and user_id=$2',[tenantId,userId])).rowCount,'not_found');
 }
 async summary(input){return this.queue.transaction(async db=>{await this.authorize(db,input);const{rows:drafts}=await db.query('select id,revision,review_hash from profile_drafts where user_id=$1 and confirmed_at is null order by id',[input.userId]);check(drafts.length<=5,'export_limit');return {drafts,exportAvailable:true,deletionAvailable:false,automaticRetention:false};});}
 async discardDrafts({...input}){
  check(input.acknowledged===true,'confirmation_required');check(Array.isArray(input.expectedDrafts)&&input.expectedDrafts.length<=5);
  return this.queue.transaction(async db=>{
   await new Onboarding({queue:this.queue,store:this.store}).userLock(db,input.userId);await this.authorize(db,input);
   const{rows:drafts}=await db.query('select id,review_hash from profile_drafts where user_id=$1 and confirmed_at is null order by id',[input.userId]);
   const expected=input.expectedDrafts.map(value=>({id:value?.id,review_hash:value?.reviewHash})).sort((a,b)=>String(a.id).localeCompare(String(b.id)));
   check(JSON.stringify(expected)===JSON.stringify(drafts),'review_conflict');
   const removed=await db.query('delete from profile_drafts d where d.user_id=$1 and d.confirmed_at is null and not exists(select 1 from personal_workspaces p where p.draft_id=d.id)',[input.userId]);
   check(removed.rowCount===drafts.length,'review_conflict');return {discarded:removed.rowCount};
  });
 }
 async export(input){
  check(this.store,'storage_configuration_required');
  const data=await this.queue.transaction(async db=>{
   await this.authorize(db,input);
   // Pin the metadata set while queue/profile publishers use this same row lock.
   const{rows:[tenant]}=await db.query('select id,generation,snapshot from tenants where id=$1 for update',[input.tenantId]);
   const{rows:[jobSize]}=await db.query('select coalesce(sum(octet_length(payload::text)+coalesce(octet_length(result::text),0)),0)::text as bytes from jobs where tenant_id=$1',[input.tenantId]);
   const{rows:[profileSize]}=await db.query('select coalesce(sum(octet_length(content::text)),0)::text as bytes from profile_drafts where user_id=$1',[input.userId]);
   check(Number(jobSize.bytes)<=10000000&&Number(profileSize.bytes)<=2000000,'export_limit');
   const{rows:versions}=await db.query('select generation,snapshot,job_id,created_at from workspace_versions where tenant_id=$1 order by generation limit 1001',[input.tenantId]);
   const{rows:jobs}=await db.query('select id,payload,engine_revision,status,result,error_code,created_at,finished_at from jobs where tenant_id=$1 order by created_at,id limit 10001',[input.tenantId]);
   const{rows:profiles}=await db.query('select id,revision,review_hash,content,created_at,updated_at,confirmed_at from profile_drafts where user_id=$1 order by created_at,id limit 1001',[input.userId]);
   check(versions.length<=1000&&jobs.length<=10000&&profiles.length<=1000,'export_limit');
   return {schema:1,scope:'personal-workspace-published-data',exportedAt:new Date().toISOString(),tenant,versions,jobs,profiles};
  });
  const snapshots=[],files=new Map();let total=0,entries=0,manifestBytes=0;
  for(const id of new Set([data.tenant.snapshot,...data.versions.map(version=>version.snapshot)])){
   const manifest=await this.store.manifest(id);entries+=manifest.files.length;manifestBytes+=Buffer.byteLength(JSON.stringify(manifest));check(entries<=50000&&manifestBytes<=10000000,'export_limit');snapshots.push({id,manifest});
   for(const file of manifest.files)if(!files.has(file.sha256)){check(file.bytes<=20000000,'export_limit');total+=file.bytes;check(total<=100000000,'export_limit');files.set(file.sha256,{id,file});}
  }
  const header=JSON.stringify({...data,snapshots}).slice(0,-1)+',"files":[',iterator=files.entries(),encoder=new TextEncoder();let started=false,first=true,stopped=false,pendingRead;
  const store=this.store;
  const stream=new ReadableStream({async pull(controller){
   if(stopped)return;
   try{
    if(!started){started=true;controller.enqueue(encoder.encode(header));return;}
    const next=iterator.next();if(next.done){controller.enqueue(encoder.encode('],"complete":true}'));controller.close();stopped=true;return;}
    const[sha256,{id,file}]=next.value,bytes=await(pendingRead=store.readBytes(id,file.path,{maxBytes:20000000}));pendingRead=null;
    if(stopped)return;check(bytes.length===file.bytes&&hash(bytes)===sha256,'snapshot_corrupt');
    controller.enqueue(encoder.encode((first?'':',')+JSON.stringify({sha256,bytes:bytes.length,encoding:'base64',data:bytes.toString('base64')})));first=false;
   }catch{if(!stopped){stopped=true;controller.error(new Error('export_failed'));}}
  },async cancel(){stopped=true;await pendingRead?.catch(()=>{});}});
  return new Response(stream,{headers:{'Content-Type':'application/json','Content-Disposition':'attachment; filename="career-workspace-export.json"','Cache-Control':'private, no-store',Vary:'Cookie','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'; sandbox",'Referrer-Policy':'no-referrer'}});
 }
}
