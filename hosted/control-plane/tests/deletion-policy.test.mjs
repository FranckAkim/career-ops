import {test} from 'node:test';import assert from 'node:assert/strict';import {deletionRequestPolicy} from '../deletion-policy.mjs';
test('public deletion defaults off and requires all verified safety gates',()=>{
 assert.equal(deletionRequestPolicy({}),false);assert.equal(deletionRequestPolicy({HOSTED_DELETION_REQUESTS_ENABLED:'0'}),false);assert.throws(()=>deletionRequestPolicy({HOSTED_DELETION_REQUESTS_ENABLED:'true'}),/invalid_deletion_configuration/);
 const env={HOSTED_DELETION_REQUESTS_ENABLED:'1',HOSTED_ACCOUNT_LIFECYCLE_ENABLED:'1',HOSTED_REQUEST_DRAIN_ENABLED:'1',HOSTED_SNAPSHOT_INVENTORY_ENABLED:'1',HOSTED_GENERATION_SNAPSHOTS_ENABLED:'1'};assert.equal(deletionRequestPolicy(env),true);for(const k of Object.keys(env).filter(k=>k!=='HOSTED_DELETION_REQUESTS_ENABLED'))assert.throws(()=>deletionRequestPolicy({...env,[k]:'0'}),/deletion_prerequisites_required/);
});
