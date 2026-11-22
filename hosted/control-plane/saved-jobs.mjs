import {postingContext,evaluationScore} from './match-context.mjs';
import {postingDetails} from './posting-details.mjs';
import {classifyWorkAuthorization} from './work-authorization.mjs';
import {randomUUID} from 'node:crypto';
import {ControlError,hash} from './queue.mjs';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const check=(value,code='invalid_request')=>{if(!value)throw new ControlError(code);};
export function savedPosting(job){
 check(job&&typeof job==='object');let url;try{url=new URL(job.url);}catch{throw new ControlError('invalid_request');}
 check(url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&job.url.length<=4096);
 check(['title','company','description','location','source'].every(k=>typeof job[k]==='string')&&job.title.trim()&&job.company.trim());
 check(job.title.length<=200&&job.company.length<=200&&job.location.length<=300&&job.description.length<=30000&&job.source.length<=80);
 const visaText=typeof job.visaText==='string'?job.visaText.slice(0,4000):'';
 const authorization=classifyWorkAuthorization([job.description,visaText].filter(Boolean).join('\n'),{incomplete:job.descriptionAvailable!==true});
 const details=postingDetails(job);
 const posting={...details,visaText,authorization,id:job.url,url:job.url,title:job.title,company:job.company,location:job.location,description:job.description,descriptionAvailable:job.descriptionAvailable===true,source:job.source,postedAt:typeof job.postedAt==='string'?job.postedAt.slice(0,30):null};
 check(Buffer.byteLength(JSON.stringify(posting))<=120000,'input_limit');return posting;
}
export class SavedJobs{
 constructor(queue){this.queue=queue;}
 async lock(db,{tenantId,userId}){await db.query('select id from tenants where id=$1 for update',[tenantId]);await this.queue.authorize(db,tenantId,userId);}
 async list({tenantId,userId}){return this.queue.transaction(async db=>{await this.queue.authorize(db,tenantId,userId);const rows=(await db.query('select id,posting,shortlisted,revision,created_at,updated_at from saved_jobs where tenant_id=$1 and user_id=$2 order by shortlisted desc,created_at desc,id limit 31',[tenantId,userId])).rows;check(rows.length<=30,'saved_job_limit');
   if(!rows.length)return rows;
   const texts=rows.map(row=>hash(postingContext(row.posting))),urls=rows.map(row=>row.posting.url);
   const evaluations=(await db.query(`select distinct on (payload->>'postingUrl',encode(sha256(convert_to(payload->>'postingText','UTF8')),'hex')) id,status,result->>'score' as score,result->>'applicationNumber' as application_number,created_at,finished_at,payload->>'postingUrl' as url,encode(sha256(convert_to(payload->>'postingText','UTF8')),'hex') as source_hash
    from jobs where tenant_id=$1 and requested_by=$2 and payload->>'operation'='evaluate' and payload->>'postingUrl'=any($3::text[]) and md5(payload->>'postingUrl')=any(array(select md5(supplied.url) from unnest($3::text[]) as supplied(url))) and encode(sha256(convert_to(payload->>'postingText','UTF8')),'hex')=any($4::text[]) order by payload->>'postingUrl',encode(sha256(convert_to(payload->>'postingText','UTF8')),'hex'),created_at desc,id desc`,[tenantId,userId,urls,texts])).rows;
   const profile=(await db.query('select d.confirmed_at from personal_workspaces p join profile_drafts d on d.id=p.draft_id where p.tenant_id=$1 and p.user_id=$2',[tenantId,userId])).rows[0];
   const projection=(await db.query('select j.result from tenants t left join lateral (select v.job_id from workspace_versions v where v.tenant_id=t.id and v.generation<=t.generation and v.job_id is not null order by v.generation desc limit 1) w on true left join jobs j on j.tenant_id=t.id and j.id=w.job_id where t.id=$1',[tenantId])).rows[0]?.result?.applications;
   return rows.map(row=>{const evaluation=evaluations.find(job=>job.url===row.posting.url&&job.source_hash===hash(postingContext(row.posting)));if(!evaluation)return {...row,match:null};const number=Number(evaluation.application_number),application=Array.isArray(projection)?projection.find(item=>item.number===number):null;
    return {...row,match:{jobId:evaluation.id,status:evaluation.status,score:evaluationScore(evaluation.score),createdAt:evaluation.created_at,finishedAt:evaluation.finished_at,stale:!profile?.confirmed_at||new Date(profile.confirmed_at)>new Date(evaluation.created_at),applicationNumber:Number.isSafeInteger(number)&&number>0?number:null,applicationStatus:application?.status||null}};});});}
 async save({tenantId,userId,runId,jobId}){
  check(uuid.test(runId||'')&&typeof jobId==='string'&&jobId.length<=4096);
  return this.queue.transaction(async db=>{
   await this.lock(db,{tenantId,userId});
   const run=(await db.query("select result from discovery_runs where id=$1 and tenant_id=$2 and user_id=$3 and state='succeeded' and expires_at>clock_timestamp() for share",[runId,tenantId,userId])).rows[0];check(run,'not_found');
   const item=run.result?.jobs?.find(job=>job.id===jobId);check(item,'not_found');const posting=savedPosting(item),urlHash=hash(posting.url);
   const prior=(await db.query('select id,posting,shortlisted,revision,created_at,updated_at from saved_jobs where tenant_id=$1 and user_id=$2 and url_hash=$3',[tenantId,userId,urlHash])).rows[0];if(prior){check(prior.posting.url===posting.url,'saved_job_conflict');check(postingContext(prior.posting)===postingContext(posting)&&prior.posting.descriptionAvailable===posting.descriptionAvailable,'saved_job_source_changed');return prior;}
   check(Number((await db.query('select count(*) as count from saved_jobs where tenant_id=$1 and user_id=$2',[tenantId,userId])).rows[0].count)<30,'saved_job_limit');
   return (await db.query('insert into saved_jobs(id,tenant_id,user_id,url_hash,posting) values($1,$2,$3,$4,$5) returning id,posting,shortlisted,revision,created_at,updated_at',[randomUUID(),tenantId,userId,urlHash,posting])).rows[0];
  });
 }

