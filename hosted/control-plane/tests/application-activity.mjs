import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {ApplicationActivity} from '../application-activity.mjs';import {SavedJobs} from '../saved-jobs.mjs';import {hash} from '../queue.mjs';import {createApi} from '../http.mjs';
export async function verifyApplicationActivity({pool,queue,tenantId,userId,otherUserId}){
 const service=new ApplicationActivity(queue),id=randomUUID(),actor={tenantId,userId,id},posting={url:'https://example.test/activity',company:'Synthetic Activity',title:'Engineer',location:'US',description:'Synthetic saved posting.',source:'lever-full'};
 await pool.query('insert into saved_jobs(id,tenant_id,user_id,url_hash,posting) values($1,$2,$3,$4,$5)',[id,tenantId,userId,hash(posting.url),posting]);
 const occurredOn=new Date().toISOString().slice(0,10),event={id:randomUUID(),kind:'submitted',occurredOn,notes:'Submitted on employer site.',acknowledged:true,evidence:{name:'receipt.txt',mime:'text/plain',data:Buffer.from('Synthetic receipt').toString('base64')}};
 let row=await service.add({...actor,expectedRevision:1,event});assert.equal(row.revision,2);assert.equal(row.activity[0].evidence.data,undefined);
 assert.equal((await service.add({...actor,expectedRevision:1,event})).revision,2);
 await assert.rejects(service.add({...actor,expectedRevision:2,event:{...event,notes:'Different replay'}}),/activity_conflict/);
 await assert.rejects(service.add({...actor,expectedRevision:1,event:{...event,id:randomUUID()}}),/saved_job_conflict/);
 await assert.rejects(service.add({...actor,userId:otherUserId,expectedRevision:2,event}),/not_found/);
 for(const kind of ['acknowledgment','recruiter_response'])row=await service.add({...actor,expectedRevision:row.revision,event:{id:randomUUID(),kind,occurredOn,acknowledged:true}});
 const listed=(await new SavedJobs(queue).list({tenantId,userId})).find(item=>item.id===id);assert.equal(listed.activity.length,3);assert.ok(!JSON.stringify(listed).includes(event.evidence.data));
 const response=await service.download({...actor,eventId:event.id});assert.equal(response.headers.get('content-type'),'application/octet-stream');assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(await response.text(),'Synthetic receipt');
 await assert.rejects(service.download({...actor,userId:otherUserId,eventId:event.id}),/not_found/);
 const origin='https://activity.example.test',api=createApi({queue,auth:{api:{getSession:async()=>({user:{id:userId}})}},origin,engineRevision:'a'.repeat(40)}),url=`${origin}/api/hosted/tenants/${tenantId}/saved-jobs/${id}`;
 assert.equal((await api(new Request(`${url}/activity-evidence?eventId=${event.id}`))).status,200);
 assert.equal((await api(new Request(`${url}/activity`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({expectedRevision:row.revision,event})}))).status,403);
 assert.equal((await api(new Request(`${url}/activity`,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({event:'x'.repeat(730000)})}))).status,413);
 const originalJobs=Number((await pool.query('select count(*) as n from jobs where tenant_id=$1',[tenantId])).rows[0].n);
 row=await service.remove({...actor,expectedRevision:row.revision,eventId:event.id,acknowledged:true});await assert.rejects(service.download({...actor,eventId:event.id}),/not_found/);
 for(let n=row.activity.length;n<20;n++)row=await service.add({...actor,expectedRevision:row.revision,event:{id:randomUUID(),kind:'recruiter_response',occurredOn,acknowledged:true}});
 await assert.rejects(service.add({...actor,expectedRevision:row.revision,event:{id:randomUUID(),kind:'submitted',occurredOn,acknowledged:true}}),/activity_limit/);
 assert.equal(Number((await pool.query('select count(*) as n from jobs where tenant_id=$1',[tenantId])).rows[0].n),originalJobs);
 const rights=(await pool.query("select has_column_privilege('career_web','saved_jobs','activity','UPDATE') as web_write,has_table_privilege('career_discovery','saved_jobs','SELECT') as discovery_read,has_table_privilege('career_worker','saved_jobs','SELECT') as worker_read")).rows[0];assert.deepEqual(rights,{web_write:true,discovery_read:false,worker_read:false});
 const extra=[];for(let n=0;n<3;n++){const extraId=randomUUID(),source={...posting,url:posting.url+'-'+n};extra.push(extraId);await pool.query('insert into saved_jobs(id,tenant_id,user_id,url_hash,posting) values($1,$2,$3,$4,$5)',[extraId,tenantId,userId,hash(source.url),source]);const input={...actor,id:extraId,expectedRevision:1,event:{...event,id:randomUUID(),evidence:{name:'bounded.txt',mime:'text/plain',data:Buffer.alloc(512000,97).toString('base64')}}};if(n<2)await service.add(input);else await assert.rejects(service.add(input),/activity_limit/);}
 await pool.query('delete from saved_jobs where id=any($1::uuid[])',[[id,...extra]]);
 console.log('PASS application activity: confirmed submission/ack/reply, private evidence round-trip and redacted lists, owner/CSRF/replay/stale/quota checks, correction removal, grants and no AI/stage job');
}
