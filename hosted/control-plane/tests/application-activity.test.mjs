import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {activityEvent,activitySummary} from '../application-activity.mjs';
const event=()=>({id:randomUUID(),kind:'submitted',occurredOn:'2026-11-24',acknowledged:true});
test('activity requires actual-event confirmation and strict dates, kinds and bounded content',()=>{
 const opts={now:Date.parse('2026-11-24T12:00:00Z')};assert.equal(activityEvent(event(),opts).provenance,'user_confirmed');
 for(const raw of [{...event(),acknowledged:false},{...event(),kind:'auto_verified'},{...event(),occurredOn:'2026-02-30'},{...event(),occurredOn:'2026-11-25'},{...event(),notes:'x'.repeat(2001)},{...event(),status:'Applied'}])assert.throws(()=>activityEvent(raw,opts),/invalid_request/);
});
test('evidence is bounded, signature checked, download-only and omitted from summaries',()=>{
 const raw={...event(),evidence:{name:'receipt.txt',mime:'text/plain',data:Buffer.from('Synthetic receipt').toString('base64')}};
 const saved=activityEvent(raw);assert.equal(saved.evidence.bytes,17);assert.equal(activitySummary([saved])[0].evidence.data,undefined);
 for(const evidence of [{...raw.evidence,name:'../secret.txt'},{...raw.evidence,mime:'image/png'},{...raw.evidence,mime:'text/html'},{...raw.evidence,data:'a'.repeat(682669)},{...raw.evidence,data:Buffer.from([0,255]).toString('base64')}])assert.throws(()=>activityEvent({...raw,evidence}));
});
