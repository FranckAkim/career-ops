import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {BlobWriteFence} from '../blob-write-fence.mjs';
const key='career-workspaces/v1/'+ 'a'.repeat(64)+'/files/'+ 'b'.repeat(64),etag=b=>createHash('sha256').update(b).digest('hex');
function fake(initial){const objects=new Map(initial?[[key,Buffer.from(initial)]]:[]),calls=[];const transport={
 async head(k){const b=objects.get(k);return b?{etag:etag(b),size:b.length}:null;},
 async get(k){const b=objects.get(k);return b?{statusCode:200,stream:new Response(b).body}:null;},
 async put(k,b,o){calls.push(o);if(o.ifMatch?etag(objects.get(k)||Buffer.alloc(0))!==o.ifMatch:objects.has(k))throw Error('precondition');objects.set(k,Buffer.from(b));}
 };return {objects,calls,transport,fence:new BlobWriteFence({transport,credentials:{storeId:'synthetic'}})};}
test('seals existing and missing exact keys; late immutable creates cannot restore data',async()=>{for(const initial of [undefined,'synthetic personal bytes']){const f=fake(initial);const r=await f.fence.seal(key);assert.equal(r.sealed,true);assert.equal(r.markerRetained,true);assert.equal(r.uploadSettlementVerified,false);assert.equal(f.calls[0].allowOverwrite,!!initial);assert.equal(!!f.calls[0].ifMatch,!!initial);await assert.rejects(f.transport.put(key,Buffer.from('late bytes'),{allowOverwrite:false}),/precondition/);assert.equal((await f.fence.seal(key)).sealed,true);assert.equal(f.calls.length,2);}});
test('concurrent modification refuses stale ETag overwrite',async()=>{const f=fake('old'),put=f.transport.put;f.transport.put=async(k,b,o)=>{f.objects.set(k,Buffer.from('concurrent'));return put(k,b,o);};await assert.rejects(f.fence.seal(key),/fence_not_verified/);assert.equal(f.objects.get(key).toString(),'concurrent');});
test('lost put reply verifies marker, outages and absent/unverified results refuse success',async()=>{const f=fake('old'),put=f.transport.put;f.transport.put=async(...args)=>{await put(...args);throw Error('lost reply');};assert.equal((await f.fence.seal(key)).sealed,true);const g=fake();g.transport.put=async()=>{throw Error('outage');};await assert.rejects(g.fence.seal(key),/fence_not_verified/);g.transport.head=async()=>{throw Error('private provider detail');};await assert.rejects(g.fence.seal(key),/fence_verification_failed/);});
test('arbitrary paths and malformed metadata fail closed',async()=>{const f=fake();for(const k of ['../outside','career-workspaces/v1/a/manifest.json',key+'/extra'])await assert.rejects(f.fence.seal(k),/invalid_fence_key/);for(const m of [undefined,{},false,{etag:'e',size:-1}]){f.transport.head=async()=>m;await assert.rejects(f.fence.seal(key),/fence_verification_failed/);}assert.equal(f.calls.length,0);});
