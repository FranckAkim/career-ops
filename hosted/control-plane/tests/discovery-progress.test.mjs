import test from 'node:test';import assert from 'node:assert/strict';import {discoveryProgress} from '../discovery-progress.mjs';import {scanSources} from '../../local-worker/discovery-runner.mjs';
test('progress carries bounded source counters, never filters or posting text',()=>{
 const row={source:'lever',state:'running',elapsedMs:0,matches:0,boardsScanned:0};assert.equal(discoveryProgress({sources:[row]}).sources.length,1);
 for(const value of [{sources:[row,row]},{sources:[{...row,source:'arbitrary'}]},{sources:[{...row,matches:51}]},{sources:[row],postingText:'private'},{sources:[{...row,token:'secret'}]}])assert.throws(()=>discoveryProgress(value),/invalid_progress/);
});
test('scanner publishes actual provider lifecycle without increasing provider concurrency',async()=>{
 const receipts=[];await scanSources({q:'engineer'},async()=>({jobs:[],companiesScanned:1}),{onProgress:value=>receipts.push(discoveryProgress(value))});
 assert.equal(receipts.length,8);assert.ok(receipts.every(receipt=>receipt.sources.filter(source=>source.state==='running').length<=2));assert.ok(receipts.at(-1).sources.every(source=>source.state==='finished'));assert.equal(receipts.at(-1).sources.length,4);
});
