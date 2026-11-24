import test from 'node:test';import assert from 'node:assert/strict';
import {jobWorkflow} from '../job-workflow.mjs';
test('workflow accepts explicit planning metadata without application status writes',()=>{
 assert.equal(jobWorkflow({state:'seen',notes:' Reviewed ',followUpOn:'2026-12-01'}).notes,'Reviewed');
 assert.equal(jobWorkflow({}).state,'new');
});
test('workflow rejects invalid dates, unbounded notes and unauthorized fields',()=>{
 for(const raw of [{status:'Applied'},{deadline:'2026-02-30'},{notes:'x'.repeat(4001)},{state:'applied'},{contact:'x\u0000'}])assert.throws(()=>jobWorkflow(raw),/invalid_request/);
});
