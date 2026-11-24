import {randomUUID} from 'node:crypto';
import {ControlError} from './queue.mjs';
import {discoveryInput} from './discovery.mjs';
const check=(value,code='invalid_request')=>{if(!value)throw new ControlError(code);};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function savedSearchInput(raw){
 check(raw&&typeof raw==='object'&&!Array.isArray(raw)&&Object.keys(raw).every(k=>['name','input','daily'].includes(k)));
 check(typeof raw.name==='string'&&raw.name.trim().length>0&&raw.name.length<=80&&!/[\x00-\x1f]/.test(raw.name)&&typeof raw.daily==='boolean');
 return {name:raw.name.trim(),input:discoveryInput(raw.input),daily:raw.daily};
}
export class SavedSearches{
 constructor(queue){this.queue=queue;}
 async lock(db,{tenantId,userId}){await db.query('select id from tenants where id=$1 for update',[tenantId]);await this.queue.authorize(db,tenantId,userId);}
 async list(actor){return this.queue.transaction(async db=>{await this.queue.authorize(db,actor.tenantId,actor.userId);return (await db.query('select s.*,r.state as run_state,r.expires_at as run_expires_at from saved_searches s left join discovery_runs r on r.id=s.last_run_id and r.tenant_id=s.tenant_id and r.user_id=s.user_id where s.tenant_id=$1 and s.user_id=$2 order by s.created_at,s.id limit 6',[actor.tenantId,actor.userId])).rows;});}
 async create({tenantId,userId,...raw}){const input=savedSearchInput(raw);return this.queue.transaction(async db=>{await this.lock(db,{tenantId,userId});check(Number((await db.query('select count(*)::int as count from saved_searches where tenant_id=$1 and user_id=$2',[tenantId,userId])).rows[0].count)<5,'saved_search_limit');return(await db.query('insert into saved_searches(id,tenant_id,user_id,name,input,daily) values($1,$2,$3,$4,$5,$6) returning *',[randomUUID(),tenantId,userId,input.name,input.input,input.daily])).rows[0];});}
 async mutate({tenantId,userId,id,expectedRevision,action,daily}){
 check(uuid.test(id||'')&&Number.isSafeInteger(expectedRevision)&&expectedRevision>0&&['daily','read','remove','run'].includes(action));if(action==='daily')check(typeof daily==='boolean');
 return this.queue.transaction(async db=>{await this.lock(db,{tenantId,userId});const saved=(await db.query('select * from saved_searches where id=$1 and tenant_id=$2 and user_id=$3 for update',[id,tenantId,userId])).rows[0];check(saved,'not_found');check(saved.revision===expectedRevision,'saved_search_conflict');
  if(action==='remove'){await db.query('delete from saved_searches where id=$1',[id]);return {removed:true};}
  if(action==='run'){
   const active=(await db.query("select id,state,input from discovery_runs where tenant_id=$1 and user_id=$2 and state in ('queued','running') order by created_at desc limit 1",[tenantId,userId])).rows[0];
   if(active){check(active.id===saved.last_run_id,'discovery_busy');return active;}
   check(Number((await db.query("select count(*)::int as count from discovery_runs where tenant_id=$1 and created_at>clock_timestamp()-interval '1 hour'",[tenantId])).rows[0].count)<10,'search_rate_limited');
   const runId=randomUUID();await db.query('insert into discovery_runs(id,tenant_id,user_id,input) values($1,$2,$3,$4)',[runId,tenantId,userId,discoveryInput(saved.input)]);
   await db.query("update saved_searches set last_run_id=$2,next_due=((date_trunc('day',clock_timestamp() at time zone 'UTC')+interval '1 day 6 hours') at time zone 'UTC') where id=$1",[id,runId]);return {id:runId,state:'queued',input:saved.input};
  }
  return (await db.query(action==='daily'?'update saved_searches set daily=$2 where id=$1 returning *':'update saved_searches set unread=false where id=$1 returning *',action==='daily'?[id,daily]:[id])).rows[0];
 });}
}
