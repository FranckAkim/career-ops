import test from 'node:test';
import assert from 'node:assert/strict';
import { hostedMode, hostedPathAllowed } from '../src/lib/hosted-mode.mjs';

test('Vercel always enables hosted isolation even if local mode is requested', () => {
  assert.equal(hostedMode({ VERCEL: '1', CAREER_OPS_MODE: 'local' }), true);
  assert.equal(hostedMode({ CAREER_OPS_MODE: 'hosted' }), true);
  assert.equal(hostedMode({}), false);
});
test('hosted allowlist excludes all legacy pages and local file/process APIs', () => {
  for (const pathname of ['/','/pipeline','/api/status','/api/files','/api/ai/evaluate','/api/apply','/api/authentic','/api/hosted-escape']) assert.equal(hostedPathAllowed(pathname), false, pathname);
  for (const pathname of ['/hosted','/api/hosted/session','/api/hosted/tenants','/api/auth/get-session','/api/auth/callback/google']) assert.equal(hostedPathAllowed(pathname), true, pathname);
});
