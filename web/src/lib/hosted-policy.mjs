// Public capabilities only. Credentials never leave the server.
export function executionPolicy(env = process.env) {
  const mode = env.HOSTED_EXECUTION_MODE || 'cloud';
  const cloudReady = /^https:\/\/[a-z0-9.-]+\.vercel\.app$/.test(env.HOSTED_WORKER_URL || '') && env.HOSTED_DISPATCH_SECRET?.length >= 32;
  const ready = mode === 'local' ? env.HOSTED_LOCAL_WORKER_CONFIGURED === '1' : mode === 'cloud' && cloudReady;
  return Object.freeze({ mode: mode === 'local' ? 'local' : mode === 'cloud' ? 'cloud' : 'unavailable',
    jobsEnabled: Boolean(ready && (env.VERCEL !== '1' || env.HOSTED_JOBS_ENABLED === '1')),
    notifyCloud: Boolean(mode === 'cloud' && cloudReady) });
}
