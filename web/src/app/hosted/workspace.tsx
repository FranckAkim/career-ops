'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './screen.module.css';
import {ProcessingNotice} from './processing-notice';

type Job = { id: string; operation: string; status: string; company?: string; role?: string; created_at: string; error_code?: string; result?: { company?: string; role?: string; score?: string | number; pdf?: string; report?: string; pages?: number } };
type JobEvent = { sequence: string; kind: string; created_at: string };
const active = (status: string) => ['queued','running','cancel_requested'].includes(status);
const labels: Record<string,string> = { queued: 'Queued', running: 'Running', cancel_requested: 'Stopping', cancelled: 'Cancelled', succeeded: 'Complete', failed: 'Failed', needs_recovery: 'Needs review' };

export function Workspace({ tenantId, onSignOut, pageError, signingOut, executionMode='unavailable' }: { tenantId: string; onSignOut: () => void; pageError: string; signingOut: boolean; executionMode?: string }) {
  const base = `/api/hosted/tenants/${tenantId}`;
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [events, setEvents] = useState<JobEvent[]>([]);
  const [postingText, setPostingText] = useState('');
  const [postingUrl, setPostingUrl] = useState('');
  const [report, setReport] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [recovery, setRecovery] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const evaluationKey = useRef<{ input: string; key: string } | null>(null);
  const tailorKeys = useRef(new Map<string,string>());

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      const [history, memberships] = await Promise.all([
        fetch(`${base}/jobs`, { signal: controller.signal, cache: 'no-store' }),
        fetch('/api/hosted/tenants', { signal: controller.signal, cache: 'no-store' }),
      ]);
      if (!history.ok || !memberships.ok) throw new Error();
      const [list, access] = await Promise.all([history.json(), memberships.json()]);
      if (controller.signal.aborted) return;
      setJobs(list.jobs); setRecovery(Boolean(access.tenants.find((t: { id: string }) => t.id === tenantId)?.recovery_required));
      if (list.jobs.length) setSelected(list.jobs[0].id);
    })().catch(() => { if (!controller.signal.aborted) setError('Could not load your workspace. Please reload and try again.'); }).finally(() => { if (!controller.signal.aborted) setLoaded(true); });
    return () => controller.abort();
  }, [base, tenantId]);

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>;
    let cursor = '0'; const collected = new Map<string,JobEvent>();
    setJob(null); setReport(''); setEvents([]); setError('');
    async function poll() {
      try {
        const response = await fetch(`${base}/jobs/${selected}?after=${cursor}`, { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error();
        const detail = await response.json();
        if (controller.signal.aborted) return;
        for (const event of detail.events) { collected.set(event.sequence, event); cursor = event.sequence; }
        setJob(detail); setEvents([...collected.values()]);
        setJobs(previous => previous.map(item => item.id === selected ? { ...item, ...detail, company: detail.result?.company || item.company, role: detail.result?.role || item.role } : item));
        if (detail.status === 'needs_recovery') setRecovery(true);
        // Drain bounded event pages before stopping on a terminal job.
        if (active(detail.status) || detail.events.length === 100) timer = setTimeout(poll, detail.events.length === 100 ? 50 : 1500);
        if (detail.status === 'succeeded' && detail.result?.report) {
          const file = await fetch(`${base}/artifacts/${selected}/report`, { signal: controller.signal, cache: 'no-store' });
          if (!file.ok) throw new Error();
          const text = await file.text(); if (!controller.signal.aborted) setReport(text);
        }
      } catch { if (!controller.signal.aborted) { setError('Could not refresh this job. Select it again to retry.'); } }
    }
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [base, selected, refresh]);

  async function mutate(path: string, input: unknown, key?: string) {
    const response = await fetch(`${base}/${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(key ? { 'idempotency-key': key } : {}) }, body: JSON.stringify(input) });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error === 'idempotency_conflict' ? 'This request changed. Check the job history before trying again.' : 'Could not save this action. Check your connection and try again.');
    return value;
  }
  async function enqueue(input: Record<string,string>, key: string) {
    const value = await mutate('jobs', input, key);
    setJobs(previous => previous.some(item => item.id === value.job.id) ? previous : [{ ...value.job, operation: input.operation, created_at: new Date().toISOString() }, ...previous]);
    setSelected(value.job.id); setJob(null); setRefresh(previous => previous + 1);
  }
  async function evaluate(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    const input = { operation: 'evaluate', postingText, postingUrl };
    const fingerprint = JSON.stringify(input);
    if (evaluationKey.current?.input !== fingerprint) evaluationKey.current = { input: fingerprint, key: crypto.randomUUID() };
    try { await enqueue(input, evaluationKey.current.key); setPostingText(''); setPostingUrl(''); evaluationKey.current = null; }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function tailor() {
    if (!job) return;
    setBusy(true); setError('');
    if (!tailorKeys.current.has(job.id)) tailorKeys.current.set(job.id, crypto.randomUUID());
    try { await enqueue({ operation: 'tailor', evaluationJobId: job.id }, tailorKeys.current.get(job.id)!); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function cancel() {
    if (!job) return;
    setBusy(true); setError('');
    try { const value = await mutate(`jobs/${job.id}/cancel`, {}); setJob(previous => previous ? { ...previous, status: value.status } : null); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function discardRecovery() {
    setBusy(true); setError('');
    try { await mutate('recovery/discard', {}); setRecovery(false); setDiscard(false); setSelected(null); setJob(null); const history = await fetch(`${base}/jobs`, { cache: 'no-store' }); if (!history.ok) throw new Error('Changes discarded. Reload to update the job history.'); setJobs((await history.json()).jobs); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <main className={styles.page}>
    <ProcessingNotice mode={executionMode} />
    <header className={styles.header}><a className={styles.brand} href="/hosted"><span className={styles.mark}>CW</span>Career Workspace</a><button className={styles.quiet} onClick={onSignOut} disabled={busy || signingOut}>Sign out</button></header>
    <div className={styles.workspace}>
      <div className={styles.workspaceTitle}><div><p className={styles.eyebrow}>Your confirmed profile is the foundation</p><h1>Your workspace</h1></div><p>Evaluate the fit. Prepare your CV.<br />You decide what to send.</p></div>
      {(error || pageError) && <p role="alert" className={styles.workspaceError}>{error || pageError}</p>}
      {recovery && <section className={styles.recovery} aria-label="Workspace recovery"><h2>A job needs your review.</h2><p>Your last saved workspace is still in place. Discard uncommitted changes from the interrupted attempt before starting more work.</p><label><input type="checkbox" checked={discard} onChange={e => setDiscard(e.target.checked)} /> I understand this discards the workspace’s uncommitted changes.</label><button className={styles.primary} disabled={!discard || busy} onClick={discardRecovery}>Discard interrupted changes</button></section>}
      <div className={styles.workspaceGrid}>
        <aside className={styles.card}>
          <form onSubmit={evaluate}><p className={styles.eyebrow}>A new opportunity</p><h2>Bring a role.</h2><p>Paste a job description to evaluate it against your confirmed profile.</p><label htmlFor="posting-text">Posting text</label><textarea id="posting-text" rows={8} maxLength={200000} required disabled={busy || recovery} value={postingText} onChange={e => setPostingText(e.target.value)} /><label>Posting URL <span>(optional)</span><input type="url" maxLength={4096} disabled={busy || recovery} value={postingUrl} onChange={e => setPostingUrl(e.target.value)} /></label><p className={styles.help}>Text-only assessment. The link is saved as a reference; it is not fetched.</p><button className={styles.primary} disabled={busy || recovery || !loaded || !postingText.trim()}>{busy ? 'Saving…' : 'Evaluate posting'}</button></form>
          <h3 className={styles.historyTitle}>Recent work</h3><ul className={styles.jobList}>{jobs.map(item => <li key={item.id}><button aria-current={selected === item.id ? 'true' : undefined} onClick={() => { setSelected(item.id); setRefresh(value => value + 1); }}><strong>{item.company ? `${item.company} · ${item.role || 'Evaluation'}` : item.operation === 'tailor' ? 'Tailored CV' : 'Role evaluation'}</strong><span>{labels[item.status] || 'Updating'} · {new Date(item.created_at).toLocaleDateString()}</span></button></li>)}</ul>{!jobs.length && <p className={styles.help}>Your evaluations and CVs will appear here.</p>}
        </aside>
        <section className={styles.card} aria-label="Selected job">
          {!selected ? <><p className={styles.eyebrow}>Start with the role</p><h2>A clearer view of your next move.</h2><p>Your profile is confirmed. Paste a posting to start an evaluation, then review the report before preparing a tailored CV.</p><div className={styles.summary}>Nothing is submitted to employers automatically.</div></> : !job ? <p role="status">Loading job…</p> : <>
            <p className={styles.eyebrow}>{job.operation === 'tailor' ? 'CV preparation' : 'Role evaluation'}</p><h2>{job.result?.company || (job.operation === 'tailor' ? 'Your tailored CV' : 'Role evaluation')}</h2>{job.result?.role && <p>{job.result.role}</p>}<p role="status" className={styles.jobStatus}>{labels[job.status] || 'Updating'}{job.result?.score !== undefined ? ` · Fit score ${job.result.score}` : ''}</p>
            {job.status === 'queued' && <p>Waiting for a worker. You can leave this page and return to follow its progress.</p>}
            {job.status === 'running' && <p>{job.operation === 'tailor' ? 'Preparing and validating your CV and PDF.' : 'Evaluating the posting against your confirmed profile.'}</p>}
            {job.status === 'failed' && <p>This attempt could not finish. Your previously saved workspace is unchanged.</p>}
            {job.status === 'cancelled' && <p>This attempt was cancelled. No new workspace changes were published.</p>}
            {active(job.status) && <button className={styles.quiet} disabled={busy || job.status === 'cancel_requested'} onClick={cancel}>Cancel job</button>}
            {job.status === 'succeeded' && <div className={styles.actions}>{job.operation === 'evaluate' && <button className={styles.primary} onClick={tailor} disabled={busy || recovery}>Create tailored CV</button>}{job.result?.report && <a className={styles.download} href={`${base}/artifacts/${job.id}/report`}>Download report</a>}{job.result?.pdf && <a className={styles.download} href={`${base}/artifacts/${job.id}/pdf`}>Download PDF</a>}</div>}
            <ol className={styles.events} aria-label="Job progress">{events.map(event => <li key={event.sequence}>{labels[event.kind] || event.kind.replaceAll('_', ' ')}<time>{new Date(event.created_at).toLocaleTimeString()}</time></li>)}</ol>
            {report && <><h3>Original evaluation report</h3><p className={styles.help}>Based on pasted text; no live company research. This preserves the original evaluation; later CV progress appears above.</p><pre className={styles.report} aria-label="Evaluation report">{report}</pre></>}
          </>}
        </section>
      </div>
    </div>
  </main>;
}
