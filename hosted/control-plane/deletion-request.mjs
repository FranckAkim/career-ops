import {ControlError} from './queue.mjs';
const allowed=new Set(['reauthentication_required','shared_workspace_review_required','scope_review_required','review_conflict','not_found','account_deleting']);
export class DeletionRequest {
 constructor({queue}){this.queue=queue;}
 async call(name,{userId,sessionId,tenantId,scopeHash}){
  try{const {rows}=await this.queue.pool.query(name==='preview'?'select hosted_preview_deletion($1,$2,$3) as result':'select hosted_request_deletion($1,$2,$3,$4) as result',name==='preview'?[userId,sessionId,tenantId]:[userId,sessionId,tenantId,scopeHash]);return rows[0].result;}catch(e){throw new ControlError(allowed.has(e.message)?e.message:'service_unavailable');}
 }
 async preview(input){await this.queue.authorize(this.queue.pool,input.tenantId,input.userId,true);return this.call('preview',input);}
 async request(input){if(input.acknowledged!==true||input.confirmation!=='DELETE MY ACCOUNT'||!/^[a-f0-9]{64}$/.test(input.scopeHash||''))throw new ControlError('confirmation_required');await this.queue.authorize(this.queue.pool,input.tenantId,input.userId,true);return this.call('request',input);}
}
