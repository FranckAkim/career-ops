import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Writable, Readable } from 'node:stream';
import { Sandbox } from '@vercel/sandbox';
import { exportWorkspace, importWorkspace, verifySourceRetention } from '../workspace-transfer.mjs';
import { ControlError } from '../control-plane/queue.mjs';

const codeRoot = '/opt/career-ops';
const fail = code => { throw new ControlError(code); };
// Configuration is operator-owned. Credentials are brokered outside the VM.
export function sandboxRunner({ images, provider, journal, credentials = {}, timeoutMs = 240000, create = options => Sandbox.create(options) }) {
  let endpoint;
  try { endpoint = new URL(provider.baseUrl); } catch { fail('invalid_runner_config'); }
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.port || !/^[a-z0-9.-]+\.[a-z]+$/i.test(endpoint.hostname) || !provider.apiKey || !provider.model || typeof journal !== 'function' || !Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 900000) fail('invalid_runner_config');
  const completionPath = `${endpoint.pathname.replace(/\/$/, '')}/chat/completions`;
  return async ({ workspace, job, engineRevision, claim, signal }) => {
    const image = images?.[engineRevision];
    if (!/^[a-f0-9]{40}$/.test(engineRevision) || !/^[a-zA-Z0-9_./-]+@sha256:[a-f0-9]{64}$/.test(image || '')) fail('engine_image_unavailable');
    if (signal?.aborted) fail('cancelled');
    const before = await exportWorkspace(workspace);
    const name = `hc-${randomUUID()}`;
    // Persist a discoverable name BEFORE creation; ambiguous create must never
    // silently become a fresh paid attempt after a supervisor crash.
    await journal({ name, jobId: job.jobId, claim, state: 'creating' });
    let session, stopped = false, stopPromise, expired = false;
    const stop = () => {
      if (!session) return Promise.resolve();
      if (!stopPromise) stopPromise = (async () => {
        const reply = await session.stop({ signal: AbortSignal.timeout(30000) });
        if (!['stopped','failed','aborted'].includes(reply.session.status)) fail('sandbox_cleanup_failed');
        stopped = true;
      })();
      return stopPromise;
    };
    const abort = () => { void stop().catch(() => {}); };
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => { expired = true; abort(); }, timeoutMs);
    try {
      // No caller cancellation during create: obtain the handle, then stop it.
      // A bounded create request plus VM lifetime also bounds ambiguous failure.
      const sandbox = await create({ ...credentials, name, image, persistent: false, ports: [], resources: { vcpus: 1 }, timeout: timeoutMs,
        signal: AbortSignal.timeout(60000),
        networkPolicy: { allow: { [endpoint.hostname]: [{ match: { path: { exact: completionPath }, method: ['POST'] }, transform: [{ headers: { Authorization: `Bearer ${provider.apiKey}` } }] }] } },
        env: { HOSTED_MODEL_BASE_URL: provider.baseUrl, HOSTED_MODEL: provider.model, HOSTED_MODEL_API_KEY: 'brokered-outside-vm', HOSTED_WORKSPACE_ROOT: '/tmp/hc-workspace', HOSTED_TIMEOUT_MS: String(Math.min(timeoutMs, 900000)), NODE_EXTRA_CA_CERTS: '/etc/ssl/certs/ca-certificates.crt', NODE_USE_SYSTEM_CA: '1' },
      });
      session = sandbox.currentSession();
      await journal({ name, jobId: job.jobId, claim, sessionId: session.sessionId, state: 'running' });
      const command = async (script, args = [], input = '', maxBytes = 2000000) => {
        if (signal?.aborted || expired || stopped || stopPromise) fail('cancelled');
        let bytes = 0; const chunks = [];
        const sink = collect => new Writable({ write(chunk, encoding, done) {
          bytes += chunk.length;
          if (bytes > maxBytes) { abort(); done(new ControlError('worker_output_limit')); }
          else { if (collect) chunks.push(Buffer.from(chunk)); done(); }
        } });
        const stdout = sink(true), stderr = sink(false);
        // SDK may emit stream errors before runCommand rejects.
        stdout.on('error', () => {}); stderr.on('error', () => {});
        const result = await session.runCommand({ cmd: '/usr/local/bin/node', args: [`${codeRoot}/hosted/${script}`, ...args], cwd: codeRoot,
          stdin: Readable.from([input]), stdout, stderr, signal, timeoutMs });
        if (result.exitCode !== 0) fail('worker_failed');
        try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { fail('invalid_worker_response'); }
      };
      const probe = await command('transfer-worker.mjs', ['probe']);
      if (probe.revision !== engineRevision || !Number.isInteger(probe.uid) || probe.uid <= 0) fail('engine_revision_mismatch');
      await command('transfer-worker.mjs', ['import'], JSON.stringify(before));
      const envelope = await command('worker.mjs', [], JSON.stringify(job));
      if (envelope.ok !== true || envelope.result?.jobId !== job.jobId || envelope.result.engineRevision !== engineRevision) fail('invalid_worker_response');
      const after = await command('transfer-worker.mjs', ['export'], '', 32000000);
      verifySourceRetention(before, after);
      await stop();
      if (signal?.aborted || expired) fail('cancelled');
      // Materialize only verified bytes after the VM is confirmed stopped.
      const parent = path.dirname(workspace), stage = path.join(parent, randomUUID()), backup = path.join(parent, randomUUID());
      try {
        await importWorkspace(stage, after);
        await fs.rename(workspace, backup);
        try { await fs.rename(stage, workspace); } catch (error) { await fs.rename(backup, workspace); throw error; }
      } finally {
        if (path.dirname(stage) !== parent || path.dirname(backup) !== parent) fail('unsafe_cleanup');
        await fs.rm(stage, { recursive: true, force: true });
        await fs.rm(backup, { recursive: true, force: true });
      }
      return envelope.result;
    } catch (error) {
      if (error instanceof ControlError) throw error;
      if (['source_changed','transfer_corrupt','transfer_limit','invalid_transfer','unsafe_transfer_entry','unsafe_transfer_path'].includes(error.code)) fail(error.code);
      fail('sandbox_worker_failed');
    } finally {
      clearTimeout(timer); signal?.removeEventListener('abort', abort);
      if (session) {
        try { await stop(); } catch { fail('sandbox_cleanup_failed'); }
        await journal({ name, jobId: job.jobId, claim, sessionId: session.sessionId, state: 'stopped' });
      }
      // Without a session, keep the 'creating' journal for external cleanup.
    }
  };
}
