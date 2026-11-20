import { test } from 'node:test';
import assert from 'node:assert/strict';
import { modelProvider } from '../src/lib/provider.mjs';

test('Gemini uses a fixed endpoint/model despite unrelated provider credentials', () => {
  const provider = modelProvider({ GEMINI_API_KEY:'synthetic-key',
    ANTHROPIC_API_KEY:'must-not-use', VERCEL_OIDC_TOKEN:'must-not-use',
    HOSTED_MODEL_BASE_URL:'https://attacker.example', HOSTED_MODEL:'paid-model' });
  assert.deepEqual(provider, {baseUrl:'https://generativelanguage.googleapis.com/v1beta/openai',model:'gemini-3.5-flash-lite',apiKey:'synthetic-key'});
  assert.ok(Object.isFrozen(provider));
});
test('missing Gemini access cannot fall back to paid or subscription credentials', () => {
  for (const key of [undefined, '', ' ', 'key\nheader']) {
    assert.throws(() => modelProvider({GEMINI_API_KEY:key,ANTHROPIC_API_KEY:'synthetic',VERCEL_OIDC_TOKEN:'synthetic'}), /gemini_configuration_required/);
  }
  for (const provider of ['claude-code','anthropic','gateway']) {
    assert.throws(() => modelProvider({HOSTED_MODEL_PROVIDER:provider,GEMINI_API_KEY:'synthetic'}), /unsupported_model_provider/);
  }
});
