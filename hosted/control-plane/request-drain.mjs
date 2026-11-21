import {randomUUID} from 'node:crypto';
import {ControlError} from './queue.mjs';

// Durable markers, not expiring leases. A failed settlement leaves purge blocked.
export class RequestDrain {
 constructor({pool}){this.pool=pool;}
 async begin(userId){
  const id=randomUUID();
  try{await this.pool.query('insert into account_request_activity(id,user_id) values($1,$2)',[id,userId]);}
  catch(error){if(error.code==='P0001'&&error.message==='account_deleting')throw new ControlError('account_deleting');throw error;}
  let settled=false;
  return async()=>{if(settled)return;await this.pool.query("update account_request_activity set state='settled',settled_at=clock_timestamp() where id=$1 and user_id=$2 and state='active'",[id,userId]);settled=true;};
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
