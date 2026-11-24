import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {Discovery} from '../discovery.mjs';import {cloudDiscovery} from '../cloud-discovery.mjs';
export async function verifyCloudDiscovery({pool,queue,tenantId,userId}){
 const restricted={query:async(sql,args)=>{const db=await pool.connect();try{await db.query('begin');await db.query('set local role career_discovery');const result=await db.query(sql,args);await db.query('commit');return result;}catch(e){await db.query('rollback');throw e;}finally{db.release();}}};
 for(const table of ['tenants','profile_drafts','jobs','memberships','saved_jobs','saved_searches','discovery_runs'])assert.equal((await pool.query("select has_table_privilege('career_discovery',$1,'SELECT') as allowed",[table])).rows[0].allowed,false,table);
 assert.equal((await pool.query("select has_function_privilege('career_web','hosted_discovery_claim(uuid,uuid)','EXECUTE') as allowed")).rows[0].allowed,false);
 await assert.rejects(restricted.query('select content from profile_drafts'),/permission denied/);
 const service=new Discovery(queue),input={q:'synthetic',location:'United States',sinceDays:7,limitPerAts:25};
 const run=await service.start({tenantId,userId,input});let calls=0;
 const runner=async options=>{calls++;assert.equal(options.input.q,'synthetic');return {jobs:[],partial:true};};
 await Promise.all([cloudDiscovery({pool:restricted,discoveryId:run.id,runner}),cloudDiscovery({pool:restricted,discoveryId:run.id,runner})]);assert.equal(calls,1);assert.equal((await service.read({tenantId,userId,id:run.id})).result.execution,'cloud');
 await cloudDiscovery({pool:restricted,discoveryId:run.id,runner});assert.equal(calls,1);
 const next=await service.start({tenantId,userId,input});let enter,release;const entered=new Promise(r=>enter=r),gate=new Promise(r=>release=r);
 const running=cloudDiscovery({pool:restricted,discoveryId:next.id,runner:async()=>{enter();await gate;return {jobs:[]};}});await entered;await service.cancel({tenantId,userId,id:next.id});release();await running;assert.equal((await service.read({tenantId,userId,id:next.id})).state,'cancelled');
 const leased=await service.start({tenantId,userId,input}),claim=randomUUID();await restricted.query('select hosted_discovery_claim($1,$2)',[leased.id,claim]);assert.equal((await restricted.query('select hosted_discovery_finish($1,$2,$3,false) as done',[leased.id,randomUUID(),{jobs:[]}])).rows[0].done,false);
 await assert.rejects(restricted.query('select hosted_discovery_finish($1,$2,$3,false)',[leased.id,claim,{invalid:true}]),/invalid_discovery_result/);
 await pool.query("update discovery_runs set lease_until=clock_timestamp()-interval '1 second' where id=$1",[leased.id]);await cloudDiscovery({pool:restricted,discoveryId:leased.id,runner});assert.equal((await service.read({tenantId,userId,id:leased.id})).state,'failed');assert.equal(calls,1);
 const expired=await service.start({tenantId,userId,input});await pool.query("update discovery_runs set expires_at=clock_timestamp()-interval '1 second' where id=$1",[expired.id]);const count=(await restricted.query('select hosted_discovery_cleanup() as count')).rows[0].count;assert.ok(count>=1);assert.equal((await pool.query('select 1 from discovery_runs where id=$1',[expired.id])).rowCount,0);assert.equal((await pool.query('select 1 from discovery_runs where id=$1',[run.id])).rowCount,1);assert.equal((await pool.query("select has_function_privilege('career_web','hosted_discovery_cleanup()','EXECUTE') as allowed")).rows[0].allowed,false);
 console.log('PASS cloud search: dedicated no-CV role, RPC-only exact claims, concurrent/replayed delivery, cancellation, stale claims, expired leases bounded results and expired-only scheduled cleanup');
}
