import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { betterAuth } from 'better-auth';
import { authOptions } from '../auth.mjs';
import { migrateAuth } from '../auth-migrate.mjs';
import { createApi } from '../http.mjs';
import { testOrigin, verifyWebAuth } from './web-auth.mjs';
import { Onboarding } from '../onboarding.mjs';
import { Artifacts } from '../artifacts.mjs';

export async function verifyAuthHttp({ pool, queue, snapshot, engineRevision, store, runner, workRoot }) {
  const origin = process.env.HOSTED_TEST_WEB === '1' ? await testOrigin() : 'http://localhost:3000';
  const secret = randomBytes(32).toString('hex');
  const options = authOptions({ pool, origin, secret });
  assert.equal(options.emailAndPassword.enabled, false);
  assert.equal(options.telemetry.enabled, false);
  assert.equal(options.account.encryptOAuthTokens, true);
  // Password signup is enabled only in this synthetic test instance. Production
  // configuration exposes Google OAuth and no password/signup/test bypass.
  const auth = betterAuth({ ...options, emailAndPassword: { enabled: true } });
  await migrateAuth(pool, auth); await migrateAuth(pool, auth);
  const accounts = [];
  for (const name of ['Alpha','Beta']) {
    const response = await auth.handler(new Request(`${origin}/api/auth/sign-up/email`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin },
      body: JSON.stringify({ name: `Synthetic ${name}`, email: `${name.toLowerCase()}@example.test`, password: 'Synthetic-only-password-123!' }),
    }));
    assert.equal(response.status, 200);
    const value = await response.json();
    assert.match(value.user.id, /^[a-f0-9-]{36}$/);
    const cookies = response.headers.getSetCookie();
    assert.ok(cookies.some(c => /HttpOnly/i.test(c) && /SameSite=Lax/i.test(c)));
    accounts.push({ id: value.user.id, cookie: cookies.map(c => c.split(';')[0]).join('; ') });
  }
  const api = createApi({ queue, auth, origin, engineRevision, onboarding: new Onboarding({ queue, store }), artifacts: new Artifacts({ queue, store }) });
  const call = (route, { account = accounts[0], method = 'GET', data, headers = {} } = {}) => api(new Request(`${origin}/api/hosted/${route}`, {
    method, headers: { ...(account ? { cookie: account.cookie } : {}), ...(method === 'POST' ? { origin, 'content-type': 'application/json' } : {}), ...headers },
    ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
  }));
  assert.equal((await call('session', { account: null })).status, 401);
  assert.equal((await call('session', { headers: { cookie: 'better-auth.session_token=forged' } })).status, 401);
  assert.equal((await call('session')).status, 200);
  const tenant = await queue.provision({ userId: accounts[0].id, snapshot });
  const foreign = await queue.provision({ userId: accounts[1].id, snapshot });
  const tenantList = await (await call('tenants')).json();
  assert.deepEqual(tenantList.tenants.map(t => t.id), [tenant]);
  assert.equal((await call(`tenants/${foreign}/jobs`)).status, 404);
  const route = `tenants/${tenant}/jobs`;
  const input = { operation: 'evaluate', postingText: 'Synthetic Python role.' };
  const headers = { 'idempotency-key': 'http-test' };
  const accepted = await call(route, { method: 'POST', data: input, headers });
  assert.equal(accepted.status, 202);
  assert.equal(accepted.headers.get('cache-control'), 'private, no-store');
  const { job } = await accepted.json();
  assert.equal((await (await call(route, { method: 'POST', data: input, headers })).json()).job.id, job.id);
  assert.equal((await call(route, { method: 'POST', data: { ...input, postingText: 'Changed' }, headers })).status, 409);
  assert.equal((await call(`tenants/${tenant}/jobs/${job.id}`, { account: accounts[1] })).status, 404);
  assert.equal((await call(route, { method: 'POST', data: input, headers: { ...headers, origin: 'https://attacker.example' } })).status, 403);
  assert.equal((await call(route, { method: 'POST', data: input, headers: { ...headers, origin: '' } })).status, 403);
  assert.equal((await call(route, { method: 'POST', data: { ...input, userId: accounts[1].id }, headers })).status, 400);
  assert.equal((await call(route, { method: 'POST', data: { ...input, workspace: '/tmp/arbitrary' }, headers })).status, 400);
  assert.equal((await call(route, { method: 'POST', data: { ...input, postingText: 'x'.repeat(260000) }, headers })).status, 413);
  const cancellation = await call(`${route}/${job.id}/cancel`, { method: 'POST', data: {} });
  assert.equal((await cancellation.json()).status, 'cancelled');
  const read = await (await call(`${route}/${job.id}`)).json();
  assert.equal(read.events.at(-1).kind, 'cancelled');
  const onboardingDraft = await call('onboarding/drafts', { method: 'POST', data: { fullName: 'Synthetic Alpha', cvMarkdown: '# Synthetic Alpha\n\nConfirmed synthetic source.' } });
  assert.equal(onboardingDraft.status, 201);
  const { draft } = await onboardingDraft.json();
  assert.equal((await call(`onboarding/drafts/${draft.id}`, { account: accounts[1] })).status, 404);
  assert.equal((await call(`onboarding/drafts/${draft.id}/confirm`, { method: 'POST', data: { expectedHash: draft.review_hash, acknowledged: false } })).status, 400);
  if (process.env.HOSTED_TEST_WEB === '1') {
    assert.equal((await call('onboarding/drafts',{method:'POST',data:{fullName:'Synthetic unused draft',cvMarkdown:'# Synthetic unused draft\n\nUnused source.'}})).status,201);
    await verifyWebAuth({ pool, origin, secret, accounts, tenant, engineRevision, store, runner, queue, workRoot });
  }
  else {
    const confirmed = await call(`onboarding/drafts/${draft.id}/confirm`, { method: 'POST', data: { expectedHash: draft.review_hash, acknowledged: true } });
    assert.equal(confirmed.status, 200);
  }
  await pool.query('delete from auth_sessions where "userId"=$1', [accounts[0].id]);
  assert.equal((await call('session')).status, 401);
  // Remove the other synthetic session too; never leave an unclaimed queued
  // job that could interfere with subsequent worker integration checks.
  await pool.query('delete from auth_sessions where "userId"=$1', [accounts[1].id]);
  console.log('PASS real DB-backed auth cookies, revocation, HTTP authorization, CSRF, bounded inputs and idempotency');
}
