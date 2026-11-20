import { ControlError } from '../control-plane/queue.mjs';

export function attemptJournal(queue, { maxDailyAttempts = 20 } = {}) {
  if (!Number.isInteger(maxDailyAttempts) || maxDailyAttempts < 1 || maxDailyAttempts > 1000) throw new ControlError('invalid_attempt_limit');
  return async ({ name, jobId, claim, state, sessionId }) => {
    if (!/^hc-[0-9a-f-]{36}$/.test(name) || claim?.id !== jobId || !['creating','running','stopped'].includes(state)) throw new ControlError('invalid_attempt');
    if (state === 'creating') {
      await queue.transaction(async db => {
        const { job } = await queue.locked(db, claim);
        if (job.status !== 'running') throw new ControlError('cancelled');
        await db.query('select pg_advisory_xact_lock(847291,3)');
        const usage = await db.query("select count(*) from worker_attempts where created_at >= clock_timestamp()-interval '24 hours'");
        if (Number(usage.rows[0].count) >= maxDailyAttempts) throw new ControlError('worker_daily_limit');
        await db.query('insert into worker_attempts(name,job_id,fence,state) values($1,$2,$3,$4)', [name,jobId,claim.fence,state]);
      });
    } else {
      const result = await queue.pool.query(`update worker_attempts set state=$4,session_id=$5,updated_at=clock_timestamp()
        where name=$1 and job_id=$2 and fence=$3 and state <> 'stopped'`, [name,jobId,claim.fence,state,sessionId]);
      if (result.rowCount !== 1) throw new ControlError('invalid_attempt');
    }
  };
}
