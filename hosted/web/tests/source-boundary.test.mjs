import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { copies, prepare, assertSourceTree } from '../scripts/prepare.mjs';
import { hostedMode } from '../src/lib/hosted-mode.mjs';

test('deployment has no local mode and preparation rejects unexpected source',async t=>{
  assert.equal(hostedMode(),true);
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'hc-deploy-test-'));
  t.after(()=>{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('hc-deploy-test-'));return fs.rm(root,{recursive:true,force:true});});
  const projectRoot=path.join(root,'app'),sourceRoot=path.join(root,'source');
  await fs.mkdir(path.join(projectRoot,'src'),{recursive:true});
  for(const [source] of copies) {
    const file=path.join(sourceRoot,source);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,'synthetic source');
  }
  await prepare({projectRoot,sourceRoot});
  assert.equal(await fs.readFile(path.join(projectRoot,'src/lib/hosted-server.mjs'),'utf8'),'synthetic source');
  await fs.mkdir(path.join(projectRoot,'src/app/api/run'),{recursive:true});
  await fs.writeFile(path.join(projectRoot,'src/app/api/run/route.ts'),'unexpected local execution route');
  await assert.rejects(assertSourceTree(projectRoot),/Unapproved hosted source/);
  await assert.rejects(prepare({projectRoot,sourceRoot}),/Unapproved hosted source/);
  await fs.unlink(path.join(projectRoot,'src/app/api/run/route.ts'));
  await fs.writeFile(path.join(projectRoot,'public/private-cv.md'),'synthetic private facts');
  await assert.rejects(prepare({projectRoot,sourceRoot}),/Unapproved hosted source/);
  assert.equal(await fs.readFile(path.join(projectRoot,'public/private-cv.md'),'utf8'),'synthetic private facts');
});

test('preparation refuses source links without touching their target',{skip:process.platform==='win32'},async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'hc-deploy-test-'));
  t.after(()=>{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('hc-deploy-test-'));return fs.rm(root,{recursive:true,force:true});});
  const projectRoot=path.join(root,'app'),sourceRoot=path.join(root,'source');
  await fs.mkdir(path.join(projectRoot,'src/lib'),{recursive:true});
  const outside=path.join(root,'outside.mjs');await fs.writeFile(outside,'must remain untouched');
  await fs.symlink(outside,path.join(projectRoot,'src/lib/hosted-server.mjs'));
  await fs.mkdir(sourceRoot);
  await assert.rejects(prepare({projectRoot,sourceRoot}),/Unapproved hosted source/);
  assert.equal(await fs.readFile(outside,'utf8'),'must remain untouched');
});
