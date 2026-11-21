import {test} from 'node:test';
import assert from 'node:assert/strict';
import {executionPolicy} from '../src/lib/hosted-policy.mjs';
test('local mode requires explicit setup and admission, and never wakes cloud inference',()=>{
  const env={VERCEL:'1',HOSTED_EXECUTION_MODE:'local',HOSTED_JOBS_ENABLED:'1',HOSTED_WORKER_URL:'https://example.vercel.app',HOSTED_DISPATCH_SECRET:'s'.repeat(32)};
  assert.equal(executionPolicy(env).jobsEnabled,false);
  assert.deepEqual(executionPolicy({...env,HOSTED_LOCAL_WORKER_CONFIGURED:'1'}),{mode:'local',jobsEnabled:true,notifyCloud:false});
  assert.equal(executionPolicy({...env,HOSTED_LOCAL_WORKER_CONFIGURED:'1',HOSTED_JOBS_ENABLED:'0'}).jobsEnabled,false);
});
test('cloud requires dispatch credentials and unknown execution modes fail closed',()=>{
  assert.equal(executionPolicy({VERCEL:'1',HOSTED_JOBS_ENABLED:'1'}).jobsEnabled,false);
  assert.deepEqual(executionPolicy({HOSTED_EXECUTION_MODE:'typo',HOSTED_JOBS_ENABLED:'1'}),{mode:'unavailable',jobsEnabled:false,notifyCloud:false});
});
