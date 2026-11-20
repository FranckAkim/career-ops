import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createEngine} from '../engine.mjs';
import {candidate,modelServer,engineRevision,browserExecutable} from './fixtures.mjs';

const payload = name => ({lang:'en',candidate:{name},experience:[{company:'Example Labs',role:'Software Engineer',location:'Remote',dates:'2022–2025',bullets:['Built internal reporting tools with Python.','Led a team of 4 engineers.']}]});
test('structured content uses the real renderer and preserves two-tenant PDF isolation', async t => {
  const mock=await modelServer(t,r=>JSON.stringify(payload(JSON.stringify(r.messages).includes('Synthetic Beta')?'Synthetic Beta':'Synthetic Alpha')));
  const engine=createEngine({provider:mock.provider,engineRevision,browserExecutable,allowLocalProvider:true,tailoringFormat:'json'});
  const hashes=[];
  for(const name of ['Synthetic Alpha','Synthetic Beta']){
    const workspace=await candidate(t,name);
    const evaluated=await engine.evaluate({workspace,jobId:randomUUID(),postingText:'Example Employer seeks a Python engineer.'});
    const result=await engine.tailor({workspace,jobId:randomUUID(),evaluationJobId:evaluated.jobId});
    assert.equal(result.pages,1);hashes.push(result.pdfSha256);
    const html=await fs.readFile(path.join(workspace,result.html),'utf8');
    assert.ok(html.includes(name));assert.ok(!html.includes(name==='Synthetic Alpha'?'Synthetic Beta':'Synthetic Alpha'));
    assert.equal((await fs.readFile(path.join(workspace,result.pdf))).subarray(0,5).toString(),'%PDF-');
  }
  assert.notEqual(hashes[0],hashes[1]);
  const requests=mock.requests.filter(r=>!r.stream);
  assert.equal(requests.length,2);
  assert.ok(requests.every(r=>JSON.stringify(r.messages).includes('OUTPUT CONTRACT: CV JSON')));
});
test('structured path still blocks invented facts, missing source sections and model asset paths', async t=>{
  for(const [kind,mutate,code] of [
    ['fabricated metric',p=>p.experience[0].bullets[1]='Led a team of 40 engineers.','cv_facts_failed'],
    ['missing experience',p=>p.experience=[],'cv_render_failed'],
    ['model photo path',p=>p.candidate.photo='/etc/passwd','tailoring_failed'],
    ['locked rewrite',p=>p.experience[0].bullets[1]='Managed a team of 4 engineers.','cv_render_failed'],
  ])await t.test(kind,async st=>{
    const workspace=await candidate(st),value=payload('Synthetic Alpha');mutate(value);
    if(kind==='locked rewrite') await fs.writeFile(path.join(workspace,'config/profile.yml'),'name: Synthetic Alpha\ncv:\n  locked_sections: [experience]\n');
    const mock=await modelServer(st,JSON.stringify(value));
    const engine=createEngine({provider:mock.provider,engineRevision,browserExecutable,allowLocalProvider:true,tailoringFormat:'json'});
    const evaluated=await engine.evaluate({workspace,jobId:randomUUID(),postingText:'Example Employer needs Python.'});
    const jobId=randomUUID();await assert.rejects(engine.tailor({workspace,jobId,evaluationJobId:evaluated.jobId}),{code});
    await assert.rejects(fs.access(path.join(workspace,'output','hosted',jobId,'cv.pdf')));
  });
});
