import test from 'node:test';import assert from 'node:assert/strict';
import {savedSearchInput} from '../saved-searches.mjs';
test('saved searches use the existing validated discovery filters and explicit daily opt-in',()=>{
 const saved=savedSearchInput({name:' New graduate roles ',input:{q:'engineer',targeting:{experience:'entry'}},daily:false});assert.equal(saved.name,'New graduate roles');assert.equal(saved.daily,false);assert.equal(saved.input.targeting.experience,'entry');
 for(const raw of [{name:'x',input:{q:'engineer'}},{name:'',input:{q:'engineer'},daily:true},{name:'x',input:{q:'engineer',path:'/tmp'},daily:true},{name:'x',input:{q:'engineer'},daily:true,userId:'forged'}])assert.throws(()=>savedSearchInput(raw),/invalid_request/);
});
