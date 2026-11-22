import { authorized, reply } from '../../../lib/authorization.mjs';
import {wakeDiscovery} from '../../../lib/discovery.mjs';
import { wake } from '../../../lib/runtime.mjs';
export const runtime = 'nodejs';
export const maxDuration = 30;
export async function POST(request: Request) {
  if (!authorized(request,process.env.HOSTED_DISPATCH_SECRET)) return reply({error:'unauthorized'},401);
  try {
    // Only a notification; never accept a tenant, workspace or worker command.
    const text = await request.text();
    if (text.length > 256) return reply({error:'invalid_request'},400);
    const body = JSON.parse(text);
    if(Object.keys(body).length===1&&Object.hasOwn(body,'discoveryId')){await wakeDiscovery(body);return reply({accepted:true},202);}
    if (Object.keys(body).length !== 1 || !/^[a-f0-9-]{36}$/.test(body.jobId)) return reply({error:'invalid_request'},400);
    await wake(body.jobId); return reply({accepted:true},202);
  } catch { return reply({error:'service_unavailable'},503); }
}
