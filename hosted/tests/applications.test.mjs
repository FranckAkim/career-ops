import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createEngine} from '../engine.mjs';
import {candidate,modelServer,engineRevision} from './fixtures.mjs';
test('canonical status writer updates tracker/ledger, retains source, is replay-safe and makes no model or posting call',async t=>{
 const workspace=await candidate(t),mock=await modelServer(t),engine=createEngine({provider:mock.provider,engineRevision,allowLocalProvider:true});
 const evaluated=await engine.evaluate({workspace,jobId:randomUUID(),postingText:'Example Employer needs a Python engineer.',postingUrl:mock.origin+'/must-not-fetch'});
 const cv=await fs.readFile(path.join(workspace,'cv.md'),'utf8');let row=evaluated.applications[0];assert.equal(row.status,'Evaluated');
 const input={workspace,jobId:randomUUID(),applicationNumber:row.number,targetStatus:'Applied',expectedStatus:row.status,expectedRowHash:row.rowHash};
 const applied=await engine.set_status(input);assert.equal(applied.applicationStatus,'Applied');assert.equal((await engine.set_status(input)).replayed,true);
 row=applied.applications[0];const interviewed=await engine.set_status({...input,jobId:randomUUID(),targetStatus:'Interview',expectedStatus:row.status,expectedRowHash:row.rowHash});
 assert.equal(interviewed.applications[0].status,'Interview');assert.match(await fs.readFile(path.join(workspace,'data/status-log.tsv'),'utf8'),/Interview/);
 assert.equal(await fs.readFile(path.join(workspace,'cv.md'),'utf8'),cv);assert.equal(mock.requests.length,1);assert.deepEqual(mock.unexpected,[]);
 await assert.rejects(engine.set_status({...input,jobId:randomUUID(),targetStatus:'Offer'}),{code:'application_conflict'});
 assert.equal((await engine.sync_applications({workspace,jobId:randomUUID()})).applications[0].status,'Interview');
});
test('status mutations reject unknown states, raw selectors and mismatched row identities',async t=>{
 const workspace=await candidate(t),mock=await modelServer(t),engine=createEngine({provider:mock.provider,engineRevision,allowLocalProvider:true});
 const base={workspace,jobId:randomUUID(),applicationNumber:1,targetStatus:'Applied',expectedStatus:'Evaluated',expectedRowHash:'a'.repeat(64)};
 for(const update of [{targetStatus:'--force'},{applicationNumber:'1;rm'},{expectedRowHash:'bad'}])await assert.rejects(engine.set_status({...base,...update}),{code:'invalid_application_update'});
 assert.equal(mock.requests.length,0);
});
