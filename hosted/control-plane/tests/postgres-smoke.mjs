import {verifySnapshotFences} from './snapshot-fences.mjs';
import {verifyCompletionReview} from './completion-review.mjs';
import {verifyRequestReview} from './request-review.mjs';
import {verifyRequestDrain} from './request-drain.mjs';
// Real PostgreSQL integration; creates only a disposable local test container.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { migrate } from '../migrate.mjs';
import { Queue } from '../queue.mjs';
import { SnapshotStore } from '../snapshots.mjs';
import { Supervisor } from '../supervisor.mjs';
import { dockerRunner } from '../docker-runner.mjs';
import { createEngine } from '../../engine.mjs';
import { candidate, modelServer, engineRevision } from '../../tests/fixtures.mjs';
import { verifyAuthHttp } from './auth-http.mjs';
import { verifyOnboarding } from './onboarding.mjs';
import { verifyArtifacts } from './artifacts.mjs';
import {verifyApplications} from './applications.mjs';
import {verifyProfiles} from './profiles.mjs';
import {verifyDataControls} from './data-controls.mjs';
import {verifySnapshotInventory} from './snapshot-inventory.mjs';
import {verifyStorageReconciliation} from './storage-reconciliation.mjs';
import {verifyAccountLifecycle} from './account-lifecycle.mjs';
import {verifyAccountPurge} from './account-purge.mjs';
import { attemptJournal } from '../../sandbox-worker/journal.mjs';

