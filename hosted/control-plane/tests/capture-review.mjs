import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {CaptureReview} from '../capture-review.mjs';
export async function verifyCaptureReview({pool,queue,requestId,userId,purger}){
 const snapshot=randomBytes(32).toString('hex'),file=randomBytes(32).toString('hex'),captureId=randomUUID();
 await pool.query('insert into snapshot_objects(id,file_hashes,file_count,total_bytes) values($1,$2,1,3)',[snapshot,[file]]);
 await pool.query("insert into snapshot_captures(id,user_id,kind,snapshot_id,state,lease_until,finished_at,error_code) values($1,$2,'onboarding',$3,'failed',clock_timestamp(),clock_timestamp(),'capture_failed')",[captureId,userId,snapshot]);
 const calls=[],store={async objectPresent(id,key){calls.push([id,key]);return null;}},review=new CaptureReview({queue,store});
 const result=await review.inspect(requestId);assert.deepEqual(calls,[[snapshot,file],[snapshot,null]]);assert.equal(result.observations[0].missing,2);assert.equal(result.purgeAuthorized,false);assert.equal(result.uploadSettlementVerified,false);
 await assert.rejects(purger.prepare(requestId),/capture_failure_review_required/);
 let changed=false;const racing=new CaptureReview({queue,store:{async objectPresent(){if(!changed){changed=true;await pool.query("update snapshot_captures set error_code='capture_interrupted' where id=$1",[captureId]);}return null;}}});await assert.rejects(racing.inspect(requestId),/review_conflict/);
 assert.equal((await pool.query('select state from snapshot_captures where id=$1',[captureId])).rows[0].state,'failed');
 // Disposable PostgreSQL fixture only; no provider upload was ever issued.
 await pool.query('delete from snapshot_captures where id=$1',[captureId]);await pool.query('delete from snapshot_objects where id=$1',[snapshot]);
 console.log('PASS failed-capture exact-key inspection, stale-scope rejection and unchanged purge barrier in disposable PostgreSQL');
}
