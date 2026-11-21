import {ControlError} from './queue.mjs';
export function snapshotPolicy({generationSnapshots=false,snapshotInventory=false}={}){
 if(typeof generationSnapshots!=='boolean'||typeof snapshotInventory!=='boolean')throw new ControlError('invalid_snapshot_configuration');
 if(generationSnapshots&&!snapshotInventory)throw new ControlError('snapshot_inventory_required');
 return {generationSnapshots};
}
export function snapshotEnvironment(env){
 const flag=env.HOSTED_GENERATION_SNAPSHOTS_ENABLED;
 if(flag!==undefined&&!['0','1'].includes(flag))throw new ControlError('invalid_snapshot_configuration');
 return snapshotPolicy({generationSnapshots:flag==='1',snapshotInventory:env.HOSTED_SNAPSHOT_INVENTORY_ENABLED==='1'});
}
