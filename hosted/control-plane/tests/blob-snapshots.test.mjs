import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { BlobSnapshotStore } from '../blob-snapshots.mjs';

function fakeBlob() {
  const objects = new Map(), calls = [];
  const transport = {
    async get(key, options) { calls.push({ key, ...options }); const data = objects.get(key); return data ? { statusCode: 200, stream: new Response(data).body } : null; },
    async put(key, data, options) {
      calls.push({ key, ...options });
      assert.equal(options.allowOverwrite, false); assert.equal(options.addRandomSuffix, false);
      if (objects.has(key)) throw new Error('already exists');
      objects.set(key, Buffer.from(data)); return { pathname: key };
    },
  };
  return { objects, calls, transport };
}
test('private Blob contract: immutable round trip, dedupe, binary files and integrity', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hc-blob-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.join(root, 'source'); await fs.mkdir(source);
  await fs.writeFile(path.join(source, 'cv.md'), '# Synthetic candidate');
  const binary = Buffer.from([0,1,128,255]); await fs.writeFile(path.join(source, 'cv.pdf'), binary);
  const fake = fakeBlob();
  const store = new BlobSnapshotStore({ token: 'synthetic-token', transport: fake.transport });
  const saved = await store.capture(source);
  assert.equal((await store.capture(source)).id, saved.id);
  assert.equal(await store.read(saved.id, 'cv.md'), '# Synthetic candidate');
  assert.deepEqual(await store.readBytes(saved.id, 'cv.pdf'), binary);
  await assert.rejects(store.readBytes(saved.id, 'cv.pdf', { maxBytes: 3 }), /artifact_limit/);
  await store.materialize(saved.id, path.join(root, 'clone'));
  assert.deepEqual(await fs.readFile(path.join(root, 'clone/cv.pdf')), binary);
  assert.ok(fake.calls.every(call => call.access === 'private'));
  assert.ok([...fake.objects.keys()].every(key => !key.includes('cv.md')));
  const file = saved.files.find(file => file.path === 'cv.md');
  fake.objects.set(store.key(saved.id, `files/${file.sha256}`), Buffer.from('tampered'));
  await assert.rejects(store.verify(saved.id), /snapshot_corrupt/);
  await assert.rejects(store.manifest('../outside'), /invalid_snapshot/);
});
test('failed Blob publication leaves no manifest; credentials are required', async t => {
  assert.throws(() => new BlobSnapshotStore(), /storage_configuration_required/);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hc-blob-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, 'cv.md'), 'Synthetic');
  const fake = fakeBlob(), original = fake.transport.put;
  fake.transport.put = (key, data, options) => key.endsWith('/manifest.json') ? Promise.reject(new Error('outage')) : original(key, data, options);
  await assert.rejects(new BlobSnapshotStore({ storeId: 'synthetic-store', transport: fake.transport }).capture(root), /snapshot_missing/);
  assert.ok([...fake.objects.keys()].every(key => !key.endsWith('/manifest.json')));
});


test('Blob generation snapshots isolate identical content and remain readable through default readers',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'hc-blob-generations-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));await fs.writeFile(path.join(root,'cv.md'),'Synthetic identical content');
 const fake=fakeBlob(),legacy=new BlobSnapshotStore({storeId:'synthetic-store',transport:fake.transport}),modern=new BlobSnapshotStore({storeId:'synthetic-store',transport:fake.transport,generationSnapshots:true});
 const old=await legacy.capture(root),a=await modern.capture(root),b=await modern.capture(root);assert.equal(new Set([old.id,a.id,b.id]).size,3);assert.deepEqual(a.files,b.files);
 assert.equal((await modern.manifest(old.id)).schema,1);assert.equal((await legacy.manifest(a.id)).schema,2);
 for(const key of fake.objects.keys())if(key.startsWith(`career-workspaces/v1/${a.id}/`))fake.objects.set(key,Buffer.from('synthetic retained fence'));
 await assert.rejects(modern.read(a.id,'cv.md'),/snapshot_corrupt/);assert.equal(await modern.read(b.id,'cv.md'),'Synthetic identical content');assert.equal(await modern.read(old.id,'cv.md'),'Synthetic identical content');
 const c=await modern.capture(root);assert.notEqual(c.id,a.id);assert.equal(await modern.read(c.id,'cv.md'),'Synthetic identical content');
});
