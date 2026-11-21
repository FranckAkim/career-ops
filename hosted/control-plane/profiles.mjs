import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {ControlError} from './queue.mjs';
import {profileInput,reviewHash} from './onboarding.mjs';
import {assertCapturePublication} from './snapshot-inventory.mjs';
const check=(value,code='invalid_request')=>{if(!value)throw new ControlError(code);};

// Source-only publication: preserve the canonical tracker and all prior receipts.
// No model is asked to invent, extract or confirm career facts.
export class Profiles {
 constructor({queue,store,inventory}){this.queue=queue;this.store=store;this.inventory=inventory;}
 async current({tenantId,userId},db=this.queue.pool){
  await this.queue.authorize(db,tenantId,userId,true);
  const{rows:[row]}=await db.query('select t.generation,t.snapshot,t.active_job,t.recovery_required,p.review_hash,d.content,d.revision,w.job_id from tenants t join personal_workspaces p on p.tenant_id=t.id and p.user_id=$2 join profile_drafts d on d.id=p.draft_id and d.user_id=p.user_id join workspace_versions w on w.tenant_id=t.id and w.generation=t.generation where t.id=$1',[tenantId,userId]);
  check(row,'not_found');return row;
 }
 async read(input){const row=await this.current(input);return {profile:row.content,reviewHash:row.review_hash,generation:row.generation,revision:row.revision};}
 review(profile){const content=profileInput(profile);return {profile:content,reviewHash:reviewHash(content)};}
 async save({tenantId,userId,profile,expectedHash,expectedGeneration,reviewedHash,acknowledged}){
  check(acknowledged===true,'confirmation_required');
  const content=profileInput(profile),fingerprint=reviewHash(content);
  check(reviewedHash===fingerprint,'review_conflict');
  check(/^[a-f0-9]{64}$/.test(expectedHash||'')&&/^\d{1,19}$/.test(String(expectedGeneration)));
  const input={tenantId,userId},base=await this.current(input);
  // Exact replay is safe; it never changes the current workspace again.
  if(base.review_hash===fingerprint)return {saved:true,replayed:true,generation:base.generation};
  check(base.review_hash===expectedHash&&base.generation===String(expectedGeneration),'review_conflict');
  check(!base.active_job&&!base.recovery_required,'tenant_busy');
  check(!(await this.queue.pool.query("select 1 from jobs where tenant_id=$1 and status in ('queued','running','cancel_requested') limit 1",[tenantId])).rowCount,'tenant_busy');
  check(this.store,'storage_configuration_required');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'hc-profile-')),workspace=path.join(root,'workspace'),draftId=randomUUID();let snapshot;
  try{
   await fs.chmod(root,0o700);await this.store.materialize(base.snapshot,workspace);
   // These fields originated in hosted onboarding. Preserve unrelated source
   // configuration and any additional user-authored targeting notes.
   let configuration;try{configuration=JSON.parse(await fs.readFile(path.join(workspace,'config/profile.yml'),'utf8'));}catch{throw new ControlError('profile_source_conflict');}
   check(configuration&&typeof configuration==='object'&&!Array.isArray(configuration),'profile_source_conflict');
   const targeting=await fs.readFile(path.join(workspace,'modes/_profile.md'),'utf8'),oldTarget=`Target role stated by the user: ${JSON.stringify(base.content.targetRole)}. Use only confirmed CV/profile facts.`;
   check(targeting===oldTarget||targeting.startsWith(oldTarget+'\n'),'profile_source_conflict');
   const provenance={schema:1,provenance:'user-confirmed-pasted-source',userId,draftId,revision:base.revision+1,reviewHash:fingerprint,previousReviewHash:base.review_hash,previousGeneration:base.generation,confirmedAt:new Date().toISOString()};
   const files={'cv.md':content.cvMarkdown,'config/profile.yml':JSON.stringify({...configuration,name:content.fullName,candidate:{...configuration.candidate,full_name:content.fullName},output_language:content.language}),'modes/_profile.md':`Target role stated by the user: ${JSON.stringify(content.targetRole)}. Use only confirmed CV/profile facts.`+targeting.slice(oldTarget.length),'config/confirmed-profile.json':JSON.stringify(provenance)};
   for(const[file,text]of Object.entries(files))await fs.writeFile(path.join(workspace,file),text,{mode:0o600});
   snapshot=this.inventory?await this.inventory.capture({store:this.store,workspace,userId,tenantId,kind:'profile'}):await this.store.capture(workspace);await this.store.verify(snapshot.id);
  }finally{
   if(path.dirname(root)!==path.resolve(os.tmpdir())||!path.basename(root).startsWith('hc-profile-')||await fs.realpath(root)!==root)throw new ControlError('unsafe_cleanup');
   await fs.rm(root,{recursive:true,force:true});
  }
  return this.queue.transaction(async db=>{
   // Same tenant lock order as enqueue/claim/publish; all slow storage work is outside it.
   await db.query('select id from tenants where id=$1 for update',[tenantId]);
   const current=await this.current(input,db);
   if(current.review_hash===fingerprint)return {saved:true,replayed:true,generation:current.generation};
   check(current.generation===base.generation&&current.snapshot===base.snapshot&&current.review_hash===expectedHash,'review_conflict');
   check(!current.active_job&&!current.recovery_required,'tenant_busy');
   check(!(await db.query("select 1 from jobs where tenant_id=$1 and status in ('queued','running','cancel_requested') limit 1",[tenantId])).rowCount,'tenant_busy');
   const generation=(BigInt(current.generation)+1n).toString();
   if(this.inventory)await assertCapturePublication(db,{snapshot:snapshot.id,captureId:snapshot.captureId,userId,tenantId,kind:'profile'});
   await db.query('insert into profile_drafts(id,user_id,revision,review_hash,content,confirmed_at) values($1,$2,$3,$4,$5,clock_timestamp())',[draftId,userId,current.revision+1,fingerprint,content]);
   await db.query('update personal_workspaces set draft_id=$2,review_hash=$3 where user_id=$1',[userId,draftId,fingerprint]);
   // Source-only generations have no job receipt. Tracker reads resolve the most
   // recent committed job; the tracker bytes themselves remain unchanged.
   await db.query('insert into workspace_versions(tenant_id,generation,snapshot) values($1,$2,$3)',[tenantId,generation,snapshot.id]);
   await db.query('update tenants set generation=$2,snapshot=$3 where id=$1',[tenantId,generation,snapshot.id]);
   return {saved:true,replayed:false,generation};
  });
 }
}
