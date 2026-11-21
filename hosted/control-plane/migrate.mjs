import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

export async function migrate(pool) {
  const migrations = ['./schema.sql','./migrations/002-onboarding.sql','./migrations/003-artifact-job-index.sql','./migrations/004-worker-attempts.sql','./migrations/005-snapshot-inventory.sql','./migrations/006-storage-reconciliation.sql','./migrations/007-account-lifecycle.sql','./migrations/008-account-purge.sql','./migrations/009-request-drain.sql','./migrations/010-request-review.sql'];
  const db = await pool.connect();
  try {
    await db.query('begin');
    await db.query("select pg_advisory_xact_lock(847291, 1)");
    await db.query('create table if not exists hosted_migrations (version integer primary key, checksum text not null)');
    for (const [index, filename] of migrations.entries()) {
      const version = index + 1;
      const sql = await fs.readFile(new URL(filename, import.meta.url), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const { rows } = await db.query('select checksum from hosted_migrations where version=$1', [version]);
      if (rows.length && rows[0].checksum !== checksum) throw new Error('migration_checksum_changed');
      if (!rows.length) {
        await db.query(sql);
        await db.query('insert into hosted_migrations values ($1,$2)', [version, checksum]);
      }
    }
    await db.query('commit');
  } catch (error) { await db.query('rollback'); throw error; }
  finally { db.release(); }
}
