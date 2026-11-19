import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Onboarding, profileInput } from '../onboarding.mjs';
import { createEngine } from '../../engine.mjs';

export async function verifyOnboarding({ pool, queue, store, model, engineRevision }) {
  const userId = randomUUID(), other = randomUUID();
  const service = new Onboarding({ queue, store });
  const profile = { fullName: 'Synthetic Onboarding', cvMarkdown: '# Synthetic Onboarding\n\n## Experience\n\n### Example Labs — Remote\n**Software Engineer**\n2022–2025\n\n- Built internal reporting tools with Python.\n- Led a team of 4 engineers.\n', targetRole: 'Software Engineer', language: 'en' };
  const draft = await service.create({ userId, profile });
  assert.equal(await service.existing(userId), undefined);
  await assert.rejects(service.read({ userId: other, draftId: draft.id }), /not_found/);
  await assert.rejects(service.confirm({ userId, draftId: draft.id, expectedHash: draft.review_hash, acknowledged: false }), /confirmation_required/);
  assert.throws(() => profileInput({ ...profile, workspace: '/arbitrary' }), /invalid_request/);
  const updated = await service.update({ userId, draftId: draft.id, expectedHash: draft.review_hash, profile: { ...profile, targetRole: 'Backend Engineer' } });
  await assert.rejects(service.confirm({ userId, draftId: draft.id, expectedHash: draft.review_hash, acknowledged: true }), /review_conflict/);
  await assert.rejects(service.update({ userId, draftId: draft.id, expectedHash: draft.review_hash, profile }), /review_conflict/);
  const attempts = await Promise.all(Array.from({ length: 4 }, () => service.confirm({ userId, draftId: draft.id, expectedHash: updated.review_hash, acknowledged: true })));
  assert.equal(new Set(attempts.map(result => result.tenantId)).size, 1);
  assert.equal(attempts.filter(result => !result.replayed).length, 1);
  const tenantId = attempts[0].tenantId;
  assert.equal((await pool.query('select * from personal_workspaces where user_id=$1', [userId])).rowCount, 1);
  await assert.rejects(service.update({ userId, draftId: draft.id, expectedHash: updated.review_hash, profile }), /already_onboarded/);
  const { rows: [tenant] } = await pool.query('select * from tenants where id=$1', [tenantId]);
  assert.equal(tenant.generation, '0');
  assert.equal(await store.read(tenant.snapshot, 'cv.md'), profile.cvMarkdown);
  const provenance = JSON.parse(await store.read(tenant.snapshot, 'config/confirmed-profile.json'));
  assert.equal(provenance.reviewHash, updated.review_hash);
  assert.equal(provenance.provenance, 'user-confirmed-pasted-source');
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'hc-onboarding-test-'));
  try {
    const workspace = path.join(temporary, 'workspace');
    await store.materialize(tenant.snapshot, workspace);
    const engine = createEngine({ provider: model.provider, engineRevision, allowLocalProvider: true });
    const result = await engine.evaluate({ workspace, jobId: randomUUID(), postingText: 'Synthetic Python role.' });
    assert.equal(result.applicationNumber, 1);
  } finally { await fs.rm(temporary, { recursive: true, force: true }); }
  const failureUser = randomUUID();
  const broken = new Onboarding({ queue, store: { capture() { throw new Error('synthetic storage outage'); } } });
  const pending = await broken.create({ userId: failureUser, profile });
  await assert.rejects(broken.confirm({ userId: failureUser, draftId: pending.id, expectedHash: pending.review_hash, acknowledged: true }), /storage outage/);
  assert.equal(await broken.existing(failureUser), undefined);
  assert.equal((await broken.read({ userId: failureUser, draftId: pending.id })).confirmed_at, null);
  const changedUser = randomUUID();
  const changing = new Onboarding({ queue, store: {
    async capture(root) {
      const saved = await store.capture(root);
      await pool.query("update profile_drafts set review_hash=repeat('a',64) where user_id=$1", [changedUser]);
      return saved;
    }, verify: id => store.verify(id),
  } });
  const changingDraft = await changing.create({ userId: changedUser, profile });
  await assert.rejects(changing.confirm({ userId: changedUser, draftId: changingDraft.id, expectedHash: changingDraft.review_hash, acknowledged: true }), /review_conflict/);
  assert.equal(await changing.existing(changedUser), undefined);
  console.log('PASS reviewed onboarding, stale edits, concurrent confirmation, storage failure, provenance and real engine compatibility');
}
