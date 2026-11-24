import { authorized, reply } from '../../../lib/authorization.mjs';
import { sweep } from '../../../lib/runtime.mjs';
import {cleanupDiscovery,scheduleSavedSearches} from '../../../lib/discovery.mjs';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function GET(request: Request) {
  if (!authorized(request,process.env.CRON_SECRET)) return reply({error:'unauthorized'},401);
  try {
    if(process.env.HOSTED_DISCOVERY_CLOUD_ENABLED==='1'){await cleanupDiscovery();await scheduleSavedSearches();}
    if(process.env.HOSTED_WORKER_ENABLED==='1')await sweep();
    return reply({accepted:true},202);
  } catch { return reply({error:'service_unavailable'},503); }
}
