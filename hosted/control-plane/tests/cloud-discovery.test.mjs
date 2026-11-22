import {test} from 'node:test';import assert from 'node:assert/strict';import {discoveryMessage} from '../cloud-discovery.mjs';
test('search notifications accept only an opaque run ID, never filters or commands',()=>{
 const discoveryId='00000000-0000-4000-8000-000000000001';assert.equal(discoveryMessage({discoveryId}),discoveryId);
 for(const value of [null,[],{}, {discoveryId:'bad'}, {discoveryId,tenantId:'other'}, {discoveryId,command:'node'}, {discoveryId,input:{q:'engineer'}}])assert.throws(()=>discoveryMessage(value));
});
