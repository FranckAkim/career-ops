import {test} from 'node:test';import assert from 'node:assert/strict';import {createApi} from '../http.mjs';
test('application rollout gate rejects reads/writes before an engine upgrade without disabling existing jobs',async()=>{
 let enqueued=false;const api=createApi({queue:{enqueue:async()=>{enqueued=true;}},auth:{api:{getSession:async()=>({user:{id:'synthetic'}})}},origin:'https://example.test',engineRevision:'a'.repeat(40),applicationsEnabled:false});
 assert.equal((await api(new Request('https://example.test/api/hosted/tenants/synthetic/applications'))).status,404);
 const response=await api(new Request('https://example.test/api/hosted/tenants/synthetic/jobs',{method:'POST',headers:{origin:'https://example.test','content-type':'application/json'},body:JSON.stringify({operation:'sync_applications'})}));assert.equal(response.status,503);assert.equal(enqueued,false);
});
