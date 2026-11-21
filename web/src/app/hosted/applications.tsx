'use client';
import {useEffect,useRef,useState} from 'react';
import d from './dashboard.module.css';

type Application={number:number;rowHash:string;company:string;role:string;score:string;status:string|null;pdfReady:boolean;date:string};
type Tracker={initialized:boolean;applications:Application[];states:string[];generation:string};
type Props={tenantId:string;revision:string;processing:boolean;recovery:boolean;enqueue:(input:Record<string,unknown>,key:string)=>Promise<void>};
function ApplicationRow({application,states,disabled,enqueue}: {application:Application;states:string[];disabled:boolean;enqueue:Props['enqueue']}){
  const [target,setTarget]=useState(application.status||'');const[confirmed,setConfirmed]=useState(false);const[busy,setBusy]=useState(false);const[error,setError]=useState('');
  const retry=useRef<{input:string;key:string}|null>(null);
  async function save(event:React.FormEvent){
    event.preventDefault();setBusy(true);setError('');
    const input={operation:'set_status',applicationNumber:application.number,expectedStatus:application.status,expectedRowHash:application.rowHash,targetStatus:target},fingerprint=JSON.stringify(input);
    if(retry.current?.input!==fingerprint)retry.current={input:fingerprint,key:crypto.randomUUID()};
    try{await enqueue(input,retry.current.key);retry.current=null;}catch(error){setError((error as Error).message||'Could not queue this update. Refresh the tracker before trying again.');}finally{setBusy(false);}
  }
  return <article className={d.panel}><div className={d.panelHeading}><div><h2>{application.company}</h2><p>{application.role}</p></div><span className={d.tag} aria-label="Current application status">{application.status||'Needs review'}</span></div>
    <p>Fit {application.score} · {application.pdfReady?'CV ready':'CV not prepared'}</p>
    <form className={d.statusForm} onSubmit={save}><label htmlFor={`status-${application.number}`}>Application status</label><select id={`status-${application.number}`} value={target} onChange={event=>{setTarget(event.target.value);setConfirmed(false);}} disabled={disabled||busy||!application.status}>{!application.status&&<option value="">Unrecognized status</option>}{states.map(state=><option key={state} value={state}>{state}</option>)}</select>
      {target==='Applied'&&target!==application.status&&<label className={d.confirmStatus}><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)} disabled={disabled||busy}/>I have already submitted this application myself.</label>}
      <button className={d.primary} disabled={disabled||busy||!application.status||target===application.status||(target==='Applied'&&!confirmed)}>{busy?'Queuing…':'Save status'}</button>
    </form>{error&&<p role="alert">{error}</p>}
  </article>;
}
export function Applications({tenantId,revision,processing,recovery,enqueue}:Props){
  const[tracker,setTracker]=useState<Tracker|null>(null);const[error,setError]=useState('');const[busy,setBusy]=useState(false);const[search,setSearch]=useState('');const[filter,setFilter]=useState('all');const[reload,setReload]=useState(0);const syncKey=useRef<string|null>(null);
  useEffect(()=>{const controller=new AbortController();setError('');(async()=>{const r=await fetch(`/api/hosted/tenants/${tenantId}/applications`,{signal:controller.signal,cache:'no-store'});if(!r.ok)throw Error();const data=await r.json();if(!controller.signal.aborted)setTracker(data);})().catch(()=>{if(!controller.signal.aborted)setError('Could not load the application tracker. Please refresh it.');});return()=>controller.abort();},[tenantId,revision,reload]);
  async function sync(){setBusy(true);setError('');syncKey.current??=crypto.randomUUID();try{await enqueue({operation:'sync_applications'},syncKey.current);syncKey.current=null;}catch{setError('Could not queue the tracker sync. Please try again.');}finally{setBusy(false);}}
  const visible=(tracker?.applications||[]).filter(item=>(filter==='all'||item.status===filter)&&`${item.company} ${item.role}`.toLowerCase().includes(search.toLowerCase().trim()));
  return <section aria-label="Application tracker"><div className={d.panelHeading}><p>Record stages you have reached. Saving a status never sends an application.</p><button className={d.secondary} onClick={()=>setReload(value=>value+1)}>Refresh tracker</button></div>
    {error&&<p role="alert" className={d.error}>{error}</p>}{processing&&<p role="status" className={d.applicationNotice}>A workspace job is processing. Status changes appear here after publication.</p>}{recovery&&<p role="alert">An interrupted job needs review in Opportunities before more changes can run.</p>}
    {!tracker&&!error?<p role="status">Loading your application tracker…</p>:tracker&&!tracker.initialized?<div className={d.panel}><h2>Load your existing tracker.</h2><p>This one-time sync reads the saved tracker through the worker. It does not use AI.</p><button className={d.primary} onClick={sync} disabled={processing||recovery||busy}>{busy?'Queuing…':'Sync application tracker'}</button></div>:tracker&&<>
      <section className={d.stats} aria-label="Application stages">{['Applied','Interview','Offer','Hired'].map(stage=><div className={d.stat} key={stage}><div><strong>{tracker.applications.filter(item=>item.status===stage).length}</strong><span>{stage}</span></div></div>)}</section>
      <div className={d.applicationFilters}><label>Search applications<input type="search" value={search} onChange={event=>setSearch(event.target.value)} maxLength={200} placeholder="Company or role"/></label><label>Filter by status<select value={filter} onChange={event=>setFilter(event.target.value)}><option value="all">All statuses</option>{tracker.states.map(state=><option key={state}>{state}</option>)}</select></label></div>
      <div className={d.documentGrid}>{visible.slice(0,100).map(application=><ApplicationRow key={`${application.number}:${application.rowHash}:${application.status}`} application={application} states={tracker.states} disabled={processing||recovery||busy} enqueue={enqueue}/>)}</div>
      {!visible.length&&<div className={d.panel}><h2>{tracker.applications.length?'No matching applications.':'Your tracker is ready.'}</h2><p>{tracker.applications.length?'Try another search or status.':'Evaluate a posting in Opportunities to add your first role.'}</p></div>}
      <p className={d.scope}>{tracker.applications.length} tracked roles. Showing up to 100 matching roles. Statuses come from your published tracker.</p>
    </>}
  </section>;
}
