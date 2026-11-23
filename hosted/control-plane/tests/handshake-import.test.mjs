import {test} from 'node:test';import assert from 'node:assert/strict';
import {handshakeInput} from '../handshake-import.mjs';import {handshakeUrl} from '../posting-details.mjs';import {savedPosting} from '../saved-jobs.mjs';
const input={url:'https://app.joinhandshake.com/jobs/123?ref=shared',title:'Synthetic Engineer',company:'Synthetic Employer',location:'United States',description:'Build Python reporting tools. OPT candidates are welcome. No visa sponsorship.',acknowledged:true};
test('Handshake imports are canonical user-reviewed snapshots with no live date claim',()=>{
 const raw=handshakeInput(input),posting=savedPosting(raw);assert.equal(posting.url,'https://app.joinhandshake.com/stu/jobs/123');assert.equal(posting.applicationLink,posting.url);assert.equal(posting.provenance,'user_import');assert.equal(posting.checkedAt,null);assert.equal(posting.postedAt,null);assert.ok(posting.importedAt);assert.equal(posting.authorization.h1b.status,'negative');assert.equal(posting.authorization.opt.status,'positive');assert.equal(posting.description,input.description);
 assert.equal(handshakeUrl('https://app.joinhandshake.com/stu/jobs/123/'),'https://app.joinhandshake.com/stu/jobs/123');
});
test('only explicit reviewed job content and exact Handshake job links can be imported',()=>{
 for(const url of ['http://app.joinhandshake.com/jobs/123','https://app.joinhandshake.com.evil.test/jobs/123','https://user@app.joinhandshake.com/jobs/123','https://app.joinhandshake.com/jobs','https://app.joinhandshake.com/stu/jobs/123/apply','https://app.joinhandshake.com/stu/jobs/%31%32%33','https://app.joinhandshake.com/jobs/123%2f456','https://localhost/jobs/123'])assert.throws(()=>handshakeInput({...input,url}),/invalid_request/);
 for(const patch of [{acknowledged:false},{description:'short'},{description:'x'.repeat(30001)},{title:''},{company:''},{source:'lever-full'},{score:5},{postedAt:'2026-11-23'}])assert.throws(()=>handshakeInput({...input,...patch}),/invalid_request/);
});

import {createApi} from '../http.mjs';import {ControlError} from '../queue.mjs';
test('Handshake HTTP import keeps auth/origin/tenant checks and refuses forged source fields',async()=>{
 const db={query:async(sql,params)=>({rows:sql.includes('count(*)')?[{count:0}]:sql.startsWith('insert into saved_jobs')?[{id:params[0],posting:params[4],revision:1}]:[]})};
 const queue={transaction:fn=>fn(db),authorize:async(_db,tenant)=>{if(tenant!=='mine')throw new ControlError('not_found');}};
 const options={queue,engineRevision:'a'.repeat(40),origin:'https://example.test',auth:{api:{getSession:async()=>({user:{id:'synthetic'}})}}};
 const request=(tenant,raw=input,origin='https://example.test')=>new Request(`https://example.test/api/hosted/tenants/${tenant}/saved-jobs/import-handshake`,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(raw)});
 const api=createApi(options);assert.equal((await api(request('mine'))).status,201);assert.equal((await api(request('other'))).status,404);assert.equal((await api(request('mine',{...input,score:5}))).status,400);assert.equal((await api(request('mine',input,'https://evil.test'))).status,403);assert.equal((await createApi({...options,auth:{api:{getSession:async()=>null}}})(request('mine'))).status,401);
});
