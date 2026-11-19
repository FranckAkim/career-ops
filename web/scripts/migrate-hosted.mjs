import pg from 'pg';
import { createAuth } from '@hosted-career/control-plane/auth.mjs';
import { migrate } from '@hosted-career/control-plane/migrate.mjs';
import { migrateAuth } from '@hosted-career/control-plane/auth-migrate.mjs';

// Explicit operator command. DATABASE_URL must use the migration role; never
// execute this command in an HTTP handler or on every Function startup.
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2, connectionTimeoutMillis: 5000 });
try {
  if (!process.env.DATABASE_URL) throw new Error('configuration_required');
  const auth = createAuth({ pool, origin: process.env.BETTER_AUTH_URL, secret: process.env.BETTER_AUTH_SECRET });
  await migrate(pool);
  await migrateAuth(pool, auth);
  console.log('Hosted database migrations applied.');
} catch {
  console.error('Hosted migration failed; check migration-role configuration and schema compatibility.');
  process.exitCode = 1;
} finally { await pool.end(); }
