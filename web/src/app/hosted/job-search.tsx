'use client';
import {useEffect,useRef,useState} from 'react';
import styles from './screen.module.css';
import css from './job-search.module.css';
type Listing={id:string;url:string;title:string;company:string;description:string;descriptionAvailable:boolean;location:string;source:string;postedAt:string|null};
type Results={jobs:Listing[];partial:boolean;timedOut:boolean;companiesScanned:number;unreachableBoards:number;capHit:boolean;displayCapped:boolean};
type Run={id:string;state:string;result?:Results;error_code?:string};
const active=(run:Run|null)=>!!run&&['queued','running'].includes(run.state);
export function JobSearch({base,disabled,onSelect}:{base:string;disabled:boolean;onSelect:(text:string,url:string)=>void}){
 const[q,setQ]=useState(''),[location,setLocation]=useState('United States, USA, U.S., US Remote'),[workplace,setWorkplace]=useState('any'),[sinceDays,setSinceDays]=useState(14),[limit,setLimit]=useState(50);
 const[run,setRun]=useState<Run|null>(null),[sending,setSending]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const operation=useRef<AbortController|null>(null);
 useEffect(()=>{const controller=new AbortController();void fetch(`${base}/discovery`,{signal:controller.signal,cache:'no-store'}).then(async response=>{if(!response.ok)throw Error();const value=await response.json();if(!controller.signal.aborted)setRun(value.run);}).catch(()=>{if(!controller.signal.aborted)setError('Could not restore the last search. You can try a new search.');});return()=>{controller.abort();operation.current?.abort();};},[base]);
 const runId=run?.id;
 useEffect(()=>{if(!runId)return;const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
  async function poll(){try{const response=await fetch(`${base}/discovery/${runId}`,{signal:controller.signal,cache:'no-store'});if(!response.ok)throw Error();const value=await response.json();if(controller.signal.aborted)return;setRun(value);setError('');if(['queued','running'].includes(value.state))timer=setTimeout(poll,2000);}catch{if(!controller.signal.aborted){setError('Could not refresh this search. Retrying…');timer=setTimeout(poll,5000);}}}
  void poll();return()=>{controller.abort();clearTimeout(timer);};
 },[base,runId]);
 async function search(){const controller=new AbortController();operation.current=controller;setSending(true);setError('');setNotice('');
  try{const response=await fetch(`${base}/discovery`,{method:'POST',signal:controller.signal,headers:{'content-type':'application/json'},body:JSON.stringify({q:q.trim(),location:location.trim(),workplace,sinceDays,limitPerAts:limit})});if(!response.ok)throw Error(response.status===409?'A search is already queued or running. Cancel it before starting another.':response.status===429?'Search limit reached. Try again later.':'Could not start the search. Please try again.');const value=await response.json();if(!controller.signal.aborted)setRun(value);}catch(e){if(!controller.signal.aborted)setError((e as Error).message);}finally{if(!controller.signal.aborted)setSending(false);}}
 async function cancel(){setSending(true);try{const response=await fetch(`${base}/discovery/${run!.id}/cancel`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});if(!response.ok)throw Error();setRun(await response.json());setNotice('Search cancelled. No evaluation was started.');}catch{setError('Could not cancel. The search may have finished; refresh its status.');}finally{setSending(false);}}
 function select(job:Listing){onSelect(`Company: ${job.company}\nRole: ${job.title}\nLocation: ${job.location}\nSource: ${job.source}\n\n${job.description}`,job.url);setNotice(`${job.title} loaded below. Review the description, then choose Evaluate posting.`);requestAnimationFrame(()=>document.getElementById('posting-text')?.focus());}
 const busy=sending||active(run),result=run?.result;
 return <section className={`${styles.card} ${css.search}`} aria-label="Find jobs">
 <p className={styles.eyebrow}>Built-in career-ops discovery</p><h2>Find your next role.</h2>
 <p>Search employer boards through the repo’s Greenhouse, Lever, Ashby and Workday scanner. Scans run on your computer and wait while it is offline.</p>
 <form onSubmit={e=>{e.preventDefault();void search();}} className={css.form}>
 <label>Role or keywords<input value={q} onChange={e=>setQ(e.target.value)} maxLength={120} placeholder="e.g. project manager, program manager" required disabled={busy}/></label>
 <label>Location keywords<input value={location} onChange={e=>setLocation(e.target.value)} maxLength={120} required disabled={busy}/></label>
 <label>Work arrangement<select value={workplace} onChange={e=>setWorkplace(e.target.value)} disabled={busy}><option value="any">Any arrangement</option><option value="remote">Remote</option><option value="hybrid">Hybrid</option><option value="onsite">On-site</option></select></label>
 <label>Posted within<select value={sinceDays} onChange={e=>setSinceDays(Number(e.target.value))} disabled={busy}>{[7,14,30].map(n=><option key={n} value={n}>{n} days</option>)}</select></label>
 <label>Boards per source<select value={limit} onChange={e=>setLimit(Number(e.target.value))} disabled={busy}>{[25,50,100].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
 <button className={styles.primary} disabled={busy||!q.trim()||!location.trim()}>{busy?'Search in progress…':'Search jobs'}</button></form>
 <p className={styles.help}>Comma-separated keywords use the repo’s matching rules. This is a sampled scan, not complete US coverage. Your CV is not used or sent to job sources. Search results expire after 24 hours. Unknown work arrangements are excluded when you choose a specific arrangement.</p>
 {error?<p role="alert">{error}</p>:null}{notice?<p role="status">{notice}</p>:null}
 {active(run)?<div role="status"><p>{run?.state==='queued'?'Queued for your local scanner. Keep the computer and discovery worker running.':'Scanning employer boards. This can take several minutes.'}</p><button className={styles.quiet} onClick={()=>void cancel()} disabled={sending}>Cancel search</button></div>:null}
 {run?.state==='failed'?<p role="alert">The scanner could not finish. Try again with a smaller scan or check that your local discovery worker is running.</p>:null}
 {result?<><p role="status">{result.jobs.length} matches · {result.companiesScanned} boards scanned. {result.partial?'Partial coverage: some boards were capped, unavailable, undated, or the scan stopped early.':'This sampled scan finished.'}{result.displayCapped?' Showing the first 50 matches. Narrow your keywords to refine results.':''}</p>
 {!result.jobs.length?<p>No matches in this sample. Try broader role/location keywords, 30 days, or more boards per source.</p>:null}
 <div className={css.results}>{result.jobs.map(job=><article key={job.id} className={css.result}><p className={styles.eyebrow}>{job.company}</p><h3>{job.title}</h3><p>{job.location} · {job.source}{job.postedAt?` · ${job.postedAt}`:''}</p><p className={css.excerpt}>{job.descriptionAvailable?`${job.description.slice(0,260)}…`:'The scanner returned this role without a complete description. Open the employer posting for details.'}</p><div className={styles.actions}><button className={styles.primary} disabled={disabled||!job.descriptionAvailable} onClick={()=>select(job)}>Use this job</button><a href={job.url} target="_blank" rel="noopener noreferrer">View employer posting</a></div></article>)}</div></>:null}
 </section>;
}
