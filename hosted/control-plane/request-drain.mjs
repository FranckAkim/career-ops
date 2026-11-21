import {issueAdmissionReceipt} from './admission-receipts.mjs';
import {issueCompletionReceipt} from './completion-receipts.mjs';
import {randomUUID} from 'node:crypto';
import {ControlError} from './queue.mjs';

// Durable markers, not expiring leases. A failed settlement leaves purge blocked.
export class RequestDrain {
 constructor({pool,deploymentId=null,instanceId=null,completion=null}){
  if((deploymentId===null)!==(instanceId===null)||(deploymentId!==null&&(!/^dpl_[A-Za-z0-9]{20,64}$/.test(deploymentId)||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(instanceId))))throw new ControlError('invalid_execution_identity');
  this.completion=completion;this.pool=pool;this.deploymentId=deploymentId;this.instanceId=instanceId;
 }
 async begin(userId){
  const id=randomUUID();
  try{await this.pool.query('insert into account_request_activity(id,user_id,deployment_id,instance_id) values($1,$2,$3,$4)',[id,userId,this.deploymentId,this.instanceId]);}
  catch(error){if(error.code==='P0001'&&error.message==='account_deleting')throw new ControlError('account_deleting');throw error;}
  if(this.completion&&this.deploymentId){try{await this.completion.report(issueAdmissionReceipt({secret:this.completion.secret,projectId:this.completion.projectId,activityId:id,deploymentId:this.deploymentId,instanceId:this.instanceId,admittedAt:new Date().toISOString()}));}catch{/* Missing admission evidence never permits cleanup. */}}
  let settled=false,reported=false;
  return async()=>{if(settled)return;
   if(!reported&&this.completion&&this.deploymentId){reported=true;try{await this.completion.report(issueCompletionReceipt({secret:this.completion.secret,projectId:this.completion.projectId,activityId:id,deploymentId:this.deploymentId,instanceId:this.instanceId,completedAt:new Date().toISOString()}));}catch{/* Missing evidence leaves a failed settlement unresolved. */}}
   await this.pool.query("update account_request_activity set state='settled',settled_at=clock_timestamp() where id=$1 and user_id=$2 and state='active'",[id,userId]);settled=true;};
 }
 async run(handle){
  let settle;
  const register=async userId=>{if(settle)throw new Error('request_already_registered');settle=await this.begin(userId);};
  let response;
  try{response=await handle(register);}catch(error){await settle?.();throw error;}
  if(!settle)return response;
  if(!response.body){await settle();return response;}
  const reader=response.body.getReader();let cancelled=false;
  const body=new ReadableStream({
   async pull(controller){
    try{const chunk=await reader.read();if(cancelled)return;if(chunk.done){await settle();controller.close();}else controller.enqueue(chunk.value);}
    catch(error){if(cancelled)return;try{await reader.cancel();await settle();}catch{/* Keep the marker if cleanup is uncertain. */}controller.error(error);}
   },
   async cancel(reason){cancelled=true;await reader.cancel(reason);await settle();}
  },{highWaterMark:0});
  return new Response(body,{status:response.status,statusText:response.statusText,headers:response.headers});
 }
}
