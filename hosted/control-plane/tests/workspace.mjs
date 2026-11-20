import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Supervisor } from '../supervisor.mjs';
import { hash } from '../queue.mjs';

export async function verifyWorkspace({ page, pool, queue, store, runner, workRoot, userId, origin }) {
  const { rows: [personal] } = await pool.query('select tenant_id from personal_workspaces where user_id=$1', [userId]);
  const tenantId = personal.tenant_id;
  const supervisor = new Supervisor({ queue, store, runner, workRoot, heartbeatMs: 500 });
  const submit = async text => {
    await page.getByLabel('Posting text', { exact:true }).fill(text);
    const accepted = page.waitForResponse(response => response.url() === `${origin}/api/hosted/tenants/${tenantId}/jobs` && response.request().method() === 'POST');
    await page.getByRole('button', { name:'Evaluate posting',exact:true }).click();
    const response = await accepted; assert.equal(response.status(),202);
    return (await response.json()).job.id;
  };
  const evaluation = await submit('Example Employer needs a Python software engineer.');
  const evaluated = await supervisor.runOnce(); assert.equal(evaluated.jobId,evaluation); assert.equal(evaluated.status,'succeeded');
  await page.getByRole('button',{name:'Create tailored CV',exact:true}).waitFor();
  await page.getByLabel('Evaluation report', { exact:true }).waitFor();
  assert.ok((await page.getByLabel('Evaluation report',{exact:true}).innerText()).includes('Synthetic evaluation'));
  const accepted = page.waitForResponse(response => response.url() === `${origin}/api/hosted/tenants/${tenantId}/jobs` && response.request().method() === 'POST');
  await page.getByRole('button',{name:'Create tailored CV',exact:true}).click();
  const cvId = (await (await accepted).json()).job.id;
  const prepared = await supervisor.runOnce(); assert.equal(prepared.jobId,cvId); assert.equal(prepared.status,'succeeded');
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
  await page.reload();
  await page.getByRole('link',{name:'Download PDF',exact:true}).waitFor();
  if (process.env.HOSTED_TEST_SCREENSHOTS) {
    await fs.mkdir(process.env.HOSTED_TEST_SCREENSHOTS,{recursive:true});
    await page.screenshot({path:path.join(process.env.HOSTED_TEST_SCREENSHOTS,'workspace-desktop.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
    await page.screenshot({path:path.join(process.env.HOSTED_TEST_SCREENSHOTS,'workspace-mobile.png'),fullPage:true});
    await page.setViewportSize({width:1280,height:720});
  }
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
  await page.getByRole('checkbox').check();
  await page.getByRole('button',{name:'Discard interrupted changes'}).click();
  await page.getByRole('heading',{name:'A job needs your review.'}).waitFor({state:'hidden'});
  assert.equal((await pool.query('select recovery_required from tenants where id=$1',[tenantId])).rows[0].recovery_required,false);
  console.log('PASS browser posting -> durable queue -> real worker evaluation/PDF -> verified download, reload, cancellation and explicit recovery');
  return pdfUrl;
}
