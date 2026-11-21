import { getMigrations } from 'better-auth/db/migration';

// Operator command/test setup only. Never migrate during an HTTP request.
// This uses the pinned SDK's schema generator; schema changes must be reviewed
// when upgrading that SDK. A separate migration-role pool is required in prod.
export async function migrateAuth(pool, auth) {
  const lock = await pool.connect();
  try {
    await lock.query('select pg_advisory_lock(847291,2)');
    const { runMigrations } = await getMigrations(auth.options);
    await runMigrations();
    // Fresh test/operator installs may create auth tables after application
    // migration 007. Existing production installs get this trigger in 007.
    await lock.query(`do $$ begin
      if to_regprocedure('hosted_auth_session_guard()') is not null and not exists(select 1 from pg_trigger where tgname='lifecycle_auth_session_guard' and tgrelid='auth_sessions'::regclass) then
        execute 'create trigger lifecycle_auth_session_guard before insert or update on auth_sessions for each row execute function hosted_auth_session_guard()';
      end if;
    end $$`);
  } finally {
    try { await lock.query('select pg_advisory_unlock(847291,2)'); }
    finally { lock.release(); }
  }
}
