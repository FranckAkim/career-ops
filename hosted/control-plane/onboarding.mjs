import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { ControlError, hash } from './queue.mjs';
import {assertCapturePublication} from './snapshot-inventory.mjs';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const check = (value, code = 'invalid_request') => { if (!value) throw new ControlError(code); };
export function profileInput(value) {
  check(value && typeof value === 'object' && !Array.isArray(value));
  check(Object.keys(value).every(key => ['fullName','cvMarkdown','targetRole','language'].includes(key)));
  const { fullName, cvMarkdown, targetRole = '', language = 'en' } = value;
  check(typeof fullName === 'string' && fullName.trim() && fullName.length <= 200 && !/[\x00-\x1f\x7f]/.test(fullName));
  check(typeof cvMarkdown === 'string' && cvMarkdown.trim() && Buffer.byteLength(cvMarkdown) <= 200000 && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(cvMarkdown));
  check(typeof targetRole === 'string' && targetRole.length <= 300 && !/[\x00-\x1f\x7f]/.test(targetRole));
  check(['en','fr','es','de','pt','it'].includes(language));
  return { fullName: fullName.trim(), cvMarkdown: cvMarkdown.replaceAll('\r\n','\n'), targetRole: targetRole.trim(), language };
}
export const reviewHash = profile => hash(JSON.stringify({ schema: 1, profile }));
// An empty initial scaffold only: subsequent application writes always use the
// engine. Integration tests verify this layout with its actual parser/merger.
export const emptyTracker = '# Applications\n\n| # | Date | Company | Role | Score | Status | PDF | Report | Notes | URL |\n|---|---|---|---|---|---|---|---|---|---|\n';

