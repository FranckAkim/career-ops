import {test} from 'node:test';import assert from 'node:assert/strict';
import {scanConfiguration,scanResult,scanSources,runDiscovery,discoverySources} from '../discovery-runner.mjs';
import {discoveryInput} from '../../control-plane/discovery.mjs';
import {parseArgs} from '../../../scan-ats-full.mjs';
test('quality gate removes stale/undated/untrusted results, deduplicates and caps after newest-first sorting',()=>{
 const now=Date.parse('2026-11-22T12:00:00Z'),base={source:'lever-full',company:'Synthetic',title:'Engineer',description:'Build reporting tools for synthetic teams.',sourceCheckedAt:'2026-11-22T11:59:00Z'};
 const offers=Array.from({length:60},(_,i)=>({...base,url:`https://jobs.lever.co/synthetic/role-${i}`,postedAt:i===59?'2026-11-22':'2026-11-16'}));
 const bad=[{...offers[0],url:'https://jobs.lever.co/synthetic/expired-deadline',applicationDeadline:'2026-11-22T10:00:00Z'},{...offers[0],url:'https://jobs.lever.co/synthetic/unlisted',isListed:false},{...offers[0],url:'https://evil.test/synthetic/role'}, {...offers[0],url:'https://jobs.lever.co/synthetic/stale',postedAt:'2026-10-01'}, {...offers[0],url:'https://jobs.lever.co/synthetic/undated',postedAt:null}, {...offers[0],url:'https://jobs.lever.co/synthetic/future',postedAt:'2026-11-23'}, {...offers[0],url:'https://jobs.lever.co/synthetic/old-check',sourceCheckedAt:'2026-11-21T12:00:00Z'}];
 const r=scanResult({offers:[...bad,...offers,{...offers[0],url:offers[0].url+'?utm_source=duplicate'}]},{now,sinceDays:7});
 assert.equal(r.filteredQuality,7);assert.equal(r.jobs.length,50);assert.equal(r.jobs[0].postedAt,'2026-11-22');assert.equal(r.jobs[0].id,offers[59].url);assert.equal(r.displayCapped,true);assert.equal(new Set(r.jobs.map(j=>j.url)).size,50);assert.equal(r.checkedAt,'2026-11-22T12:00:00.000Z');
});
test('built-in scanner arguments/filters are bounded and shell/path input is not accepted',()=>{
 const config=scanConfiguration({q:'project manager,program manager',location:'United States, Chicago',workplace:'hybrid',sinceDays:30,limitPerAts:25});
 assert.match(config.portals,/project manager/);assert.match(config.portals,/Chicago/);assert.ok(config.args.includes('--dry-run'));assert.ok(config.args.includes('--json'));assert.ok(config.args.includes('--include-descriptions'));assert.equal(parseArgs(config.args).includeDescriptions,true);
 assert.equal(parseArgs(['--dry-run','--json']).includeDescriptions,false);
 for(const input of [{q:'',location:'US'},{q:'engineer',codeRoot:'/tmp'},{q:'engineer',limitPerAts:999},{q:'engineer',workplace:'any;rm'},{q:'engineer',sinceDays:365}])assert.throws(()=>discoveryInput(input));
});
test('scanner results retain incomplete coverage and use core work-arrangement matching',()=>{
 const offer={postedAt:new Date().toISOString().slice(0,10),sourceCheckedAt:new Date().toISOString(),company:'Synthetic',title:'Engineer',url:'https://jobs.lever.co/example/one',source:'lever-full',location:'United States',description:'Build Python reporting tools for internal teams.',workplaceType:'remote'};
 const result=scanResult({offers:[offer,offer,{...offer,url:'javascript:bad'}],capHit:true,companiesScanned:25,unreachableBoards:1},{workplace:'remote'});
 assert.equal(result.jobs.length,1);assert.equal(result.jobs[0].descriptionAvailable,true);assert.equal(result.partial,true);
 assert.equal(scanResult({offers:[{...offer,workplaceType:null}]},{workplace:'remote'}).jobs.length,0);
 assert.equal(scanResult(null,{timedOut:true,live:[{...offer,description:undefined}]}).jobs[0].descriptionAvailable,false);
 assert.equal(scanResult({offers:[{...offer,descriptionTruncated:true}]}).jobs[0].descriptionAvailable,false);
});

