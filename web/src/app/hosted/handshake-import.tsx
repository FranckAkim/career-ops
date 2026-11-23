'use client';
import {useEffect,useRef,useState} from 'react';
import {CV_FILE_ACCEPT,readPostingFile} from '@/lib/hosted-cv-import.mjs';
import styles from './screen.module.css';
import css from './job-search.module.css';
export function HandshakeImport({base,onSaved}:{base:string;onSaved:()=>void}){
 const[url,setUrl]=useState(''),[title,setTitle]=useState(''),[company,setCompany]=useState(''),[location,setLocation]=useState(''),[text,setText]=useState(''),[reviewed,setReviewed]=useState(false),[reading,setReading]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const mounted=useRef(true),generation=useRef(0),request=useRef<AbortController|null>(null);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;generation.current++;request.current?.abort();};},[base]);
 async function upload(event:React.ChangeEvent<HTMLInputElement>){const file=event.target.files?.[0];event.target.value='';if(!file)return;const id=++generation.current;setReading(true);setError('');setNotice('');
  try{const value=await readPostingFile(file);if(mounted.current&&generation.current===id){setText(value);setReviewed(false);setNotice('Posting text extracted. Review it below before saving.');}}
  catch(e){if(mounted.current&&generation.current===id)setError((e as Error).message);}
  finally{if(mounted.current&&generation.current===id)setReading(false);}
 }
 async function save(event:React.FormEvent){event.preventDefault();if(reading||saving)return;const controller=new AbortController();request.current=controller;setSaving(true);setError('');
  try{const response=await fetch(`${base}/saved-jobs/import-handshake`,{method:'POST',signal:controller.signal,headers:{'content-type':'application/json'},body:JSON.stringify({url,title,company,location,description:text,acknowledged:reviewed})});const value=await response.json();if(!response.ok)throw Error(value.error==='saved_job_source_changed'?'A different copy of this posting is already saved. Remove that bookmark first to import the updated text. Existing evaluations and applications will remain.':value.error==='saved_job_limit'?'Your 30 saved-job slots are full. Remove a saved copy before importing.':response.status===400?'Check the Handshake job link, required fields, posting text and review confirmation.':'Could not save this posting. Try again or sign in again if your session ended.');
   if(!controller.signal.aborted){setUrl('');setTitle('');setCompany('');setLocation('');setText('');setReviewed(false);setNotice('Handshake posting saved. Choose Evaluate CV match in Saved jobs when ready.');onSaved();}
  }catch(e){if(!controller.signal.aborted)setError((e as Error).message);}finally{if(!controller.signal.aborted)setSaving(false);}
 }
 const busy=reading||saving;
 return <section className={`${styles.card} ${css.search}`} aria-label="Import a Handshake posting"><p className={styles.eyebrow}>Your university opportunities</p><h2>Import from Handshake.</h2><p>Open a job with your student Handshake account, then bring its link and full posting text here. This imports a copy you review; it does not connect your account or automatically search Handshake.</p>
 <form onSubmit={event=>void save(event)} className={css.form}>
 <label>Handshake job link<input type="url" value={url} onChange={event=>{setUrl(event.target.value);setReviewed(false);}} maxLength={4096} required disabled={busy} placeholder="https://app.joinhandshake.com/stu/jobs/123456"/></label>
 <label>Handshake job title<input value={title} onChange={event=>{setTitle(event.target.value);setReviewed(false);}} maxLength={200} required disabled={busy}/></label>
 <label>Handshake employer<input value={company} onChange={event=>{setCompany(event.target.value);setReviewed(false);}} maxLength={200} required disabled={busy}/></label>
 <label>Handshake location (optional)<input value={location} onChange={event=>{setLocation(event.target.value);setReviewed(false);}} maxLength={300} disabled={busy}/></label>
 <label>Upload saved posting<input type="file" accept={CV_FILE_ACCEPT} onChange={event=>void upload(event)} disabled={busy} aria-describedby="handshake-file-help"/></label>
 <p id="handshake-file-help">PDF, Word (.docx), Markdown or text, up to 5 MB. Your browser extracts the text; the original file stays on your device. Scanned PDFs need a text-based copy.</p>
 <label className={css.importText} htmlFor="handshake-posting-text">Handshake posting text<textarea id="handshake-posting-text" aria-label="Handshake posting text" value={text} onChange={event=>{setText(event.target.value);setReviewed(false);}} rows={12} minLength={20} maxLength={30000} required disabled={busy}/></label>
 <label className={`${css.authorizationUnknown} ${css.importText}`}><input type="checkbox" checked={reviewed} onChange={event=>setReviewed(event.target.checked)} disabled={busy}/>I reviewed this full posting text and checked that the link, employer and role match.</label>
 <p>Saving keeps this text in your private Saved jobs. H-1B/OPT labels use only the supplied wording. Dates, availability and university eligibility are not verified; check the original posting before applying.</p>
 <button className={styles.primary} disabled={busy||!reviewed||text.trim().length<20}>{reading?'Reading posting…':saving?'Saving posting…':'Save Handshake posting'}</button>
 </form>{notice?<p role="status">{notice}</p>:null}{error?<p role="alert">{error}</p>:null}</section>;
}
