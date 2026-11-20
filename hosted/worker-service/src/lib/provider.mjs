// Operator configuration only. Never accept a provider, model or key from jobs.
// A free-tier key must belong to a Google project with billing left disabled.
export function modelProvider(env = process.env) {
  if (env.HOSTED_MODEL_PROVIDER && env.HOSTED_MODEL_PROVIDER !== 'gemini-free') {
    throw new Error('unsupported_model_provider');
  }
  const apiKey = env.GEMINI_API_KEY;
  if (typeof apiKey !== 'string' || !apiKey.trim() || /\s/.test(apiKey)) {
    throw new Error('gemini_configuration_required');
  }
  return Object.freeze({
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-3.5-flash-lite',
    apiKey,
  });
}
