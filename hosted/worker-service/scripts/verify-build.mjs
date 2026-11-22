import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'), expected=new Set(['/page','/_not-found/page','/_global-error/page','/api/wake/route','/api/consume/route','/api/sweep/route','/api/discovery/route']);
const routes=JSON.parse(await fs.readFile(path.join(root,'.next/server/app-paths-manifest.json'),'utf8'));
if(Object.keys(routes).some(r=>!expected.has(r)) || !['/api/wake/route','/api/consume/route','/api/sweep/route'].every(r=>routes[r]))throw new Error('unexpected_worker_routes');
let traces=0;const files=new Set();
const ancestors=new Set();for(let p=path.dirname(root);;p=path.dirname(p)){ancestors.add(path.join(p,'package.json'));if(path.dirname(p)===p)break;}
async function walk(directory){
 for(const entry of await fs.readdir(directory,{withFileTypes:true})){
  const filename=path.join(directory,entry.name);
  if(entry.isDirectory())await walk(filename);
  else if(entry.name.endsWith('.nft.json')){
   traces++;const trace=JSON.parse(await fs.readFile(filename,'utf8'));
   for(const relative of trace.files){
    const target=path.resolve(path.dirname(filename),relative),inside=path.relative(root,target),normalized=target.replaceAll('\\','/');
    if((inside.startsWith(`..${path.sep}`)||path.isAbsolute(inside))&&!ancestors.has(target))throw new Error('external_worker_trace');
    if(/\/(?:\.env[^/]*|cv\.md|applications\.md|docker-runner\.mjs|auth-migrate\.mjs|migrate\.mjs)$|\/\.vercel\//.test(normalized))throw new Error('forbidden_worker_trace');
    files.add(target);
   }
  }
 }
}
await walk(path.join(root,'.next/server'));if(!traces)throw new Error('missing_worker_traces');
console.log(JSON.stringify({workerRoutes:Object.keys(routes),traces,uniqueFiles:files.size}));

const manifest=JSON.parse(await fs.readFile(path.join(root,'.scanner-manifest.json'),'utf8'));if(!manifest.length||manifest.some(file=>(!file.path.endsWith('.mjs')&&file.path!=='tracker-aliases.json')||file.path.includes('..')))throw Error('invalid_scanner_manifest');

for(const file of manifest){const bytes=await fs.readFile(path.join(root,'src/lib/generated/scanner',file.path));if(createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw Error('scanner_source_changed');}
