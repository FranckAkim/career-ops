import {randomUUID} from 'node:crypto';
import {ControlError,hash} from './queue.mjs';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const check=(value,code='invalid_request')=>{if(!value)throw new ControlError(code);};
export function savedPosting(job){
 check(job&&typeof job==='object');let url;try{url=new URL(job.url);}catch{throw new ControlError('invalid_request');}
 check(url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&job.url.length<=4096);
 check(['title','company','description','location','source'].every(k=>typeof job[k]==='string')&&job.title.trim()&&job.company.trim());
 check(job.title.length<=200&&job.company.length<=200&&job.location.length<=300&&job.description.length<=30000&&job.source.length<=80);
 const posting={id:job.url,url:job.url,title:job.title,company:job.company,location:job.location,description:job.description,descriptionAvailable:job.descriptionAvailable===true,source:job.source,postedAt:typeof job.postedAt==='string'?job.postedAt.slice(0,30):null};
 check(Buffer.byteLength(JSON.stringify(posting))<=120000,'input_limit');return posting;
}
export class SavedJobs{
 constructor(queue){this.queue=queue;}
 async lock(db,{tenantId,userId}){await db.query('select id from tenants where id=$1 for update',[tenantId]);await this.queue.authorize(db,tenantId,userId);}
 async list({tenantId,userId}){return this.queue.transaction(async db=>{await this.queue.authorize(db,tenantId,userId);const rows=(await db.query('select id,posting,shortlisted,revision,created_at,updated_at from saved_jobs where tenant_id=$1 and user_id=$2 order by shortlisted desc,created_at desc,id limit 31',[tenantId,userId])).rows;check(rows.length<=30,'saved_job_limit');return rows;});}
 async save({tenantId,userId,runId,jobId}){
  check(uuid.test(runId||'')&&typeof jobId==='string'&&jobId.length<=4096);
  return this.queue.transaction(async db=>{
   await this.lock(db,{tenantId,userId});
   const run=(await db.query("select result from discovery_runs where id=$1 and tenant_id=$2 and user_id=$3 and state='succeeded' and expires_at>clock_timestamp() for share",[runId,tenantId,userId])).rows[0];check(run,'not_found');
   const item=run.result?.jobs?.find(job=>job.id===jobId);check(item,'not_found');const posting=savedPosting(item),urlHash=hash(posting.url);
   const prior=(await db.query('select id,posting,shortlisted,revision,created_at,updated_at from saved_jobs where tenant_id=$1 and user_id=$2 and url_hash=$3',[tenantId,userId,urlHash])).rows[0];if(prior){check(prior.posting.url===posting.url,'saved_job_conflict');return prior;}
   check(Number((await db.query('select count(*) as count from saved_jobs where tenant_id=$1 and user_id=$2',[tenantId,userId])).rows[0].count)<30,'saved_job_limit');
   return (await db.query('insert into saved_jobs(id,tenant_id,user_id,url_hash,posting) values($1,$2,$3,$4,$5) returning id,posting,shortlisted,revision,created_at,updated_at',[randomUUID(),tenantId,userId,urlHash,posting])).rows[0];
  });
 }
 async update({tenantId,userId,id,expectedRevision,shortlisted}){check(uuid.test(id||'')&&Number.isSafeInteger(expectedRevision)&&expectedRevision>0&&typeof shortlisted==='boolean');return this.queue.transaction(async db=>{await this.lock(db,{tenantId,userId});const row=(await db.query('update saved_jobs set shortlisted=$5 where id=$1 and tenant_id=$2 and user_id=$3 and revision=$4 returning id,posting,shortlisted,revision,created_at,updated_at',[id,tenantId,userId,expectedRevision,shortlisted])).rows[0];check(row,'saved_job_conflict');return row;});}
 async remove({tenantId,userId,id,expectedRevision}){check(uuid.test(id||'')&&Number.isSafeInteger(expectedRevision)&&expectedRevision>0);return this.queue.transaction(async db=>{await this.lock(db,{tenantId,userId});const row=await db.query('delete from saved_jobs where id=$1 and tenant_id=$2 and user_id=$3 and revision=$4 returning id',[id,tenantId,userId,expectedRevision]);check(row.rowCount,'saved_job_conflict');return {removed:true};});}
}
