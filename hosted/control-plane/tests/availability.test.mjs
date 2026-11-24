import test from 'node:test';import assert from 'node:assert/strict';
import {availabilityInput,availabilityResult} from '../availability.mjs';
import {runAvailability} from '../../local-worker/availability-runner.mjs';
test('availability accepts only a source-owned exact ATS role, never Handshake or an arbitrary URL',()=>{
 assert.equal(availabilityInput({kind:'availability',source:'lever-full',url:'https://jobs.lever.co/synthetic/one'}).source,'lever-full');
 for(const raw of [{kind:'availability',source:'handshake-import',url:'https://app.joinhandshake.com/stu/jobs/123'},{kind:'availability',source:'lever-full',url:'https://jobs.lever.co.evil.test/a/b'},{kind:'availability',source:'lever-full',url:'https://jobs.lever.co/a/b',command:'run'},{kind:'availability',source:'lever-full',url:'https://jobs.lever.co/a/b?redirect=x'}])assert.throws(()=>availabilityInput(raw));
 assert.equal(availabilityResult(null).state,'unknown');assert.equal(availabilityResult({result:'uncertain',code:'blocked'}).state,'unknown');
});
test('real core API rung preserves authoritative removal versus inconclusive transport',async()=>{
 const previous=globalThis.fetch;let requests=0;
 try{globalThis.fetch=async url=>{requests++;assert.match(String(url),/^https:\/\/(?:boards-api.greenhouse.io|api.lever.co)\//);return new Response('',{status:404});};
 const greenhouse=await runAvailability({input:{kind:'availability',source:'greenhouse-full',url:'https://job-boards.greenhouse.io/synthetic/jobs/123'}});assert.equal(greenhouse.availability.state,'expired');
 const lever=await runAvailability({input:{kind:'availability',source:'lever-full',url:'https://jobs.lever.co/synthetic/one'}});assert.equal(lever.availability.state,'unknown');assert.equal(requests,2);
 globalThis.fetch=async()=>{throw Error('synthetic timeout');};const timeout=await runAvailability({input:{kind:'availability',source:'greenhouse-full',url:'https://job-boards.greenhouse.io/synthetic/jobs/123'}});assert.equal(timeout.availability.state,'unknown');
 }finally{globalThis.fetch=previous;}
});
