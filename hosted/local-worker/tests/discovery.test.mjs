import {test} from 'node:test';import assert from 'node:assert/strict';
import {scanConfiguration,scanResult} from '../discovery-runner.mjs';
import {discoveryInput} from '../../control-plane/discovery.mjs';
import {parseArgs} from '../../../scan-ats-full.mjs';
test('built-in scanner arguments/filters are bounded and shell/path input is not accepted',()=>{
 const config=scanConfiguration({q:'project manager,program manager',location:'United States, Chicago',workplace:'hybrid',sinceDays:30,limitPerAts:25});
 assert.match(config.portals,/project manager/);assert.match(config.portals,/Chicago/);assert.ok(config.args.includes('--dry-run'));assert.ok(config.args.includes('--json'));assert.ok(config.args.includes('--include-descriptions'));assert.equal(parseArgs(config.args).includeDescriptions,true);
 assert.equal(parseArgs(['--dry-run','--json']).includeDescriptions,false);
 for(const input of [{q:'',location:'US'},{q:'engineer',codeRoot:'/tmp'},{q:'engineer',limitPerAts:999},{q:'engineer',workplace:'any;rm'},{q:'engineer',sinceDays:365}])assert.throws(()=>discoveryInput(input));
});
test('scanner results retain incomplete coverage and use core work-arrangement matching',()=>{
 const offer={company:'Synthetic',title:'Engineer',url:'https://jobs.lever.co/example/one',source:'lever-full',location:'United States',description:'Build Python reporting tools for internal teams.',workplaceType:'remote'};
 const result=scanResult({offers:[offer,offer,{...offer,url:'javascript:bad'}],capHit:true,companiesScanned:25,unreachableBoards:1},{workplace:'remote'});
 assert.equal(result.jobs.length,1);assert.equal(result.jobs[0].descriptionAvailable,true);assert.equal(result.partial,true);
 assert.equal(scanResult({offers:[{...offer,workplaceType:null}]},{workplace:'remote'}).jobs.length,0);
 assert.equal(scanResult(null,{timedOut:true,live:[{...offer,description:undefined}]}).jobs[0].descriptionAvailable,false);
 assert.equal(scanResult({offers:[{...offer,descriptionTruncated:true}]}).jobs[0].descriptionAvailable,false);
});

test('H-1B/OPT gates use full source policy text and keep explicit refusals separate from unknowns',()=>{
 const base={company:'Synthetic',title:'Engineer',location:'United States',source:'lever-full',workplaceType:'remote'};
 const offers=[{...base,url:'https://example.test/h1b',description:'We sponsor H1B visas for qualified software engineers.'},{...base,url:'https://example.test/opt',description:'OPT candidates are welcome. No visa sponsorship is available.'},{...base,url:'https://example.test/unknown',description:'Build reporting tools with engineering teams.'},{...base,url:'https://example.test/metadata',description:'Build reporting tools for internal engineering teams.',visaText:'H-1B sponsorship is available.'}];
 assert.equal(scanResult({offers},{authorization:'h1b'}).jobs.length,2);const opt=scanResult({offers},{authorization:'opt'});assert.equal(opt.jobs.length,1);assert.equal(opt.jobs[0].authorization.h1b.status,'negative');assert.equal(opt.jobs[0].authorization.opt.status,'positive');assert.equal(opt.filteredAuthorization,3);
 assert.equal(scanResult({offers},{authorization:'either'}).jobs.length,3);assert.equal(scanResult({offers},{authorization:'both'}).jobs.length,0);assert.equal(scanResult({offers},{authorization:'h1b',includeUnknown:true}).jobs.length,3);
 const partial=scanResult({offers:[{...offers[0],descriptionTruncated:true}]},{authorization:'h1b'});assert.equal(partial.jobs.length,0);
 assert.throws(()=>discoveryInput({q:'engineer',authorization:'guaranteed'}));assert.throws(()=>discoveryInput({q:'engineer',includeUnknown:'yes'}));
});
