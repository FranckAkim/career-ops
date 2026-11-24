import {verifySavedSearchesBrowser} from './saved-searches-browser.mjs';
import {verifyHandshakeBrowser} from './handshake-browser.mjs';
import {verifyMatchingBrowser} from './matching-browser.mjs';
import {verifyAuthorizationBrowser} from './authorization-browser.mjs';
import {verifySavedJobsBrowser} from './saved-jobs-browser.mjs';
import {verifyJobSearch} from './job-search-browser.mjs';
import {verifyCvUploads} from './cv-upload-browser.mjs';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { verifyWorkspace } from './workspace.mjs';

export async function testOrigin() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise(resolve => server.close(resolve));
  return `http://127.0.0.1:${port}`;
}
export async function verifyWebAuth({ pool, origin, secret, accounts, tenant, engineRevision, store, runner, queue, workRoot }) {
  const webRoot = fileURLToPath(new URL(process.env.HOSTED_TEST_APP === 'deployment' ? '../../web/' : '../../../web/', import.meta.url));
  const database = new URL('postgresql://127.0.0.1');
  database.username = pool.options.user; database.password = pool.options.password;
  database.port = String(pool.options.port); database.pathname = `/${pool.options.database}`;
  const child = spawn(process.execPath, [path.join(webRoot, 'node_modules/next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', new URL(origin).port], {
    cwd: webRoot, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore','pipe','pipe'],
    env: { ...process.env, CAREER_OPS_MODE: process.env.HOSTED_TEST_APP === 'deployment' ? 'local' : 'hosted', DATABASE_URL: database.href, BETTER_AUTH_URL: origin, BETTER_AUTH_SECRET: secret,
      // Next loads .env.local automatically. Explicit blanks prevent a linked
      // developer machine from sending synthetic fixtures to live Blob storage.
      BLOB_READ_WRITE_TOKEN: '', BLOB_STORE_ID: '', VERCEL: '',
      HOSTED_SNAPSHOT_INVENTORY_ENABLED:'1',
      HOSTED_ACCOUNT_LIFECYCLE_ENABLED:'1',
      GOOGLE_CLIENT_ID: 'synthetic-client', GOOGLE_CLIENT_SECRET: 'synthetic-secret', HOSTED_ENGINE_REVISION: engineRevision, NEXT_TELEMETRY_DISABLED: '1', HOSTED_DEVELOPMENT_SNAPSHOT_ROOT: store.root },
  });
  child.stdout.resume(); child.stderr.resume();
  let exit;
  const closed = new Promise(resolve => { child.on('error', () => { exit = -1; resolve(); }); child.on('close', code => { exit = code; resolve(); }); });
  let browser;
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      if (exit !== undefined) break;
      try { const response = await fetch(`${origin}/api/hosted/session`); if (response.status === 401) { ready = true; break; } } catch {}
      await new Promise(r => setTimeout(r, 100));
    }
    assert.ok(ready, 'production Next server returns unauthenticated 401');
    if (process.env.HOSTED_TEST_APP === 'deployment') {
      const license = await fetch(`${origin}/fonts/Inter-OFL.txt`);
      assert.equal(license.status,200); assert.ok((await license.text()).includes('SIL OPEN FONT LICENSE'));
    }
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    await context.addCookies(accounts[0].cookie.split('; ').map(pair => {
      const split = pair.indexOf('='); return { name: pair.slice(0, split), value: pair.slice(split + 1), url: origin, httpOnly: true, sameSite: 'Lax' };
    }));
    const page = await context.newPage();
    assert.equal((await page.goto(`${origin}/api/hosted/session`)).status(), 200);
    const outcome = await page.evaluate(async ({ tenant }) => {
      const response = await fetch(`/api/hosted/tenants/${tenant}/jobs`, { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': 'browser-test' }, body: JSON.stringify({ operation: 'evaluate', postingText: 'Synthetic browser Python role.' }) });
      return { status: response.status, data: await response.json() };
    }, { tenant });
    assert.equal(outcome.status, 202);
    const jobId = outcome.data.job.id;
    assert.equal((await pool.query('select requested_by from jobs where id=$1', [jobId])).rows[0].requested_by, accounts[0].id);
    assert.equal((await page.goto(`${origin}/api/status`)).status(), 404);
    assert.equal((await page.goto(`${origin}/pipeline`)).status(), 404);
    assert.equal((await page.goto(`${origin}/`)).status(), 200);
    assert.equal(new URL(page.url()).pathname, '/hosted');
    await page.getByLabel('Full name', { exact: true }).waitFor();
    await verifyCvUploads(page);
    await page.getByLabel('Full name', { exact: true }).fill('Synthetic Alpha');
    await page.getByLabel('CV text', { exact: true }).fill('# Synthetic Alpha\n\n## Experience\n\n### Example Labs — Remote\n**Software Engineer**\n2022–2025\n\n- Built internal reporting tools with Python.\n- Led a team of 4 engineers.\n');
    await page.getByRole('button', { name: 'Review profile', exact: true }).click();
    await page.getByRole('heading', { name: 'Check the details.' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Confirm and create workspace' }).isDisabled(), true);
    await page.getByRole('button', { name: 'Edit profile', exact: true }).click();
    await page.getByLabel('Target role', { exact: false }).fill('Backend Engineer');
    await page.getByRole('button', { name: 'Review profile', exact: true }).click();
    await page.getByRole('heading', { name: 'Check the details.' }).waitFor();
    if (process.env.HOSTED_TEST_SCREENSHOTS) {
      await fs.mkdir(process.env.HOSTED_TEST_SCREENSHOTS, { recursive: true });
      await page.screenshot({ path: path.join(process.env.HOSTED_TEST_SCREENSHOTS, 'onboarding-review.png'), fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: path.join(process.env.HOSTED_TEST_SCREENSHOTS, 'onboarding-mobile.png'), fullPage: true });
      await page.setViewportSize({ width: 1280, height: 720 });
    }
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Confirm and create workspace' }).click();
    await page.getByRole('heading', { name: 'Your next move, in focus.', exact:true }).waitFor();
    await verifyJobSearch(page);
    await verifySavedSearchesBrowser({page,pool,userId:accounts[0].id});
    await verifyHandshakeBrowser({page,pool,userId:accounts[0].id});
    await verifySavedJobsBrowser({page,pool,userId:accounts[0].id});
    await verifyAuthorizationBrowser(page);
    await verifyMatchingBrowser({page,pool,userId:accounts[0].id});
    const personal = (await pool.query('select t.snapshot from personal_workspaces p join tenants t on p.tenant_id=t.id where p.user_id=$1', [accounts[0].id])).rows[0];
    assert.ok((await store.read(personal.snapshot, 'cv.md')).includes('Synthetic Alpha'));
    await page.reload();
    await page.getByRole('heading', { name: 'Your next move, in focus.', exact:true }).waitFor();
    await page.getByRole('button',{name:'My Profile',exact:true}).click();await page.getByRole('button',{name:'Edit profile',exact:true}).click();
    await page.getByLabel('Upload your CV',{exact:true}).setInputFiles({name:'replacement.txt',mimeType:'text/plain',buffer:Buffer.from('Synthetic replacement source for upload review only.')});
    await page.waitForFunction(()=>[...document.querySelectorAll('textarea')].some(t=>t.value.includes('Synthetic replacement source')));
    assert.match(await page.getByLabel('Source CV',{exact:true}).inputValue(),/Synthetic replacement source/);
    await page.getByRole('button',{name:'Cancel changes',exact:true}).click();assert.ok((await store.read(personal.snapshot,'cv.md')).includes('Synthetic Alpha'));console.log('PASS profile-editor file import is reviewable and cancellation preserves confirmed source');
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    const cancellation = await page.evaluate(async ({ tenant, jobId }) => {
      const response = await fetch(`/api/hosted/tenants/${tenant}/jobs/${jobId}/cancel`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      return { status: response.status, data: await response.json() };
    }, { tenant, jobId });
    assert.equal(cancellation.status, 200); assert.equal(cancellation.data.status, 'cancelled');
    let pdfUrl;
    if (runner) {
      await page.setViewportSize({width:1280,height:720});
      pdfUrl = await verifyWorkspace({page,pool,queue,store,runner,workRoot,userId:accounts[0].id,origin});
    }
    const other = await browser.newContext();
    await other.addCookies(accounts[1].cookie.split('; ').map(pair => {
      const split = pair.indexOf('='); return { name: pair.slice(0, split), value: pair.slice(split + 1), url: origin, httpOnly: true, sameSite: 'Lax' };
    }));
    const otherPage = await other.newPage();
    assert.equal((await otherPage.goto(`${origin}/api/hosted/tenants/${tenant}/jobs/${jobId}`)).status(), 404);
    if (pdfUrl) assert.equal((await other.request.get(pdfUrl)).status(),404);
    const{rows:[personalWorkspace]}=await pool.query('select tenant_id from personal_workspaces where user_id=$1',[accounts[0].id]);
    if(personalWorkspace)assert.equal((await other.request.get(`${origin}/api/hosted/tenants/${personalWorkspace.tenant_id}/profile`)).status(),404);
    if(personalWorkspace)assert.equal((await other.request.get(`${origin}/api/hosted/tenants/${personalWorkspace.tenant_id}/data-controls/export`)).status(),404);
    const guest = await browser.newContext();
    const guestPage = await guest.newPage();
    await guestPage.goto(`${origin}/hosted`);
    await guestPage.getByRole('button', { name: 'Continue with Google' }).waitFor();
    if (pdfUrl) assert.equal((await guest.request.get(pdfUrl)).status(),401);
    if(personalWorkspace)assert.equal((await guest.request.get(`${origin}/api/hosted/tenants/${personalWorkspace.tenant_id}/profile`)).status(),401);
    if(personalWorkspace)assert.equal((await guest.request.get(`${origin}/api/hosted/tenants/${personalWorkspace.tenant_id}/data-controls/export`)).status(),401);
    console.log('PASS browser onboarding edit/review/confirmation, reload/mobile layout, auth/tenant DB and enqueue/cancel; legacy routes blocked');
  } finally {
    if (browser) await browser.close();
    if (child.pid && exit === undefined) {
      if (process.platform === 'win32') await new Promise(resolve => {
        const killer = spawn(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        killer.on('error', () => { child.kill(); resolve(); }); killer.on('close', resolve);
      });
      else { try { process.kill(-child.pid, 'SIGTERM'); } catch {} }
    }
    await closed;
  }
}
