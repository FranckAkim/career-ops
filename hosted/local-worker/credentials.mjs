import fs from 'node:fs/promises';
import path from 'node:path';
import {parseEnv} from 'node:util';
import {spawn} from 'node:child_process';
import {credentialConfig} from './config.mjs';

export function credentialLoader(config) {
  let credentials;
  return async () => {
    if (credentials && credentials.expiresAt>Date.now()+25*60*1000) return credentials;
    const link=JSON.parse(await fs.readFile(path.join(config.projectRoot,'.vercel/project.json'),'utf8'));
    if (link.projectId!==config.projectId) throw new Error('unexpected_linked_project');
    try {if(!(await fs.lstat(config.credentialFile)).isFile())throw new Error('unsafe_credentials');}catch(e){if(e.code!=='ENOENT')throw e;}
    await fs.mkdir(path.dirname(config.credentialFile),{recursive:true,mode:0o700});
    await new Promise((resolve,reject)=>{
      const child=spawn(process.execPath,[config.vercelCli,'env','pull',config.credentialFile,'--environment','development','--yes','--scope',config.team],{
        cwd:config.projectRoot,windowsHide:true,shell:false,stdio:['ignore','pipe','pipe']});
      const timer=setTimeout(()=>{child.kill();reject(new Error('credential_refresh_failed'));},60000);
      child.stdout.resume();child.stderr.resume();child.on('error',()=>{clearTimeout(timer);reject(new Error('credential_refresh_failed'));});
      child.on('close',code=>{clearTimeout(timer);code===0?resolve():reject(new Error('credential_refresh_failed'));});
    });
    const env=parseEnv(await fs.readFile(config.credentialFile,'utf8'));
    credentials=credentialConfig(env);
    // Keep only the runtime role and short-lived storage identity in this file.
    await fs.writeFile(config.credentialFile,`DATABASE_URL=${JSON.stringify(credentials.databaseUrl)}\nBLOB_STORE_ID=${credentials.storeId}\nVERCEL_OIDC_TOKEN=${credentials.oidcToken}\n`,{mode:0o600});
    await fs.chmod(config.credentialFile,0o600);
    return credentials;
  };
}
