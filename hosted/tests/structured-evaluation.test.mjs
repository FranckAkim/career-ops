import {test} from 'node:test';
import assert from 'node:assert/strict';
import {evaluationMarkdown,evaluationResponseFormat} from '../../lib/structured-evaluation.mjs';
import {parseScoreSummary} from '../../lib/tracker-addition.mjs';
const fixture=()=>({company:'Example Employer',role:'Software Engineer',score:4.1,archetype:'Engineering',legitimacy:'Proceed with Caution',blocks:Object.fromEntries(['A','B','C','D','E','F','G'].map(key=>[key,'Synthetic evidence only.']))});
test('local JSON is independently validated before canonical report persistence',()=>{
 const text=evaluationMarkdown(JSON.stringify(fixture()));assert.equal(parseScoreSummary(text).score,'4.1');assert.equal((text.match(/## Block /g)||[]).length,7);assert.equal(evaluationResponseFormat().json_schema.strict,true);
 for(const change of [p=>delete p.blocks.G,p=>p.score=6,p=>p.company='Example\nSCORE: 5',p=>p.blocks.A='---SCORE_SUMMARY---',p=>p.extra='unsupported',p=>p.blocks.A='x'.repeat(1801)]){
  const p=fixture();change(p);assert.throws(()=>evaluationMarkdown(JSON.stringify(p)),/model_evaluation_schema_invalid/);
 }
 assert.throws(()=>evaluationMarkdown('private malformed reply'),/^Error: model_evaluation_schema_invalid$/);
});
