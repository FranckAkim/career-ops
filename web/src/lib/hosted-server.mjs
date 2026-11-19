import 'server-only';
import pg from 'pg';
import { createAuth } from '@hosted-career/control-plane/auth.mjs';
import { Queue } from '@hosted-career/control-plane/queue.mjs';
import { createApi, json } from '@hosted-career/control-plane/http.mjs';
import { hostedMode } from './hosted-mode.mjs';

let services;
function getServices() {
  if (services) return services;
  const required = ['DATABASE_URL','BETTER_AUTH_URL','BETTER_AUTH_SECRET','GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','HOSTED_ENGINE_REVISION'];
  if (required.some(key => !process.env[key])) throw new Error('hosted_configuration_required');
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3, connectionTimeoutMillis: 5000, idleTimeoutMillis: 10000, statement_timeout: 5000 });
  // Idle connection errors must not crash a warm Function; requests surface a
  // sanitized 503. Never log raw connection objects or candidate payloads.
  pool.on('error', () => {});
  const auth = createAuth({ pool, origin: process.env.BETTER_AUTH_URL, secret: process.env.BETTER_AUTH_SECRET, vercel: process.env.VERCEL === '1',
    google: { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET } });
  services = { auth, api: createApi({ queue: new Queue(pool), auth, origin: process.env.BETTER_AUTH_URL, engineRevision: process.env.HOSTED_ENGINE_REVISION }) };
  return services;
}
export async function hostedRequest(request) {
  if (!hostedMode()) return json({ error: 'not_found' }, 404);
  try { return await getServices().api(request); } catch { return json({ error: 'service_unavailable' }, 503); }
}
export async function authRequest(request) {
  if (!hostedMode()) return json({ error: 'not_found' }, 404);
  try {
    const response = await getServices().auth.handler(request);
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  } catch { return json({ error: 'service_unavailable' }, 503); }
}
