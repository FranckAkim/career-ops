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
  } finally {
    try { await lock.query('select pg_advisory_unlock(847291,2)'); }
    finally { lock.release(); }
  }
}
