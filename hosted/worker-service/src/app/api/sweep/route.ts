import { authorized, reply } from '../../../lib/authorization.mjs';
import { sweep } from '../../../lib/runtime.mjs';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function GET(request: Request) {
  if (!authorized(request,process.env.CRON_SECRET)) return reply({error:'unauthorized'},401);
  try { await sweep(); return reply({accepted:true},202); } catch { return reply({error:'service_unavailable'},503); }
}
