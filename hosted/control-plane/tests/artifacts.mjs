import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Artifacts } from '../artifacts.mjs';
import { hash } from '../queue.mjs';

// Deliberately synthetic committed metadata tests the authorization/publication
// boundary; the browser integration separately downloads a real rendered PDF.
export async function verifyArtifacts({ queue, store, snapshot, engineRevision }) {
  const userId = randomUUID(), tenantId = await queue.provision({ userId, snapshot });
  const service = new Artifacts({ queue, store });
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hc-artifact-test-'));
  try {
    const pdf = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from([0,1,128,255])]);
    const report = '# Synthetic evaluation\n';
    await fs.writeFile(path.join(root, 'cv.pdf'), pdf);
    await fs.writeFile(path.join(root, 'report.md'), report);
    const saved = await store.capture(root);
    const evaluation = await queue.enqueue({ tenantId,userId,idempotencyKey:'report',operation:'evaluate',postingText:'Synthetic',engineRevision });
    let claim = await queue.claim(); assert.equal(claim.id, evaluation.id);
    await assert.rejects(service.download({ tenantId,userId,jobId:claim.id,kind:'report' }), /not_found/);
    await queue.publish(claim, { snapshot:saved.id,result:{ jobId:claim.id,engineRevision,report:'report.md' },artifacts:[{ path:'report.md',sha256:hash(report) }] });
    const tailoring = await queue.enqueue({ tenantId,userId,idempotencyKey:'pdf',operation:'tailor',evaluationJobId:evaluation.id,engineRevision });
    claim = await queue.claim(); assert.equal(claim.id, tailoring.id);
    await queue.publish(claim, { snapshot:saved.id,result:{ jobId:claim.id,engineRevision,pdf:'cv.pdf',report:'report.md' },artifacts:[{ path:'cv.pdf',sha256:hash(pdf) },{ path:'report.md',sha256:hash(report) }] });
    const request = { tenantId,userId,jobId:tailoring.id,kind:'pdf' };
    const response = await service.download(request);
    assert.equal(response.headers.get('content-type'), 'application/pdf');
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.match(response.headers.get('content-disposition'), /^attachment; filename="cv-[a-f0-9-]+\.pdf"$/);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), pdf);
    await assert.rejects(service.download({ ...request,userId:randomUUID() }), /not_found/);
    for (const kind of ['html','../cv.pdf','__proto__']) await assert.rejects(service.download({ ...request,kind }), /not_found/);
    await fs.writeFile(path.join(root, 'cv.pdf'), '%PDF-NEW');
    const later = await store.capture(root);
    const next = await queue.enqueue({ tenantId,userId,idempotencyKey:'later',operation:'evaluate',postingText:'Later',engineRevision });
    claim = await queue.claim(); assert.equal(claim.id, next.id);
    await queue.publish(claim, { snapshot:later.id,result:{jobId:claim.id,engineRevision,report:'report.md'},artifacts:[{path:'report.md',sha256:hash(report)}] });
    assert.deepEqual(Buffer.from(await (await service.download(request)).arrayBuffer()), pdf);
    await fs.writeFile(path.join(store.root, saved.id, 'files/cv.pdf'), '%PDF-tampered');
    await assert.rejects(service.download(request), /snapshot_corrupt/);
    console.log('PASS binary artifact delivery, committed-generation binding, tenant denial, allowlists and tamper rejection');
  } finally { await fs.rm(root, { recursive:true,force:true }); }
}
