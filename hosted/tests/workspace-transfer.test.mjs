import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { exportWorkspace, importWorkspace, validateTransfer, verifySourceRetention } from '../workspace-transfer.mjs';

test('binary transfer isolates generations and retains confirmed sources', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hosted-transfer-'));
  try {
    const a = path.join(root, 'a'), b = path.join(root, 'b');
    await fs.mkdir(a); await fs.writeFile(path.join(a, 'cv.md'), 'Synthetic candidate');
    await fs.writeFile(path.join(a, 'output.pdf'), Buffer.from([0, 255, 10, 13]));
    const before = await exportWorkspace(a);
    await importWorkspace(b, before);
    assert.deepEqual(await exportWorkspace(b), before);
    await assert.rejects(importWorkspace(b, before), { code: 'EEXIST' });
    await fs.writeFile(path.join(b, 'report.md'), 'Synthetic report');
    verifySourceRetention(before, await exportWorkspace(b));
    await fs.writeFile(path.join(b, 'cv.md'), 'Unapproved change');
    assert.throws(() => verifySourceRetention(before, { ...before, files: [] }), { code: 'source_changed' });
    assert.throws(() => verifySourceRetention(before, validateTransfer(before), { maxBytes: 1 }), { code: 'transfer_limit' });
    const changed = await exportWorkspace(b);
    assert.throws(() => verifySourceRetention(before, changed), { code: 'source_changed' });
    await assert.rejects(exportWorkspace(a, { maxFiles: 1 }), { code: 'transfer_limit' });
    const corrupt = structuredClone(before); corrupt.files[0].sha256 = '0'.repeat(64);
    assert.throws(() => validateTransfer(corrupt), { code: 'transfer_corrupt' });
    for (const name of ['../escape', 'C:/escape', 'a\\escape', '.env', 'A/NUL.txt', 'a/../b', 'cv.md.']) {
      const bad = structuredClone(before); bad.files[0].path = name;
      assert.throws(() => validateTransfer(bad), { code: 'unsafe_transfer_path' });
    }
    const duplicate = structuredClone(before); duplicate.files.push({ ...duplicate.files[0], path: duplicate.files[0].path.toUpperCase() });
    assert.throws(() => validateTransfer(duplicate), { code: 'invalid_transfer' });
    await fs.link(path.join(a, 'cv.md'), path.join(a, 'linked.md'));
    await assert.rejects(exportWorkspace(a), { code: 'unsafe_transfer_entry' });
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('export rejects workspace symlinks', { skip: process.platform === 'win32' }, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hosted-transfer-'));
  try {
    await fs.symlink(os.tmpdir(), path.join(root, 'outside'));
    await assert.rejects(exportWorkspace(root), { code: 'unsafe_transfer_entry' });
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
