import {randomUUID} from 'node:crypto';
export async function discoveryOnce({pool,runner,signal}){
 // Expired running searches fail instead of repeating external scans silently.
 await pool.query("delete from discovery_runs where expires_at<clock_timestamp()");
 await pool.query("update discovery_runs set state='failed',error_code='scanner_interrupted',result=null where state='running' and lease_until<clock_timestamp()");
 const claim=randomUUID();
 const db=await pool.connect();let job;
 try{await db.query('begin');job=(await db.query("select * from discovery_runs r where state='queued' and expires_at>clock_timestamp() and not exists(select 1 from account_tombstones a where a.user_id=r.user_id and a.active) and not exists(select 1 from workspace_tombstones w where w.tenant_id=r.tenant_id and w.active) order by created_at for update skip locked limit 1")).rows[0];if(job)await db.query("update discovery_runs set state='running',claim=$2,lease_until=clock_timestamp()+interval '30 seconds' where id=$1",[job.id,claim]);await db.query('commit');}catch(e){await db.query('rollback');throw e;}finally{db.release();}
 if(!job)return null;
 const abort=new AbortController(),onAbort=()=>abort.abort();signal?.addEventListener('abort',onAbort,{once:true});if(signal?.aborted)abort.abort();
 let pulse=Promise.resolve(),heartbeat;
 const beat=()=>{pulse=pulse.then(async()=>{if(abort.signal.aborted)return;try{const row=await pool.query("update discovery_runs set lease_until=clock_timestamp()+interval '30 seconds' where id=$1 and claim=$2 and state='running' and lease_until>clock_timestamp() returning id",[job.id,claim]);if(!row.rowCount)abort.abort();}catch{abort.abort();}});};
 heartbeat=setInterval(beat,5000);
 try{const result=await runner({input:job.input,signal:abort.signal});clearInterval(heartbeat);await pulse;
  if(abort.signal.aborted)throw new Error('scan_cancelled');
  const done=await pool.query("update discovery_runs set state='succeeded',result=$3 where id=$1 and claim=$2 and state='running' and lease_until>clock_timestamp() returning id",[job.id,claim,result]);return {id:job.id,state:done.rowCount?'succeeded':'cancelled'};
 }catch{await pool.query("update discovery_runs set state='failed',error_code='scanner_unavailable',result=null where id=$1 and claim=$2 and state='running'",[job.id,claim]);return{id:job.id,state:'failed'};}
 finally{clearInterval(heartbeat);await pulse;signal?.removeEventListener('abort',onAbort);}
}
