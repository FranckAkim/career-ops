import{test}from'node:test';import assert from'node:assert/strict';import{revisionRunner}from'../runners.mjs';
test('rolling deployment runs only explicitly reviewed revision/image pairs',()=>{
 const seen=[],run=revisionRunner({old:'sha256:old',next:'sha256:next'},image=>context=>{seen.push([image,context.engineRevision]);return image;});
 assert.equal(run({engineRevision:'old'}),'sha256:old');assert.equal(run({engineRevision:'next'}),'sha256:next');assert.throws(()=>run({engineRevision:'unreviewed'}),/engine_revision_mismatch/);assert.equal(seen.length,2);
});
