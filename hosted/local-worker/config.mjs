import path from 'node:path';
import {createHash} from 'node:crypto';

export function localConfig(input) {
  if (!input || !/^sha256:[a-f0-9]{64}$/.test(input.image || '') || !/^[a-f0-9]{40}$/.test(input.engineRevision || '') ||
      !path.isAbsolute(input.seccomp || '') || !path.isAbsolute(input.workRoot || '') || !path.isAbsolute(input.credentialFile || '') ||
      !path.isAbsolute(input.vercelCli || '') || !path.isAbsolute(input.projectRoot || '') ||
      !/^[a-z0-9-]+$/.test(input.team || '') || input.project !== 'career-workspace-worker' ||
      !/^prj_[A-Za-z0-9]+$/.test(input.projectId || '')) throw new Error('invalid_local_worker_config');
  if (path.relative(input.workRoot,input.credentialFile).startsWith('..') || path.basename(input.credentialFile).startsWith('.env') === false) throw new Error('unsafe_credential_file');
  const additional=input.additionalImages||{};
  if(input.snapshotInventory!==undefined&&typeof input.snapshotInventory!=='boolean')throw new Error('invalid_local_worker_config');
  if(typeof additional!=='object'||Array.isArray(additional)||Object.keys(additional).length>3||Object.entries(additional).some(([revision,image])=>!/^[a-f0-9]{40}$/.test(revision)||!/^sha256:[a-f0-9]{64}$/.test(image)||revision===input.engineRevision&&image!==input.image))throw new Error('invalid_engine_images');
  const engineImages=Object.freeze({...additional,[input.engineRevision]:input.image});
  return Object.freeze({...input,engineImages,model:'qwen3.5:4b',modelContainer:'career-workspace-local-ai',
    modelBaseUrl:'http://127.0.0.1:11434/v1',timeoutMs:600000,
    namespace:createHash('sha256').update(path.resolve(input.workRoot)).digest('hex').slice(0,32)});
}

export function credentialConfig(env, now=Date.now()) {
  let database,claims;
  try {database=new URL(env.DATABASE_URL);claims=JSON.parse(Buffer.from(env.VERCEL_OIDC_TOKEN.split('.')[1],'base64url').toString());} catch {throw new Error('local_credentials_required');}
  if (!['postgresql:','postgres:'].includes(database.protocol) || decodeURIComponent(database.username)!=='career_worker' ||
      database.searchParams.get('sslmode')!=='verify-full' || !database.hostname.endsWith('.neon.tech') ||
      !/^store_[A-Za-z0-9]+$/.test(env.BLOB_STORE_ID||'') || !Number.isFinite(claims.exp) || claims.exp*1000 < now+25*60*1000) throw new Error('local_credentials_required');
  return {databaseUrl:env.DATABASE_URL,storeId:env.BLOB_STORE_ID,oidcToken:env.VERCEL_OIDC_TOKEN,expiresAt:claims.exp*1000};
}
