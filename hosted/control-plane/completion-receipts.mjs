import {ControlError} from './queue.mjs';
import {requestReceiptCodec} from './receipt-codec.mjs';
const codec=requestReceiptCodec('resource_work_complete');
export const completionPrefix=codec.prefix;
export function issueCompletionReceipt(input){try{return codec.issue(input);}catch(error){throw new ControlError(error.code==='receipt_configuration_required'?error.code:'invalid_execution_identity');}}
export function completionEvidence(input){
 try{return codec.read(input).map(({payload:p,evidenceHash})=>({resourcesDrained:true,activityId:p.activityId,deploymentId:p.deploymentId,instanceId:p.instanceId,evidenceHash}));}
 catch(error){throw new ControlError(error.code==='receipt_configuration_required'?error.code:'completion_not_verified');}
}
export function vercelCompletionVerifier({secret,projectId,readLogs}){
 try{codec.validateSecret(secret);}catch{throw new ControlError('receipt_configuration_required');}if(!/^prj_[A-Za-z0-9]{20,64}$/.test(projectId)||typeof readLogs!=='function')throw new ControlError('receipt_configuration_required');
 return async activity=>{
  let logText;try{logText=await readLogs({projectId,deploymentId:activity.deployment_id,activityId:activity.id});}catch{throw new ControlError('completion_not_verified');}
  return completionEvidence({logText,secret,projectId,activity}).find(proof=>proof.evidenceHash===activity.evidenceHash)||null;
 };
}