 async evaluate({tenantId,userId,id,expectedRevision,engineRevision}){
  check(uuid.test(id||'')&&Number.isSafeInteger(expectedRevision)&&expectedRevision>0);
  const rows=await this.list({tenantId,userId}),item=rows.find(row=>row.id===id);check(item,'not_found');check(item.revision===expectedRevision,'saved_job_conflict');check(item.posting.descriptionAvailable,'invalid_request');
  if(item.match&&!item.match.stale&&['queued','running','succeeded','needs_recovery','cancel_requested'].includes(item.match.status))return {id:item.match.jobId,status:item.match.status};
  const profile=(await this.queue.pool.query('select p.review_hash,p.draft_id from personal_workspaces p join profile_drafts d on d.id=p.draft_id where p.tenant_id=$1 and p.user_id=$2 and d.confirmed_at is not null',[tenantId,userId])).rows[0];check(profile,'not_found');
  const attempt=item.match&&!item.match.stale?item.match.jobId:'initial';
  return this.queue.enqueue({tenantId,userId,engineRevision,operation:'evaluate',postingText:postingContext(item.posting),postingUrl:item.posting.url,idempotencyKey:'saved-match:'+hash(JSON.stringify([id,item.posting,profile.review_hash,profile.draft_id,attempt]))});
 }
 async update({tenantId,userId,id,expectedRevision,shortlisted}){check(uuid.test(id||'')&&Number.isSafeInteger(expectedRevision)&&expectedRevision>0&&typeof shortlisted==='boolean');return this.queue.transaction(async db=>{await this.lock(db,{tenantId,userId});const row=(await db.query('update saved_jobs set shortlisted=$5 where id=$1 and tenant_id=$2 and user_id=$3 and revision=$4 returning id,posting,shortlisted,revision,created_at,updated_at',[id,tenantId,userId,expectedRevision,shortlisted])).rows[0];check(row,'saved_job_conflict');return row;});}
 async remove({tenantId,userId,id,expectedRevision}){check(uuid.test(id||'')&&Number.isSafeInteger(expectedRevision)&&expectedRevision>0);return this.queue.transaction(async db=>{await this.lock(db,{tenantId,userId});const row=await db.query('delete from saved_jobs where id=$1 and tenant_id=$2 and user_id=$3 and revision=$4 returning id',[id,tenantId,userId,expectedRevision]);check(row.rowCount,'saved_job_conflict');return {removed:true};});}
}
