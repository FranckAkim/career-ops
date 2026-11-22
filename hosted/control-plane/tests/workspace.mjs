import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Supervisor } from '../supervisor.mjs';
import { hash } from '../queue.mjs';
import {SnapshotInventory} from '../snapshot-inventory.mjs';
import {Queue} from '../queue.mjs';

export async function verifyWorkspace({ page, pool, queue, store, runner, workRoot, userId, origin }) {
  const { rows: [personal] } = await pool.query('select tenant_id from personal_workspaces where user_id=$1', [userId]);
  const tenantId = personal.tenant_id;
  const inventoryEnabled=true,workerQueue=new Queue(pool,{snapshotInventory:true,accountLifecycle:true});
  const inventory=inventoryEnabled?new SnapshotInventory({queue:workerQueue}):undefined;
  const engineFailures=new Map();
  const supervisedRunner=async context=>{try{return await runner(context);}catch(error){engineFailures.set(context.job.jobId,error.code||error.name);throw error;}};
  const supervisor = new Supervisor({ queue:workerQueue, store, runner:supervisedRunner, inventory,workRoot, heartbeatMs: 500 });
  await page.getByRole('button',{name:'Opportunities',exact:true}).click();
  const submit = async text => {
    await page.getByLabel('Posting text', { exact:true }).fill(text);
    const accepted = page.waitForResponse(response => response.url() === `${origin}/api/hosted/tenants/${tenantId}/jobs` && response.request().method() === 'POST');
    await page.getByRole('button', { name:'Evaluate posting',exact:true }).click();
    const response = await accepted; assert.equal(response.status(),202);
    return (await response.json()).job.id;
  };
  // A durable saved role must still drive the original queue/engine after its
  // ephemeral discovery request is removed. Do not replace it with pasted text.
  const discoveryId=randomUUID(),posting={id:'https://example.test/saved-engine-journey',url:'https://example.test/saved-engine-journey',company:'Example Employer',title:'Software Engineer',location:'United States',source:'lever-full',description:'Example Employer needs a Python software engineer.',descriptionAvailable:true,postedAt:'2026-11-22'};
  await pool.query("insert into discovery_runs(id,tenant_id,user_id,input,state,result) values($1,$2,$3,$4,'succeeded',$5)",[discoveryId,tenantId,userId,{q:'software engineer',location:'United States',workplace:'any',sinceDays:14,limitPerAts:25},{jobs:[posting],partial:true,companiesScanned:1}]);
  await page.reload();await page.getByRole('button',{name:'Opportunities',exact:true}).click();await page.getByRole('region',{name:'Find jobs',exact:true}).getByRole('button',{name:'Save job',exact:true}).click();await page.getByRole('button',{name:'Saved jobs',exact:true}).click();const savedRoles=page.getByRole('region',{name:'Saved jobs',exact:true});await savedRoles.getByRole('heading',{name:posting.title,exact:true}).waitFor();
  await pool.query('delete from discovery_runs where id=$1 and user_id=$2',[discoveryId,userId]);await page.reload();await page.getByRole('button',{name:'Opportunities',exact:true}).click();await page.getByRole('button',{name:'Saved jobs',exact:true}).click();await savedRoles.getByRole('button',{name:'Use this saved job',exact:true}).click();const selected=await page.getByLabel('Posting text',{exact:true}).inputValue();assert.ok(selected.includes(posting.description));
  const acceptedEvaluation=page.waitForResponse(response=>response.url()===`${origin}/api/hosted/tenants/${tenantId}/jobs`&&response.request().method()==='POST');await page.getByRole('button',{name:'Evaluate posting',exact:true}).click();const evaluationResponse=await acceptedEvaluation;assert.equal(evaluationResponse.status(),202);const evaluation=(await evaluationResponse.json()).job.id;
  const queued=(await pool.query('select payload from jobs where id=$1 and requested_by=$2',[evaluation,userId])).rows[0].payload;assert.equal(queued.postingText,selected);assert.equal(queued.postingUrl,posting.url);

  const evaluated = await supervisor.runOnce(); assert.equal(evaluated.jobId,evaluation); assert.equal(evaluated.status,'succeeded');
  await page.getByRole('button',{name:'Create tailored CV',exact:true}).waitFor();
  await page.getByLabel('Evaluation report', { exact:true }).waitFor();
  assert.ok((await page.getByLabel('Evaluation report',{exact:true}).innerText()).includes('Synthetic evaluation'));
  const accepted = page.waitForResponse(response => response.url() === `${origin}/api/hosted/tenants/${tenantId}/jobs` && response.request().method() === 'POST');
  await page.getByRole('button',{name:'Create tailored CV',exact:true}).click();
  const cvId = (await (await accepted).json()).job.id;
  const prepared = await supervisor.runOnce(); assert.equal(prepared.jobId,cvId); assert.equal(prepared.status,'succeeded',engineFailures.get(cvId)||'worker must publish the tailored PDF');
  await page.getByRole('link',{name:'Download PDF',exact:true}).waitFor();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link',{name:'Download PDF',exact:true}).click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(),`cv-${cvId}.pdf`);
  const bytes = await fs.readFile(await download.path());
  assert.equal(bytes.subarray(0,5).toString(),'%PDF-');
  const detail = await queue.read({ tenantId,userId,jobId:cvId });
  assert.equal(hash(bytes),detail.result.pdfSha256);
  const pdfUrl = `${origin}/api/hosted/tenants/${tenantId}/artifacts/${cvId}/pdf`;
  const attachment = await page.request.get(pdfUrl);
  assert.equal(attachment.headers()['content-type'],'application/pdf');
  assert.ok(attachment.headers()['content-security-policy'].includes("default-src 'none'"));
  await page.getByRole('button',{name:'Applications',exact:true}).click();
  await page.getByLabel('Application status',{exact:true}).waitFor();
  for(const stage of ['Applied','Interview','Offer']){
    await page.getByLabel('Application status',{exact:true}).selectOption(stage);
    if(stage==='Applied'){
      assert.equal(await page.getByRole('button',{name:'Save status',exact:true}).isDisabled(),true);
      await page.getByLabel('I have already submitted this application myself.',{exact:true}).check();
    }
    const acceptedStatus=page.waitForResponse(r=>r.url()===`${origin}/api/hosted/tenants/${tenantId}/jobs`&&r.request().method()==='POST');
    await page.getByRole('button',{name:'Save status',exact:true}).click();assert.equal((await acceptedStatus).status(),202);
    assert.equal((await supervisor.runOnce()).status,'succeeded');
    await page.getByLabel('Current application status',{exact:true}).filter({hasText:new RegExp(`^${stage}$`)}).waitFor();
  }
  await page.reload();await page.getByRole('button',{name:'Applications',exact:true}).click();
  await page.getByLabel('Current application status',{exact:true}).filter({hasText:/^Offer$/}).waitFor();
  await page.getByLabel('Filter by status',{exact:true}).selectOption('Applied');await page.getByRole('heading',{name:'No matching applications.',exact:true}).waitFor();await page.getByLabel('Filter by status',{exact:true}).selectOption('all');
  if(process.env.HOSTED_TEST_SCREENSHOTS){
    await fs.mkdir(process.env.HOSTED_TEST_SCREENSHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.HOSTED_TEST_SCREENSHOTS,'applications-desktop.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);await page.screenshot({path:path.join(process.env.HOSTED_TEST_SCREENSHOTS,'applications-mobile.png'),fullPage:true});await page.setViewportSize({width:1280,height:720});
  }
  await page.reload();
  await page.getByRole('heading',{name:'Your next move, in focus.',exact:true}).waitFor();
  await page.getByRole('button',{name:'CV Studio',exact:true}).click();
  await page.getByLabel('CV library',{exact:true}).getByRole('link',{name:'Download PDF',exact:true}).waitFor();
  await page.getByRole('button',{name:'My Profile',exact:true}).click();
  await page.getByLabel('Confirmed profile',{exact:true}).getByRole('heading',{name:'Synthetic Alpha',exact:true}).waitFor();
  const profileBefore=await (await page.request.get(`${origin}/api/hosted/tenants/${tenantId}/profile`)).json();
  await page.getByRole('button',{name:'Edit profile',exact:true}).click();
  await page.getByLabel('Target role',{exact:true}).fill('Backend Engineer — Confirmed Update');
  await page.getByRole('button',{name:'Review profile changes',exact:true}).click();
  await page.getByRole('heading',{name:'Review your profile changes.',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Confirm profile changes',exact:true}).isDisabled(),true);
  await page.getByLabel('I have reviewed these changes and confirm this is my source information.',{exact:true}).check();
  await page.getByRole('button',{name:'Confirm profile changes',exact:true}).click();
  await page.getByText(`Confirmed by you · Version ${profileBefore.revision+1}`,{exact:true}).waitFor();
  await page.reload();await page.getByRole('button',{name:'My Profile',exact:true}).click();
  await page.getByText('Backend Engineer — Confirmed Update',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Applications',exact:true}).click();
  await page.getByLabel('Current application status',{exact:true}).filter({hasText:/^Offer$/}).waitFor();
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByRole('heading',{name:'Processing and privacy',exact:true}).waitFor();
  const exportDownload=page.waitForEvent('download');await page.getByRole('button',{name:'Download workspace data',exact:true}).click();
  const exported=await exportDownload,archive=JSON.parse(await fs.readFile(await exported.path(),'utf8'));assert.equal(archive.complete,true);assert.equal(archive.tenant.id,tenantId);assert.ok(archive.savedJobs.some(item=>item.posting.url===posting.url));assert.ok(archive.files.some(file=>hash(Buffer.from(file.data,'base64'))===detail.result.pdfSha256));
  assert.equal(await page.getByRole('button',{name:'Discard unused drafts',exact:true}).isDisabled(),true);
  await page.getByLabel('Discard my unused profile drafts. I understand this cannot be undone.',{exact:true}).check();await page.getByRole('button',{name:'Discard unused drafts',exact:true}).click();
  await page.getByText('1 unused draft discarded. Your confirmed profile and saved work are unchanged.',{exact:true}).waitFor();
  if(process.env.HOSTED_TEST_SCREENSHOTS)await page.screenshot({path:path.join(process.env.HOSTED_TEST_SCREENSHOTS,'data-controls.png'),fullPage:true});
  await page.getByRole('button',{name:'Overview',exact:true}).click();
  assert.match(await page.getByLabel('Recent workspace summary',{exact:true}).innerText(),/1\s+CVs ready/);
  await page.getByRole('searchbox',{name:'Search recent work',exact:true}).fill('zzzz-no-matching-role');
  await page.getByRole('heading',{name:'No matching work yet.',exact:true}).waitFor();
  await page.getByRole('searchbox',{name:'Search recent work',exact:true}).fill('');
  if (process.env.HOSTED_TEST_SCREENSHOTS) {
    await fs.mkdir(process.env.HOSTED_TEST_SCREENSHOTS,{recursive:true});
    await page.screenshot({path:path.join(process.env.HOSTED_TEST_SCREENSHOTS,'workspace-desktop.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
    await page.screenshot({path:path.join(process.env.HOSTED_TEST_SCREENSHOTS,'workspace-mobile.png'),fullPage:true});
    await page.setViewportSize({width:1280,height:720});
  }
  await page.getByRole('button',{name:'Opportunities',exact:true}).click();
  const cancelled = await submit('A second synthetic role.');
  await page.getByRole('button',{name:'Cancel job',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Cancelled'}).waitFor();
  assert.equal((await queue.read({tenantId,userId,jobId:cancelled})).status,'cancelled');
  const interrupted = await submit('An interrupted synthetic role.');
  const claim = await queue.claim(); assert.equal(claim.id,interrupted);
  await pool.query("update jobs set lease_until=clock_timestamp()-interval '1 second' where id=$1",[interrupted]);
  await queue.reapExpired();
  await page.getByRole('heading',{name:'A job needs your review.'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Discard interrupted changes'}).isDisabled(),true);
  await page.getByRole('region',{name:'Workspace recovery',exact:true}).getByRole('checkbox').check();
  await page.getByRole('button',{name:'Discard interrupted changes'}).click();
  await page.getByRole('heading',{name:'A job needs your review.'}).waitFor({state:'hidden'});
  assert.equal((await pool.query('select recovery_required from tenants where id=$1',[tenantId])).rows[0].recovery_required,false);
  console.log('PASS dashboard navigation/search/profile/CV library and browser saved role after search removal -> durable queue -> real worker evaluation/PDF -> verified download, reload, cancellation and explicit recovery');
  if(inventoryEnabled){const{rows}=await pool.query("select kind,count(*)::int as count from snapshot_captures where user_id=$1 and state='ready' group by kind",[userId]);for(const kind of ['onboarding','profile','job'])assert.ok(rows.some(row=>row.kind===kind&&row.count>0));console.log('PASS browser onboarding/profile/job publications have durable owner capture proofs');}
  return pdfUrl;
}
