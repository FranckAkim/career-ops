import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {Pool,neonConfig} from '@neondatabase/serverless';
import {Queue} from '@hosted-career/control-plane/queue.mjs';
import {Supervisor} from '@hosted-career/control-plane/supervisor.mjs';
import {BlobSnapshotStore} from '@hosted-career/control-plane/blob-snapshots.mjs';
import {dockerRunner} from '@hosted-career/control-plane/docker-runner.mjs';
import {credentialLoader} from './credentials.mjs';

neonConfig.webSocketConstructor=WebSocket;
export function docker(args) {
  return new Promise((resolve,reject)=>{
    const child=spawn('docker',args,{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});
    const chunks=[];let size=0;
    const timer=setTimeout(()=>{child.kill();reject(new Error('docker_operation_failed'));},30000);
    child.stdout.on('data',data=>{size+=data.length;if(size>2000000){child.kill();reject(new Error('docker_output_limit'));}else chunks.push(data);});child.stderr.resume();
    child.on('error',()=>{clearTimeout(timer);reject(new Error('docker_operation_failed'));});
    child.on('close',code=>{clearTimeout(timer);code===0?resolve(Buffer.concat(chunks).toString('utf8')):reject(new Error('docker_operation_failed'));});
  });
}

export async function verifyLocalRuntime(config) {
  const [model]=JSON.parse(await docker(['inspect',config.modelContainer]));
  if (!model.State.Running || model.Config.Labels?.['io.career-workspace.service']!=='local-ai' ||
      !model.Config.Env.includes('OLLAMA_NO_CLOUD=1') ||
      model.Config.Image!=='ollama/ollama@sha256:910d0d8107b538fb0894e63163eb195de0cc7aefcbc666dc62d3b18f71124592') throw new Error('local_model_runtime_required');
  for(const entries of Object.values(model.NetworkSettings.Ports))for(const entry of entries||[])if(!['127.0.0.1','::1'].includes(entry.HostIp))throw new Error('public_model_port_refused');
  const networks=Object.keys(model.NetworkSettings.Networks);
  if(!networks.length)throw new Error('private_model_network_required');
  for(const name of networks){const[network]=JSON.parse(await docker(['network','inspect',name]));if(!network.Internal)throw new Error('private_model_network_required');}
  const [engine]=JSON.parse(await docker(['image','inspect',config.image]));
  if(!engine.Config.Env.includes(`HOSTED_ENGINE_REVISION=${config.engineRevision}`)||!['node','1000','1000:1000'].includes(engine.Config.User))throw new Error('engine_revision_mismatch');
}

async function lockWorker(config) {
  const file=path.join(config.workRoot,'worker.lock');
  try {await fs.writeFile(file,String(process.pid),{flag:'wx',mode:0o600});}
  catch(error){
    if(error.code!=='EEXIST')throw error;
    const prior=(await fs.readFile(file,'utf8')).trim();if(!/^\d+$/.test(prior))throw new Error('local_worker_lock_invalid');
    let alive=true;try{process.kill(Number(prior),0);}catch(e){if(e.code==='ESRCH')alive=false;else throw new Error('local_worker_lock_unavailable');}
    if(alive)throw new Error('local_worker_already_running');
    await fs.unlink(file);await fs.writeFile(file,String(process.pid),{flag:'wx',mode:0o600});
  }
  return async()=>{if((await fs.readFile(file,'utf8')).trim()===String(process.pid))await fs.unlink(file);};
}

export async function runLocalWorker(config,{once=false,signal}={}) {
  await fs.mkdir(config.workRoot,{recursive:true,mode:0o700});
  if(await fs.realpath(config.workRoot)!==path.resolve(config.workRoot))throw new Error('unsafe_local_work_root');
  const unlock=await lockWorker(config);let pool;
  try{
    await verifyLocalRuntime(config);
    // Stop only abandoned containers belonging to this exact worker namespace.
    const prior=(await docker(['ps','-aq','--filter',`label=io.career-workspace.worker=${config.namespace}`])).trim().split(/\s+/).filter(Boolean);
    for(const id of prior){if(!/^[a-f0-9]{12,64}$/.test(id))throw new Error('unexpected_container');const[c]=JSON.parse(await docker(['inspect',id]));if(c.Config.Labels?.['io.career-workspace.worker']!==config.namespace)throw new Error('unexpected_container');await docker(['rm','-f',id]);}
    const load=credentialLoader(config);const credentials=await load();
    pool=new Pool({connectionString:credentials.databaseUrl,max:3,connectionTimeoutMillis:10000});pool.on('error',()=>{});
    const queue=new Queue(pool),store=new BlobSnapshotStore({storeId:credentials.storeId});
    const runner=dockerRunner({image:config.image,seccomp:config.seccomp,network:`container:${config.modelContainer}`,
      provider:{baseUrl:config.modelBaseUrl,model:config.model,apiKey:''},timeoutMs:config.timeoutMs,allowLocalProvider:true,tailoringFormat:'json',workerNamespace:config.namespace});
    const supervisor=new Supervisor({queue,store,runner,workRoot:path.join(config.workRoot,'jobs')});
    console.log('Local AI worker ready; model traffic stays on the isolated local network.');
    do{
      try{
        const current=await load();
        if(current.databaseUrl!==credentials.databaseUrl||current.storeId!==credentials.storeId)throw new Error('runtime_credentials_changed_restart_required');
        // Project credential refresh only, never request/tenant environment switching.
        process.env.BLOB_READ_WRITE_TOKEN='';process.env.VERCEL_OIDC_TOKEN=current.oidcToken;
        await queue.reapExpired();
        const result=await supervisor.runOnce({signal});
        if(result)console.log(JSON.stringify({event:'local_job_finished',jobId:result.jobId,status:result.status}));
        if(once)return result;
        if(!result)await delay(5000,undefined,{signal});
      }catch(error){
        if(signal?.aborted)break;
        console.error('Local worker operation failed; inspect job status or refresh operator credentials.');
        if(once)throw error;
        await delay(10000,undefined,{signal});
      }
    }while(!signal?.aborted);
  }finally{await pool?.end();await unlock();}
}
