import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {RequestDrain} from '../request-drain.mjs';
import {AccountLifecycle} from '../account-lifecycle.mjs';
import {Queue} from '../queue.mjs';
import {createAuth} from '../auth.mjs';
import {createApi} from '../http.mjs';
export async function verifyRequestDrain({pool,engineRevision}){
 const queue=new Queue(pool,{accountLifecycle:true}),lifecycle=new AccountLifecycle({queue}),drain=new RequestDrain({pool}),userId=randomUUID();
 const auth=createAuth({pool,origin:'http://localhost:3000',secret:'synthetic-request-drain-'.repeat(4),accountLifecycle:true}),ctx=await auth.$context;
 await ctx.adapter.create({model:'user',forceAllowId:true,data:{id:userId,name:'Synthetic Drain',email:`${userId}@example.test`,emailVerified:false,createdAt:new Date(),updatedAt:new Date()}});
 const session=await ctx.internalAdapter.createSession(userId,false,{expiresAt:new Date(Date.now()+600000)},true);
 const api=createApi({queue,auth:{api:{getSession:async()=>({user:{id:userId,name:'Synthetic Drain'}})}},origin:'http://localhost:3000',engineRevision,requestDrainEnabled:true});
 const response=await api(new Request('http://localhost:3000/api/hosted/session'));
 assert.equal((await pool.query("select 1 from account_request_activity where user_id=$1 and state='active'",[userId])).rowCount,1);
 await response.json();assert.equal((await pool.query("select 1 from account_request_activity where user_id=$1 and state='active'",[userId])).rowCount,0);
 const scope=await lifecycle.preview(userId),db=await pool.connect(),id=randomUUID();let blocked;
 try{
  await db.query('begin');await db.query("insert into account_request_activity(id,user_id,started_at) values($1,$2,clock_timestamp()-interval '1 year')",[id,userId]);
  let finished=false;blocked=lifecycle.request({userId,sessionId:session.id,expectedScopeHash:scope.scopeHash,acknowledged:true,confirmation:'DELETE MY ACCOUNT'}).then(result=>{finished=true;return result;});
  await new Promise(r=>setTimeout(r,100));assert.equal(finished,false,'blocking serializes with request admission');await db.query('commit');
 }catch(error){await db.query('rollback');throw error;}finally{db.release();}
 const request=await blocked;await assert.rejects(drain.begin(userId),/account_deleting/);
 assert.equal((await pool.query("select 1 from account_request_activity where id=$1 and state='active'",[id])).rowCount,1,'old marker never expires into deletion authority');
 await pool.query("update account_request_activity set state='settled',settled_at=clock_timestamp() where id=$1",[id]);
 await assert.rejects(pool.query("update account_request_activity set state='active',settled_at=null where id=$1",[id]),/invalid_request_activity/);
 await lifecycle.cancel(request.requestId);await pool.query('delete from account_request_activity where user_id=$1',[userId]);await pool.query('delete from auth_users where id=$1',[userId]);
 console.log('PASS HTTP response tracking, atomic admission/block race, post-block refusal and non-expiring unresolved request markers');
}
