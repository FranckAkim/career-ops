import{test}from'node:test';import assert from'node:assert/strict';import path from'node:path';import{localConfig,credentialConfig}from'../config.mjs';
const root=path.resolve('private-test-state');
const input={image:`sha256:${'a'.repeat(64)}`,engineRevision:'b'.repeat(40),seccomp:path.join(root,'seccomp.json'),workRoot:root,credentialFile:path.join(root,'.env.runtime.local'),vercelCli:path.join(root,'vc.js'),projectRoot:path.join(root,'project'),project:'career-workspace-worker',projectId:'prj_synthetic',team:'synthetic-team'};
test('local settings cannot redirect model traffic or select a cloud model',()=>{
 const result=localConfig({...input,model:'paid:cloud',modelBaseUrl:'https://outside.example',modelContainer:'other'});
 assert.equal(result.model,'qwen3.5:4b');assert.equal(result.modelBaseUrl,'http://127.0.0.1:11434/v1');assert.equal(result.modelContainer,'career-workspace-local-ai');assert.equal(result.namespace.length,32);
 assert.throws(()=>localConfig({...input,credentialFile:path.resolve('../outside/.env.local')}),/unsafe_credential/);
 assert.throws(()=>localConfig({...input,image:'mutable:latest'}),/invalid_local/);
 assert.throws(()=>localConfig({...input,snapshotInventory:'true'}),/invalid_local/);
 assert.throws(()=>localConfig({...input,additionalImages:{latest:input.image}}),/invalid_engine_images/);
 assert.throws(()=>localConfig({...input,additionalImages:{[input.engineRevision]:`sha256:${'c'.repeat(64)}`}}),/invalid_engine_images/);
});
test('only a restricted verified-TLS database role and fresh short-lived storage identity are loaded',()=>{
 const now=Date.now(),token=`e30.${Buffer.from(JSON.stringify({exp:Math.floor(now/1000)+7200})).toString('base64url')}.synthetic`;
 const env={DATABASE_URL:'postgresql://career_worker:synthetic@ep-test.neon.tech/db?sslmode=verify-full',BLOB_STORE_ID:'store_synthetic',VERCEL_OIDC_TOKEN:token,GEMINI_API_KEY:'ignored',BLOB_READ_WRITE_TOKEN:'ignored'};
 const result=credentialConfig(env,now);assert.equal(Object.keys(result).length,4);assert.equal(result.databaseUrl,env.DATABASE_URL);
 assert.throws(()=>credentialConfig({...env,DATABASE_URL:env.DATABASE_URL.replace('career_worker','owner')},now),/local_credentials_required/);
 assert.throws(()=>credentialConfig(env,now+7200000),/local_credentials_required/);
});
