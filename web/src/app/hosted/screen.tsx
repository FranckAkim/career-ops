'use client';

import { useEffect, useState } from 'react';
import styles from './screen.module.css';
import { Workspace } from './workspace';
import {ProcessingNotice} from './processing-notice';

type Profile = { fullName: string; cvMarkdown: string; targetRole: string; language: string };
type Draft = { id: string; review_hash: string; revision: number; content: Profile };
type User = { id: string; name: string };
const errors: Record<string, string> = {
  review_conflict: 'This draft changed. Reload the page and review the latest version.',
  confirmation_required: 'Please confirm that you have reviewed the facts.',
  storage_configuration_required: 'We could not create your workspace yet. Your draft is saved; please try again later.',
  unauthorized: 'Your session ended. Please sign in again.',
  invalid_request: 'Check your name, CV text and profile settings, then try again.',
};
async function api(path: string, data?: unknown) {
  const response = await fetch(`/api/hosted/${path}`, { cache: 'no-store', ...(data === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) }) });
  const value = await response.json();
  if (!response.ok) throw new Error(errors[value.error] || 'Something went wrong. Please try again.');
  return value;
}

export function OnboardingScreen({ user, unavailable, executionMode='unavailable' }: { user: User | null; unavailable: boolean; executionMode?: string }) {
  const [profile, setProfile] = useState<Profile>({ fullName: user?.name || '', cvMarkdown: '', targetRole: '', language: 'en' });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [step, setStep] = useState<'edit' | 'review' | 'ready'>('edit');
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(Boolean(user));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      const status = await api('onboarding/status');
      if (!active) return;
      if (status.workspace) { setTenantId(status.workspace.tenant_id); setStep('ready'); return; }
      const { drafts } = await api('onboarding/drafts');
      if (drafts.length) {
        const { draft: saved } = await api(`onboarding/drafts/${drafts[0].id}`);
        if (active) { setDraft(saved); setProfile(saved.content); }
      }
    })().catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user]);
  async function signIn() {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/auth/sign-in/social', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ provider: 'google', callbackURL: '/hosted' }) });
      const result = await response.json();
      if (!response.ok || !result.url) throw new Error();
      window.location.assign(result.url);
    } catch { setError('Sign-in is unavailable right now. Please try again later.'); setBusy(false); }
  }
  async function signOut() {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/auth/sign-out', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      if (!response.ok) throw new Error();
      window.location.reload();
    } catch { setError('Could not sign out. Please try again.'); setBusy(false); }
  }
  async function review(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const result = draft ? await api(`onboarding/drafts/${draft.id}/update`, { expectedHash: draft.review_hash, profile }) : await api('onboarding/drafts', profile);
      setDraft(result.draft); setProfile(result.draft.content); setChecked(false); setStep('review');
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function confirm() {
    if (!draft || !checked) return;
    setBusy(true); setError('');
    try { const result = await api(`onboarding/drafts/${draft.id}/confirm`, { expectedHash: draft.review_hash, acknowledged: true }); setTenantId(result.tenantId); setStep('ready'); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  if (user && step === 'ready' && tenantId) return <Workspace tenantId={tenantId} userName={user.name} onSignOut={signOut} pageError={error} signingOut={busy} executionMode={executionMode} />;
  return <main className={styles.page}>
    <header className={styles.header}><a className={styles.brand} href="/hosted"><span className={styles.mark}>CW</span>Career Workspace</a>{user && <button className={styles.quiet} onClick={signOut} disabled={busy}>Sign out</button>}</header>
    <ProcessingNotice mode={executionMode} />
    <div className={styles.layout}>
      <aside className={styles.intro}>
        <p className={styles.eyebrow}>A clearer next move</p>
        <h1>Start with <br />what’s true.</h1>
        <p>Your experience is the foundation. Bring your CV, check the details, and create a profile you can stand behind.</p>
        <ol className={styles.steps}><li aria-current={step === 'edit' ? 'step' : undefined}><strong>Your experience</strong><span>Bring your existing CV.</span></li><li aria-current={step === 'review' ? 'step' : undefined}><strong>Your review</strong><span>Check names, dates and numbers.</span></li><li aria-current={step === 'ready' ? 'step' : undefined}><strong>Your workspace</strong><span>Build from confirmed facts.</span></li></ol>
        <p className={styles.note}>Nothing is submitted to employers automatically.</p>
      </aside>
      <section className={styles.card} aria-label="Profile onboarding">
        {error && <p className={styles.error} role="alert">{error}</p>}
        {!user ? <><p className={styles.eyebrow}>Welcome</p><h2>Your career, in one place.</h2><p>Sign in to create your profile and save your progress.</p><button className={styles.primary} onClick={signIn} disabled={busy || unavailable}>{busy ? 'Opening sign-in…' : 'Continue with Google'}</button>{unavailable && <p role="status">Sign-in is temporarily unavailable. Please try again later.</p>}</> : loading ? <p role="status">Loading your profile…</p> : step === 'ready' ? <><p className={styles.eyebrow}>Profile confirmed</p><h2>Your workspace is ready.</h2><p>Your reviewed career information has been saved. Future evaluations and CVs will build from this confirmed profile.</p><div className={styles.summary}>Your facts stay the foundation. You remain in control of every application.</div></> : step === 'edit' ? <form onSubmit={review}>
          <p className={styles.eyebrow}>Your experience</p><h2>Bring your starting point.</h2><p>Paste your CV as text or Markdown. You’ll review the saved version before confirming it.</p>
          <label>Full name<input disabled={busy} required maxLength={200} autoComplete="name" value={profile.fullName} onChange={e => setProfile({ ...profile, fullName: e.target.value })} /></label>
          <div className={styles.row}><label>Target role <span>(optional)</span><input disabled={busy} maxLength={300} value={profile.targetRole} onChange={e => setProfile({ ...profile, targetRole: e.target.value })} /></label><label>Output language<select disabled={busy} value={profile.language} onChange={e => setProfile({ ...profile, language: e.target.value })}><option value="en">English</option><option value="fr">French</option><option value="es">Spanish</option><option value="de">German</option><option value="pt">Portuguese</option><option value="it">Italian</option></select></label></div>
          <label htmlFor="cv-text">CV text</label><textarea id="cv-text" disabled={busy} required rows={13} maxLength={200000} value={profile.cvMarkdown} onChange={e => setProfile({ ...profile, cvMarkdown: e.target.value })} aria-describedby="cv-help" /><p id="cv-help" className={styles.help}>Include only career information you want to use. Remove sensitive details you don’t need in applications.</p>
          <button className={styles.primary} disabled={busy}>{busy ? 'Saving draft…' : 'Review profile'}</button>
        </form> : <><p className={styles.eyebrow}>Your review</p><h2>Check the details.</h2><p>This is the exact saved text your workspace will use. Edit anything you can’t confirm.</p><dl className={styles.details}><div><dt>Name</dt><dd>{draft?.content.fullName}</dd></div><div><dt>Target role</dt><dd>{draft?.content.targetRole || 'Not specified'}</dd></div><div><dt>Output language</dt><dd>{({ en: 'English', fr: 'French', es: 'Spanish', de: 'German', pt: 'Portuguese', it: 'Italian' } as Record<string,string>)[draft?.content.language || 'en']}</dd></div></dl><pre className={styles.preview} aria-label="Saved CV for review">{draft?.content.cvMarkdown}</pre>
          <label className={styles.check}><input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} />I’ve reviewed the career facts above and confirm they’re accurate.</label><div className={styles.actions}><button className={styles.quiet} disabled={busy} onClick={() => { setChecked(false); setStep('edit'); }}>Edit profile</button><button className={styles.primary} disabled={!checked || busy} onClick={confirm}>{busy ? 'Creating workspace…' : 'Confirm and create workspace'}</button></div></>}
      </section>
    </div>
  </main>;
}