test('H-1B/OPT gates use full source policy text and keep explicit refusals separate from unknowns',()=>{
 const base={postedAt:new Date().toISOString().slice(0,10),sourceCheckedAt:new Date().toISOString(),company:'Synthetic',title:'Engineer',location:'United States',source:'lever-full',workplaceType:'remote'};
 const offers=[{...base,url:'https://jobs.lever.co/synthetic/h1b',description:'We sponsor H1B visas for qualified software engineers.'},{...base,url:'https://jobs.lever.co/synthetic/opt',description:'OPT candidates are welcome. No visa sponsorship is available.'},{...base,url:'https://jobs.lever.co/synthetic/unknown',description:'Build reporting tools with engineering teams.'},{...base,url:'https://jobs.lever.co/synthetic/metadata',description:'Build reporting tools for internal engineering teams.',visaText:'H-1B sponsorship is available.'}];
 assert.equal(scanResult({offers},{authorization:'h1b'}).jobs.length,2);const opt=scanResult({offers},{authorization:'opt'});assert.equal(opt.jobs.length,1);assert.equal(opt.jobs[0].authorization.h1b.status,'negative');assert.equal(opt.jobs[0].authorization.opt.status,'positive');assert.equal(opt.filteredAuthorization,3);
 assert.equal(scanResult({offers},{authorization:'either'}).jobs.length,3);assert.equal(scanResult({offers},{authorization:'both'}).jobs.length,0);assert.equal(scanResult({offers},{authorization:'h1b',includeUnknown:true}).jobs.length,3);
 const partial=scanResult({offers:[{...offers[0],descriptionTruncated:true}]},{authorization:'h1b'});assert.equal(partial.jobs.length,0);
 assert.throws(()=>discoveryInput({q:'engineer',authorization:'guaranteed'}));assert.throws(()=>discoveryInput({q:'engineer',includeUnknown:'yes'}));
});

import {buildLocationFilter,buildTitleFilter} from '../../../scan.mjs';
import * as yaml from 'js-yaml';
test('country-only US search includes state-qualified US cities without widening city/country requests',()=>{
 const make=location=>buildLocationFilter(yaml.load(scanConfiguration({q:'engineer',location}).portals).location_filter);
 const us=make('United States, USA, U.S., US Remote');
 for(const location of ['Austin, TX','New York, NY','Chicago, Illinois','United States'])assert.equal(us(location),true,location);
 for(const location of ['Toronto, Ontario, Canada','London, United Kingdom','Bengaluru, India'])assert.equal(us(location),false,location);
 assert.equal(make('Chicago')('Austin, TX'),false);assert.equal(make('Canada')('Austin, TX'),false);
 assert.equal(yaml.load(scanConfiguration({q:'engineer',location:'United States, Chicago'}).portals).location_filter.always_allow,undefined);
});
test('all-word role matching reuses core AND rules and leaves literal/advanced matching available',()=>{
 const title=(titleMatch,q='data analyst')=>buildTitleFilter(yaml.load(scanConfiguration({q,location:'United States',titleMatch}).portals).title_filter);
 assert.equal(title('all_words')('Senior Data Reporting Analyst'),true);
 assert.equal(title('all_words')('Data Scientist'),false);
 assert.equal(title('phrase')('Senior Data Reporting Analyst'),false);
 assert.equal(title('all_words','data analyst,software engineer')('Software Backend Engineer'),true);
 assert.equal(title('all_words','word:AI + engineer')('AI Platform Engineer'),true);
 assert.throws(()=>discoveryInput({q:'engineer',titleMatch:'anything'}));
 assert.equal(discoveryInput({q:'engineer'}).titleMatch,'phrase');
});

