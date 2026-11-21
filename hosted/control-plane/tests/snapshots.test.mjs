import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SnapshotStore, safePath, manifestValid } from '../snapshots.mjs';

test('immutable snapshot round trip, deduplication, tampering and unsafe paths', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hc-snap-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const workspace = path.join(root, 'source'); await fs.mkdir(workspace);
  await fs.writeFile(path.join(workspace, 'cv.md'), '# Synthetic candidate');
  const store = new SnapshotStore(path.join(root, 'store'));
  const saved = await store.capture(workspace);
  assert.equal((await store.capture(workspace)).id, saved.id);
  await store.materialize(saved.id, path.join(root, 'clone'));
  assert.equal(await fs.readFile(path.join(root, 'clone/cv.md'), 'utf8'), '# Synthetic candidate');
  for (const relative of ['../x','/x','a/../../x','a\\x','C:/x','a//b']) assert.throws(() => safePath(root, relative));
  await fs.writeFile(path.join(root, 'store', saved.id, 'files/cv.md'), 'tampered');
  await assert.rejects(store.verify(saved.id), /snapshot_corrupt/);
  await assert.rejects(store.capture(workspace), /snapshot_corrupt/);
  await fs.writeFile(path.join(workspace, '.env'), 'synthetic-secret');
  await assert.rejects(store.capture(workspace), /unsafe_snapshot_entry/);
});

test('snapshot limits and symlinks fail closed', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hc-snap-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'source'));
  await fs.writeFile(path.join(root, 'source/a'), '12345');
  await assert.rejects(new SnapshotStore(path.join(root, 'store'), { maxBytes: 4 }).capture(path.join(root, 'source')), /snapshot_limit/);
  if (process.platform !== 'win32') {
    await fs.symlink('../source', path.join(root, 'source/link'));
    await assert.rejects(new SnapshotStore(path.join(root, 'store')).capture(path.join(root, 'source')), /unsafe_snapshot_entry/);
  }
});


test('generation snapshots preserve old reads and give identical content independent storage identities', async t => {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'hc-generation-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const source=path.join(root,'source');await fs.mkdir(source);await fs.writeFile(path.join(source,'cv.md'),'Synthetic generation candidate');
 const legacy=new SnapshotStore(path.join(root,'store')),modern=new SnapshotStore(path.join(root,'store'),{generationSnapshots:true});
 const old=await legacy.capture(source),first=await modern.capture(source),second=await modern.capture(source);
 assert.equal((await legacy.capture(source)).id,old.id);assert.equal(new Set([old.id,first.id,second.id]).size,3);assert.deepEqual(first.files,second.files);
 assert.equal((await modern.manifest(old.id)).schema,1);assert.equal((await modern.manifest(first.id)).schema,2);assert.notEqual((await modern.manifest(first.id)).generation,(await modern.manifest(second.id)).generation);
 await modern.materialize(second.id,path.join(root,'clone'));assert.equal(await fs.readFile(path.join(root,'clone','cv.md'),'utf8'),'Synthetic generation candidate');
 // Losing or retiring the old generation never changes a new generation's key.
 await fs.rm(path.join(root,'store',first.id),{recursive:true});assert.equal(await modern.read(second.id,'cv.md'),'Synthetic generation candidate');
 const raw=JSON.parse(await fs.readFile(path.join(root,'store',second.id,'manifest.json'),'utf8'));raw.generation='00000000-0000-4000-8000-000000000000';
 await fs.writeFile(path.join(root,'store',second.id,'manifest.json'),JSON.stringify(raw));await assert.rejects(modern.manifest(second.id),/snapshot_corrupt/);
});
test('manifest generations are versioned, server UUIDs and never implicit on legacy manifests',()=>{
 for(const value of [{schema:2,files:[]},{schema:2,generation:'../path',files:[]},{schema:2,generation:['00000000-0000-4000-8000-000000000000'],files:[]},{schema:2,generation:'00000000-0000-1000-8000-000000000000',files:[]},{schema:1,generation:'00000000-0000-4000-8000-000000000000',files:[]},{schema:3,files:[]}])assert.throws(()=>manifestValid(value,10,100),/invalid_snapshot/);
 assert.throws(()=>new SnapshotStore(path.resolve('unused'),{generationSnapshots:'true'}),/invalid_snapshot_configuration/);
});
