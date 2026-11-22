import{test}from'node:test';import assert from'node:assert/strict';import{createApi}from'../http.mjs';import{ControlError}from'../queue.mjs';
test('cloud wake follows authorization, carries only the existing run ID and retries from queued reads',async()=>{
 const id='00000000-0000-4000-8000-000000000001',calls=[];let latest=null;
 const db={query:async sql=>({rows:sql.includes('count(*)')?[{count:0}]:sql.includes('select id,state,input')?(latest?[latest]:[]):[]})};
 const queue={pool:db,transaction:fn=>fn(db),authorize:async(_db,tenant)=>{if(tenant!=='mine')throw new ControlError('not_found');}};
 const api=createApi({queue,engineRevision:'a'.repeat(40),auth:{api:{getSession:async()=>({user:{id:'user'}})}},origin:'https://example.com',notifyDiscovery:async runId=>{calls.push(runId);throw Error('temporary_dispatch_failure');}});
 const req=(tenant,method='GET')=>new Request(`https://example.com/api/hosted/tenants/${tenant}/discovery`,{method,headers:{origin:'https://example.com','content-type':'application/json'},...(method==='POST'?{body:JSON.stringify({q:'engineer'})}:{})});
 assert.equal((await api(req('other','POST'))).status,404);assert.equal(calls.length,0);
 const started=await api(req('mine','POST'));assert.equal(started.status,202);const run=await started.json();assert.equal(calls[0],run.id);
 latest={id,state:'queued',input:{q:'engineer'}};assert.equal((await api(req('mine'))).status,200);assert.equal(calls[1],id);
 latest={...latest,state:'succeeded'};await api(req('mine'));assert.equal(calls.length,2);
});
test('built-in search keeps authenticated origin and tenant checks; old feed is removed',async()=>{
 let checks=0;const options={origin:'https://example.com',engineRevision:'a'.repeat(40),queue:{pool:{query:async()=>({rows:[]})},authorize:async(db,tenant)=>{checks++;if(tenant!=='mine')throw new ControlError('not_found');}},auth:{api:{getSession:async()=>({user:{id:'user'}})}}};const request=(path,headers={})=>new Request('https://example.com/api/hosted/tenants/'+path,{headers});
 assert.equal((await createApi(options)(request('mine/discovery'))).status,200);assert.equal(checks,1);assert.equal((await createApi(options)(request('other/discovery'))).status,404);assert.equal(checks,2);
 assert.equal((await createApi(options)(request('mine/discovery',{origin:'https://evil.test'}))).status,403);assert.equal(checks,2);
 assert.equal((await createApi({...options,auth:{api:{getSession:async()=>null}}})(request('mine/discovery'))).status,401);assert.equal(checks,2);
 assert.equal((await createApi(options)(request('mine/discover?q=engineer'))).status,404);
});