const name = `hc-postgres-test-${randomUUID()}`;
const cleanup = [];
const t = { after(fn) { cleanup.push(fn); } };
const password = randomBytes(32).toString('hex');
function docker(args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, { env, shell: false, windowsHide: true, stdio: ['ignore','pipe','pipe'] });
    let out = ''; child.stdout.on('data', b => { out += b; }); child.stderr.resume();
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(out.trim()) : reject(new Error('test_docker_failed')));
  });
}
let pool;
try {
  await docker(['run','-d','--name',name,'--publish=127.0.0.1::5432','--env=POSTGRES_PASSWORD','--env=POSTGRES_USER=control_test','--env=POSTGRES_DB=hosted_test',
    '--mount=type=volume,destination=/var/lib/postgresql/data', process.env.HOSTED_TEST_POSTGRES_IMAGE || 'postgres:17-bookworm@sha256:837bed18782820fe967067cb5328b02b0d9992c1be9a37ee0c9c492cfc03af3b'], { ...process.env, POSTGRES_PASSWORD: password });
  cleanup.push(() => docker(['rm','-fv',name]));
  const getPort = async () => Number(JSON.parse(await docker(['inspect',name,'--format','{{json .NetworkSettings.Ports}}']))['5432/tcp'][0].HostPort);
  let port = await getPort();
  const connect = () => new pg.Pool({ host: '127.0.0.1', port, user: 'control_test', password, database: 'hosted_test', max: 8, connectionTimeoutMillis: 2000 });
  pool = connect(); pool.on('error', () => {});
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { await pool.query('select 1'); ready = true; break; } catch { await new Promise(r => setTimeout(r, 100)); }
  }
  assert.ok(ready, 'PostgreSQL starts');
  await pool.query('create role career_web;create role career_worker');
  await Promise.all([migrate(pool), migrate(pool)]);
  const rights=(await pool.query("select has_table_privilege('career_web','account_request_activity','INSERT') as admission,has_column_privilege('career_web','account_request_activity','state','UPDATE') as settlement,has_table_privilege('career_web','account_request_activity','DELETE') as erase,has_table_privilege('career_worker','account_request_activity','SELECT') as worker")).rows[0];
  assert.deepEqual(rights,{admission:true,settlement:true,erase:false,worker:false});
  let queue = new Queue(pool, { leaseSeconds: 5 });
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hc-control-test-'));
  cleanup.push(() => fs.rm(root, { recursive: true, force: true }));
  const store = new SnapshotStore(path.join(root, 'store'));
  const initial = await store.capture(await candidate(t));
  const initialB = await store.capture(await candidate(t, 'Synthetic Beta'));
  const userA = randomUUID(), userB = randomUUID();
  const tenantA = await queue.provision({ userId: userA, snapshot: initial.id });
  const tenantB = await queue.provision({ userId: userB, snapshot: initialB.id });
  const enqueue = (tenantId, userId, key = randomUUID()) => queue.enqueue({ tenantId, userId, idempotencyKey: key, operation: 'evaluate', postingText: 'Example Employer needs a Python engineer.', engineRevision });
  const first = await enqueue(tenantA, userA, 'first');
  const copies = await Promise.all(Array.from({ length: 8 }, () => enqueue(tenantA, userA, 'first')));
  assert.ok(copies.every(j => j.id === first.id));
  const limitedQueue = new Queue(pool, { maxDailyJobs: 1 });
  await assert.rejects(limitedQueue.enqueue({ tenantId:tenantA,userId:userA,idempotencyKey:'quota-rejected',operation:'evaluate',postingText:'Synthetic role',engineRevision }), /daily_job_limit/);
  assert.equal((await limitedQueue.enqueue({ tenantId:tenantA,userId:userA,idempotencyKey:'first',operation:'evaluate',postingText:'Example Employer needs a Python engineer.',engineRevision })).id,first.id);
  await assert.rejects(queue.enqueue({ tenantId: tenantA, userId: userA, idempotencyKey: 'first', operation: 'evaluate', postingText: 'Different', engineRevision }), /idempotency_conflict/);
  await assert.rejects(enqueue(tenantA, userB), /not_found/);
  await assert.rejects(queue.read({ tenantId: tenantA, userId: userB, jobId: first.id }), /not_found/);
  console.log('PASS authorization and concurrent idempotency');

  await enqueue(tenantA, userA); await enqueue(tenantB, userB);
  const claims = (await Promise.all(Array.from({ length: 8 }, () => queue.claim()))).filter(Boolean);
  assert.equal(claims.length, 2); assert.equal(new Set(claims.map(j => j.tenant_id)).size, 2);
  const a = claims.find(j => j.tenant_id === tenantA), b = claims.find(j => j.tenant_id === tenantB);
  const journal = attemptJournal(queue), attemptName = `hc-${randomUUID()}`;
  await journal({ name: attemptName, jobId: a.id, claim: a, state: 'creating' });
  await assert.rejects(attemptJournal(queue,{maxDailyAttempts:1})({name:`hc-${randomUUID()}`,jobId:b.id,claim:b,state:'creating'}), /worker_daily_limit/);
  await assert.rejects(journal({ name: `hc-${randomUUID()}`, jobId: a.id, claim: a, state: 'creating' }), /unique|duplicate/);
  await journal({ name: attemptName, jobId: a.id, claim: a, sessionId: 'synthetic-session', state: 'running' });
  await queue.cancel({ tenantId: tenantA, userId: userA, jobId: a.id });
  assert.equal(await queue.heartbeat(a), false);
  await assert.rejects(queue.publish(a, { snapshot: initial.id, result: { jobId: a.id, engineRevision }, artifacts: [] }), /cancelled/);
  assert.equal(await queue.finish(a), 'cancelled');
  await journal({ name: attemptName, jobId: a.id, claim: a, sessionId: 'synthetic-session', state: 'stopped' });
  assert.equal((await pool.query('select state from worker_attempts where name=$1', [attemptName])).rows[0].state, 'stopped');
  await assert.rejects(journal({ name: `hc-${randomUUID()}`, jobId: a.id, claim: a, state: 'creating' }), /lease_lost/);
  await queue.finish(b, { ambiguous: false, code: 'synthetic_failure' });
  console.log('PASS concurrent tenant serialization and cancellation before publication');

  const stale = await queue.claim(); assert.equal(stale.tenant_id, tenantA);
  await pool.query("update jobs set lease_until=clock_timestamp()-interval '1 second' where id=$1", [stale.id]);
  assert.equal(await queue.reapExpired(), 1);
  assert.equal(await queue.claim(), null);
  await assert.rejects(queue.heartbeat(stale), /lease_lost/);
  await assert.rejects(queue.publish(stale, { snapshot: initial.id, result: { jobId: stale.id, engineRevision }, artifacts: [] }), /lease_lost/);
  await assert.rejects(queue.discardRecovery({ tenantId: tenantA, userId: userB }), /not_found/);
  await queue.discardRecovery({ tenantId: tenantA, userId: userA });
  const durable = await enqueue(tenantA, userA, 'survive-restart');
  await pool.end(); pool = null;
  await docker(['restart',name]);
  port = await getPort();
  pool = connect(); pool.on('error', () => {});
  for (let i = 0; ; i++) { try { await pool.query('select 1'); break; } catch (error) { if (i > 100) throw error; await new Promise(r => setTimeout(r, 100)); } }
  queue = new Queue(pool, { leaseSeconds: 30 });
  assert.equal((await enqueue(tenantA, userA, 'survive-restart')).id, durable.id);
  assert.equal((await queue.read({ tenantId: tenantA, userId: userA, jobId: durable.id })).status, 'queued');
  console.log('PASS expired-worker fencing, explicit discard and database restart durability');

  const model = await modelServer(t);
  const engine = createEngine({ provider: model.provider, engineRevision, allowLocalProvider: true });
  const runner = ({ workspace, job: { operation, ...job }, signal }) => engine[operation]({ workspace, ...job, signal });
  const supervisor = new Supervisor({ queue, store, runner, workRoot: path.join(root, 'workspaces'), heartbeatMs: 500 });
  const success = await supervisor.runOnce(); assert.equal(success.status, 'succeeded');
  const saved = await queue.read({ tenantId: tenantA, userId: userA, jobId: durable.id });
  assert.equal(saved.status, 'succeeded'); assert.equal(saved.events.at(-1).kind, 'succeeded');
  const { rows: [current] } = await pool.query('select * from tenants where id=$1', [tenantA]);
  assert.equal(current.generation, '1'); assert.notEqual(current.snapshot, initial.id);
  await store.verify(current.snapshot);
  assert.equal((await pool.query('select * from artifacts where job_id=$1', [durable.id])).rowCount, 2);
  console.log('PASS real engine evaluation through PostgreSQL queue and immutable snapshot publication');
  const applicationTenant=await queue.provision({userId:userA,snapshot:initial.id});
  assert.equal((await queue.applications({tenantId:applicationTenant,userId:userA})).initialized,false);
  await queue.enqueue({tenantId:applicationTenant,userId:userA,idempotencyKey:'application-evaluation',operation:'evaluate',postingText:'Example Employer needs a Python engineer.',engineRevision});
  assert.equal((await supervisor.runOnce()).status,'succeeded');
  await verifyApplications({queue,supervisor,tenantId:applicationTenant,userId:userA,otherUserId:userB,engineRevision,store,pool});

  const failed = await enqueue(tenantA, userA);
  const broken = new Supervisor({ queue, store, workRoot: path.join(root, 'workspaces'), heartbeatMs: 500,
    runner: async ({ workspace }) => { await fs.writeFile(path.join(workspace, 'cv.md'), 'uncommitted damage'); throw new Error('synthetic crash'); } });
  assert.equal((await broken.runOnce()).status, 'needs_recovery');
  assert.equal((await pool.query('select snapshot from tenants where id=$1', [tenantA])).rows[0].snapshot, current.snapshot);
  assert.deepEqual(await fs.readdir(path.join(root, 'workspaces')), []);
  assert.equal((await queue.read({ tenantId: tenantA, userId: userA, jobId: failed.id })).error_code, 'supervisor_failed');
  await queue.discardRecovery({ tenantId: tenantA, userId: userA });
  console.log('PASS interrupted workspace discarded with committed pointer unchanged');

  const cancelledJob = await enqueue(tenantA, userA);
  const cancellation = new Supervisor({ queue, store, workRoot: path.join(root, 'workspaces'), heartbeatMs: 100,
    runner: async ({ signal }) => {
      const stopped = new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }));
      await queue.cancel({ tenantId: tenantA, userId: userA, jobId: cancelledJob.id });
      await stopped; throw new Error('synthetic stopped process');
    } });
  assert.equal((await cancellation.runOnce()).status, 'cancelled');
  assert.equal((await pool.query('select snapshot from tenants where id=$1', [tenantA])).rows[0].snapshot, current.snapshot);
  console.log('PASS running cancellation reaches supervisor and preserves committed workspace');

  await enqueue(tenantA, userA);
  const tampering = new Supervisor({ queue, store, workRoot: path.join(root, 'workspaces'), heartbeatMs: 500,
    runner: async context => {
      const result = await runner(context);
      const receipt = JSON.parse(await fs.readFile(path.join(context.workspace, '.hosted', context.job.jobId, 'result.json'), 'utf8'));
      await fs.writeFile(path.join(context.workspace, receipt.artifacts[0].path), 'tampered artifact');
      return result;
    } });
  assert.equal((await tampering.runOnce()).status, 'needs_recovery');
  assert.equal((await pool.query('select snapshot from tenants where id=$1', [tenantA])).rows[0].snapshot, current.snapshot);
  await queue.discardRecovery({ tenantId: tenantA, userId: userA });
  console.log('PASS receipt artifact tampering cannot publish');

  await enqueue(tenantA, userA);
  const conflict = await queue.claim();
  await pool.query('update tenants set generation=generation+1 where id=$1', [tenantA]);
  await assert.rejects(queue.publish(conflict, { snapshot: initial.id, result: { jobId: conflict.id, engineRevision }, artifacts: [] }), /generation_conflict/);
  await queue.finish(conflict); await queue.discardRecovery({ tenantId: tenantA, userId: userA });
  console.log('PASS generation compare-and-swap rejects stale base');
  await verifyOnboarding({ pool, queue, store, model, engineRevision });
  await verifyProfiles({pool,queue,store,model,engineRevision});
  await verifyDataControls({pool,queue,store,engineRevision});
  await verifySnapshotInventory({pool,queue,store,model,engineRevision});
  await verifyStorageReconciliation({pool,queue});
  await verifyArtifacts({ queue, store, snapshot: initial.id, engineRevision });
  let webRunner, webRevision = engineRevision;

  if (process.env.HOSTED_TEST_IMAGE_ID) {
    const image = process.env.HOSTED_TEST_IMAGE_ID;
    const revision = JSON.parse(await docker(['image','inspect',image,'--format','{{json .Config.Env}}'])).find(v => v.startsWith('HOSTED_ENGINE_REVISION=')).split('=')[1];
    const modelName = `hc-supervisor-model-${randomUUID()}`;
    const network = `hc-supervisor-network-${randomUUID()}`;
    await docker(['network','create','--internal',network]); cleanup.push(() => docker(['network','rm',network]));
    const { cvHtml } = await import('../../tests/fixtures.mjs');
    const code = `const http=require('node:http');const html=${cvHtml.toString()};http.createServer(async(req,res)=>{let body='';for await(const b of req)body+=b;const job=JSON.parse(body);if(!job.stream){const candidate=JSON.stringify(job.messages || []).includes('Synthetic Beta')?'Synthetic Beta':'Synthetic Alpha';res.end(JSON.stringify({choices:[{message:{content:html(candidate)},finish_reason:'stop'}]}));return;}res.setHeader('Content-Type','text/event-stream');res.end('data: '+JSON.stringify({choices:[{delta:{content:'Synthetic evaluation.\\n---SCORE_SUMMARY---\\nCOMPANY: Example Employer\\nROLE: Software Engineer\\nSCORE: 4.1\\nARCHETYPE: Engineering\\nLEGITIMACY: Proceed with Caution\\n---END_SUMMARY---'},finish_reason:'stop'}]})+'\\n\\ndata: [DONE]\\n\\n');}).listen(9000,'0.0.0.0');`;
    await docker(['run','-d','--name',modelName,'--network',network,'--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--entrypoint=node',image,'-e',code]);
    cleanup.push(() => docker(['rm','-f',modelName]));
    await docker(['exec',modelName,'node','-e',"(async()=>{for(let i=0;i<50;i++){try{await fetch('http://127.0.0.1:9000',{method:'POST',body:JSON.stringify({stream:false})});return;}catch{}await new Promise(r=>setTimeout(r,100));}process.exitCode=1;})()"]);
    const containerRunner = dockerRunner({ image, seccomp: path.resolve(process.env.HOSTED_TEST_SECCOMP), network: `container:${modelName}`,
      provider: { baseUrl: 'http://127.0.0.1:9000/v1', model: 'synthetic-fixture-model' }, allowLocalProvider: true,
      uid: typeof process.getuid === 'function' ? `${process.getuid()}:${process.getgid()}` : undefined });
    const containerSupervisor = new Supervisor({ queue, store, runner: containerRunner, workRoot: path.join(root, 'workspaces'), heartbeatMs: 500 });
    webRunner = containerRunner; webRevision = revision;
    const tenants = await Promise.all([userA,userB].map((userId, i) => queue.provision({ userId, snapshot: [initial,initialB][i].id })));
    const evaluations = await Promise.all(tenants.map((tenantId, i) => queue.enqueue({ tenantId, userId: [userA,userB][i], idempotencyKey: 'eval', operation: 'evaluate', postingText: 'Python role', engineRevision: revision })));
    for (const outcome of await Promise.all([containerSupervisor.runOnce(),containerSupervisor.runOnce()])) assert.equal(outcome.status, 'succeeded');
    await Promise.all(tenants.map((tenantId, i) => queue.enqueue({ tenantId, userId: [userA,userB][i], idempotencyKey: 'pdf', operation: 'tailor', evaluationJobId: evaluations[i].id, engineRevision: revision })));
    for (const outcome of await Promise.all([containerSupervisor.runOnce(),containerSupervisor.runOnce()])) assert.equal(outcome.status, 'succeeded');
    for (const [i, tenantId] of tenants.entries()) {
      const { rows: [tenant] } = await pool.query('select * from tenants where id=$1', [tenantId]);
      assert.equal(tenant.generation, '2'); await store.verify(tenant.snapshot);
      assert.ok((await store.read(tenant.snapshot, 'cv.md')).startsWith(i === 0 ? '# Synthetic Alpha' : '# Synthetic Beta'));
    }
    console.log('PASS two tenants: durable queue -> constrained worker containers -> real PDFs -> atomic generation 2');
  }
  await verifyAuthHttp({ pool, queue, snapshot: initial.id, engineRevision: webRevision, store, runner: webRunner, workRoot: path.join(root, 'workspaces') });
  await verifyAccountLifecycle({pool,store,engineRevision});
  await verifyRequestDrain({pool,engineRevision});
  await verifyRequestReview({pool});
  await verifyCompletionReview({pool});
  await verifyAccountPurge({pool});
  await verifySnapshotFences({pool});
} finally {
  if (pool) await pool.end();
  for (const fn of cleanup.reverse()) await fn();
}
