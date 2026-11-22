'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import styles from './screen.module.css';
import css from './job-search.module.css';
import {SavedJobs,type SavedPosting} from './saved-jobs';
import {WorkAuthorization} from './work-authorization';
import {PostingDetails,PostingLinks} from './posting-details';
type Listing=SavedPosting & {id:string;url:string;title:string;company:string;description:string;descriptionAvailable:boolean;location:string;source:string;postedAt:string|null};
type Results={checkedAt?:string;filteredQuality?:number;sort?:string;jobs:Listing[];partial:boolean;timedOut:boolean;companiesScanned:number;filteredAuthorization?:number;authorizationFilter?:string;unreachableBoards:number;capHit:boolean;displayCapped:boolean};
type SearchInput={q:string;location:string;workplace:string;sinceDays:number;limitPerAts:number;authorization?:string;includeUnknown?:boolean};
type Run={id:string;state:string;input?:SearchInput;result?:Results;error_code?:string};
const active=(run:Run|null)=>!!run&&['queued','running'].includes(run.state);
export function JobSearch({base,disabled,onSelect,cloudDiscovery=false}:{base:string;disabled:boolean;onSelect:(text:string,url:string)=>void;cloudDiscovery?:boolean}){
 const[q,setQ]=useState(''),[location,setLocation]=useState('United States, USA, U.S., US Remote'),[workplace,setWorkplace]=useState('any'),[sinceDays,setSinceDays]=useState(14),[limit,setLimit]=useState(50);
 const[run,setRun]=useState<Run|null>(null),[sending,setSending]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const[authorization,setAuthorization]=useState('any'),[includeUnknown,setIncludeUnknown]=useState(false);
 const[resultFilter,setResultFilter]=useState('');
 const[showSaved,setShowSaved]=useState(false);
 const[savedRefresh,setSavedRefresh]=useState(0),[savedUrls,setSavedUrls]=useState<string[]>([]),[saving,setSaving]=useState('');
 const savedRequest=useRef<AbortController|null>(null);
 const onSavedUrls=useCallback((urls:string[])=>setSavedUrls(urls),[]);
 useEffect(()=>()=>savedRequest.current?.abort(),[base]);
 const operation=useRef<AbortController|null>(null);
 const[restoring,setRestoring]=useState(true);
 const restore=useCallback((value:Run|null)=>{setRun(value);setResultFilter('');if(value?.input){setQ(value.input.q);setLocation(value.input.location);setWorkplace(value.input.workplace);setSinceDays(value.input.sinceDays);setLimit(value.input.limitPerAts);setAuthorization(value.input.authorization||'any');setIncludeUnknown(value.input.includeUnknown===true);}},[]);
 useEffect(()=>{
  const controller=new AbortController();setRestoring(true);
  void fetch(`${base}/discovery`,{signal:controller.signal,cache:'no-store'}).then(async response=>{
   if(!response.ok)throw Error();const value=await response.json();if(!controller.signal.aborted)restore(value.run);
  }).catch(()=>{if(!controller.signal.aborted)setError('Could not restore the last search. You can try a new search.');}).finally(()=>{if(!controller.signal.aborted)setRestoring(false);});
  return()=>{controller.abort();operation.current?.abort();};
 },[base,restore]);
 const runId=run?.id;
 useEffect(()=>{
  if(!runId)return;const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
  async function poll(){try{
   const response=await fetch(`${base}/discovery/${runId}`,{signal:controller.signal,cache:'no-store'});
   if(controller.signal.aborted)return;
   if(response.status===404){setRun(null);setError('');setNotice('This search has expired or is no longer available. Start a new search.');return;}
   if(response.status===401||response.status===403){setRun(null);setError('Search access ended. Refresh the page and sign in again if needed.');return;}
   if(!response.ok)throw Error();const value=await response.json();if(controller.signal.aborted)return;
   setRun(previous=>previous?.id===runId?value:previous);setError('');if(['queued','running'].includes(value.state))timer=setTimeout(poll,2000);
  }catch{if(!controller.signal.aborted){setError('Could not refresh this search. Retrying…');timer=setTimeout(poll,5000);}}}
  void poll();return()=>{controller.abort();clearTimeout(timer);};
 },[base,runId]);
 async function search(){
  const controller=new AbortController();operation.current=controller;setSending(true);setError('');setNotice('');setResultFilter('');
  try{
   const response=await fetch(`${base}/discovery`,{method:'POST',signal:controller.signal,headers:{'content-type':'application/json'},body:JSON.stringify({q:q.trim(),location:location.trim(),workplace,sinceDays,limitPerAts:limit,authorization,includeUnknown})});
   if(response.status===409){
    const latest=await fetch(`${base}/discovery`,{signal:controller.signal,cache:'no-store'});if(!latest.ok)throw Error('Could not restore the active search. Refresh the page to try again.');const value=await latest.json();
    if(!controller.signal.aborted){restore(value.run);setNotice(value.run?'Your existing search was restored. Review it or cancel it before starting another.':'The earlier search is no longer available. Try starting this search again.');}return;
   }
   if(!response.ok)throw Error(response.status===429?'Search limit reached. Try again later.':response.status===401||response.status===403?'Search access ended. Refresh the page and sign in again if needed.':'Could not start the search. Please try again.');
   const value=await response.json();if(!controller.signal.aborted)setRun(value);
  }catch(e){if(!controller.signal.aborted)setError((e as Error).message);}finally{if(!controller.signal.aborted)setSending(false);}
 }
 async function cancel(){
  if(!run)return;const controller=new AbortController();operation.current=controller;setSending(true);setError('');
  try{
   const response=await fetch(`${base}/discovery/${run.id}/cancel`,{method:'POST',signal:controller.signal,headers:{'content-type':'application/json'},body:'{}'});
   if(response.status===404){const current=await fetch(`${base}/discovery/${run.id}`,{signal:controller.signal,cache:'no-store'});if(controller.signal.aborted)return;if(current.status===404){setRun(null);setNotice('This search has expired or is no longer available. Start a new search.');return;}if(!current.ok)throw Error();setRun(await current.json());setNotice('This search has already finished.');return;}
   if(!response.ok)throw Error();const value=await response.json();if(!controller.signal.aborted){setRun(value);setNotice('Search cancelled. No evaluation was started.');}
  }catch{if(!controller.signal.aborted)setError('Could not cancel. The search may have finished; refresh its status.');}finally{if(!controller.signal.aborted)setSending(false);}
 }
 function select(job:SavedPosting){onSelect(`Company: ${job.company}\nRole: ${job.title}\nLocation: ${job.location}\nSource: ${job.source}\n\n${job.description}${job.visaText?`\n\nAdditional source policy text:\n${job.visaText}`:''}`,job.url);setNotice(`${job.title} loaded below. Review the description, then choose Evaluate posting.`);requestAnimationFrame(()=>document.getElementById('posting-text')?.focus());}
 async function save(job:Listing){if(!run||saving)return;const controller=new AbortController();savedRequest.current=controller;setSaving(job.url);setError('');
  try{const response=await fetch(`${base}/saved-jobs`,{method:'POST',signal:controller.signal,headers:{'content-type':'application/json'},body:JSON.stringify({runId:run.id,jobId:job.id})});if(!response.ok)throw Error(response.status===409?'Your saved list is full or changed. Review saved jobs and try again.':response.status===404?'This search result expired. Search again before saving it.':response.status===413?'This posting is too large to save. You can still open the employer page.':'Could not save this job. Please try again.');if(!controller.signal.aborted){setNotice('Job saved. It will remain after this search expires.');setSavedRefresh(value=>value+1);}}
  catch(e){if(!controller.signal.aborted)setError((e as Error).message);}finally{if(!controller.signal.aborted)setSaving('');}
 }
 const busy=restoring||sending||active(run),result=run?.result;
 const filterText=resultFilter.trim().toLowerCase();
 const visibleJobs=(result?.jobs||[]).filter(job=>`${job.title} ${job.company} ${job.location}`.toLowerCase().includes(filterText));
 return <><div className={styles.actions} role="group" aria-label="Opportunity views"><button className={styles.quiet} aria-pressed={!showSaved} onClick={()=>setShowSaved(false)}>Find jobs</button><button className={styles.quiet} aria-label="Saved jobs" aria-pressed={showSaved} onClick={()=>setShowSaved(true)}>Saved jobs ({savedUrls.length})</button></div><div hidden={!showSaved}><SavedJobs base={base} refresh={savedRefresh} disabled={disabled} onSelect={job=>{setShowSaved(false);select(job);}} onUrls={onSavedUrls}/></div><section hidden={showSaved} className={`${styles.card} ${css.search}`} aria-label="Find jobs">
 <p className={styles.eyebrow}>Built-in career-ops discovery</p><h2>Find your next role.</h2>
 <p>Search employer boards through the repo’s Greenhouse, Lever, Ashby and Workday scanner. {cloudDiscovery?'Search runs in the cloud, including while your computer is off.':'Scans run on your computer and wait while it is offline.'}</p>
 <form onSubmit={e=>{e.preventDefault();void search();}} className={css.form}>
 <label>Role or keywords<input value={q} onChange={e=>setQ(e.target.value)} maxLength={120} placeholder="e.g. project manager, program manager" required disabled={busy}/></label>
 <label>Location keywords<input value={location} onChange={e=>setLocation(e.target.value)} maxLength={120} required disabled={busy}/></label>
 <label>Work arrangement<select aria-label="Work arrangement" value={workplace} onChange={e=>setWorkplace(e.target.value)} disabled={busy}><option value="any">Any arrangement</option><option value="remote">Remote</option><option value="hybrid">Hybrid</option><option value="onsite">On-site</option></select></label>
 <label>Posted within<select aria-label="Posted within" value={sinceDays} onChange={e=>setSinceDays(Number(e.target.value))} disabled={busy}>{[7,14,30].map(n=><option key={n} value={n}>{n} days</option>)}</select></label>
 <label>Boards per source<select aria-label="Boards per source" value={limit} onChange={e=>setLimit(Number(e.target.value))} disabled={busy}>{[25,50,100].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
 <label>Work authorization<select aria-label="Work authorization" value={authorization} onChange={event=>{setAuthorization(event.target.value);if(event.target.value==='any')setIncludeUnknown(false);}} disabled={busy}><option value="any">Any policy</option><option value="h1b">H-1B sponsorship / transfers</option><option value="opt">OPT / STEM OPT acceptance</option><option value="either">H-1B or OPT</option><option value="both">H-1B and OPT</option></select></label>
 <label className={css.authorizationUnknown}><input type="checkbox" checked={includeUnknown} onChange={event=>setIncludeUnknown(event.target.checked)} disabled={busy||authorization==='any'}/>Include unclear work-authorization policies</label>
 <button className={styles.primary} disabled={busy||!q.trim()||!location.trim()}>{restoring?'Restoring search…':busy?'Search in progress…':'Search jobs'}</button></form>
 <p className={styles.help}>Comma-separated keywords use the repo’s matching rules. This is a sampled scan, not complete US coverage. Your CV is not used or sent to job sources. Search results expire after 24 hours. Unknown work arrangements are excluded when you choose a specific arrangement.</p>
 <p className={styles.help}>Authorization filters use explicit posting wording. OPT acceptance and future H-1B sponsorship are separate policies. Read the matching evidence and confirm requirements with the employer.</p>
 {error?<p role="alert">{error}</p>:null}{notice?<p role="status">{notice}</p>:null}
 {active(run)?<div role="status"><p>{run?.state==='queued'?(cloudDiscovery?'Queued for the cloud scanner. You can leave this page and return later.':'Queued for your local scanner. Keep the computer and discovery worker running.'):'Scanning employer boards. This can take several minutes.'}</p><button className={styles.quiet} onClick={()=>void cancel()} disabled={sending}>Cancel search</button></div>:null}
 {run?.state==='failed'?<p role="alert">{cloudDiscovery?'The cloud scanner could not finish. Try again with a smaller scan.':'The scanner could not finish. Try again with a smaller scan or check that your local discovery worker is running.'}</p>:null}
 {result?<><p className={styles.help}>{result.checkedAt?`Search checked ${new Date(result.checkedAt).toISOString().replace('T',' ').slice(0,16)} UTC. Newest source dates first.`:'Older search snapshot: refresh this search to check current source details.'} Results were listed on the employer ATS when checked; availability can change. Search again before applying to an older result.</p><p role="status">{result.jobs.length} matches · {result.companiesScanned} boards scanned. {result.partial?'Partial coverage: some boards were capped, unavailable, undated, or the scan stopped early.':'This sampled scan finished.'}{result.filteredQuality?` ${result.filteredQuality} postings were excluded for missing/old dates or unverifiable ATS links/check times.`:''}{result.filteredAuthorization?` ${result.filteredAuthorization} postings did not match your authorization filter.`:''}{result.displayCapped?' Showing up to 50 newest matching postings. Narrow your keywords to refine results.':''}</p>
 {!result.jobs.length?<p>{result.authorizationFilter&&result.authorizationFilter!=='any'?'No postings in this sample matched your authorization filter. Include unclear policies or broaden the scan to see more possibilities.':'No matches in this sample. Try broader role/location keywords, 30 days, or more boards per source.'}</p>:null}
 {result.jobs.length?<div className={css.filter}><label>Filter these results<input type="search" value={resultFilter} onChange={event=>setResultFilter(event.target.value)} maxLength={120} placeholder="Role, employer or location"/></label><p role="status">{visibleJobs.length} of {result.jobs.length} results shown. Filtering does not start another scan.</p>{resultFilter?<button className={styles.quiet} onClick={()=>setResultFilter('')}>Clear result filter</button>:null}</div>:null}
 {result.jobs.length&&!visibleJobs.length?<p>No results match this filter. Clear it to see all matches from your scan.</p>:null}
 <div className={css.results}>{visibleJobs.map(job=><article key={job.id} className={css.result}><p className={styles.eyebrow}>{job.company}</p><h3>{job.title}</h3><p>{job.location}</p><PostingDetails job={job}/><p className={css.excerpt}>{job.descriptionAvailable?`${job.description.slice(0,260)}…`:'The scanner returned this role without a complete description. Open the employer posting for details.'}</p><WorkAuthorization value={job.authorization}/>{job.description?<details className={css.description}><summary>{job.descriptionAvailable?'Read full description':'Read available description'}</summary><p tabIndex={0}>{job.description}</p></details>:null}<div className={styles.actions}><button className={styles.primary} disabled={disabled||!job.descriptionAvailable} onClick={()=>select(job)}>Use this job</button><button className={styles.quiet} disabled={!!saving||savedUrls.includes(job.url)} onClick={()=>void save(job)}>{savedUrls.includes(job.url)?'Saved':saving===job.url?'Saving…':'Save job'}</button><PostingLinks job={job}/></div></article>)}</div></>:null}
 </section></>;
}
