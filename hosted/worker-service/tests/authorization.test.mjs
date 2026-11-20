import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authorized } from '../src/lib/authorization.mjs';
test('worker invocation requires the configured server credential', () => {
  const secret = 'synthetic-'.repeat(8);
  const request = token => new Request('https://worker.example/api/wake',{headers:{authorization:token}});
  assert.equal(authorized(request(`Bearer ${secret}`),secret),true);
  for (const token of ['', 'Bearer wrong', `bearer ${secret}`, 'a'.repeat(1000)]) assert.equal(authorized(request(token),secret),false);
  assert.equal(authorized(request(`Bearer ${secret}`),''),false);
});
