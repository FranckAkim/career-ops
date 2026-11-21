// A view of the authorized, bounded job history, never a second application tracker.
export function workspaceSummary(jobs, search = '') {
  const evaluations = new Map(jobs.filter(job => job.operation === 'evaluate').map(job => [job.id,job]));
  jobs = jobs.map(job => {
    const source = job.operation === 'tailor' ? evaluations.get(job.evaluation_job_id) : undefined;
    return source ? {...job,company:job.company||source.company,role:job.role||source.role} : job;
  });
  const query = String(search).trim().toLocaleLowerCase();
  const visible = jobs.filter(job => !query || [job.company,job.role,job.operation === 'tailor' ? 'tailored CV' : 'role evaluation',job.status].some(value => String(value || '').toLocaleLowerCase().includes(query)));
  const completed = jobs.filter(job => job.operation === 'evaluate' && job.status === 'succeeded');
  const cvs = jobs.filter(job => job.operation === 'tailor' && job.status === 'succeeded' && job.pdf);
  const prepared = new Set(cvs.map(job => job.evaluation_job_id).filter(Boolean));
  const inProgress = jobs.filter(job => ['queued','running','cancel_requested'].includes(job.status));
  const review = jobs.filter(job => job.status === 'needs_recovery');
  const shown = new Set(visible.map(job => job.id));
  return {visible,completed,cvs,inProgress,review,
    awaitingCV:completed.filter(job => !prepared.has(job.id)),
    columns:[
      {title:'Evaluated',items:completed.filter(job => !prepared.has(job.id) && shown.has(job.id))},
      {title:'In progress',items:inProgress.filter(job => shown.has(job.id))},
      {title:'CV ready',items:cvs.filter(job => shown.has(job.id))},
    ]};
}
