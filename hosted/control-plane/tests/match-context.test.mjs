import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {postingContext,samePosting,evaluationScore,compareMatches,pipelineStage} from '../match-context.mjs';
import {applicationStates} from '../application-states.mjs';
test('browser and server use the same exact immutable posting context',async()=>{
 assert.equal(await fs.readFile(new URL('../match-context.mjs',import.meta.url),'utf8'),await fs.readFile(new URL('../../../web/src/lib/match-context.mjs',import.meta.url),'utf8'));
 const job={url:'https://example.test/job',company:'Synthetic',title:'Engineer',location:'US',source:'lever-full',description:'Build Python tools.',visaText:'OPT accepted.',descriptionAvailable:true};
 assert.match(postingContext(job),/Additional source policy text:\nOPT accepted\./);assert.equal(samePosting(job,{...job}),true);
 for(const key of ['url','company','title','location','source','description','visaText','descriptionAvailable'])assert.equal(samePosting(job,{...job,[key]:'changed'}),false);
});
test('ranking uses only current successful engine scores, never visa states or invented percentages',()=>{
 assert.equal(evaluationScore('4.1/5'),4.1);for(const value of ['N/A',null,'6','4.2 extra','-1','100%'])assert.equal(evaluationScore(value),null);
 const items=[{id:'stale',match:{status:'succeeded',score:5,stale:true}},{id:'low',match:{status:'succeeded',score:3.2,stale:false}},{id:'pending',match:{status:'queued',score:5}},{id:'best',match:{status:'succeeded',score:4.6,stale:false}}];assert.deepEqual(items.sort(compareMatches).slice(0,2).map(i=>i.id),['best','low']);
 for(const state of applicationStates)assert.ok(['Reviewing','Applied','Interviewing','Offer','Closed'].includes(pipelineStage(state)));assert.equal(pipelineStage('Interview'),'Interviewing');assert.equal(pipelineStage('Evaluated'),'Reviewing');assert.equal(pipelineStage('Offer'),'Offer');
});
