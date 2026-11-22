'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import styles from './screen.module.css';
import css from './job-search.module.css';
import {WorkAuthorization,type AuthorizationEvidence} from './work-authorization';
export type SavedPosting={visaText?:string;authorization?:AuthorizationEvidence;id:string;url:string;title:string;company:string;description:string;descriptionAvailable:boolean;location:string;source:string;postedAt:string|null};
type Entry={id:string;posting:SavedPosting;shortlisted:boolean;revision:number;created_at:string};
export function SavedJobs({base,refresh,disabled,onSelect,onUrls}:{base:string;refresh:number;disabled:boolean;onSelect:(job:SavedPosting)=>void;onUrls:(urls:string[])=>void}){
 const[jobs,setJobs]=useState<Entry[]|null>(null),[shortlistOnly,setShortlistOnly]=useState(false),[busy,setBusy]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[removing,setRemoving]=useState('');
 const mutation=useRef<AbortController|null>(null);
 useEffect(()=>()=>mutation.current?.abort(),[base]);
 const apply=useCallback((items:Entry[])=>{setJobs(items);onUrls(items.map(item=>item.posting.url));},[onUrls]);
 const load=useCallback(async(signal?:AbortSignal)=>{const response=await fetch(`${base}/saved-jobs`,{signal,cache:'no-store'});if(!response.ok)throw Error('Could not load saved jobs. Refresh to try again.');const value=await response.json();if(!signal?.aborted)apply(value.jobs);},[base,apply]);
 useEffect(()=>{const controller=new AbortController();void load(controller.signal).catch(e=>{if(!controller.signal.aborted)setError(e.message);});return()=>controller.abort();},[load,refresh]);
 async function change(item:Entry,action:'shortlist'|'remove'){
  const controller=new AbortController();mutation.current=controller;setBusy(item.id);setError('');setNotice('');
  try{const response=await fetch(`${base}/saved-jobs/${item.id}/${action}`,{method:'POST',signal:controller.signal,headers:{'content-type':'application/json'},body:JSON.stringify({expectedRevision:item.revision,...(action==='shortlist'?{shortlisted:!item.shortlisted}:{})})});
   if(!response.ok){if(response.status===409){await load(controller.signal);throw Error('This saved job changed in another tab. The list has been refreshed.');}throw Error('Could not update the saved job. Please try again.');}
   await load(controller.signal);if(!controller.signal.aborted){setRemoving('');setNotice(action==='remove'?'Saved job removed. Your evaluations and applications are unchanged.':item.shortlisted?'Removed from shortlist. The job is still saved.':'Added to your shortlist.');}
  }catch(e){if(!controller.signal.aborted)setError((e as Error).message);}finally{if(!controller.signal.aborted)setBusy('');}
 }
 const visible=(jobs||[]).filter(item=>!shortlistOnly||item.shortlisted);
 return <section className={`${styles.card} ${css.search}`} aria-label="Saved jobs"><p className={styles.eyebrow}>Keep promising roles</p><h2>Saved jobs &amp; shortlist</h2><p>Keep up to 30 postings after search results expire. Saved copies stay until you remove them or account data is removed. Check the employer’s page before applying; a saved copy does not prove a job is still open.</p>
 <label className={css.shortlistToggle}><input type="checkbox" checked={shortlistOnly} onChange={event=>setShortlistOnly(event.target.checked)}/>Shortlist only</label>
 {jobs===null&&!error?<p role="status">Loading saved jobs…</p>:null}{error?<p role="alert">{error}</p>:null}{notice?<p role="status">{notice}</p>:null}
 {jobs!==null?<p>{jobs.length} saved · {jobs.filter(item=>item.shortlisted).length} shortlisted</p>:null}
 {jobs!==null&&!visible.length?<p>{shortlistOnly?'Your shortlist is empty. Add a saved job to your shortlist.':'Save a result from your search to keep it here.'}</p>:null}
 <div className={css.results}>{visible.map(item=><article key={item.id} className={css.result}><p className={styles.eyebrow}>{item.posting.company}{item.shortlisted?' · Shortlisted':''}</p><h3>{item.posting.title}</h3><p>{item.posting.location} · Saved {new Date(item.created_at).toLocaleDateString()}</p>
 <WorkAuthorization value={item.posting.authorization}/>
 {item.posting.description?<details className={css.description}><summary>Read saved description</summary><p tabIndex={0}>{item.posting.description}</p></details>:<p>Description not available. Open the employer posting.</p>}
 <div className={styles.actions}><button className={styles.primary} disabled={disabled||!item.posting.descriptionAvailable} onClick={()=>onSelect(item.posting)}>Use this saved job</button><button className={styles.quiet} disabled={!!busy} onClick={()=>void change(item,'shortlist')}>{item.shortlisted?'Remove from shortlist':'Add to shortlist'}</button><a href={item.posting.url} target="_blank" rel="noopener noreferrer">View employer posting</a><button className={styles.quiet} disabled={!!busy} onClick={()=>setRemoving(item.id)}>Remove saved job</button></div>
 {removing===item.id?<div><p>Remove this saved copy? Your evaluations and applications will remain.</p><button className={styles.quiet} disabled={!!busy} onClick={()=>void change(item,'remove')}>Confirm removal</button><button className={styles.quiet} disabled={!!busy} onClick={()=>setRemoving('')}>Keep saved job</button></div>:null}
 </article>)}</div></section>;
}
