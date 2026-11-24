import {SavedSearches} from './saved-searches.mjs';
import {SavedJobs} from './saved-jobs.mjs';
import {Discovery} from './discovery.mjs';
import {DeletionRequest} from './deletion-request.mjs';
import {RequestDrain} from './request-drain.mjs';
import { ControlError } from './queue.mjs';
import {Profiles} from './profiles.mjs';
import {DataControls} from './data-controls.mjs';
import {assertAccountActive} from './account-lifecycle.mjs';

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

export function createApi({ queue, auth, origin, engineRevision, onboarding, artifacts, notifyQueue, notifyDiscovery, jobsEnabled = true,applicationsEnabled=true,profileEditingEnabled=true,dataControlsEnabled=true,deletionRequestsEnabled=false,requestDrainEnabled=false,requestDeploymentId=null,requestInstanceId=null,requestCompletion=null }) {
  if (new URL(origin).origin !== origin || !/^[a-f0-9]{40}$/.test(engineRevision)) throw new ControlError('invalid_api_config');
  const handle = async (request,register) => {
    try {
      const source = request.headers.get('origin');
      if ((source && source !== origin) || (request.method !== 'GET' && source !== origin) || request.headers.get('sec-fetch-site') === 'cross-site') return json({ error: 'origin_denied' }, 403);
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session) return json({ error: 'unauthorized' }, 401);
      const userId = session.user.id;
      if(register)await register(userId);
      if(queue.accountLifecycle)await assertAccountActive(queue.pool,userId);
      const url = new URL(request.url);
      const segments = url.pathname.split('/').filter(Boolean);
      if (segments[0] !== 'api' || segments[1] !== 'hosted') return json({ error: 'not_found' }, 404);
      const route = segments.slice(2);
      if (request.method === 'GET' && route.join('/') === 'session') return json({ user: { id: userId, name: session.user.name } });
      if (request.method === 'GET' && route.join('/') === 'tenants') return json({ tenants: await queue.tenants({ userId }) });
      if (route[0] === 'onboarding' && onboarding) {
        if (route.join('/') === 'onboarding/drafts' && request.method === 'GET') return json({ drafts: await onboarding.list(userId) });
        if (route.join('/') === 'onboarding/status' && request.method === 'GET') return json({ workspace: await onboarding.existing(userId) || null });
        if (route.join('/') === 'onboarding/drafts' && request.method === 'POST') return json({ draft: await onboarding.create({ userId, profile: await body(request, ['fullName','cvMarkdown','targetRole','language']) }) }, 201);
        if (route[1] === 'drafts' && route[2] && route.length === 3 && request.method === 'GET') return json({ draft: await onboarding.read({ userId, draftId: route[2] }) });
        if (route[1] === 'drafts' && route[2] && route.length === 4 && request.method === 'POST') {
          if (route[3] === 'update') {
            const input = await body(request, ['expectedHash','profile']);
            return json({ draft: await onboarding.update({ userId, draftId: route[2], ...input }) });
          }
          if (route[3] === 'confirm') {
            const input = await body(request, ['expectedHash','acknowledged']);
            return json(await onboarding.confirm({ userId, draftId: route[2], ...input }));
          }
        }
        return json({ error: 'not_found' }, 404);
      }
      const [prefix, tenantId, collection, jobId, action] = route;
      if (prefix !== 'tenants' || route.length > 5) return json({ error: 'not_found' }, 404);
      if(collection==='saved-searches'){const service=new SavedSearches(queue),actor={tenantId,userId};if(route.length===3&&request.method==='GET')return json({searches:await service.list(actor)});if(route.length===3&&request.method==='POST')return json({search:await service.create({...actor,...await body(request,['name','input','daily'])})},201);if(route.length===5&&request.method==='POST'){const value=await service.mutate({...actor,id:jobId,action,...await body(request,action==='daily'?['expectedRevision','daily']:['expectedRevision'])});if(action==='run'){if(notifyDiscovery&&value.state==='queued')await notifyDiscovery(value.id).catch(()=>{});return json(value,202);}return json(value);}}
      if(collection==='saved-jobs'){const service=new SavedJobs(queue),actor={tenantId,userId};if(route.length===3&&request.method==='GET')return json({jobs:await service.list(actor)});if(route.length===4&&jobId==='import-handshake'&&request.method==='POST')return json({job:await service.importHandshake({...actor,input:await body(request,['url','title','company','location','description','acknowledged'])})},201);if(route.length===3&&request.method==='POST')return json({job:await service.save({...actor,...await body(request,['runId','jobId'])})},201);if(route.length===5&&jobId&&request.method==='POST'){if(action==='evaluate'){if(!jobsEnabled)throw new ControlError('service_unavailable');const input=await body(request,['expectedRevision']);const job=await service.evaluate({...actor,id:jobId,...input,engineRevision});if(job.status==='queued'&&notifyQueue)await notifyQueue(job.id).catch(()=>{});return json({job:{id:job.id,status:job.status}},202);}if(action==='workflow')return json({job:await service.workflow({...actor,id:jobId,...await body(request,['expectedRevision','workflow'])})});if(action==='shortlist')return json({job:await service.update({...actor,id:jobId,...await body(request,['expectedRevision','shortlisted'])})});if(action==='remove')return json(await service.remove({...actor,id:jobId,...await body(request,['expectedRevision'])}));}}
      if(collection==='discovery'&&route.length<=5){const service=new Discovery(queue),actor={tenantId,userId};if(!jobId&&request.method==='GET'){const run=await service.latest(actor);if(notifyDiscovery&&run?.state==='queued')await notifyDiscovery(run.id).catch(()=>{});return json({run});};if(!jobId&&request.method==='POST'){const run=await service.start({...actor,input:await body(request,['q','location','workplace','sinceDays','limitPerAts','authorization','includeUnknown','titleMatch','coverage','strictAuthorization','targeting'])});if(notifyDiscovery&&run.state==='queued')await notifyDiscovery(run.id).catch(()=>{});return json(run,202);};if(jobId&&!action&&request.method==='GET'){const run=await service.read({...actor,id:jobId});if(notifyDiscovery&&run.state==='queued')await notifyDiscovery(run.id).catch(()=>{});return json(run);};if(jobId&&action==='cancel'&&request.method==='POST'){await body(request,[]);return json(await service.cancel({...actor,id:jobId}));}}
      if(collection==='data-controls'&&dataControlsEnabled&&onboarding){
        const controls=new DataControls({queue,store:onboarding.store}),input={tenantId,userId};
        if(deletionRequestsEnabled&&jobId==='account-deletion'&&route.length===4){const service=new DeletionRequest({queue}),actor={userId,tenantId,sessionId:session.session.id};if(request.method==='GET')return json(await service.preview(actor));if(request.method==='POST')return json(await service.request({...await body(request,['scopeHash','acknowledged','confirmation']),...actor}),202);}
        if(route.length===3&&request.method==='GET')return json({...await controls.summary(input),deletionRequestsAvailable:deletionRequestsEnabled});
        if(route.length===4&&jobId==='export'&&request.method==='GET')return await controls.export(input);
        if(route.length===4&&jobId==='discard-drafts'&&request.method==='POST')return json(await controls.discardDrafts({...await body(request,['expectedDrafts','acknowledged']),...input}));
      }
      if(collection==='profile'&&profileEditingEnabled&&onboarding){
        const profiles=new Profiles({queue,store:onboarding.store,inventory:onboarding.inventory});
        if(route.length===3&&request.method==='GET')return json(await profiles.read({tenantId,userId}));
        if(route.length===4&&jobId==='review'&&request.method==='POST'){
          await queue.authorize(queue.pool,tenantId,userId,true);
          const input=await body(request,['profile']);return json(profiles.review(input.profile));
        }
        if(route.length===4&&jobId==='confirm'&&request.method==='POST'){
          const input=await body(request,['profile','expectedHash','expectedGeneration','reviewedHash','acknowledged']);
          return json(await profiles.save({...input,tenantId,userId}));
        }
      }
      if(collection==='applications'&&route.length===3&&request.method==='GET'&&applicationsEnabled)return json(await queue.applications({tenantId,userId}));
      if (collection === 'artifacts' && jobId && action && request.method === 'GET' && artifacts) return await artifacts.download({ tenantId, userId, jobId, kind: action });
      if (collection === 'jobs' && !jobId) {
        if (request.method === 'GET') return json({ jobs: await queue.list({ tenantId, userId }) });
        if (request.method === 'POST') {
          if (!jobsEnabled) throw new ControlError('service_unavailable');
          const input = await body(request, ['operation','postingText','postingUrl','evaluationJobId','applicationNumber','targetStatus','expectedStatus','expectedRowHash']);
          if(['set_status','sync_applications'].includes(input.operation)&&!applicationsEnabled)throw new ControlError('service_unavailable');
          const job = await queue.enqueue({ ...input, tenantId, userId, idempotencyKey: request.headers.get('idempotency-key'), engineRevision });
          // The database commit is authoritative. An uncertain notification must
          // not remove the job or repeat model execution. Worker sweep repairs it.
          if (job.status === 'queued' && notifyQueue) await notifyQueue(job.id).catch(() => {});
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
      const status = code==='account_deleting'?403:['not_found','evaluation_not_found','artifact_missing'].includes(code) ? 404
        : ['daily_job_limit','search_rate_limited'].includes(code) ? 429 : ['saved_search_limit','saved_search_conflict','saved_job_conflict','saved_job_source_changed','saved_job_limit','discovery_busy','idempotency_conflict','tenant_busy','already_onboarded','review_conflict','draft_limit','evaluation_stale','profile_source_conflict'].includes(code) ? 409 : ['input_limit','export_limit'].includes(code) ? 413 : ['search_unavailable','service_unavailable','storage_configuration_required','snapshot_missing','snapshot_corrupt','snapshot_limit','artifact_limit'].includes(code) ? 503 : 400;
      return json({ error: code }, status);
    }
  };
  const drain=requestDrainEnabled?new RequestDrain({pool:queue.pool,deploymentId:requestDeploymentId,instanceId:requestInstanceId,completion:requestCompletion}):null;
  return request=>drain?drain.run(register=>handle(request,register)):handle(request);
}
