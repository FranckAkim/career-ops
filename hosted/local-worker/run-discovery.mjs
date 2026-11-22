import fs from 'node:fs/promises';
import path from 'node:path';
import {parseEnv} from 'node:util';
import {setTimeout as delay} from 'node:timers/promises';
import {Pool,neonConfig} from '@neondatabase/serverless';
import {discoveryOnce} from './discovery-runtime.mjs';
import {runDiscovery} from './discovery-runner.mjs';
neonConfig.webSocketConstructor=WebSocket;
const root=path.resolve(import.meta.dirname,'../..'),file=process.argv[process.argv.indexOf('--config')+1];
let pool;
try{
 if(!process.argv.includes('--config')||!path.isAbsolute(file))throw Error('config_required');
 const config=JSON.parse(await fs.readFile(file,'utf8'));if(!path.isAbsolute(config.credentialFile)||!path.isAbsolute(config.workRoot))throw Error('invalid_config');
 const env=parseEnv(await fs.readFile(config.credentialFile,'utf8')),url=new URL(env.DATABASE_URL);if(decodeURIComponent(url.username)!=='career_worker'||!url.hostname.endsWith('.neon.tech')||url.searchParams.get('sslmode')!=='verify-full')throw Error('worker_role_required');
 await fs.mkdir(config.workRoot,{recursive:true});if(await fs.realpath(config.workRoot)!==path.resolve(config.workRoot))throw Error('unsafe_work_root');
 pool=new Pool({connectionString:url.href,max:2,connectionTimeoutMillis:10000});pool.on('error',()=>{});const abort=new AbortController();process.once('SIGTERM',()=>abort.abort());process.once('SIGINT',()=>abort.abort());
 console.log('Built-in ATS discovery worker ready. No CV or model credentials are used.');
 do{try{const result=await discoveryOnce({pool,signal:abort.signal,runner:options=>runDiscovery({...options,codeRoot:root,workRoot:config.workRoot})});if(result)console.log(JSON.stringify({event:'discovery_finished',...result}));if(process.argv.includes('--once'))break;if(!result)await delay(3000,undefined,{signal:abort.signal});}catch{if(abort.signal.aborted)break;console.error('Discovery operation unavailable; retrying.');if(process.argv.includes('--once'))throw Error('discovery_failed');await delay(10000,undefined,{signal:abort.signal});}}while(!abort.signal.aborted);
}catch{console.error('Built-in discovery stopped; check private configuration and database access.');process.exitCode=1;}finally{await pool?.end();}
