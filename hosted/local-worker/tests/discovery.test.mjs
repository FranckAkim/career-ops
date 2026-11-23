import {test} from 'node:test';import assert from 'node:assert/strict';
import {scanConfiguration,scanResult} from '../discovery-runner.mjs';
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
