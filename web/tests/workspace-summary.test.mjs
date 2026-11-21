import {test} from 'node:test';
import assert from 'node:assert/strict';
import {workspaceSummary} from '../src/lib/workspace-summary.mjs';
test('only published PDFs count as ready and completed tailoring links to its own evaluation',()=>{
 const jobs=[{id:'e1',operation:'evaluate',status:'succeeded',company:'Cedar Labs'}, {id:'e2',operation:'evaluate',status:'succeeded'},
  {id:'t1',operation:'tailor',status:'succeeded',pdf:'cv.pdf',evaluation_job_id:'e1'}, {id:'t2',operation:'tailor',status:'running'},
  {id:'t3',operation:'tailor',status:'failed',pdf:'not-published.pdf'}, {id:'bad',operation:'evaluate',status:'needs_recovery'}];
 const result=workspaceSummary(jobs);assert.equal(result.cvs.length,1);assert.deepEqual(result.awaitingCV.map(j=>j.id),['e2']);assert.equal(result.inProgress.length,1);assert.equal(result.review.length,1);
 assert.equal(result.cvs[0].company,'Cedar Labs');assert.equal(jobs[2].company,undefined);
 assert.deepEqual(workspaceSummary(jobs,'cedar').visible.map(j=>j.id),['e1','t1']);assert.equal(workspaceSummary([]).completed.length,0);
});
