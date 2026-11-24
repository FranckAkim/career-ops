import path from 'node:path';import os from 'node:os';import fs from 'node:fs/promises';
import pg from 'pg';import {send} from '@vercel/queue';
import {cloudDiscovery,discoveryMessage} from '@hosted-career/control-plane/cloud-discovery.mjs';
import {pathToFileURL} from 'node:url';
// These packages are traced for the raw, fixed scanner child (no browser binary).
import 'js-yaml';import 'undici';import 'dotenv';
export function discoveryConfigured(env=process.env){
 if(env.HOSTED_DISCOVERY_CLOUD_ENABLED!=='1')throw Error('cloud_discovery_disabled');
 const url=new URL(env.DISCOVERY_DATABASE_URL);if(decodeURIComponent(url.username)!=='career_discovery'||!url.hostname.endsWith('.neon.tech')||url.searchParams.get('sslmode')!=='verify-full')throw Error('discovery_role_required');return url.href;
}
export async function wakeDiscovery(value){discoveryConfigured();const id=discoveryMessage(value);await send('career-discovery',{discoveryId:id},{region:'iad1',idempotencyKey:`${id}:${Math.floor(Date.now()/300000)}`,retentionSeconds:3600});}
export async function scheduleSavedSearches(){
 const pool=new pg.Pool({connectionString:discoveryConfigured(),max:1,connectionTimeoutMillis:5000,statement_timeout:5000});pool.on('error',()=>{});
 try{const rows=(await pool.query('select hosted_saved_search_schedule() as id')).rows;const settled=await Promise.allSettled(rows.map(row=>wakeDiscovery({discoveryId:row.id})));if(settled.some(item=>item.status==='rejected'))throw Error('saved_search_dispatch_failed');console.info(JSON.stringify({event:'saved_search_dispatch',count:rows.length}));}finally{await pool.end();}
}
export async function cleanupDiscovery(){
 const pool=new pg.Pool({connectionString:discoveryConfigured(),max:1,connectionTimeoutMillis:5000,statement_timeout:5000});pool.on('error',()=>{});
 try{const removed=(await pool.query('select hosted_discovery_cleanup() as count')).rows[0].count;console.info(JSON.stringify({event:'cloud_discovery_cleanup',removed}));}finally{await pool.end();}
}
export async function consumeDiscovery(value){
 const discoveryId=discoveryMessage(value),connectionString=discoveryConfigured(),pool=new pg.Pool({connectionString,max:2,connectionTimeoutMillis:5000,statement_timeout:5000});pool.on('error',()=>{});
 const workRoot=path.join(os.tmpdir(),'career-discovery');await fs.mkdir(workRoot,{recursive:true});
 try{
  const codeRoot=path.join(process.cwd(),'src/lib/generated/scanner');
  const {runDiscovery}=await import(/* webpackIgnore: true */ pathToFileURL(path.join(codeRoot,'hosted/local-worker/discovery-runner.mjs')).href);
  const result=await cloudDiscovery({pool,discoveryId,runner:options=>runDiscovery({...options,codeRoot,workRoot,timeoutMs:225000})});
  console.info(JSON.stringify({event:'cloud_discovery_finished',...result}));
  await scheduleSavedSearches();
 }catch(error){console.error(JSON.stringify({event:'cloud_discovery_failed',code:error.code||error.name,...(['MODULE_NOT_FOUND','ERR_MODULE_NOT_FOUND'].includes(error.code)?{module:String(error.message).split('\n')[0].slice(0,300)}:{})}));throw error;}finally{await pool.end();}
}
