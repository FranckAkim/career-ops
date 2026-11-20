import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { sandboxRunner } from '../runner.mjs';
import { exportWorkspace } from '../../workspace-transfer.mjs';

const revision = 'a'.repeat(40), jobId = '00000000-0000-4000-8000-000000000001';
const provider = { baseUrl: 'https://api.example.com/v1', model: 'synthetic-model', apiKey: 'secret-not-in-vm' };
async function fixture(run) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hc-sdk-test-'));
  try {
    const workspace = path.join(root, 'workspace'); await fs.mkdir(workspace);
    await fs.writeFile(path.join(workspace, 'cv.md'), 'Synthetic CV');
    await run(workspace);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
}
function harness(bundle, { stopFails = false, wrongRevision = false, cancelAtCreate, workerError } = {}) {
  const events = []; let createOptions, calls = 0;
  const session = {
    sessionId: 'synthetic-session',
    async stop() { events.push('stop'); if (stopFails) throw new Error('secret error'); return { session: { status: 'stopped' } }; },
    async runCommand(options) {
      calls++; assert.equal(options.sudo, undefined); assert.equal(options.cmd, '/usr/local/bin/node');
      let output;
      if (calls === 1) output = { revision: wrongRevision ? 'b'.repeat(40) : revision, uid: 1000 };
      else if (calls === 2) output = { imported: true };
      else if (calls === 3) output = workerError ? { ok:false,error:workerError } : { ok: true, result: { jobId, engineRevision: revision } };
      else output = bundle;
      options.stdout.write(JSON.stringify(output));
      return { exitCode: calls === 3 && workerError ? 1 : 0 };
    },
  };
  const runner = sandboxRunner({ images: { [revision]: `worker@sha256:${'1'.repeat(64)}` }, provider,
    journal: async record => { events.push(record.state); },
    create: async options => { createOptions = options; cancelAtCreate?.abort(); return { currentSession: () => session }; },
  });
  return { runner, events, options: () => createOptions, calls: () => calls };
}
test('fresh pinned VM, brokered credentials and stop before local publication', async () => fixture(async workspace => {
  const bundle = await exportWorkspace(workspace), h = harness(bundle);
  assert.deepEqual(await h.runner({ workspace, job: { operation: 'evaluate', jobId, postingText: 'Synthetic role' }, engineRevision: revision }), { jobId, engineRevision: revision });
  assert.deepEqual(h.events, ['creating','running','stop','stopped']);
  const options = h.options();
  assert.equal(options.persistent, false); assert.deepEqual(options.ports, []);
  assert.equal(JSON.stringify(options.env).includes(provider.apiKey), false);
  assert.deepEqual(options.networkPolicy.allow['api.example.com'][0].match, { path: { exact: '/v1/chat/completions' }, method: ['POST'] });
  assert.equal(options.networkPolicy.allow['api.example.com'][1].response.statusCode,403);
  assert.deepEqual(await exportWorkspace(workspace), bundle);
}));
test('cancellation during create stops the original VM without running work', async () => fixture(async workspace => {
  const abort = new AbortController(), h = harness(await exportWorkspace(workspace), { cancelAtCreate: abort });
  await assert.rejects(h.runner({ workspace, job: { jobId }, engineRevision: revision, signal: abort.signal }), { code: 'cancelled' });
  assert.equal(h.calls(), 0); assert.ok(h.events.includes('stop'));
}));
test('worker failures expose only reviewed categories and never publish', async () => fixture(async workspace => {
  const before = await exportWorkspace(workspace);
  for (const [workerError, code] of [['cv_facts_failed','cv_facts_failed'], ['private model output secret','worker_failed']]) {
    const h = harness(before, {workerError});
    await assert.rejects(h.runner({workspace,job:{jobId},engineRevision:revision}), {code});
    assert.deepEqual(await exportWorkspace(workspace),before);
    assert.deepEqual(h.events,['creating','running','stop','stopped']);
  }
}));
test('failed cleanup cannot return success or publish files', async () => fixture(async workspace => {
  const before = await exportWorkspace(workspace), h = harness(before, { stopFails: true });
  await assert.rejects(h.runner({ workspace, job: { jobId }, engineRevision: revision }), { code: 'sandbox_cleanup_failed' });
  assert.deepEqual(await exportWorkspace(workspace), before);
  assert.equal(h.events.includes('stopped'), false);
}));
test('wrong engine and altered sources are rejected and VM stopped', async () => fixture(async workspace => {
  const before = await exportWorkspace(workspace), wrong = harness(before, { wrongRevision: true });
  await assert.rejects(wrong.runner({ workspace, job: { jobId }, engineRevision: revision }), { code: 'engine_revision_mismatch' });
  const changed = harness({ schema: 1, files: [] });
  await assert.rejects(changed.runner({ workspace, job: { jobId }, engineRevision: revision }), { code: 'source_changed' });
  assert.deepEqual(await exportWorkspace(workspace), before);
  assert.ok(wrong.events.includes('stop')); assert.ok(changed.events.includes('stop'));
}));
