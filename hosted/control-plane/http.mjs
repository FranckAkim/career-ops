import { ControlError } from './queue.mjs';

export function json(body, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie', 'X-Content-Type-Options': 'nosniff' } });
}
async function body(request, fields) {
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') throw new ControlError('invalid_request');
  let bytes = 0, timedOut = false; const chunks = [];
  const reader = request.body?.getReader();
  if (!reader) throw new ControlError('invalid_request');
  const timer = setTimeout(() => { timedOut = true; reader.cancel().catch(() => {}); }, 10000);
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      bytes += value.length;
      if (bytes > 256000) throw new ControlError('input_limit');
      chunks.push(Buffer.from(value));
    }
    if (timedOut) throw new ControlError('invalid_request');
    let value;
    try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new ControlError('invalid_request'); }
    if (!value || Array.isArray(value) || typeof value !== 'object' || Object.keys(value).some(key => !fields.includes(key))) throw new ControlError('invalid_request');
    return value;
  } finally { clearTimeout(timer); await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export function createApi({ queue, auth, origin, engineRevision }) {
  if (new URL(origin).origin !== origin || !/^[a-f0-9]{40}$/.test(engineRevision)) throw new ControlError('invalid_api_config');
  return async request => {
    try {
      const source = request.headers.get('origin');
      if ((source && source !== origin) || (request.method !== 'GET' && source !== origin) || request.headers.get('sec-fetch-site') === 'cross-site') return json({ error: 'origin_denied' }, 403);
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session) return json({ error: 'unauthorized' }, 401);
      const userId = session.user.id;
      const url = new URL(request.url);
      const segments = url.pathname.split('/').filter(Boolean);
      if (segments[0] !== 'api' || segments[1] !== 'hosted') return json({ error: 'not_found' }, 404);
      const route = segments.slice(2);
      if (request.method === 'GET' && route.join('/') === 'session') return json({ user: { id: userId, name: session.user.name } });
      if (request.method === 'GET' && route.join('/') === 'tenants') return json({ tenants: await queue.tenants({ userId }) });
      const [prefix, tenantId, collection, jobId, action] = route;
      if (prefix !== 'tenants' || route.length > 5) return json({ error: 'not_found' }, 404);
      if (collection === 'jobs' && !jobId) {
        if (request.method === 'GET') return json({ jobs: await queue.list({ tenantId, userId }) });
        if (request.method === 'POST') {
          const input = await body(request, ['operation','postingText','postingUrl','evaluationJobId']);
          const job = await queue.enqueue({ ...input, tenantId, userId, idempotencyKey: request.headers.get('idempotency-key'), engineRevision });
          return json({ job: { id: job.id, status: job.status } }, 202);
        }
      }
      if (collection === 'jobs' && jobId) {
        if (request.method === 'GET' && !action) return json(await queue.read({ tenantId, userId, jobId, after: url.searchParams.get('after') || '0' }));
        if (request.method === 'POST' && action === 'cancel') { await body(request, []); return json({ status: await queue.cancel({ tenantId, userId, jobId }) }); }
      }
      if (collection === 'recovery' && jobId === 'discard' && !action && request.method === 'POST') {
        await body(request, []); await queue.discardRecovery({ tenantId, userId }); return json({ status: 'discarded' });
      }
      return json({ error: 'not_found' }, 404);
    } catch (error) {
      const code = error instanceof ControlError ? error.code : 'service_unavailable';
      const status = code === 'not_found' || code === 'evaluation_not_found' ? 404
        : ['idempotency_conflict','tenant_busy'].includes(code) ? 409 : code === 'input_limit' ? 413 : code === 'service_unavailable' ? 503 : 400;
      return json({ error: code }, status);
    }
  };
}
