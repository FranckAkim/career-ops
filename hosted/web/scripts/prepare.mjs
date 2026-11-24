import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

export const copies = [
  ['src/app/hosted/posting-availability.tsx','src/app/hosted/posting-availability.tsx'],
  ['src/app/hosted/saved-searches.tsx','src/app/hosted/saved-searches.tsx'],
  ['src/app/hosted/job-workflow.tsx','src/app/hosted/job-workflow.tsx'],
  ['src/app/hosted/handshake-import.tsx','src/app/hosted/handshake-import.tsx'],
  ['src/app/hosted/match-explanation.tsx','src/app/hosted/match-explanation.tsx'],
  ...['match-context','machine-summary','machine-summary-section','report-sections','report-tables'].map(name=>[`src/lib/${name}.mjs`,`src/lib/${name}.mjs`]),
  ['src/app/hosted/posting-details.tsx','src/app/hosted/posting-details.tsx'],
  ['src/app/hosted/work-authorization.tsx','src/app/hosted/work-authorization.tsx'],
  ['src/app/hosted/saved-jobs.tsx','src/app/hosted/saved-jobs.tsx'],
  ['src/app/hosted/job-search.tsx','src/app/hosted/job-search.tsx'],
  ['src/app/hosted/job-search.module.css','src/app/hosted/job-search.module.css'],
  ['src/app/hosted/cv-upload.tsx','src/app/hosted/cv-upload.tsx'],
  ['src/app/hosted/cv-upload.module.css','src/app/hosted/cv-upload.module.css'],
  ['src/lib/hosted-cv-import.mjs','src/lib/hosted-cv-import.mjs'],
  ['src/app/hosted/data-controls.tsx','src/app/hosted/data-controls.tsx'],
  ['src/app/hosted/profile-editor.tsx','src/app/hosted/profile-editor.tsx'],
  ['src/app/hosted/applications.tsx','src/app/hosted/applications.tsx'],
  ['src/app/hosted/dashboard.tsx','src/app/hosted/dashboard.tsx'],
  ['src/app/hosted/dashboard.module.css','src/app/hosted/dashboard.module.css'],
  ['src/lib/workspace-summary.mjs','src/lib/workspace-summary.mjs'],
  ['src/app/hosted/privacy/page.tsx','src/app/hosted/privacy/page.tsx'],
  ['src/app/hosted/processing-notice.tsx','src/app/hosted/processing-notice.tsx'],
  ['src/lib/hosted-policy.mjs','src/lib/hosted-policy.mjs'],
  ['src/app/hosted/page.tsx','src/app/hosted/page.tsx'],
  ['src/app/hosted/screen.tsx','src/app/hosted/screen.tsx'],
  ['src/app/hosted/workspace.tsx','src/app/hosted/workspace.tsx'],
  ['src/app/hosted/screen.module.css','src/app/hosted/screen.module.css'],
  ['src/app/api/auth/[...all]/route.ts','src/app/api/auth/[...all]/route.ts'],
  ['src/app/api/hosted/[...path]/route.ts','src/app/api/hosted/[...path]/route.ts'],
  ['src/lib/hosted-server.mjs','src/lib/hosted-server.mjs'],
  ['src/assets/fonts/inter/Inter-Latin-Variable.woff2','src/assets/Inter-Latin-Variable.woff2'],
  ['src/assets/fonts/inter/OFL.txt','src/assets/OFL.txt'],
  ['src/assets/fonts/inter/OFL.txt','public/fonts/Inter-OFL.txt'],
];
const owned = ['src/app/layout.tsx','src/app/globals.css','src/app/page.tsx','src/lib/hosted-mode.mjs'];
export async function assertSourceTree(root) {
  const sourceStat = await fs.lstat(path.join(root,'src'));
  if (!sourceStat.isDirectory() || sourceStat.isSymbolicLink()) throw new Error('Unsafe source root');
  const allowed = new Set([...owned,...copies.map(([,target])=>target)]);
  async function walk(relative) {
    for (const entry of await fs.readdir(path.join(root,relative),{withFileTypes:true})) {
      const name = `${relative}/${entry.name}`;
      if (entry.isDirectory()) await walk(name);
      else if (!entry.isFile() || !allowed.has(name)) throw new Error(`Unapproved hosted source: ${name}`);
    }
  }
  await walk('src');
  try {
    const stat = await fs.lstat(path.join(root,'public'));
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Unsafe public root');
    await walk('public');
  } catch(error) { if(error.code!=='ENOENT') throw error; }
}
async function directory(root, relative) {
  let current = root;
  for (const part of relative.split('/')) {
    current = path.join(current,part);
    try { const stat = await fs.lstat(current); if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Unsafe generated directory'); }
    catch(error) { if(error.code!=='ENOENT') throw error; await fs.mkdir(current); }
  }
}
export async function prepare({ projectRoot, sourceRoot }) {
  const root = await fs.realpath(projectRoot), source = await fs.realpath(sourceRoot);
  await assertSourceTree(root);
  const manifest = [];
  for (const [from,to] of copies) {
    const input = path.join(source,from), target = path.join(root,to);
    const stat = await fs.lstat(input);
    if (!stat.isFile() || stat.isSymbolicLink() || await fs.realpath(input) !== path.resolve(input)) throw new Error('Unsafe shared source');
    await directory(root,path.posix.dirname(to));
    try { const existing = await fs.lstat(target); if (!existing.isFile() || existing.isSymbolicLink()) throw new Error('Unsafe generated target'); }
    catch(error) { if(error.code!=='ENOENT') throw error; }
    const bytes = await fs.readFile(input);
    await fs.writeFile(target,bytes);
    manifest.push({ path:to,sha256:createHash('sha256').update(bytes).digest('hex') });
  }
  const metadata = path.join(root,'.generated-source.json');
  try { const stat = await fs.lstat(metadata); if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Unsafe source manifest'); }
  catch(error) { if(error.code!=='ENOENT') throw error; }
  await fs.writeFile(metadata,JSON.stringify({schema:1,files:manifest},null,2)+'\n');
  await assertSourceTree(root);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const projectRoot = fileURLToPath(new URL('../',import.meta.url));
  await prepare({projectRoot,sourceRoot:fileURLToPath(new URL('../../../web/',import.meta.url))});
  console.log('Prepared allowlisted hosted sources.');
}
