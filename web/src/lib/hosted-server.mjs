import {deletionRequestPolicy} from '@hosted-career/control-plane/deletion-policy.mjs';
import {snapshotEnvironment} from '@hosted-career/control-plane/snapshot-policy.mjs';
import {randomUUID} from 'node:crypto';
import 'server-only';
import pg from 'pg';
import { createAuth } from '@hosted-career/control-plane/auth.mjs';
import { Queue } from '@hosted-career/control-plane/queue.mjs';
import { createApi, json } from '@hosted-career/control-plane/http.mjs';
import { hostedMode } from './hosted-mode.mjs';
import { executionPolicy } from './hosted-policy.mjs';
import { Onboarding } from '@hosted-career/control-plane/onboarding.mjs';
import { BlobSnapshotStore } from '@hosted-career/control-plane/blob-snapshots.mjs';
import { SnapshotStore } from '@hosted-career/control-plane/snapshots.mjs';
import { Artifacts } from '@hosted-career/control-plane/artifacts.mjs';
import {SnapshotInventory} from '@hosted-career/control-plane/snapshot-inventory.mjs';
import {accountBlocked} from '@hosted-career/control-plane/account-lifecycle.mjs';

const requestInstanceId=randomUUID();
let services;
function getServices() {
  if (services) return services;
  const required = ['DATABASE_URL','BETTER_AUTH_URL','BETTER_AUTH_SECRET','GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','HOSTED_ENGINE_REVISION'];
  if (required.some(key => !process.env[key])) throw new Error('hosted_configuration_required');
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3, connectionTimeoutMillis: 5000, idleTimeoutMillis: 10000, statement_timeout: 5000 });
  // Idle connection errors must not crash a warm Function; requests surface a
  // sanitized 503. Never log raw connection objects or candidate payloads.
  pool.on('error', () => {});
  const lifecycleEnabled=process.env.HOSTED_ACCOUNT_LIFECYCLE_ENABLED==='1';
  const auth = createAuth({ pool, origin: process.env.BETTER_AUTH_URL, secret: process.env.BETTER_AUTH_SECRET, vercel: process.env.VERCEL === '1',accountLifecycle:lifecycleEnabled,
    google: { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET } });
  const inventoryEnabled=process.env.HOSTED_SNAPSHOT_INVENTORY_ENABLED==='1',snapshotOptions=snapshotEnvironment(process.env);
  const queue = new Queue(pool, { maxDailyJobs: process.env.VERCEL === '1' ? 10 : 0,snapshotInventory:inventoryEnabled,accountLifecycle:lifecycleEnabled });
  const inventory=inventoryEnabled?new SnapshotInventory({queue}):undefined;
  const workerUrl = process.env.HOSTED_WORKER_URL, workerSecret = process.env.HOSTED_DISPATCH_SECRET;
  const policy = executionPolicy();
  const notifyQueue = policy.notifyCloud ? async jobId => {
    const response = await fetch(`${workerUrl}/api/wake`, { method: 'POST', headers: { Authorization: `Bearer ${workerSecret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId }), signal: AbortSignal.timeout(5000), redirect: 'error' });
    if (!response.ok) throw new Error('worker_notification_failed');
  } : undefined;
  const notifyDiscovery=process.env.HOSTED_DISCOVERY_CLOUD_ENABLED==='1'?async discoveryId=>{
    if(!/^https:\/\/[a-z0-9.-]+\.vercel\.app$/.test(workerUrl||'')||!workerSecret||workerSecret.length<32)throw Error('discovery_dispatch_required');
    const response=await fetch(`${workerUrl}/api/wake`,{method:'POST',headers:{Authorization:`Bearer ${workerSecret}`,'content-type':'application/json'},body:JSON.stringify({discoveryId}),signal:AbortSignal.timeout(5000),redirect:'error'});if(!response.ok)throw Error('discovery_dispatch_failed');
  }:undefined;
  let store;
  if (process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN) store = new BlobSnapshotStore({ ...snapshotOptions,storeId: process.env.BLOB_STORE_ID, token: process.env.BLOB_READ_WRITE_TOKEN });
  else if (process.env.VERCEL !== '1' && process.env.HOSTED_DEVELOPMENT_SNAPSHOT_ROOT) store = new SnapshotStore(process.env.HOSTED_DEVELOPMENT_SNAPSHOT_ROOT,snapshotOptions);
  services = { auth,pool,lifecycleEnabled, api: createApi({ queue, auth, onboarding: new Onboarding({ queue, store,inventory }), artifacts: new Artifacts({ queue, store }), origin: process.env.BETTER_AUTH_URL, engineRevision: process.env.HOSTED_ENGINE_REVISION,
    requestCompletion:process.env.VERCEL_PROJECT_ID?{projectId:process.env.VERCEL_PROJECT_ID,secret:process.env.BETTER_AUTH_SECRET,report:receipt=>console.info(receipt)}:null,requestDrainEnabled:process.env.HOSTED_REQUEST_DRAIN_ENABLED==='1',requestDeploymentId:process.env.VERCEL_DEPLOYMENT_ID||null,requestInstanceId:process.env.VERCEL_DEPLOYMENT_ID?requestInstanceId:null,notifyQueue,notifyDiscovery, jobsEnabled: policy.jobsEnabled,applicationsEnabled:process.env.VERCEL!=='1'||process.env.HOSTED_APPLICATIONS_ENABLED==='1',profileEditingEnabled:process.env.VERCEL!=='1'||process.env.HOSTED_PROFILE_EDITING_ENABLED==='1',deletionRequestsEnabled:deletionRequestPolicy(process.env),dataControlsEnabled:process.env.VERCEL!=='1'||process.env.HOSTED_DATA_CONTROLS_ENABLED==='1' }) };
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
export async function hostedSession(headers) {
  if (!hostedMode()) return { user: null, unavailable: true };
  try {
    const session = await getServices().auth.api.getSession({ headers });
    if(session&&getServices().lifecycleEnabled&&await accountBlocked(getServices().pool,session.user.id))return {user:null,unavailable:false};
    return { user: session ? { id: session.user.id, name: session.user.name } : null, unavailable: false };
  } catch { return { user: null, unavailable: true }; }
}