export class Onboarding {
  constructor({ queue, store, inventory }) { this.queue = queue; this.store = store;this.inventory=inventory; }
  async userLock(db, userId) {
    check(uuid.test(userId));
    await db.query('select pg_advisory_xact_lock(hashtextextended($1,847292))', [userId]);
  }
  async create({ userId, profile }) {
    const content = profileInput(profile), fingerprint = reviewHash(content);
    return this.queue.transaction(async db => {
      await this.userLock(db, userId);
      check(!(await db.query('select 1 from personal_workspaces where user_id=$1', [userId])).rowCount, 'already_onboarded');
      check(Number((await db.query('select count(*) from profile_drafts where user_id=$1 and confirmed_at is null', [userId])).rows[0].count) < 5, 'draft_limit');
      const { rows: [draft] } = await db.query('insert into profile_drafts(id,user_id,review_hash,content) values($1,$2,$3,$4) returning id,revision,review_hash,content,confirmed_at', [randomUUID(), userId, fingerprint, content]);
      return draft;
    });
  }
  async read({ userId, draftId }) {
    check(uuid.test(userId) && uuid.test(draftId));
    const { rows: [draft] } = await this.queue.pool.query('select id,revision,review_hash,content,confirmed_at from profile_drafts where user_id=$1 and id=$2', [userId, draftId]);
    check(draft, 'not_found'); return draft;
  }
  async list(userId) {
    check(uuid.test(userId));
    return (await this.queue.pool.query('select id,revision,review_hash,confirmed_at,updated_at from profile_drafts where user_id=$1 and confirmed_at is null order by updated_at desc,id desc limit 5', [userId])).rows;
  }
  async update({ userId, draftId, expectedHash, profile }) {
    const content = profileInput(profile);
    return this.queue.transaction(async db => {
      await this.userLock(db, userId);
      check(uuid.test(draftId));
      const { rows: [draft] } = await db.query('select * from profile_drafts where user_id=$1 and id=$2', [userId,draftId]);
      check(draft, 'not_found');
      check(!draft.confirmed_at, 'already_onboarded');
      check(draft.review_hash === expectedHash, 'review_conflict');
      const { rows: [updated] } = await db.query('update profile_drafts set revision=revision+1,content=$3,review_hash=$4,updated_at=clock_timestamp() where id=$1 and user_id=$2 returning id,revision,review_hash,content,confirmed_at', [draftId,userId,content,reviewHash(content)]);
      return updated;
    });
  }
  async existing(userId) {
    check(uuid.test(userId));
    const { rows: [row] } = await this.queue.pool.query('select tenant_id,draft_id,review_hash from personal_workspaces where user_id=$1', [userId]);
    return row;
  }
  async confirm({ userId, draftId, expectedHash, acknowledged }) {
    check(acknowledged === true, 'confirmation_required');
    const draft = await this.read({ userId, draftId });
    check(draft.review_hash === expectedHash, 'review_conflict');
    const prior = await this.existing(userId);
    if (prior) { check(prior.draft_id === draftId && prior.review_hash === expectedHash, 'already_onboarded'); return { tenantId: prior.tenant_id, replayed: true }; }
    check(this.store, 'storage_configuration_required');
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hc-onboarding-'));
    await fs.chmod(root, 0o700);
    let snapshot;
    try {
      for (const dir of ['config','modes','data']) await fs.mkdir(path.join(root, dir), { mode: 0o700 });
      const p = draft.content;
      const files = {
        'cv.md': p.cvMarkdown,
        'config/profile.yml': JSON.stringify({ name: p.fullName, candidate: { full_name: p.fullName }, output_language: p.language, cv: { page_format: 'a4' } }),
        'config/cv-facts.json': JSON.stringify({ allow_metrics: [], allow_facts: [], allow_swaps: [], forbidden_phrases: [], warn_phrases: [] }),
        'modes/_profile.md': `Target role stated by the user: ${JSON.stringify(p.targetRole)}. Use only confirmed CV/profile facts.`,
        'data/applications.md': emptyTracker,
        'config/confirmed-profile.json': JSON.stringify({ schema: 1, provenance: 'user-confirmed-pasted-source', userId, draftId, revision: draft.revision, reviewHash: expectedHash, confirmedAt: new Date().toISOString() }),
      };
      for (const [relative, text] of Object.entries(files)) await fs.writeFile(path.join(root, relative), text, { flag: 'wx', mode: 0o600 });
      snapshot = this.inventory?await this.inventory.capture({store:this.store,workspace:root,userId,kind:'onboarding'}):await this.store.capture(root);
      await this.store.verify(snapshot.id);
    } finally {
      if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('hc-onboarding-')) throw new ControlError('unsafe_cleanup');
      await fs.rm(root, { recursive: true, force: true });
    }
    return this.queue.transaction(async db => {
      await this.userLock(db, userId);
      const { rows: [current] } = await db.query('select * from profile_drafts where user_id=$1 and id=$2 for update', [userId,draftId]);
      check(current?.review_hash === expectedHash, 'review_conflict');
      const { rows: [committed] } = await db.query('select * from personal_workspaces where user_id=$1', [userId]);
      if (committed) { check(committed.draft_id === draftId && committed.review_hash === expectedHash, 'already_onboarded'); return { tenantId: committed.tenant_id, replayed: true }; }
      if(this.inventory)await assertCapturePublication(db,{snapshot:snapshot.id,captureId:snapshot.captureId,userId,kind:'onboarding'});
      const tenantId = randomUUID();
      await db.query('insert into tenants(id,snapshot) values($1,$2)', [tenantId,snapshot.id]);
      await db.query("insert into memberships values($1,$2,'owner')", [tenantId,userId]);
      await db.query('insert into workspace_versions(tenant_id,generation,snapshot) values($1,0,$2)', [tenantId,snapshot.id]);
      await db.query('insert into personal_workspaces values($1,$2,$3,$4,clock_timestamp())', [userId,tenantId,draftId,expectedHash]);
      await db.query('update profile_drafts set confirmed_at=clock_timestamp() where id=$1', [draftId]);
      return { tenantId, replayed: false };
    });
  }
}
