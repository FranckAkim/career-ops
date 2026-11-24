import test from 'node:test';
import assert from 'node:assert/strict';
import {targetingInput,targetingDecision} from '../search-targeting.mjs';
test('missing targeting evidence remains visible',()=>{
 assert.equal(targetingDecision({title:'Engineer'},{experience:'entry',employmentType:'internship',minimumSalary:120000}),null);
 assert.equal(targetingDecision({salary:{currency:'EUR',period:'year',max:30000}},{minimumSalary:120000}),null);
});
test('explicit source evidence and exclusions produce distinct reasons',()=>{
 assert.equal(targetingDecision({title:'Senior Engineer'},{experience:'entry'}),'experience');
 assert.equal(targetingDecision({employmentType:'contract'},{employmentType:'full_time'}),'employment_type');
 assert.equal(targetingDecision({company:' Example Inc '},{excludedEmployers:['EXAMPLE INC']}),'excluded_employer');
 assert.equal(targetingDecision({description:'Requires clearance'},{negativeKeywords:['clearance']}),'negative_keyword');
 assert.equal(targetingDecision({salary:{currency:'USD',period:'year',max:50000}},{minimumSalary:60000}),'salary');
});
test('targeting rejects arbitrary fields, unbounded input and coercion',()=>{
 for(const raw of [{path:'/tmp'},{minimumSalary:'20'},{negativeKeywords:['']},{excludedEmployers:Array(21).fill('x')}])assert.throws(()=>targetingInput(raw));
});

test('discovery input validates and preserves normalized targeting',async()=>{
 const {discoveryInput}=await import('../discovery.mjs');
 assert.equal(discoveryInput({q:'Engineer',targeting:{excludedEmployers:[' Example ']}}).targeting.excludedEmployers[0],'example');
 assert.throws(()=>discoveryInput({q:'Engineer',targeting:{experience:'invented'}}),/invalid_request/);
 assert.equal(Object.hasOwn(discoveryInput({q:'Engineer'}),'targeting'),false);
});
