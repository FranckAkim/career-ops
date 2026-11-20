import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { isMainModule } from '../lib/is-main-module.mjs';

export function allowedImageFile(name) {
  if (typeof name !== 'string' || name.includes('\\') || name.split('/').some(p=>!p||p==='.'||p==='..'||p.startsWith('.env')||['node_modules','.next','.vercel','.git'].includes(p))) return false;
  if (/^[^/]+\.mjs$/.test(name) || ['package.json','package-lock.json','VERSION','tracker-aliases.json','hosted/Dockerfile'].includes(name)) return true;
  if (/^hosted\/[^/]+\.mjs$/.test(name) || name==='hosted/package.json') return true;
  if (/^(?:lib|utils|providers|fonts)\//.test(name)) return true;
  if (/^config\/[^/]+\.example\.[^/]+$/.test(name)) return true;
  if (name.startsWith('modes/') && !/^modes\/_(?:profile|custom|brief)\.md$/.test(name)) return true;
  return name.startsWith('templates/') && (!/^templates\/(?:cv-|cover-)/.test(name) || /^templates\/(?:cv-template|cover-letter-template)/.test(name));
}
export async function prepareImageContext(destination) {
  const root = path.resolve(import.meta.dirname,'..');
  if (!path.isAbsolute(destination) || !path.relative(root,destination).startsWith('..')) throw new Error('context_must_be_outside_repository');
  const git = (...args) => {
    const result = spawnSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:4000000});
    if(result.status!==0) throw new Error('image_source_inspection_failed');return result.stdout;
  };
  const revision=git('rev-parse','HEAD').trim();
  const files=git('ls-files','-z').split('\0').filter(allowedImageFile);
  const dirty=new Set(git('diff','--name-only','HEAD').trim().split(/\r?\n/));
  if(files.some(name=>dirty.has(name))) throw new Error('image_source_not_committed');
  await fs.mkdir(destination,{mode:0o700});
  const manifest=[];
  for(const name of files) {
    const source=path.join(root,...name.split('/'));
    for(let p=source;p!==root;p=path.dirname(p)) if((await fs.lstat(p)).isSymbolicLink()) throw new Error('image_source_link');
    if(!(await fs.lstat(source)).isFile()) throw new Error('image_source_not_file');
    const bytes=await fs.readFile(source), target=path.join(destination,...(name==='hosted/Dockerfile'?'Dockerfile':name).split('/'));
    // Only committed non-secret engine code is staged. Docker preserves these
    // modes on Linux; the image's non-root user must be able to read it.
    await fs.mkdir(path.dirname(target),{recursive:true,mode:0o755});await fs.writeFile(target,bytes,{flag:'wx',mode:0o644});
    manifest.push({path:name,sha256:createHash('sha256').update(bytes).digest('hex')});
  }
  await fs.writeFile(path.join(destination,'image-source.json'),JSON.stringify({revision,files:manifest}),{flag:'wx',mode:0o600});
  return {revision,files:manifest.length};
}
if(isMainModule(import.meta.url)) console.log(JSON.stringify(await prepareImageContext(process.argv[2])));
