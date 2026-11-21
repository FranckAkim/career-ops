import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CaptureReview} from '../capture-review.mjs';
const requestId='11111111-1111-4111-8111-111111111111',user='22222222-2222-4222-8222-222222222222',snapshot='a'.repeat(64),file='b'.repeat(64);
function fixture(){
 const state={blocked:true,calls:0,rows:[{id:requestId,user_id:user,tenant_id:null,snapshot_id:snapshot,state:'failed',error_code:'capture_failed',object_state:'active',legacy:false,file_hashes:[file]}],heads:[]};
 const queue={async transaction(fn){return fn({async query(sql){assert.ok(!/\b(insert|update|delete)\b/i.test(sql));if(sql.includes('account_deletion_requests'))return {rows:[{id:requestId,user_id:user,tenant_id:null,state:'blocked_pending_review'}]};if(sql.includes('account_tombstones'))return {rowCount:state.blocked?1:0};state.calls++;return {rows:structuredClone(state.rows)};}});}};
 const store={async objectPresent(id,key){state.heads.push([id,key]);return key===null?null:{etag:'synthetic-etag',size:3,url:'must-not-escape'};}};
 return {state,queue,store};
}
test('inspects exact inventoried keys without authorizing purge or disclosing storage capabilities',async()=>{
 const f=fixture(),result=await new CaptureReview(f).inspect(requestId);assert.deepEqual(f.state.heads,[[snapshot,file],[snapshot,null]]);assert.equal(result.observations[0].present,1);assert.equal(result.observations[0].missing,1);assert.equal(result.purgeAuthorized,false);assert.equal(result.uploadSettlementVerified,false);assert.equal(JSON.stringify(result).includes('must-not-escape'),false);assert.equal(f.state.calls,2);
});
test('missing objects never establish upload settlement',async()=>{const f=fixture();f.store.objectPresent=async()=>null;const r=await new CaptureReview(f).inspect(requestId);assert.equal(r.observations[0].missing,2);assert.equal(r.purgeAuthorized,false);});
test('active, unregistered, legacy and foreign captures are unresolved without storage access',async()=>{for(const change of [{state:'uploading'},{snapshot_id:null},{legacy:true},{user_id:requestId},{file_hashes:[file,file]}]){const f=fixture();Object.assign(f.state.rows[0],change);const r=await new CaptureReview(f).inspect(requestId);assert.equal(r.unresolved.length,1);assert.equal(f.state.heads.length,0);}});
test('provider failure, malformed metadata and changed review scope fail closed',async()=>{
 for(const value of [undefined,false,{}, {etag:'e',size:-1}]){const f=fixture();f.store.objectPresent=async()=>value;await assert.rejects(new CaptureReview(f).inspect(requestId),/storage_verification_failed/);}
 const f=fixture();f.store.objectPresent=async()=>{throw Error('private failure');};await assert.rejects(new CaptureReview(f).inspect(requestId),/storage_verification_failed/);
 const g=fixture();g.store.objectPresent=async()=>{g.state.rows[0].state='ready';return null;};await assert.rejects(new CaptureReview(g).inspect(requestId),/review_conflict/);
});
test('requires a blocked reviewed account and bounded inventory',async()=>{const f=fixture();f.state.blocked=false;await assert.rejects(new CaptureReview(f).inspect(requestId),/account_not_blocked/);assert.equal(f.state.heads.length,0);const g=fixture();g.state.rows=Array(1001).fill(g.state.rows[0]);await assert.rejects(new CaptureReview(g).inspect(requestId),/scope_review_required/);assert.equal(g.state.heads.length,0);});
