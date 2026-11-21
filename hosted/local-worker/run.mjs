import fs from 'node:fs/promises';
import path from 'node:path';
import {localConfig} from './config.mjs';
import {runLocalWorker} from './runtime.mjs';

const args=process.argv.slice(2),position=args.indexOf('--config');
if(position<0||!args[position+1])throw new Error('Use --config with a private absolute JSON configuration file.');
const file=path.resolve(args[position+1]);const abort=new AbortController();
process.once('SIGINT',()=>abort.abort());process.once('SIGTERM',()=>abort.abort());
try{await runLocalWorker(localConfig(JSON.parse(await fs.readFile(file,'utf8'))),{once:args.includes('--once'),signal:abort.signal});}
catch{console.error('Local AI worker stopped. Verify its private configuration, Docker runtime and Vercel operator sign-in.');process.exitCode=1;}
