'use client';
import {useEffect,useRef,useState} from 'react';
import styles from './screen.module.css';
import css from './job-search.module.css';
type Listing={id:string;url:string;applicationLink:string;title:string;company:string;description:string;expiresAt:string;locations:string[];employmentType:string};
type Results={jobs:Listing[];page:number;hasMore:boolean;fetchedAt:string};
export function JobSearch({base,disabled,onSelect}:{base:string;disabled:boolean;onSelect:(text:string,url:string)=>void}){
 const[q,setQ]=useState(''),[country,setCountry]=useState('US'),[seniority,setSeniority]=useState('');
 const[result,setResult]=useState<Results|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const controller=useRef<AbortController|null>(null),last=useRef<URLSearchParams|null>(null);
 useEffect(()=>()=>controller.current?.abort(),[base]);
 useEffect(()=>{const timer=setInterval(()=>setResult(previous=>previous?{...previous,jobs:previous.jobs.filter(job=>Date.parse(job.expiresAt)>Date.now())}:null),60000);return()=>clearInterval(timer);},[]);
 async function search(page=1){
  controller.current?.abort();const current=new AbortController();controller.current=current;
  const params=page===1?new URLSearchParams({q:q.trim(),country,seniority}):new URLSearchParams(last.current!);params.set('page',String(page));
  setBusy(true);setError('');setNotice('');setResult(null);
  try{const response=await fetch(`${base}/discover?${params}`,{signal:current.signal,cache:'no-store'});if(!response.ok)throw new Error(response.status===429?'The job source is busy. Please wait a minute and try again.':'Could not load jobs. Please try again.');const value=await response.json();if(!current.signal.aborted){last.current=params;setResult(value);}}
  catch(e){if(!current.signal.aborted)setError((e as Error).message);}finally{if(!current.signal.aborted)setBusy(false);}
 }
 function select(job:Listing){if(Date.parse(job.expiresAt)<=Date.now()){setError('This listing has expired. Search again for current roles.');return;}onSelect(`Company: ${job.company}\nRole: ${job.title}\nLocation: Remote; ${job.locations.length?job.locations.join(', '):'Worldwide'}\nSource: Himalayas\n\n${job.description}`,job.url);setNotice(`${job.title} loaded below. Review the description, then choose Evaluate posting.`);requestAnimationFrame(()=>document.getElementById('posting-text')?.focus());}
 return <section className={`${styles.card} ${css.search}`} aria-label="Find jobs">
 <p className={styles.eyebrow}>Discover opportunities</p><h2>Find your next role.</h2>
 <p>Search remote jobs available to US applicants, including worldwide roles. On-site and hybrid jobs are not covered by this source.</p>
 <form onSubmit={e=>{e.preventDefault();void search();}} className={css.form}>
 <label>Role or keywords<input value={q} onChange={e=>setQ(e.target.value)} maxLength={120} placeholder="e.g. project manager" disabled={busy}/></label>
 <label>Location<select value={country} onChange={e=>setCountry(e.target.value)} disabled={busy}><option value="US">United States + worldwide</option><option value="worldwide">Worldwide only</option></select></label>
 <label>Experience<select value={seniority} onChange={e=>setSeniority(e.target.value)} disabled={busy}><option value="">Any level</option>{['Entry-level','Mid-level','Senior','Manager','Director','Executive'].map(level=><option key={level}>{level}</option>)}</select></label>
 <button className={styles.primary} disabled={busy}>{busy?'Searchingâ€¦':'Search jobs'}</button></form>
 <p className={styles.help}>Listings from <a href="https://himalayas.app" target="_blank" rel="noopener noreferrer">Himalayas</a>. Check each roleâ€™s location, work authorization and timezone requirements. Your CV is not sent to this source.</p>
 {error?<p role="alert">{error}</p>:null}{notice?<p role="status">{notice}</p>:null}
 {result?<><p role="status">{result.jobs.length?`${result.jobs.length} results on page ${result.page}.`:'No matching open jobs on this page. Try a broader title, another experience level, or the previous page.'}</p>
 <div className={css.results}>{result.jobs.map(job=><article key={job.id} className={css.result}><p className={styles.eyebrow}>{job.company}</p><h3>{job.title}</h3><p>Remote Â· {job.locations.length?job.locations.join(', '):'Worldwide'}{job.employmentType?` Â· ${job.employmentType}`:''}</p><p className={css.excerpt}>{job.description.slice(0,260)}â€¦</p><div className={styles.actions}><button className={styles.primary} disabled={disabled||busy} onClick={()=>select(job)}>Use this job</button><a href={job.url} target="_blank" rel="noopener noreferrer">View on Himalayas</a><a href={job.applicationLink} target="_blank" rel="noopener noreferrer">Apply on Himalayas</a></div></article>)}</div>
 <div className={styles.actions}><button className={styles.quiet} disabled={busy||result.page<=1} onClick={()=>void search(result.page-1)}>Previous page</button><button className={styles.quiet} disabled={busy||!result.hasMore} onClick={()=>void search(result.page+1)}>Next page</button></div></>:null}
 </section>;
}
