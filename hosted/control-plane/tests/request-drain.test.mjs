import assert from 'node:assert/strict';
import test from 'node:test';
import {RequestDrain} from '../request-drain.mjs';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function fixture(){let active=0,fail=false;const drain=new RequestDrain({pool:{async query(sql){if(sql.startsWith('insert'))active++;else{if(fail)throw Error('synthetic_database_outage');active--;}return {rowCount:1};}}});return {drain,get active(){return active;},set fail(value){fail=value;}};}
test('response completion settles only after the source finishes',async()=>{
 const f=fixture(),gate=deferred();let sent=false;
 const response=await f.drain.run(async register=>{await register('synthetic');return new Response(new ReadableStream({async pull(c){if(!sent){sent=true;c.enqueue(new Uint8Array([1]));}else{await gate.promise;c.close();}}},{highWaterMark:0}));});
 assert.equal(f.active,1);const reader=response.body.getReader();await reader.read();const pending=reader.read();await new Promise(r=>setImmediate(r));assert.equal(f.active,1);gate.resolve();assert.equal((await pending).done,true);assert.equal(f.active,0);
});
test('cancelling a pending read waits for upstream cleanup before settlement',async()=>{
 const f=fixture(),gate=deferred(),started=deferred();
 const response=await f.drain.run(async register=>{await register('synthetic');return new Response(new ReadableStream({pull(){started.resolve();return gate.promise;},async cancel(){await gate.promise;}},{highWaterMark:0}));});
 const reader=response.body.getReader(),reading=reader.read();await started.promise;const cancel=reader.cancel();await new Promise(r=>setImmediate(r));assert.equal(f.active,1);gate.resolve();await cancel;await reading;assert.equal(f.active,0);
});
test('uncertain cancellation or database settlement leaves an unresolved marker',async()=>{
 const f=fixture();const response=await f.drain.run(async register=>{await register('synthetic');return new Response(new ReadableStream({cancel(){throw Error('synthetic_cleanup_failure');}}));});
 await assert.rejects(response.body.cancel(),/synthetic_cleanup_failure/);assert.equal(f.active,1);
 const g=fixture(),result=await g.drain.run(async register=>{await register('synthetic');return new Response('synthetic');});g.fail=true;await assert.rejects(result.text(),/synthetic_database_outage/);assert.equal(g.active,1);
});
test('unauthenticated requests have no marker and handler failures settle',async()=>{
 const f=fixture();await f.drain.run(async()=>new Response(null,{status:401}));assert.equal(f.active,0);
 await assert.rejects(f.drain.run(async register=>{await register('synthetic');throw Error('synthetic_handler_failure');}),/synthetic_handler_failure/);assert.equal(f.active,0);
});

test('execution identity is server-provided, paired and validated',()=>{
 assert.throws(()=>new RequestDrain({pool:{},deploymentId:'dpl_SyntheticRequestReview123456'}),/invalid_execution_identity/);
 assert.throws(()=>new RequestDrain({pool:{},deploymentId:'caller-path',instanceId:'foreign'}),/invalid_execution_identity/);
});
