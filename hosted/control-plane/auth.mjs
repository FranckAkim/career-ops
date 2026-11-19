import { betterAuth } from 'better-auth';
import { ControlError } from './queue.mjs';

export function authOptions({ pool, origin, secret, google, vercel = false }) {
  const url = new URL(origin);
  if (url.origin !== origin || url.username || url.password || !(url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost','127.0.0.1'].includes(url.hostname))) || typeof secret !== 'string' || secret.length < 32) throw new ControlError('invalid_auth_config');
  return {
    appName: 'Career Workspace',
    telemetry: { enabled: false },
    database: pool,
    baseURL: origin,
    secret,
    trustedOrigins: [origin],
    emailAndPassword: { enabled: false },
    socialProviders: google ? { google: { clientId: google.clientId, clientSecret: google.clientSecret } } : {},
    user: { modelName: 'auth_users' },
    account: { modelName: 'auth_accounts', accountLinking: { enabled: false } },
    session: { modelName: 'auth_sessions', cookieCache: { enabled: false }, expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
    verification: { modelName: 'auth_verifications' },
    advanced: { database: { generateId: 'uuid' }, useSecureCookies: url.protocol === 'https:',
      ipAddress: { ipAddressHeaders: vercel ? ['x-vercel-forwarded-for'] : [] } },
    rateLimit: { enabled: true, storage: 'database', modelName: 'auth_rate_limits', window: 60, max: 60 },
  };
}
export function createAuth(config) { return betterAuth(authOptions(config)); }
