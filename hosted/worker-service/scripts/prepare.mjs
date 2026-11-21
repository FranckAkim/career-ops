import fs from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(import.meta.dirname,'..');
const copies = [
  ['sandbox-worker/runner.mjs','runner.mjs'], ['sandbox-worker/journal.mjs','journal.mjs'],
  ['workspace-transfer.mjs','workspace-transfer.mjs'],
];
const destination = path.join(root,'src/lib/generated');
await fs.mkdir(destination,{recursive:true});
for (const [source,name] of copies) {
  const filename = path.resolve(root,'..',source);
  if (!(await fs.lstat(filename)).isFile() || !(await fs.lstat(destination)).isDirectory()) throw new Error('unsafe_worker_source');
  let text = await fs.readFile(filename,'utf8');
  text = text.replaceAll("'../workspace-transfer.mjs'", "'./workspace-transfer.mjs'")
    .replaceAll("'../control-plane/queue.mjs'", "'@hosted-career/control-plane/queue.mjs'")
    .replaceAll("'../control-plane/worker-errors.mjs'", "'@hosted-career/control-plane/worker-errors.mjs'");
  const target = path.join(destination,name);
  try { if (!(await fs.lstat(target)).isFile()) throw new Error('unsafe_worker_target'); } catch(error) { if(error.code !== 'ENOENT') throw error; }
  await fs.writeFile(target,text);
}
console.log('Prepared fixed worker SDK sources.');
