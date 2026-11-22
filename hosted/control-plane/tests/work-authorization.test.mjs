import{test}from'node:test';import assert from'node:assert/strict';
import{classifyWorkAuthorization as classify,matchesWorkAuthorization as matches}from'../work-authorization.mjs';
test('explicit H-1B/OPT wording is independent; mere mentions, E-Verify and questions do not establish support',()=>{
 const cases=[
 ['We sponsor H-1B visas.','positive','unknown'],
 ['H1-B sponsorship is available.','positive','unknown'],
 ['We support H-1B transfers.','positive','unknown'],
 ['OPT candidates are welcome. No visa sponsorship.','negative','positive'],
 ['We accept STEM OPT applicants. We cannot sponsor H1B visas.','negative','positive'],
 ['Candidates on Optional Practical Training may apply.','unknown','positive'],
 ['We do not accept OPT applicants.','unknown','negative'],
 ['We do not support OPT candidates.','unknown','negative'],
 ["We don't accept OPT candidates.",'unknown','negative'],
 ['OPT candidates are not eligible.','unknown','negative'],
 ['H-1B sponsorship is not available.','negative','unknown'],
 ['We sponsor H1B visas. We cannot sponsor H1B visas.','conflicting','unknown'],
 ['US citizenship required.','negative','negative'],
 ['We only hire US citizens.','negative','negative'],
 ['We use E-Verify.','unknown','unknown'],
 ['Must be authorized to work in the US.','unknown','unknown'],
 ['H-1B holders. OPT requirements apply.','unknown','unknown'],
 ['Will we sponsor H1B?','unknown','unknown'],
 ['We allow you to opt for flexible hours.','unknown','unknown'],
 ['We accept opt-in newsletters.','unknown','unknown'],
 ['H-1B1 applicants are welcome.','unknown','unknown'],
 ['We offer visa sponsorship.','unknown','unknown'],
 ];
 for(const[text,h1b,opt]of cases){const value=classify(text);assert.equal(value.h1b.status,h1b,text);assert.equal(value.opt.status,opt,text);}
 const partial=classify('We sponsor H1B visas.',{incomplete:true});assert.equal(partial.h1b.status,'unknown');assert.ok(partial.h1b.evidence.length);
 const value=classify('OPT candidates welcome. No visa sponsorship.');assert.equal(matches(value,'h1b'),false);assert.equal(matches(value,'opt'),true);assert.equal(matches(value,'either'),true);assert.equal(matches(value,'both'),false);assert.equal(matches(value,'both',true),false);
 const unknown=classify('Build reporting tools.');assert.equal(matches(unknown,'h1b'),false);assert.equal(matches(unknown,'h1b',true),true);assert.equal(matches(classify('No H1B sponsorship.'),'h1b',true),false);
 assert.equal(matches(classify('We sponsor H1B visas. OPT candidates welcome.'),'both'),true);
});
