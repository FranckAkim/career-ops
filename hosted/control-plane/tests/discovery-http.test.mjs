import{test}from'node:test';import assert from'node:assert/strict';import{createApi}from'../http.mjs';import{ControlError}from'../queue.mjs';
test('built-in search keeps authenticated origin and tenant checks; old feed is removed',async()=>{
 let checks=0;const options={origin:'https://example.com',engineRevision:'a'.repeat(40),queue:{pool:{query:async()=>({rows:[]})},authorize:async(db,tenant)=>{checks++;if(tenant!=='mine')throw new ControlError('not_found');}},auth:{api:{getSession:async()=>({user:{id:'user'}})}}};const request=(path,headers={})=>new Request('https://example.com/api/hosted/tenants/'+path,{headers});
 assert.equal((await createApi(options)(request('mine/discovery'))).status,200);assert.equal(checks,1);assert.equal((await createApi(options)(request('other/discovery'))).status,404);assert.equal(checks,2);
 assert.equal((await createApi(options)(request('mine/discovery',{origin:'https://evil.test'}))).status,403);assert.equal(checks,2);
 assert.equal((await createApi({...options,auth:{api:{getSession:async()=>null}}})(request('mine/discovery'))).status,401);assert.equal(checks,2);
 assert.equal((await createApi(options)(request('mine/discover?q=engineer'))).status,404);
});
