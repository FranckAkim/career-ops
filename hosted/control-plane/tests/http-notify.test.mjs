import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../http.mjs';
test('notification failure preserves committed job and disabled worker rejects before enqueue',async()=>{
 let calls=0,notifications=0;
 const options={queue:{enqueue:async()=>{calls++;return{id:'synthetic',status:'queued'};}},auth:{api:{getSession:async()=>({user:{id:'synthetic-user'}})}},origin:'https://example.com',engineRevision:'a'.repeat(40),notifyQueue:async()=>{notifications++;throw new Error('offline');}};
 const request=()=>new Request('https://example.com/api/hosted/tenants/synthetic/jobs',{method:'POST',headers:{origin:'https://example.com','content-type':'application/json','idempotency-key':'synthetic'},body:JSON.stringify({operation:'evaluate',postingText:'Synthetic job'})});
 const response=await createApi(options)(request());
 assert.equal(response.status,202);assert.equal(calls,1);assert.equal(notifications,1);
 assert.equal((await createApi({...options,jobsEnabled:false})(request())).status,503);assert.equal(calls,1);
});