test('source scheduling overlaps at most two providers and merges globally without losing gates',async()=>{
 let running=0,peak=0;const started=[],gates=new Map();
 const input={q:'engineer',location:'United States'};
 const run=scanSources(input,async({source,timeoutMs})=>{assert.ok(timeoutMs>0&&timeoutMs<=2000);started.push(source);running++;peak=Math.max(peak,running);await new Promise(resolve=>gates.set(source,resolve));running--;
  return {jobs:[{source:'lever-full',company:'Synthetic',title:'Engineer',url:'https://jobs.lever.co/synthetic/'+source,description:'Synthetic engineering role with reporting tools.',descriptionAvailable:source!=='workday',checkedAt:new Date().toISOString(),postedAt:new Date().toISOString().slice(0,10)}],companiesScanned:25,companiesAvailable:100,partial:false,capHit:false};
 },{timeoutMs:2000});
 await new Promise(r=>setImmediate(r));assert.deepEqual(started,['workday','greenhouse']);assert.equal(peak,2);
 gates.get('greenhouse')();await new Promise(r=>setImmediate(r));assert.deepEqual(started,['workday','greenhouse','lever']);gates.get('lever')();await new Promise(r=>setImmediate(r));gates.get('ashby')();gates.get('workday')();
 const result=await run;assert.equal(result.companiesScanned,100);assert.equal(result.jobs.length,4);assert.equal(result.jobs.find(j=>j.url.endsWith('/workday')).descriptionAvailable,false);assert.equal(result.sourceTimings.length,4);assert.equal(peak,2);
});
test('source failure retains other verified results; cancellation drains both active sources',async()=>{
 const result=await scanSources({q:'engineer'},async({source})=>{if(source==='workday')throw Error('synthetic_source_failure');return {jobs:[],partial:false,companiesScanned:1};});assert.equal(result.partial,true);assert.equal(result.companiesScanned,3);
 const abort=new AbortController();let closed=0;const run=scanSources({q:'engineer'},async({signal})=>{await new Promise(resolve=>signal.addEventListener('abort',()=>setTimeout(()=>{closed++;resolve();},5),{once:true}));return{jobs:[]};},{signal:abort.signal});await new Promise(r=>setImmediate(r));abort.abort();await assert.rejects(run,/scan_cancelled/);assert.equal(closed,2);
 const before=new AbortController();before.abort();let called=false;await assert.rejects(scanSources({q:'engineer'},async()=>{called=true;},{signal:before.signal}),/scan_cancelled/);assert.equal(called,false);
});

import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
test('real child contract has fixed providers, isolated scratch, DNS budgets and drained cancellation',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'hosted-speed-fixture-')),codeRoot=path.join(root,'code'),workRoot=path.join(root,'work');await fs.mkdir(codeRoot);await fs.mkdir(workRoot);
 try{
 await fs.writeFile(path.join(codeRoot,'scan-ats-full.mjs'),`const args=process.argv.slice(2),source=args[args.indexOf('--ats')+1];if(!['greenhouse','lever','ashby','workday'].includes(source)||process.env.CAREER_OPS_DNS_LOOKUPS_PER_MIN!=='200'||process.env.DATABASE_URL||!process.env.CAREER_OPS_ROOT.startsWith(${JSON.stringify(workRoot)}))process.exit(2);setTimeout(()=>console.log(JSON.stringify({offers:[],companiesScanned:1,companiesAvailable:1})),150);`);
 const result=await runDiscovery({codeRoot,workRoot,input:{q:'engineer'},timeoutMs:5000});assert.equal(result.companiesScanned,4);assert.equal(result.sourceTimings.length,4);assert.deepEqual(await fs.readdir(workRoot),[]);
 const controller=new AbortController(),pending=runDiscovery({codeRoot,workRoot,input:{q:'engineer'},signal:controller.signal,timeoutMs:5000});setTimeout(()=>controller.abort(),50);await assert.rejects(pending,/scan_cancelled/);assert.deepEqual(await fs.readdir(workRoot),[]);
 }finally{assert.equal(path.dirname(root),os.tmpdir());assert.ok(path.basename(root).startsWith('hosted-speed-fixture-'));await fs.rm(root,{recursive:true,force:true});}
});

