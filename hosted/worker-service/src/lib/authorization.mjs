import { createHash, timingSafeEqual } from 'node:crypto';
export function authorized(request, secret) {
  if (typeof secret !== 'string' || secret.length < 32) return false;
  const header = request.headers.get('authorization') || '';
  if (header.length > 256) return false;
  const digest = value => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`));
}
export const reply = (value, status = 200) => Response.json(value, { status, headers: { 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' } });
