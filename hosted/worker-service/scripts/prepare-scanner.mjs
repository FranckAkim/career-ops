import fs from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';
import {init,parse} from 'es-module-lexer';
const service=path.resolve(import.meta.dirname,'..'),repo=path.resolve(service,'../..'),destination=path.join(service,'src/lib/generated/scanner');
export async function prepareScanner(){
 await init;const pending=['tracker-aliases.json','scan-ats-full.mjs','hosted/local-worker/discovery-runner.mjs'],files=new Map(),external=new Set();
 while(pending.length){const relative=pending.pop().replaceAll('\\','/');if(files.has(relative))continue;
  if(relative.startsWith('../')||path.isAbsolute(relative)||(!relative.endsWith('.mjs')&&relative!=='tracker-aliases.json')||/^(?:data|config|modes|documents|output|jds|reports)\//.test(relative))throw Error('unsafe_scanner_dependency');
  const source=path.join(repo,relative);if(!(await fs.lstat(source)).isFile())throw Error('unsafe_scanner_source');const text=await fs.readFile(source,'utf8');files.set(relative,text);
  for(const item of (relative.endsWith('.mjs')?parse(text)[0]:[])){if(!item.n)continue;if(item.n.startsWith('.')){pending.push(path.relative(repo,path.resolve(path.dirname(source),item.n)));}else if(!item.n.startsWith('node:')&&!['fs','path','url','crypto','os','util','http','https','stream','zlib','dns','net','tls','child_process','events','module','assert','readline','buffer','timers','perf_hooks','string_decoder'].includes(item.n.split('/')[0]))external.add(item.n);}
 }
 if([...external].some(name=>!['js-yaml','undici','playwright','dotenv'].includes(name)))throw Error('unexpected_scanner_package:'+JSON.stringify([...external]));
 await fs.mkdir(destination,{recursive:true});const manifest=[];
 for(const [relative,text]of files){const target=path.join(destination,relative);await fs.mkdir(path.dirname(target),{recursive:true});try{if(!(await fs.lstat(target)).isFile())throw Error('unsafe_scanner_target');}catch(e){if(e.code!=='ENOENT')throw e;}await fs.writeFile(target,text);manifest.push({path:relative,sha256:createHash('sha256').update(text).digest('hex')});}
 // No stale/unmanifested code can ride into a later deployment.
 async function inspect(dir){for(const item of await fs.readdir(dir,{withFileTypes:true})){const filename=path.join(dir,item.name);if(item.isDirectory())await inspect(filename);else if(!item.isFile()||!files.has(path.relative(destination,filename).replaceAll('\\','/')))throw Error('unexpected_scanner_file');}}await inspect(destination);
 await fs.writeFile(path.join(service,'.scanner-manifest.json'),JSON.stringify(manifest));console.log(JSON.stringify({scannerFiles:files.size,packages:[...external],personalFiles:0}));
}
