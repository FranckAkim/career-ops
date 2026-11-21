import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
export async function verifyApplications({queue,supervisor,tenantId,userId,otherUserId,engineRevision,store,pool}){
 let tracker=await queue.applications({tenantId,userId});assert.equal(tracker.initialized,true);let row=tracker.applications[0];assert.equal(row.status,'Evaluated');
 await assert.rejects(queue.applications({tenantId,userId:otherUserId}),/not_found/);
 const input={tenantId,userId,engineRevision,operation:'set_status',applicationNumber:row.number,targetStatus:'Applied',expectedStatus:row.status,expectedRowHash:row.rowHash,idempotencyKey:randomUUID()};
 const job=await queue.enqueue(input);assert.equal((await queue.enqueue(input)).id,job.id);assert.equal((await queue.applications({tenantId,userId})).applications[0].status,'Evaluated');
 assert.equal((await supervisor.runOnce()).status,'succeeded');tracker=await queue.applications({tenantId,userId});assert.equal(tracker.applications[0].status,'Applied');
 const before=(await pool.query('select snapshot from tenants where id=$1',[tenantId])).rows[0].snapshot;
 await queue.enqueue({...input,idempotencyKey:randomUUID(),targetStatus:'Offer'});assert.equal((await supervisor.runOnce()).status,'needs_recovery');
 assert.equal((await pool.query('select snapshot from tenants where id=$1',[tenantId])).rows[0].snapshot,before);assert.equal((await queue.applications({tenantId,userId})).applications[0].status,'Applied');await queue.discardRecovery({tenantId,userId});
 row=tracker.applications[0];await queue.enqueue({...input,idempotencyKey:randomUUID(),expectedStatus:row.status,expectedRowHash:row.rowHash,targetStatus:'Interview'});assert.equal((await supervisor.runOnce()).status,'succeeded');
 tracker=await queue.applications({tenantId,userId});assert.equal(tracker.applications[0].status,'Interview');const snapshot=(await pool.query('select snapshot from tenants where id=$1',[tenantId])).rows[0].snapshot;assert.match(await store.read(snapshot,'data/status-log.tsv'),/Interview/);
 await assert.rejects(queue.enqueue({...input,idempotencyKey:randomUUID(),targetStatus:'--force'}),/invalid_request/);
 console.log('PASS canonical status publication, pending-state consistency, stale-update fencing, explicit recovery and cross-tenant tracker denial');
}