test('expanded mode adds three fixed core providers without accepting arbitrary sources',async()=>{
 assert.equal(discoveryInput({q:'engineer'}).coverage,'standard');assert.throws(()=>discoveryInput({q:'engineer',coverage:'all-sites'}));
 assert.deepEqual(discoverySources({coverage:'expanded'}),['workday','greenhouse','lever','ashby','icims','bamboohr','paylocity']);
 const requested=[];const result=await scanSources({q:'engineer',coverage:'expanded'},async({source})=>{requested.push(source);return{jobs:[],companiesScanned:1,partial:false};});assert.equal(result.sourceTimings.length,7);assert.equal(result.companiesScanned,7);assert.equal(new Set(requested).size,7);
 const now=Date.now(),stamp=new Date(now).toISOString(),date=stamp.slice(0,10),offers=[['icims','https://careers-synthetic.icims.com/jobs/123/engineer/job'],['bamboohr','https://synthetic.bamboohr.com/careers/123'],['paylocity','https://recruiting.paylocity.com/Recruiting/Jobs/Details/123']].map(([source,url])=>({source:source+'-full',url,company:'Synthetic',title:'Engineer',location:'United States',postedAt:date,sourceCheckedAt:stamp}));
 const normalized=scanResult({offers},{now});assert.equal(normalized.jobs.length,3);assert.ok(normalized.jobs.every(j=>!j.descriptionAvailable&&j.applicationKind==='posting'));assert.equal(scanResult({offers:offers.map(j=>({...j,postedAt:null}))},{now}).jobs.length,0);
});

test('discovery labels policy by default, and only explicit strict mode excludes jobs',async()=>{
 const base={source:'lever-full',company:'Synthetic',title:'Engineer',location:'United States',postedAt:new Date().toISOString().slice(0,10),checkedAt:new Date().toISOString(),descriptionAvailable:true};
 const jobs=[{...base,url:'https://jobs.lever.co/synthetic/yes',description:'We sponsor H1B visas for software engineers.'},{...base,url:'https://jobs.lever.co/synthetic/no',description:'US citizens only. No visa sponsorship is available.'},{...base,url:'https://jobs.lever.co/synthetic/unknown',description:'Build Python reporting tools with engineering teams.'}];
 const scan=async()=>({jobs,companiesScanned:1,partial:false});
 const labels=await scanSources({q:'engineer',authorization:'h1b'},scan);assert.equal(labels.jobs.length,3);assert.equal(labels.authorizationFilter,'any');assert.equal(labels.filteredAuthorization,0);assert.deepEqual(new Set(labels.jobs.map(j=>j.authorization.h1b.status)),new Set(['positive','negative','unknown']));
 const strict=await scanSources({q:'engineer',authorization:'h1b',strictAuthorization:true},scan);assert.equal(strict.jobs.length,1);assert.equal(strict.authorizationFilter,'h1b');
 const withUnknown=await scanSources({q:'engineer',authorization:'h1b',strictAuthorization:true,includeUnknown:true},scan);assert.equal(withUnknown.jobs.length,2);assert.equal(withUnknown.jobs.some(j=>j.authorization.h1b.status==='negative'),false);
 assert.throws(()=>discoveryInput({q:'engineer',strictAuthorization:'yes'}));assert.equal(discoveryInput({q:'engineer',strictAuthorization:false}).strictAuthorization,false);
});

test('past 24 hours is accepted end-to-end and source time survives fan-in quality gates',async()=>{
 const input={q:'engineer',sinceDays:1};assert.equal(discoveryInput(input).sinceDays,1);assert.equal(parseArgs(['node','scan-ats-full.mjs',...scanConfiguration(input).args]).sinceDays,1);
 const now=Date.now(),timestamp=new Date(now-23*3600000).toISOString(),old=new Date(now-25*3600000).toISOString();
 const offer={source:'lever-full',company:'Synthetic',title:'Engineer',url:'https://jobs.lever.co/synthetic/recent',sourceCheckedAt:new Date(now).toISOString(),postedAt:timestamp.slice(0,10),postedTimestamp:timestamp};
 const filtered=scanResult({offers:[offer,{...offer,url:offer.url+'-old',postedAt:old.slice(0,10),postedTimestamp:old}]},{now,sinceDays:1});assert.equal(filtered.jobs.length,1);assert.equal(filtered.jobs[0].postedTimestamp,timestamp);
 const merged=await scanSources(input,async()=>({...filtered,companiesScanned:1}));assert.equal(merged.jobs.length,1);assert.equal(merged.jobs[0].postedTimestamp,timestamp);
});
