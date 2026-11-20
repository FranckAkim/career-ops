import { createHash, randomUUID } from 'node:crypto';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const digest = /^[a-f0-9]{64}$/;
export const hash = value => createHash('sha256').update(value).digest('hex');
export class ControlError extends Error { constructor(code) { super(code); this.code = code; } }
function check(condition, code = 'invalid_request') { if (!condition) throw new ControlError(code); }
const event = (db, job, kind) => db.query('insert into job_events(tenant_id,job_id,kind) values($1,$2,$3)', [job.tenant_id, job.id, kind]);

// Caller identity must come from verified server-side auth, never a request body.
// Worker/admin methods below are private capabilities, not public API handlers.
export class Queue {
  constructor(pool, { leaseSeconds = 60 } = {}) {
    check(Number.isInteger(leaseSeconds) && leaseSeconds >= 5 && leaseSeconds <= 3600);
    this.pool = pool; this.leaseSeconds = leaseSeconds;
  }
  async transaction(fn) {
    const db = await this.pool.connect();
    try {
      await db.query('begin');
      await db.query("set local statement_timeout = '5s'");
      const result = await fn(db);
      await db.query('commit'); return result;
    } catch (error) { await db.query('rollback'); throw error; }
    finally { db.release(); }
  }
  async authorize(db, tenantId, userId, owner = false) {
    check(uuid.test(tenantId) && uuid.test(userId));
    const { rows } = await db.query('select role from memberships where tenant_id=$1 and user_id=$2', [tenantId, userId]);
    check(rows.length && (!owner || rows[0].role === 'owner'), 'not_found');
  }
  async provision({ tenantId = randomUUID(), userId, snapshot }) {
    check(uuid.test(tenantId) && uuid.test(userId) && digest.test(snapshot));
    return this.transaction(async db => {
      await db.query('insert into tenants(id,snapshot) values($1,$2)', [tenantId, snapshot]);
      await db.query("insert into memberships values($1,$2,'owner')", [tenantId, userId]);
      await db.query('insert into workspace_versions(tenant_id,generation,snapshot) values($1,0,$2)', [tenantId, snapshot]);
      return tenantId;
    });
  }
  async enqueue({ tenantId, userId, idempotencyKey, operation, postingText, postingUrl = '', evaluationJobId, engineRevision }) {
    check(typeof idempotencyKey === 'string' && idempotencyKey.length >= 1 && idempotencyKey.length <= 128);
    check(/^[a-f0-9]{40}$/.test(engineRevision));
    check(operation === 'evaluate' || operation === 'tailor');
    if (operation === 'evaluate') check(typeof postingText === 'string' && postingText.trim() && Buffer.byteLength(postingText) <= 200000 && typeof postingUrl === 'string' && postingUrl.length <= 4096);
    else check(uuid.test(evaluationJobId));
    const payload = operation === 'evaluate' ? { operation, postingText, postingUrl } : { operation, evaluationJobId };
    const fingerprint = hash(JSON.stringify({ payload, engineRevision }));
    return this.transaction(async db => {
      await this.authorize(db, tenantId, userId);
      // All mutators lock tenant first, then job: no job->tenant deadlock cycle.
      await db.query('select id from tenants where id=$1 for update', [tenantId]);
      const prior = await db.query('select * from jobs where tenant_id=$1 and idempotency_key=$2', [tenantId, idempotencyKey]);
      if (prior.rows.length) { check(prior.rows[0].request_hash === fingerprint, 'idempotency_conflict'); return prior.rows[0]; }
      if (operation === 'tailor') {
        const source = await db.query("select id from jobs where tenant_id=$1 and id=$2 and status='succeeded' and payload->>'operation'='evaluate'", [tenantId, evaluationJobId]);
        check(source.rows.length, 'evaluation_not_found');
      }
      const { rows: [job] } = await db.query('insert into jobs(id,tenant_id,requested_by,idempotency_key,request_hash,payload,engine_revision) values($1,$2,$3,$4,$5,$6,$7) returning *', [randomUUID(), tenantId, userId, idempotencyKey, fingerprint, payload, engineRevision]);
      await event(db, job, 'queued'); return job;
    });
  }
  async read({ tenantId, userId, jobId, after = '0' }) {
    check(uuid.test(jobId) && /^\d{1,19}$/.test(String(after)) && BigInt(after) <= 9223372036854775807n);
    return this.transaction(async db => {
      await this.authorize(db, tenantId, userId);
      const { rows: [job] } = await db.query("select id,status,result,error_code,created_at,finished_at,payload->>'operation' as operation from jobs where tenant_id=$1 and id=$2", [tenantId, jobId]);
      check(job, 'not_found');
      const { rows: events } = await db.query('select sequence,kind,created_at from job_events where tenant_id=$1 and job_id=$2 and sequence>$3 order by sequence limit 100', [tenantId, jobId, after]);
      return { ...job, events };
    });
  }
  async tenants({ userId }) {
    check(uuid.test(userId));
    const { rows } = await this.pool.query('select t.id,t.generation,t.recovery_required,m.role from tenants t join memberships m on m.tenant_id=t.id where m.user_id=$1 order by t.created_at,t.id limit 100', [userId]);
    return rows;
  }
  async list({ tenantId, userId }) {
    return this.transaction(async db => {
      await this.authorize(db, tenantId, userId);
      const { rows } = await db.query("select id,status,payload->>'operation' as operation,result->>'company' as company,result->>'role' as role,created_at,finished_at,error_code from jobs where tenant_id=$1 order by created_at desc,id desc limit 100", [tenantId]);
      return rows;
    });
  }
  async cancel({ tenantId, userId, jobId }) {
    check(uuid.test(jobId));
    return this.transaction(async db => {
      await this.authorize(db, tenantId, userId);
      await db.query('select id from tenants where id=$1 for update', [tenantId]);
      const { rows: [job] } = await db.query('select * from jobs where tenant_id=$1 and id=$2 for update', [tenantId, jobId]);
      check(job, 'not_found');
      const status = job.status === 'queued' ? 'cancelled' : job.status === 'running' ? 'cancel_requested' : job.status;
      if (status !== job.status) {
        await db.query("update jobs set status=$2,finished_at=case when $2='cancelled' then clock_timestamp() else null end where id=$1", [jobId, status]);
        await event(db, job, status);
      }
      return status;
    });
  }
  async claim() {
    return this.transaction(async db => {
      const { rows: [tenant] } = await db.query(`select t.* from tenants t where active_job is null and not recovery_required
        and exists(select 1 from jobs j where j.tenant_id=t.id and j.status='queued')
        order by (select min(created_at) from jobs j where j.tenant_id=t.id and j.status='queued'), t.id
        limit 1 for update of t skip locked`);
      if (!tenant) return null;
      const { rows: [pending] } = await db.query("select * from jobs where tenant_id=$1 and status='queued' order by created_at,id limit 1 for update", [tenant.id]);
      const { rows: [job] } = await db.query(`update jobs set status='running',fence=$2::bigint+1,base_generation=$3,base_snapshot=$4,
        lease_until=clock_timestamp()+make_interval(secs=>$5) where id=$1 returning *`, [pending.id, tenant.fence, tenant.generation, tenant.snapshot, this.leaseSeconds]);
      await db.query('update tenants set fence=$2,active_job=$3 where id=$1', [tenant.id, job.fence, job.id]);
      await event(db, job, 'running'); return job;
    });
  }
  async locked(db, claim) {
    const { rows: [tenant] } = await db.query('select * from tenants where id=$1 for update', [claim.tenant_id]);
    const { rows: [job] } = await db.query('select *,lease_until>clock_timestamp() as live from jobs where tenant_id=$1 and id=$2 for update', [claim.tenant_id, claim.id]);
    check(tenant && job && tenant.active_job === claim.id && tenant.fence === String(claim.fence) && job.fence === String(claim.fence) && job.live && ['running','cancel_requested'].includes(job.status), 'lease_lost');
    return { tenant, job };
  }
  async heartbeat(claim) {
    return this.transaction(async db => {
      const { job } = await this.locked(db, claim);
      if (job.status === 'cancel_requested') return false;
      await db.query('update jobs set lease_until=clock_timestamp()+make_interval(secs=>$2) where id=$1', [claim.id, this.leaseSeconds]);
      return true;
    });
  }
  async publish(claim, { snapshot, result, artifacts }) {
    check(digest.test(snapshot) && result && result.jobId === claim.id && result.engineRevision === claim.engine_revision && Array.isArray(artifacts));
    for (const a of artifacts) check(typeof a.path === 'string' && a.path.length <= 1024 && digest.test(a.sha256));
    return this.transaction(async db => {
      const { tenant, job } = await this.locked(db, claim);
      check(job.status === 'running', 'cancelled');
      check(tenant.generation === String(claim.base_generation) && tenant.snapshot === claim.base_snapshot, 'generation_conflict');
      const generation = (BigInt(tenant.generation) + 1n).toString();
      await db.query('insert into workspace_versions(tenant_id,generation,snapshot,job_id) values($1,$2,$3,$4)', [tenant.id, generation, snapshot, job.id]);
      for (const artifact of artifacts) await db.query('insert into artifacts values($1,$2,$3,$4)', [tenant.id, job.id, artifact.path, artifact.sha256]);
      await db.query("update jobs set status='succeeded',result=$2,finished_at=clock_timestamp(),lease_until=null where id=$1", [job.id, result]);
      await db.query('update tenants set generation=$2,snapshot=$3,active_job=null where id=$1', [tenant.id, generation, snapshot]);
      await event(db, job, 'succeeded'); return generation;
    });
  }
  // Called only after the launcher has stopped the process/container. Ambiguous
  // infrastructure failures require recovery; no implicit model retries.
  async finish(claim, { ambiguous = true, code = 'worker_failed' } = {}) {
    check(/^[a-z_]{1,64}$/.test(code));
    return this.transaction(async db => {
      const { job } = await this.locked(db, claim);
      const status = job.status === 'cancel_requested' ? 'cancelled' : ambiguous ? 'needs_recovery' : 'failed';
      await db.query('update jobs set status=$2,error_code=$3,finished_at=clock_timestamp(),lease_until=null where id=$1', [job.id, status, code]);
      await db.query('update tenants set active_job=null,recovery_required=$2,fence=fence+1 where id=$1', [job.tenant_id, status === 'needs_recovery']);
      await event(db, job, status); return status;
    });
  }
  async reapExpired() {
    return this.transaction(async db => {
      const { rows } = await db.query(`select t.* from tenants t join jobs j on j.id=t.active_job
        where j.lease_until<=clock_timestamp() limit 100 for update of t skip locked`);
      let reaped = 0;
      for (const tenant of rows) {
        const { rows: [job] } = await db.query('select *,lease_until<=clock_timestamp() as expired from jobs where id=$1 for update', [tenant.active_job]);
        // Recheck after locking: the selection snapshot may predate a heartbeat.
        if (!job.expired || !['running','cancel_requested'].includes(job.status)) continue;
        // A missing heartbeat cannot prove the worker stopped, even on cancel.
        await db.query("update jobs set status='needs_recovery',error_code='lease_expired',finished_at=clock_timestamp(),lease_until=null where id=$1", [job.id]);
        await db.query('update tenants set active_job=null,recovery_required=true,fence=fence+1 where id=$1', [tenant.id]);
        await event(db, job, 'needs_recovery');
        reaped++;
      }
      return reaped;
    });
  }
  async discardRecovery({ tenantId, userId }) {
    return this.transaction(async db => {
      await this.authorize(db, tenantId, userId, true);
      const { rows: [tenant] } = await db.query('select * from tenants where id=$1 for update', [tenantId]);
      check(!tenant.active_job, 'tenant_busy');
      // Explicit owner decision: retain the committed snapshot, discard all
      // uncommitted output. A new job needs a new idempotency key.
      await db.query('update tenants set recovery_required=false,fence=fence+1 where id=$1', [tenantId]);
      const { rows } = await db.query("update jobs set status='failed',error_code='recovery_discarded' where tenant_id=$1 and status='needs_recovery' returning *", [tenantId]);
      for (const job of rows) await event(db, job, 'recovery_discarded');
    });
  }
}
