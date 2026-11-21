import{test}from'node:test';import assert from'node:assert/strict';import{workerErrorCode}from'../worker-errors.mjs';
test('both supervisors share fixed failure categories without returning arbitrary model text',()=>{
 assert.equal(workerErrorCode({ok:false,error:'cv_facts_failed'}),'cv_facts_failed');
 for(const reply of [undefined,{ok:false,error:'private response secret'},{ok:true,error:'cv_facts_failed'},{ok:false,error:{code:'cv_facts_failed'}}])assert.equal(workerErrorCode(reply),'worker_failed');
});
