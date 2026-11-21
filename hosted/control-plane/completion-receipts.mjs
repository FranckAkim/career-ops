import {createHmac,timingSafeEqual} from 'node:crypto';
import {hash,ControlError} from './queue.mjs';
export const completionPrefix='CAREER_REQUEST_RESOURCE_COMPLETE ';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const deployment=/^dpl_[A-Za-z0-9]{20,64}$/;
const project=/^prj_[A-Za-z0-9]{20,64}$/;
const digest=/^[a-f0-9]{64}$/;
const fields=['activityId','completedAt','deploymentId','instanceId','kind','projectId','schema'];
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');
function canonical(p){return JSON.stringify({schema:1,kind:'resource_work_complete',projectId:p.projectId,activityId:p.activityId,deploymentId:p.deploymentId,instanceId:p.instanceId,completedAt:p.completedAt});}
function valid(p){return exact(p,fields)&&p.schema===1&&p.kind==='resource_work_complete'&&project.test(p.projectId)&&uuid.test(p.activityId)&&deployment.test(p.deploymentId)&&uuid.test(p.instanceId)&&typeof p.completedAt==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(p.completedAt)&&Number.isFinite(Date.parse(p.completedAt));}
function key(secret){if(typeof secret!=='string'||secret.length<32)throw new ControlError('receipt_configuration_required');return createHmac('sha256',secret).update('career-workspace/request-resource-completion/v1').digest();}
export function issueCompletionReceipt({secret,...identity}){
 const payload={schema:1,kind:'resource_work_complete',...identity};if(!valid(payload))throw new ControlError('invalid_execution_identity');
 const signature=createHmac('sha256',key(secret)).update(canonical(payload)).digest('hex');
 return completionPrefix+payload.activityId+' '+Buffer.from(JSON.stringify({payload,signature})).toString('base64url');
}
// Log presence is only transport evidence. The MAC and exact app-owned identity
// establish resource completion; this never certifies process termination.
export function completionEvidence({logText,secret,projectId,activity}){
 const signingKey=key(secret);if(typeof logText!=='string'||Buffer.byteLength(logText)>1000000||!project.test(projectId))throw new ControlError('completion_not_verified');
 const proofs=new Map();let count=0;
 for(const match of logText.matchAll(/CAREER_REQUEST_RESOURCE_COMPLETE ([a-f0-9-]{36}) ([A-Za-z0-9_-]{1,2048})/gi)){
  if(++count>1000)throw new ControlError('completion_not_verified');
  try{
   const token=match[2],bytes=Buffer.from(token,'base64url');if(bytes.toString('base64url')!==token)continue;
   const envelope=JSON.parse(bytes.toString('utf8'));if(!exact(envelope,['payload','signature'])||!valid(envelope.payload)||!digest.test(envelope.signature))continue;
   const p=envelope.payload;if(match[1]!==p.activityId)continue;if(p.projectId!==projectId||p.activityId!==activity.id||p.deploymentId!==activity.deployment_id||p.instanceId!==activity.instance_id)continue;
   const expected=createHmac('sha256',signingKey).update(canonical(p)).digest();if(!timingSafeEqual(expected,Buffer.from(envelope.signature,'hex')))continue;
   // Timestamps are informational. Exact random activity identity and the MAC,
   // not comparisons between provider/database clocks, establish provenance.
   const evidenceHash=hash(bytes);proofs.set(evidenceHash,{resourcesDrained:true,activityId:p.activityId,deploymentId:p.deploymentId,instanceId:p.instanceId,evidenceHash});
  }catch{/* Malformed/untrusted log lines never grant resolution authority. */}
 }
 return [...proofs.values()];
}
export function vercelCompletionVerifier({secret,projectId,readLogs}){
 key(secret);if(!project.test(projectId)||typeof readLogs!=='function')throw new ControlError('receipt_configuration_required');
 return async activity=>{
  let logText;try{logText=await readLogs({projectId,deploymentId:activity.deployment_id,activityId:activity.id});}catch{throw new ControlError('completion_not_verified');}
  return completionEvidence({logText,secret,projectId,activity}).find(proof=>proof.evidenceHash===activity.evidenceHash)||null;
 };
}
