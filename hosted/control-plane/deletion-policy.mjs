import {ControlError} from './queue.mjs';
export function deletionRequestPolicy(env){
 const flag=env.HOSTED_DELETION_REQUESTS_ENABLED;
 if(flag!==undefined&&!['0','1'].includes(flag))throw new ControlError('invalid_deletion_configuration');
 if(flag!=='1')return false;
 if(['HOSTED_ACCOUNT_LIFECYCLE_ENABLED','HOSTED_REQUEST_DRAIN_ENABLED','HOSTED_SNAPSHOT_INVENTORY_ENABLED','HOSTED_GENERATION_SNAPSHOTS_ENABLED'].some(k=>env[k]!=='1'))throw new ControlError('deletion_prerequisites_required');
 return true;
}
