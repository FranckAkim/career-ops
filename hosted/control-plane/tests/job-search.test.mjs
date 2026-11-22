import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JobSearch,normalizeJobs,postingText,searchInput} from '../job-search.mjs';
import {createApi} from '../http.mjs';
import {ControlError} from '../queue.mjs';
const now=1800000000000;
const job={guid:'https://himalayas.app/companies/example/jobs/engineer',applicationLink:'https://himalayas.app/companies/example/jobs/engineer?utm_source=api',title:'Engineer',companyName:'Example',description:'<p>Build useful reporting tools with Python &amp; SQL.</p>',expiryDate:now/1000+3600,locationRestrictions:['United States']};
test('search validates filters and limits; provider data is bounded, deduplicated and expired/unsafe links refused',()=>{
 assert.deepEqual(searchInput(new URLSearchParams('q=engineer')), {q:'engineer',country:'US',page:1,seniority:''});
 for(const query of ['page=0','page=51','country=XX','q=a&q=b','url=https://localhost','seniority=unknown'])assert.throws(()=>searchInput(new URLSearchParams(query)));
 assert.equal(postingText('<script>bad()</script><p>A &amp; B &#x1f600;</p>'),'A & B 😀');
 const jobs=normalizeJobs({jobs:[job,job,{...job,guid:'javascript:alert(1)'},{...job,guid:job.guid+'2',expiryDate:1},{...job,guid:job.guid+'3',applicationLink:'https://evil.test/'}]},now);
 assert.equal(jobs.length,1);assert.equal(jobs[0].applicationLink,job.applicationLink);assert.equal(jobs[0].description,'Build useful reporting tools with Python & SQL.');
});
test('provider calls fixed host with search only, coalesces/cache expires and sanitizes failures',async()=>{
 let calls=0,time=now;const service=new JobSearch({now:()=>time,fetcher:async(url,options)=>{calls++;assert.equal(url.origin,'https://himalayas.app');assert.equal(url.searchParams.get('q'),'engineer');assert.equal(url.searchParams.get('country'),'US');assert.equal(options.redirect,'error');assert.equal(options.headers.cookie,undefined);return Response.json({jobs:[job]});}});
 const params=new URLSearchParams('q=engineer');const [a,b]=await Promise.all([service.search(params),service.search(params)]);assert.equal(a.jobs.length,1);assert.deepEqual(a,b);await service.search(params);assert.equal(calls,1);time+=600001;await service.search(params);assert.equal(calls,2);
 const limited=new JobSearch({fetcher:async()=>new Response('',{status:429})});await assert.rejects(()=>limited.search(params),e=>e.code==='search_rate_limited');
 const broken=new JobSearch({fetcher:async()=>{throw new Error('secret provider internals');}});await assert.rejects(()=>broken.search(params),e=>e.code==='search_unavailable'&&!e.message.includes('secret'));
 const huge=new JobSearch({fetcher:async()=>new Response('x'.repeat(3000001),{headers:{'content-type':'application/json'}})});await assert.rejects(()=>huge.search(params),e=>e.code==='search_unavailable');
});
test('discovery requires signed-in authorized tenant and same origin before contacting provider',async()=>{
 let calls=0;const options={origin:'https://example.com',engineRevision:'a'.repeat(40),queue:{pool:{},authorize:async(db,tenant,user)=>{if(tenant!=='mine'||user!=='user')throw new ControlError('not_found');}},auth:{api:{getSession:async()=>({user:{id:'user'}})}},jobSearch:{search:async()=>{calls++;return{jobs:[]};}}};
 const request=(tenant='mine',headers={})=>new Request(`https://example.com/api/hosted/tenants/${tenant}/discover?q=engineer`,{headers});
 assert.equal((await createApi(options)(request())).status,200);assert.equal(calls,1);
 assert.equal((await createApi(options)(request('foreign'))).status,404);assert.equal(calls,1);
 assert.equal((await createApi(options)(request('mine',{origin:'https://evil.test'}))).status,403);assert.equal(calls,1);
 assert.equal((await createApi({...options,auth:{api:{getSession:async()=>null}}})(request())).status,401);assert.equal(calls,1);
});
