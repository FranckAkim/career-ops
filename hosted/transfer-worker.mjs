import fs from 'node:fs/promises';
import { exportWorkspace, importWorkspace } from './workspace-transfer.mjs';
import { isMainModule } from '../lib/is-main-module.mjs';

// Fixed commands used only by the trusted supervisor, never tenant arguments.
export async function transferWorker(operation, input = process.stdin) {
  if (process.getuid?.() === 0) throw new Error('root_worker_denied');
  if (operation === 'probe') {
    await fs.access('/etc/ssl/certs/ca-certificates.crt');
    return { revision: process.env.HOSTED_ENGINE_REVISION, uid: process.getuid() };
  }
  if (operation === 'export') return exportWorkspace('/tmp/hc-workspace');
  if (operation !== 'import') throw new Error('invalid_transfer_operation');
  const chunks = []; let bytes = 0;
  for await (const chunk of input) {
    bytes += Buffer.byteLength(chunk);
    if (bytes > 32000000) throw new Error('transfer_limit');
    chunks.push(Buffer.from(chunk));
  }
  await importWorkspace('/tmp/hc-workspace', JSON.parse(Buffer.concat(chunks).toString('utf8')));
  return { imported: true };
}
if (isMainModule(import.meta.url)) {
  try { process.stdout.write(JSON.stringify(await transferWorker(process.argv[2]))); }
  catch { process.stderr.write('workspace_transfer_failed\n'); process.exitCode = 1; }
}
