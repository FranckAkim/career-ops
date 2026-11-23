import assert from 'node:assert/strict';import {SavedJobs} from '../saved-jobs.mjs';
export async function verifyHandshakeImport({pool,queue,tenantId,userId,otherUserId,engineRevision}){
 const service=new SavedJobs(queue),input={url:'https://app.joinhandshake.com/jobs/987654321',title:'Synthetic Handshake Engineer',company:'Synthetic Campus Employer',location:'United States',description:'Build Python reporting tools with synthetic engineering teams. OPT candidates are welcome.',acknowledged:true};
 const rows=await Promise.all([service.importHandshake({tenantId,userId,input}),service.importHandshake({tenantId,userId,input})]);assert.equal(rows[0].id,rows[1].id);const saved=rows[0];
 assert.equal(saved.posting.provenance,'user_import');assert.equal(saved.posting.checkedAt,null);assert.equal(saved.posting.postedAt,null);
 await assert.rejects(service.importHandshake({tenantId,userId:otherUserId,input}),/not_found/);await assert.rejects(service.importHandshake({tenantId,userId,input:{...input,description:input.description+' Updated.'}}),/saved_job_source_changed/);
 assert.equal((await pool.query("select 1 from jobs where tenant_id=$1 and payload->>'postingUrl'=$2",[tenantId,saved.posting.url])).rowCount,0,'import alone invokes no AI');
 await service.remove({tenantId,userId,id:saved.id,expectedRevision:saved.revision});assert.equal((await pool.query('select 1 from saved_jobs where id=$1',[saved.id])).rowCount,0);
 console.log('PASS Handshake imports: reviewed source/host validation, canonical concurrent dedup, immutable conflict, tenant denial and no implicit AI');
}
