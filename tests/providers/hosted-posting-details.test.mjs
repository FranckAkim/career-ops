import {test} from 'node:test';import assert from 'node:assert/strict';
import lever from '../../providers/lever.mjs';import ashby from '../../providers/ashby.mjs';
test('providers retain source application forms, departments and unlisted state for the hosted gate',async()=>{
 const lj={id:'role',text:'Engineer',hostedUrl:'https://jobs.lever.co/synthetic/role',applyUrl:'https://jobs.lever.co/synthetic/role/apply',categories:{location:'United States',department:'Engineering'}};
 const l=await lever.fetch({name:'Synthetic',careers_url:'https://jobs.lever.co/synthetic'},{fetchJson:async()=>[lj]});
 assert.equal(l[0].applicationLink,lj.applyUrl);assert.equal(l[0].department,'Engineering');
 const aj={id:'role',title:'Engineer',jobUrl:'https://jobs.ashbyhq.com/synthetic/role',applyUrl:'https://jobs.ashbyhq.com/synthetic/role/application',department:'Engineering',isListed:false};
 const a=await ashby.fetch({name:'Synthetic',careers_url:'https://jobs.ashbyhq.com/synthetic'},{fetchJson:async()=>({jobs:[aj]})});
 assert.equal(a[0].applicationLink,aj.applyUrl);assert.equal(a[0].department,'Engineering');assert.equal(a[0].isListed,false);
});
