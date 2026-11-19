import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SnapshotStore, safePath } from '../snapshots.mjs';

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
