import { test } from 'node:test';
import assert from 'node:assert/strict';
import config from '../next.config.mjs';
test('production entry uses the exact OAuth origin; previews stay independent',async()=>{
 const prior={VERCEL_ENV:process.env.VERCEL_ENV,BETTER_AUTH_URL:process.env.BETTER_AUTH_URL};
 try{
  process.env.VERCEL_ENV='production';process.env.BETTER_AUTH_URL='https://canonical.example';
  assert.deepEqual(await config.redirects(),[{source:'/hosted',missing:[{type:'host',value:'canonical\\.example'}],destination:'https://canonical.example/hosted',permanent:false}]);
  process.env.VERCEL_ENV='preview';assert.deepEqual(await config.redirects(),[]);
  process.env.VERCEL_ENV='production';process.env.BETTER_AUTH_URL='https://example.com/untrusted-path';
  await assert.rejects(config.redirects(),/invalid_canonical_origin/);
 }finally{for(const[key,value]of Object.entries(prior))if(value===undefined)delete process.env[key];else process.env[key]=value;}
});
