import { ControlError } from '../control-plane/queue.mjs';

export function attemptJournal(queue) {
  return async ({ name, jobId, claim, state, sessionId }) => {
    if (!/^hc-[0-9a-f-]{36}$/.test(name) || claim?.id !== jobId || !['creating','running','stopped'].includes(state)) throw new ControlError('invalid_attempt');
    if (state === 'creating') {
      await queue.transaction(async db => {
        const { job } = await queue.locked(db, claim);
        if (job.status !== 'running') throw new ControlError('cancelled');
        await db.query('insert into worker_attempts(name,job_id,fence,state) values($1,$2,$3,$4)', [name,jobId,claim.fence,state]);
      });
    } else {
      const result = await queue.pool.query(`update worker_attempts set state=$4,session_id=$5,updated_at=clock_timestamp()
        where name=$1 and job_id=$2 and fence=$3 and state <> 'stopped'`, [name,jobId,claim.fence,state,sessionId]);
      if (result.rowCount !== 1) throw new ControlError('invalid_attempt');
    }
  };
}
