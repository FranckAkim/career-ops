import {discoveryProgress} from './discovery-progress.mjs';
import {availabilityInput} from './availability.mjs';
import {randomUUID} from 'node:crypto';
import {discoveryInput} from './discovery.mjs';
export function discoveryMessage(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==1||!(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value.discoveryId||'')))throw Error('invalid_discovery_notification');
 return value.discoveryId;
}
export async function cloudDiscovery({pool,discoveryId,runner,signal,heartbeatMs=5000}){
 discoveryMessage({discoveryId});const claim=randomUUID();
 const input=(await pool.query('select hosted_discovery_claim($1,$2) as input',[discoveryId,claim])).rows[0].input;
 if(!input)return {claimed:false};
 const abort=new AbortController(),onAbort=()=>abort.abort();signal?.addEventListener('abort',onAbort,{once:true});if(signal?.aborted)abort.abort();
 let progress=Promise.resolve();const onProgress=value=>{const receipt=discoveryProgress(value);progress=progress.then(async()=>{if(abort.signal.aborted)return;try{if(!(await pool.query('select hosted_discovery_progress($1,$2,$3) as active',[discoveryId,claim,receipt])).rows[0].active)abort.abort();}catch{/* Heartbeat owns transport/lease loss; progress is best effort. */}});};
 let pulse=Promise.resolve();const timer=setInterval(()=>{pulse=pulse.then(async()=>{if(abort.signal.aborted)return;try{if(!(await pool.query('select hosted_discovery_heartbeat($1,$2) as active',[discoveryId,claim])).rows[0].active)abort.abort();}catch{abort.abort();}});},heartbeatMs);
 try{
  const result=await runner({input:input.kind==='availability'?availabilityInput(input):discoveryInput(input),signal:abort.signal,onProgress});await progress;clearInterval(timer);await pulse;
  if(abort.signal.aborted)throw Error('scan_cancelled');
  const published=(await pool.query('select hosted_discovery_finish($1,$2,$3,false) as published',[discoveryId,claim,{...result,execution:'cloud'}])).rows[0].published;
  return {claimed:true,published};
 }catch{
  await pool.query('select hosted_discovery_finish($1,$2,null,true)',[discoveryId,claim]);return {claimed:true,published:false};
 }finally{clearInterval(timer);await pulse;await progress;signal?.removeEventListener('abort',onAbort);}
}
