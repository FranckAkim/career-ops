import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ControlError } from './queue.mjs';

export class Supervisor {
  constructor({ queue, store, runner, workRoot, heartbeatMs = 10000 }) {
    if (!path.isAbsolute(workRoot) || heartbeatMs < 100 || heartbeatMs >= queue.leaseSeconds * 500) throw new ControlError('invalid_supervisor_config');
    this.queue = queue; this.store = store; this.runner = runner;
    this.workRoot = path.resolve(workRoot); this.heartbeatMs = heartbeatMs;
  }
  async runOnce({ signal } = {}) {
    if (signal?.aborted) return null;
    const claim = await this.queue.claim();
    if (!claim) return null;
    const abort = new AbortController();
    const cancel = () => abort.abort();
    signal?.addEventListener('abort', cancel, { once: true });
    const workspace = path.join(this.workRoot, randomUUID());
    let timer, heartbeat, lost = false, quarantine = false;
    const beat = async () => {
      try { if (!(await this.queue.heartbeat(claim))) { lost = true; abort.abort(); } }
      catch { lost = true; abort.abort(); }
    };
    // No overlapping heartbeat transactions; database time is authoritative.
    const schedule = () => { timer = setTimeout(() => { heartbeat = beat().finally(() => { if (!abort.signal.aborted) schedule(); }); }, this.heartbeatMs); };
    const stopHeartbeat = async () => { clearTimeout(timer); if (heartbeat) await heartbeat; clearTimeout(timer); };
    try {
      await fs.mkdir(this.workRoot, { recursive: true, mode: 0o700 });
      schedule();
      await this.store.materialize(claim.base_snapshot, workspace);
      if (signal?.aborted) abort.abort();
      // runner must settle only after the worker/container is fully stopped.
      const result = await this.runner({ workspace, job: { ...claim.payload, jobId: claim.id }, engineRevision: claim.engine_revision, signal: abort.signal });
      if (lost || abort.signal.aborted) throw new ControlError('cancelled');
      const snapshot = await this.store.capture(workspace);
      // Read the verified regular-file copy, never a worker-created host link.
      const receipt = JSON.parse(await this.store.read(snapshot.id, `.hosted/${claim.id}/result.json`));
      if (receipt.schema !== 2 || receipt.operation !== claim.payload.operation || receipt.result.jobId !== claim.id || receipt.result.engineRevision !== claim.engine_revision || JSON.stringify(receipt.result) !== JSON.stringify(result) || !Array.isArray(receipt.artifacts)) throw new ControlError('invalid_receipt');
      const files = new Map(snapshot.files.map(file => [file.path, file.sha256]));
      for (const artifact of receipt.artifacts) if (files.get(artifact.path) !== artifact.sha256) throw new ControlError('artifact_changed');
      await stopHeartbeat();
      if (lost || abort.signal.aborted) throw new ControlError('cancelled');
      // Publish rechecks lease, cancellation, fence and base generation. Uploaded
      // but unreferenced snapshots are harmless; no partial workspace is visible.
      const generation = await this.queue.publish(claim, { snapshot: snapshot.id, result, artifacts: receipt.artifacts });
      return { jobId: claim.id, status: 'succeeded', generation };
    } catch (error) {
      abort.abort(); await stopHeartbeat();
      const code = error instanceof ControlError ? error.code : 'supervisor_failed';
      quarantine = code === 'container_cleanup_failed';
      try { return { jobId: claim.id, status: await this.queue.finish(claim, { ambiguous: true, code }) }; }
      catch (failure) { if (failure.code !== 'lease_lost') throw failure; return { jobId: claim.id, status: 'lease_lost' }; }
    } finally {
      abort.abort(); await stopHeartbeat();
      signal?.removeEventListener('abort', cancel);
      // Server-generated exact child path; never remove a supplied job path.
      if (path.dirname(workspace) !== this.workRoot) throw new ControlError('unsafe_cleanup');
      if (!quarantine) await fs.rm(workspace, { recursive: true, force: true });
    }
  }
}
