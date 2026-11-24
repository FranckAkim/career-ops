import {isDeepStrictEqual} from 'node:util';
import {ControlError} from './queue.mjs';
export const activityKinds=['submitted','acknowledgment','recruiter_response','interview','rejected','offer','withdrawn'];
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const check=(value,code='invalid_request')=>{if(!value)throw new ControlError(code);};
function object(value,keys){check(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>keys.includes(key)));}
export function activityEvent(raw,{now=Date.now()}={}){
 object(raw,['id','kind','occurredOn','notes','contact','evidence','acknowledged']);
 check(uuid.test(raw.id||'')&&activityKinds.includes(raw.kind)&&raw.acknowledged===true);
 check(typeof raw.occurredOn==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(raw.occurredOn));
 const day=Date.parse(raw.occurredOn);check(Number.isFinite(day)&&new Date(day).toISOString().slice(0,10)===raw.occurredOn&&raw.occurredOn<=new Date(now).toISOString().slice(0,10));
 for(const[key,max]of [['notes',2000],['contact',300]])check(raw[key]===undefined||(typeof raw[key]==='string'&&raw[key].length<=max&&!/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(raw[key])));
 let evidence=null;
 if(raw.evidence!==undefined&&raw.evidence!==null){
  object(raw.evidence,['name','mime','data']);const{name,mime,data}=raw.evidence;
  check(typeof name==='string'&&name.length>0&&name.length<=120&&!/[\x00-\x1f\x7f/\\]/.test(name));
  check(['text/plain','message/rfc822','image/png','image/jpeg','application/pdf'].includes(mime));
  check(typeof data==='string'&&data.length>0&&data.length<=682668&&/^[A-Za-z0-9+/]*={0,2}$/.test(data),'input_limit');
  const bytes=Buffer.from(data,'base64');check(bytes.length>0&&bytes.length<=512000&&bytes.toString('base64')===data,'input_limit');
  if(mime==='image/png')check(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])));
  if(mime==='image/jpeg')check(bytes[0]===255&&bytes[1]===216&&bytes[2]===255);
  if(mime==='application/pdf')check(bytes.subarray(0,5).toString()==='%PDF-');
  if(['text/plain','message/rfc822'].includes(mime))check(!bytes.includes(0)&&Buffer.from(bytes.toString('utf8')).equals(bytes));
  evidence={name,mime,data,bytes:bytes.length};
 }
 return {id:raw.id,kind:raw.kind,occurredOn:raw.occurredOn,notes:(raw.notes||'').trim(),contact:(raw.contact||'').trim(),evidence,provenance:'user_confirmed',recordedAt:new Date(now).toISOString()};
}
export function activitySummary(events=[]){return events.map(({evidence,...event})=>({...event,evidence:evidence?{name:evidence.name,mime:evidence.mime,bytes:evidence.bytes}:null}));}
export class ApplicationActivity{
 constructor(queue){this.queue=queue;}
 async lock(db,{tenantId,userId,id}){
  check(uuid.test(id||''));await db.query('select id from tenants where id=$1 for update',[tenantId]);await this.queue.authorize(db,tenantId,userId);
  const row=(await db.query('select activity,revision from saved_jobs where id=$1 and tenant_id=$2 and user_id=$3 for update',[id,tenantId,userId])).rows[0];check(row,'not_found');return row;
 }
 async add({tenantId,userId,id,expectedRevision,event}){
  check(Number.isSafeInteger(expectedRevision)&&expectedRevision>0);event=activityEvent(event);
  return this.queue.transaction(async db=>{
   const row=await this.lock(db,{tenantId,userId,id});
   // A repeated browser request must not create two submission records.
   const prior=row.activity.find(item=>item.id===event.id);
   if(prior){const comparable=({recordedAt,...value})=>value;check(isDeepStrictEqual(comparable(prior),comparable(event)),'activity_conflict');return {revision:row.revision,activity:activitySummary(row.activity)};}
   check(row.revision===expectedRevision,'saved_job_conflict');check(row.activity.length<20,'activity_limit');
   const activity=[...row.activity,event];check(Buffer.byteLength(JSON.stringify(activity))<=900000,'activity_limit');
   const other=Number((await db.query('select coalesce(sum(octet_length(activity::text)),0)::int as bytes from saved_jobs where tenant_id=$1 and user_id=$2 and id<>$3',[tenantId,userId,id])).rows[0].bytes);
   check(other+Buffer.byteLength(JSON.stringify(activity))<=2000000,'activity_limit');
   const result=(await db.query('update saved_jobs set activity=$5 where id=$1 and tenant_id=$2 and user_id=$3 and revision=$4 returning revision',[id,tenantId,userId,expectedRevision,JSON.stringify(activity)])).rows[0];check(result,'saved_job_conflict');return {...result,activity:activitySummary(activity)};
  });
 }
 async remove({tenantId,userId,id,expectedRevision,eventId,acknowledged}){
  check(uuid.test(eventId||'')&&Number.isSafeInteger(expectedRevision)&&expectedRevision>0&&acknowledged===true);
  return this.queue.transaction(async db=>{const row=await this.lock(db,{tenantId,userId,id});check(row.revision===expectedRevision,'saved_job_conflict');check(row.activity.some(item=>item.id===eventId),'not_found');const activity=row.activity.filter(item=>item.id!==eventId);
   const result=(await db.query('update saved_jobs set activity=$5 where id=$1 and tenant_id=$2 and user_id=$3 and revision=$4 returning revision',[id,tenantId,userId,expectedRevision,JSON.stringify(activity)])).rows[0];check(result,'saved_job_conflict');return {...result,activity:activitySummary(activity)};
  });
 }
 async download({tenantId,userId,id,eventId}){
  check(uuid.test(id||'')&&uuid.test(eventId||''));return this.queue.transaction(async db=>{await this.queue.authorize(db,tenantId,userId);
   const row=(await db.query('select activity from saved_jobs where id=$1 and tenant_id=$2 and user_id=$3',[id,tenantId,userId])).rows[0];const evidence=row?.activity.find(item=>item.id===eventId)?.evidence;check(evidence,'not_found');
   const bytes=Buffer.from(evidence.data,'base64'),filename=evidence.name.replace(/[^a-zA-Z0-9._ -]/g,'_');
   return new Response(bytes,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="${filename}"`,'Content-Length':String(bytes.length),'Cache-Control':'private, no-store',Vary:'Cookie','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'Referrer-Policy':'no-referrer'}});
  });
 }
}
