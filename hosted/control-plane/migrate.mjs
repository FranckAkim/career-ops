import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

export async function migrate(pool) {
  const sql = await fs.readFile(new URL('./schema.sql', import.meta.url), 'utf8');
  const checksum = createHash('sha256').update(sql).digest('hex');
  const db = await pool.connect();
  try {
    await db.query('begin');
    await db.query("select pg_advisory_xact_lock(847291, 1)");
    await db.query('create table if not exists hosted_migrations (version integer primary key, checksum text not null)');
    const { rows } = await db.query('select checksum from hosted_migrations where version = 1');
    if (rows.length && rows[0].checksum !== checksum) throw new Error('migration_checksum_changed');
    if (!rows.length) {
      await db.query(sql);
      await db.query('insert into hosted_migrations values (1, $1)', [checksum]);
    }
    await db.query('commit');
  } catch (error) { await db.query('rollback'); throw error; }
  finally { db.release(); }
}
