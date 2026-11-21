import {test} from 'node:test';
import assert from 'node:assert/strict';
import {snapshotEnvironment,snapshotPolicy} from '../snapshot-policy.mjs';
test('generation uploads default off and require explicit inventory-backed activation',()=>{
 assert.deepEqual(snapshotEnvironment({}),{generationSnapshots:false});assert.deepEqual(snapshotEnvironment({HOSTED_GENERATION_SNAPSHOTS_ENABLED:'0'}),{generationSnapshots:false});
 assert.throws(()=>snapshotEnvironment({HOSTED_GENERATION_SNAPSHOTS_ENABLED:'1'}),/snapshot_inventory_required/);
 assert.deepEqual(snapshotEnvironment({HOSTED_GENERATION_SNAPSHOTS_ENABLED:'1',HOSTED_SNAPSHOT_INVENTORY_ENABLED:'1'}),{generationSnapshots:true});
 for(const flag of ['true','yes','',1])assert.throws(()=>snapshotEnvironment({HOSTED_GENERATION_SNAPSHOTS_ENABLED:flag,HOSTED_SNAPSHOT_INVENTORY_ENABLED:'1'}),/invalid_snapshot_configuration/);
 assert.throws(()=>snapshotPolicy({generationSnapshots:'true',snapshotInventory:true}),/invalid_snapshot_configuration/);
});
