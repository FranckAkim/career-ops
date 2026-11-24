'use client';
import {useEffect,useRef,useState} from 'react';
import styles from './screen.module.css';
import css from './job-search.module.css';
export type Workflow={state?:string;appliedOn?:string;deadline?:string;followUpOn?:string;contact?:string;notes?:string;nextAction?:string};
export function JobWorkflow({base,id,revision,value,onSaved}:{base:string;id:string;revision:number;value?:Workflow;onSaved:()=>Promise<void>}){
 const [draft,setDraft]=useState<Workflow>({state:'new',appliedOn:'',deadline:'',followUpOn:'',contact:'',notes:'',nextAction:'',...value}),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const operation=useRef<AbortController|null>(null);useEffect(()=>()=>operation.current?.abort(),[base,id]);
 async function save(){if(busy)return;const controller=new AbortController();operation.current=controller;setBusy(true);setMessage('');try{
  const response=await fetch(`${base}/saved-jobs/${id}/workflow`,{method:'POST',signal:controller.signal,headers:{'content-type':'application/json'},body:JSON.stringify({expectedRevision:revision,workflow:draft})});
  if(!response.ok)throw Error(response.status===409?'This job changed in another tab. Copy your notes, refresh the saved list, and try again.':'Could not save your follow-up plan. Your edits are still here.');
  if(!controller.signal.aborted){setMessage('Follow-up plan saved.');try{await onSaved();}catch{setMessage('Plan saved, but the list could not refresh. Refresh matches to reload it.');}}
 }catch(error){if(!controller.signal.aborted)setMessage((error as Error).message);}finally{if(!controller.signal.aborted)setBusy(false);}}
 function text(key:keyof Workflow,value:string){setDraft(previous=>({...previous,[key]:value}));}
 return <details className={css.workflow}><summary>Review state &amp; follow-up plan</summary><p>Private planning notes. Recording an application date does not submit an application or change its tracker stage.</p>
 <label>Review state<select aria-label="Review state" value={draft.state} disabled={busy} onChange={e=>text('state',e.target.value)}><option value="new">New</option><option value="seen">Seen</option><option value="dismissed">Dismissed</option></select></label>
 <label>Applied on<input aria-label="Applied on" type="date" value={draft.appliedOn} disabled={busy} onChange={e=>text('appliedOn',e.target.value)}/></label>
 <label>Application deadline<input aria-label="Application deadline" type="date" value={draft.deadline} disabled={busy} onChange={e=>text('deadline',e.target.value)}/></label>
 <label>Follow up on<input aria-label="Follow up on" type="date" value={draft.followUpOn} disabled={busy} onChange={e=>text('followUpOn',e.target.value)}/></label>
 <label>Contact<input aria-label="Contact" value={draft.contact} maxLength={300} disabled={busy} onChange={e=>text('contact',e.target.value)}/></label>
 <label>Next action<input aria-label="Next action" value={draft.nextAction} maxLength={500} disabled={busy} onChange={e=>text('nextAction',e.target.value)}/></label>
 <label>Private notes<textarea aria-label="Private notes" value={draft.notes} maxLength={4000} disabled={busy} onChange={e=>text('notes',e.target.value)}/></label>
 <button type="button" className={styles.quiet} disabled={busy} onClick={()=>void save()}>{busy?'Saving plan…':'Save follow-up plan'}</button>{message?<p role="status">{message}</p>:null}
 </details>;
}
