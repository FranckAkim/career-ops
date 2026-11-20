import { ControlError, hash } from './queue.mjs';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const kinds = {
  report: { type: 'text/markdown; charset=utf-8', extension: '.md', limit: 2000000, filename: 'evaluation' },
  pdf: { type: 'application/pdf', extension: '.pdf', limit: 20000000, filename: 'cv' },
};
export class Artifacts {
  constructor({ queue, store }) { this.queue = queue; this.store = store; }
  async download({ tenantId, userId, jobId, kind }) {
    const config = kinds[kind];
    if (!config || !Object.hasOwn(kinds, kind) || !uuid.test(jobId)) throw new ControlError('not_found');
    const record = await this.queue.transaction(async db => {
      await this.queue.authorize(db, tenantId, userId);
      // Bind to this job's committed generation, never the tenant's latest
      // mutable pointer. The public caller supplies only an allowlisted kind.
      const { rows: [row] } = await db.query(`select a.path,a.sha256,w.snapshot from jobs j
        join workspace_versions w on w.tenant_id=j.tenant_id and w.job_id=j.id
        join artifacts a on a.tenant_id=j.tenant_id and a.job_id=j.id and a.path=(j.result->>($3::text))
        where j.tenant_id=$1 and j.id=$2 and j.status='succeeded'`, [tenantId,jobId,kind]);
      if (!row || !row.path.endsWith(config.extension)) throw new ControlError('not_found');
      return row;
    });
    if (!this.store) throw new ControlError('storage_configuration_required');
    const bytes = await this.store.readBytes(record.snapshot, record.path, { maxBytes: config.limit });
    if (hash(bytes) !== record.sha256 || (kind === 'pdf' && bytes.subarray(0,5).toString() !== '%PDF-')) throw new ControlError('snapshot_corrupt');
    return new Response(new Uint8Array(bytes), { headers: {
      'Content-Type': config.type,
      'Content-Length': String(bytes.length),
      'Content-Disposition': `attachment; filename="${config.filename}-${jobId}${config.extension}"`,
      'Cache-Control': 'private, no-store', Vary: 'Cookie',
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; sandbox",
    } });
  }
}
