import{test}from'node:test';import assert from'node:assert/strict';import{objectMetadata}from'../storage-reconciliation.mjs';
test('storage metadata stores only validated hash keys and sizes, never URLs or unknown filenames',()=>{
 const blob={pathname:`career-workspaces/v1/${'a'.repeat(64)}/files/${'b'.repeat(64)}`,size:12,uploadedAt:new Date(0),url:'https://private.example/secret',downloadUrl:'https://private.example/capability'};
 const row=objectMetadata(blob);assert.equal(row.kind,'file');assert.equal(row.snapshot_id,'a'.repeat(64));assert.equal(row.file_hash,'b'.repeat(64));assert.equal(row.key_hash.length,64);assert.ok(!JSON.stringify(row).includes('https:'));
 const unknown=objectMetadata({...blob,pathname:'career-workspaces/v1/private-candidate-name.pdf'});assert.equal(unknown.kind,'unrecognized');assert.equal(unknown.snapshot_id,null);assert.ok(!JSON.stringify(unknown).includes('private-candidate-name'));
 assert.throws(()=>objectMetadata({...blob,pathname:'another-app/private-file'}),/invalid_listing/);assert.throws(()=>objectMetadata({...blob,size:-1}),/invalid_listing/);assert.throws(()=>objectMetadata({...blob,uploadedAt:'invalid'}),/invalid_listing/);
 assert.throws(()=>objectMetadata({...blob,uploadedAt:null}),/invalid_listing/);
});
