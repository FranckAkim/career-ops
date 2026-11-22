import {randomUUID} from 'node:crypto';
import {ControlError} from './queue.mjs';
export function discoveryInput(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>!['q','location','workplace','sinceDays','limitPerAts','authorization','includeUnknown'].includes(k)))throw new ControlError('invalid_request');
 const {q='',location='United States',workplace='any',sinceDays=14,limitPerAts=50,authorization='any',includeUnknown=false}=raw;
 if(typeof q!=='string'||!q.split(',').some(x=>x.trim())||q.length>120||typeof location!=='string'||!location.split(',').some(x=>x.trim())||location.length>120||/[\x00-\x1f]/.test(q+location)||!['any','remote','hybrid','onsite'].includes(workplace)||![7,14,30].includes(sinceDays)||![25,50,100].includes(limitPerAts)||!['any','h1b','opt','either','both'].includes(authorization)||typeof includeUnknown!=='boolean')throw new ControlError('invalid_request');
 return {q:q.trim(),location:location.trim(),workplace,sinceDays,limitPerAts,authorization,includeUnknown};
}
export class Discovery{
 constructor(queue){this.queue=queue;}
 async start({tenantId,userId,input}){input=discoveryInput(input);return this.queue.transaction(async db=>{
  await db.query('select id from tenants where id=$1 for update',[tenantId]);await this.queue.authorize(db,tenantId,userId);
  await db.query('delete from discovery_runs where tenant_id=$1 and expires_at<clock_timestamp()',[tenantId]);
  const active=(await db.query("select id,state,input from discovery_runs where tenant_id=$1 and user_id=$2 and state in ('queued','running') order by created_at desc limit 1",[tenantId,userId])).rows[0];
  if(active){if(JSON.stringify(discoveryInput(active.input))===JSON.stringify(input))return {id:active.id,state:active.state};throw new ControlError('discovery_busy');}
  const count=Number((await db.query("select count(*) as count from discovery_runs where tenant_id=$1 and created_at>clock_timestamp()-interval '1 hour'",[tenantId])).rows[0].count);if(count>=10)throw new ControlError('search_rate_limited');
  const id=randomUUID();await db.query('insert into discovery_runs(id,tenant_id,user_id,input) values($1,$2,$3,$4)',[id,tenantId,userId,input]);return {id,state:'queued'};
 });}
 async read({tenantId,userId,id}){if(!/^[a-f0-9-]{36}$/i.test(id||''))throw new ControlError('invalid_request');return this.queue.transaction(async db=>{await this.queue.authorize(db,tenantId,userId);const row=(await db.query('select id,state,result,error_code,created_at,expires_at from discovery_runs where id=$1 and tenant_id=$2 and user_id=$3 and expires_at>clock_timestamp()',[id,tenantId,userId])).rows[0];if(!row)throw new ControlError('not_found');return row;});}
 async cancel({tenantId,userId,id}){if(!/^[a-f0-9-]{36}$/i.test(id||''))throw new ControlError('invalid_request');return this.queue.transaction(async db=>{await this.queue.authorize(db,tenantId,userId);const row=(await db.query("update discovery_runs set state='cancelled',result=null where id=$1 and tenant_id=$2 and user_id=$3 and state in ('queued','running') returning id,state",[id,tenantId,userId])).rows[0];if(!row)throw new ControlError('not_found');return row;});}
 async latest({tenantId,userId}){await this.queue.authorize(this.queue.pool,tenantId,userId);return (await this.queue.pool.query('select id,state,input from discovery_runs where tenant_id=$1 and user_id=$2 and expires_at>clock_timestamp() order by created_at desc limit 1',[tenantId,userId])).rows[0]||null;}
}
