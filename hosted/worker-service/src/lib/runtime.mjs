import path from 'node:path';
import os from 'node:os';
import pg from 'pg';
import { Sandbox } from '@vercel/sandbox';
import { send } from '@vercel/queue';
import { Queue } from '@hosted-career/control-plane/queue.mjs';
import { Supervisor } from '@hosted-career/control-plane/supervisor.mjs';
import { BlobSnapshotStore } from '@hosted-career/control-plane/blob-snapshots.mjs';
import { sandboxRunner } from './generated/runner.mjs';
import { attemptJournal } from './generated/journal.mjs';
import { modelProvider } from './provider.mjs';
import {SnapshotInventory} from '@hosted-career/control-plane/snapshot-inventory.mjs';

let services;
function configured() {
  if (process.env.HOSTED_WORKER_ENABLED !== '1') throw new Error('worker_disabled');
  modelProvider();
  if (services) return services;
  if (!process.env.DATABASE_URL || !process.env.HOSTED_ENGINE_IMAGES || (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID)) throw new Error('worker_configuration_required');
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3, connectionTimeoutMillis: 5000, statement_timeout: 5000 });
  pool.on('error', () => {});
  const inventoryEnabled=process.env.HOSTED_SNAPSHOT_INVENTORY_ENABLED==='1',queue=new Queue(pool,{snapshotInventory:inventoryEnabled,accountLifecycle:process.env.HOSTED_ACCOUNT_LIFECYCLE_ENABLED==='1'});
  services = { pool, queue,inventory:inventoryEnabled?new SnapshotInventory({queue}):undefined, store: new BlobSnapshotStore({ token:process.env.BLOB_READ_WRITE_TOKEN,storeId:process.env.BLOB_STORE_ID }), images:JSON.parse(process.env.HOSTED_ENGINE_IMAGES) };
  return services;
}
export async function wake(key) {
  configured();
  await send('career-jobs', { wake: true }, { region:'iad1', ...(key ? { idempotencyKey:key } : {}), retentionSeconds:86400 });
}
async function cleanup({ pool }) {
  const { rows } = await pool.query(`select a.* from worker_attempts a join jobs j on j.id=a.job_id
    where a.state <> 'stopped' and a.created_at < clock_timestamp()-interval '1 minute'
    and (j.lease_until < clock_timestamp() or j.status not in ('running','cancel_requested')) limit 10`);
  for (const attempt of rows) {
    try {
      const sandbox = await Sandbox.get({ name:attempt.name, resume:false, signal:AbortSignal.timeout(10000) });
      const session = sandbox.currentSession();
      if (attempt.session_id && session.sessionId !== attempt.session_id) throw new Error('unexpected_session');
      if (!['stopped','failed','aborted'].includes(session.status)) {
        const result = await session.stop({signal:AbortSignal.timeout(30000)});
        if (!['stopped','failed','aborted'].includes(result.session.status)) throw new Error('stop_not_confirmed');
      }
      await pool.query("update worker_attempts set state='stopped',updated_at=clock_timestamp() where name=$1", [attempt.name]);
    } catch { console.error('Worker attempt needs cleanup; inspect private attempt journal.'); }
  }
}
export async function consume() {
  const services = configured();
  await services.queue.reapExpired();
  await cleanup(services);
  const runner = sandboxRunner({ images:services.images,
    provider:modelProvider(),
    journal:attemptJournal(services.queue,{maxDailyAttempts:20}) });
  const supervisor = new Supervisor({ ...services, runner, workRoot:path.join(os.tmpdir(),'hc-supervisor'),heartbeatMs:10000 });
  const result = await supervisor.runOnce();
  // Each completed claim wakes another drain; duplicate deliveries still claim
  // through PostgreSQL and cannot launch the same job twice.
  if (result) await wake();
}
export async function sweep() {
  const services = configured();
  await services.queue.reapExpired(); await cleanup(services); await wake();
}
