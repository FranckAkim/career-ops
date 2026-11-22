import {test} from 'node:test';import assert from 'node:assert/strict';
import {discoveryConfigured} from '../src/lib/discovery.mjs';
test('cloud search activation requires the separate search-only database role',()=>{
 const env={HOSTED_DISCOVERY_CLOUD_ENABLED:'1',DISCOVERY_DATABASE_URL:'postgresql://career_discovery:synthetic@synthetic.neon.tech/neondb?sslmode=verify-full'};
 assert.equal(new URL(discoveryConfigured(env)).username,'career_discovery');
 for(const change of [{HOSTED_DISCOVERY_CLOUD_ENABLED:'0'},{DISCOVERY_DATABASE_URL:env.DISCOVERY_DATABASE_URL.replace('career_discovery','career_worker')},{DISCOVERY_DATABASE_URL:env.DISCOVERY_DATABASE_URL.replace('verify-full','require')},{DISCOVERY_DATABASE_URL:env.DISCOVERY_DATABASE_URL.replace('neon.tech','example.test')}])assert.throws(()=>discoveryConfigured({...env,...change}));
});

import {spawn} from 'node:child_process';import path from 'node:path';import {pathToFileURL} from 'node:url';
test('the deployed raw scanner capsule imports with its shipped alias data',async()=>{
 const file=path.resolve(import.meta.dirname,'../src/lib/generated/scanner/hosted/local-worker/discovery-runner.mjs');
 const status=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['--input-type=module','-e',`await import(${JSON.stringify(pathToFileURL(file).href)})`],{windowsHide:true,stdio:'ignore',env:{PATH:process.env.PATH,...(process.env.SystemRoot?{SystemRoot:process.env.SystemRoot}:{})}});child.on('error',reject);child.on('close',resolve);});assert.equal(status,0);
});
