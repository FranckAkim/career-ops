import{test}from'node:test';import assert from'node:assert/strict';import{createApi}from'../http.mjs';
test('data controls are inaccessible before activation',async()=>{
 const api=createApi({queue:{},onboarding:{},auth:{api:{getSession:async()=>({user:{id:'synthetic'}})}},origin:'https://example.test',engineRevision:'a'.repeat(40),dataControlsEnabled:false});
 for(const[path,method]of[['data-controls','GET'],['data-controls/export','GET'],['data-controls/discard-drafts','POST']])assert.equal((await api(new Request(`https://example.test/api/hosted/tenants/synthetic/${path}`,{method,headers:{origin:'https://example.test','content-type':'application/json'},...(method==='POST'?{body:'{}'}:{})}))).status,404);
});
