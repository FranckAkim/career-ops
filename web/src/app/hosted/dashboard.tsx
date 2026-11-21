'use client';

import {useState, type ReactNode} from 'react';
import {workspaceSummary,operationLabel} from '@/lib/workspace-summary.mjs';
import {Applications} from './applications';
import {ProfileEditor} from './profile-editor';
import {DataControls} from './data-controls';
import {ProcessingNotice} from './processing-notice';
import d from './dashboard.module.css';

export type DashboardJob = {id:string;operation:string;status:string;company?:string;role?:string;score?:string;pdf?:string;evaluation_job_id?:string;created_at:string};
type View = 'overview'|'opportunities'|'applications'|'cvs'|'profile'|'settings';
const paths={home:'m3 10 9-7 9 7v11h-6v-7H9v7H3Z',search:'m21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',file:'M14 2H5v20h14V7Zm0 0v6h5M8 12h8M8 16h8',user:'M20 22v-3a7 7 0 0 0-14 0v3M17 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0',settings:'m12 2 3 4 5 1v5l-3 4v5h-5l-4-3H3v-5l3-4V5h5ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',layers:'m2 7 10-5 10 5-10 5Zm0 5 10 5 10-5M2 17l10 5 10-5',clock:'M12 7v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',check:'m5 12 4 4L20 5',arrow:'M4 12h16m-6-6 6 6-6 6',shield:'m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6Z',plus:'M12 4v16M4 12h16'};
function Icon({name}: {name:keyof typeof paths}){return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]}/></svg>;}
const navigation=[['overview','Overview','home'],['opportunities','Opportunities','search'],['applications','Applications','layers'],['cvs','CV Studio','file'],['profile','My Profile','user'],['settings','Settings','settings']] as const;
const statusLabel:Record<string,string>={queued:'Queued',running:'In progress',cancel_requested:'Stopping',succeeded:'Complete',failed:'Failed',cancelled:'Cancelled',needs_recovery:'Needs review'};
const shortDate=(value:string)=>new Date(value).toLocaleDateString(undefined,{month:'short',day:'numeric'});

export function Dashboard({jobs,tenantId,userName,loaded,executionMode,onOpenJob,onSignOut,signingOut,enqueue,recovery,applicationsEnabled,alert,children}: {jobs:DashboardJob[];tenantId:string;userName:string;loaded:boolean;executionMode:string;onOpenJob:(id:string)=>void;onSignOut:()=>void;signingOut:boolean;enqueue:(input:Record<string,unknown>,key:string)=>Promise<void>;recovery:boolean;applicationsEnabled:boolean;alert?:string;children:ReactNode}){
  const [view,setView]=useState<View>('overview');
  const [search,setSearch]=useState('');
  const [deletionRequested,setDeletionRequested]=useState(false);
  if(deletionRequested)return <main className={`${d.panel} ${d.deletionReceipt}`}><h1>Deletion request received</h1><p role="status">Your account access is blocked and signed-in sessions are revoked. Stored-data removal is pending service-operator review. Your data has not been confirmed deleted.</p><a className={d.primary} href="/hosted">Return to sign-in</a></main>;
  const summary=workspaceSummary(jobs,search);
  const shown=new Set(summary.visible.map((item:DashboardJob)=>item.id));
  const base=`/api/hosted/tenants/${tenantId}`;
  function evaluateRole(){setView('opportunities');requestAnimationFrame(()=>document.getElementById('posting-text')?.focus());}
  function openJob(id:string){onOpenJob(id);setView('opportunities');}
  const titles={overview:'Your next move, in focus.',opportunities:'Your opportunities.',applications:'Your application pipeline.',cvs:'CVs you can stand behind.',profile:'Your confirmed profile.',settings:'Your workspace, your control.'};
  const subtitles={overview:'A clear view of your search. Built on your experience.',opportunities:'Evaluate the fit. Prepare your CV. You decide what to send.',applications:'Track the stages you have reached. Every application is still yours to send.',cvs:'Source-backed documents, checked before you download.',profile:'The career facts your evaluations and CVs build on.',settings:'Understand how your information is stored and processed.'};
  return <div className={d.dashboard}>
    <a className={d.skip} href="#workspace-main">Skip to workspace</a>
    <aside className={d.sidebar} aria-label="Workspace navigation">
      <a className={d.brand} href="/hosted"><span className={d.monogram}>CW</span><span>Career<br/> Workspace</span></a>
      <nav aria-label="Main navigation">{navigation.filter(([id])=>id!=='applications'||applicationsEnabled).map(([id,label,icon])=><button key={id} className={d.navItem} aria-current={view===id?'page':undefined} onClick={()=>setView(id)}><Icon name={icon}/>{label}</button>)}</nav>
      <div className={d.sidebarBottom}><p><span className={d.processingDot}/>{executionMode==='local'?'Local AI processing':'AI processing'}</p><small>Every application stays in your hands.</small><button className={d.account} onClick={()=>setView('profile')}><span className={d.avatar}>{userName.slice(0,1).toUpperCase()}</span><span>{userName}</span><Icon name="arrow"/></button></div>
    </aside>
    <main className={d.content} id="workspace-main" tabIndex={-1}>
      <header className={d.topbar}><p>Workspace <span>/</span> <strong>{navigation.find(([id])=>id===view)?.[1]}</strong></p><div className={d.topActions}><button className={d.primary} onClick={evaluateRole}><Icon name="plus"/>Evaluate a role</button><button className={d.secondary} onClick={onSignOut} disabled={signingOut}>Sign out</button></div></header>
      <div className={d.heading}><div><h1>{titles[view]}</h1><p>{subtitles[view]}</p></div>{(view==='overview'||view==='cvs')&&<label className={d.search}><Icon name="search"/><span className={d.srOnly}>Search recent work</span><input type="search" placeholder="Search roles, companies or CVs…" maxLength={200} value={search} onChange={event=>setSearch(event.target.value)}/></label>}</div>
      {alert&&<p className={d.error} role="alert">{alert}</p>}
      {view==='applications'&&applicationsEnabled&&<Applications tenantId={tenantId} revision={jobs.map(item=>item.id+item.status).join('|')} processing={summary.inProgress.length>0} recovery={recovery} enqueue={enqueue}/>}
      {view==='overview'&&<>
        <section className={d.stats} aria-label="Recent workspace summary">{[
          ['Evaluations',summary.completed.length,'search'],['CVs ready',summary.cvs.length,'file'],['In progress',summary.inProgress.length,'clock'],['Needs review',summary.review.length,'shield'],
        ].map(([label,count,icon])=><div className={d.stat} key={label}><span className={d.statIcon}><Icon name={icon as keyof typeof paths}/></span><div><strong>{loaded?count:'—'}</strong><span>{label}</span></div></div>)}</section>
        <p className={d.scope}>From your 100 most recent jobs. Evaluations and CVs are preparation steps; they do not mean an application was sent.</p>
        <div className={d.overviewGrid}>
          <section className={d.panel} aria-label="Opportunity progress"><div className={d.panelHeading}><div><h2>Opportunity progress</h2><p>From a clearer fit to a CV ready for review.</p></div><button className={d.textButton} onClick={()=>setView('opportunities')}>View all <Icon name="arrow"/></button></div>
            <div className={d.board}>{summary.columns.map((column:{title:string;items:DashboardJob[]})=><div className={d.column} key={column.title}><h3>{column.title}<span>{column.items.length}</span></h3>{column.items.slice(0,3).map(item=><button className={d.roleCard} key={item.id} onClick={()=>openJob(item.id)}><span className={d.company}><span className={d.companyIcon}>{(item.company||'CW').slice(0,2).toUpperCase()}</span>{item.company|| (item.operation==='tailor'?'CV preparation':'Role evaluation')}</span><strong>{item.role|| (item.operation==='tailor'?'Tailored CV':'Posting assessment')}</strong><span className={d.tag}>{item.score?`Fit ${item.score}`:statusLabel[item.status]||'Updating'}</span><small>{shortDate(item.created_at)}</small></button>)}{!column.items.length&&<p className={d.emptyColumn}>{search?'No matching work.':column.title==='Evaluated'?'Your completed evaluations appear here.':column.title==='In progress'?'No jobs are processing right now.':'Validated CVs appear here.'}</p>}</div>)}</div>
          </section>
          <div className={d.rightRail}><section className={d.panel}><h2>Your next steps</h2><p>Keep your search moving, one decision at a time.</p><div className={d.nextSteps}>
            {summary.review[0]&&<button onClick={()=>openJob(summary.review[0].id)}><Icon name="shield"/><span><strong>Review interrupted work</strong><small>Your saved workspace is intact</small></span><Icon name="arrow"/></button>}
            {summary.awaitingCV[0]&&<button onClick={()=>openJob(summary.awaitingCV[0].id)}><Icon name="file"/><span><strong>Prepare a tailored CV</strong><small>{summary.awaitingCV[0].company||'Review your evaluation first'}</small></span><Icon name="arrow"/></button>}
            <button onClick={evaluateRole}><Icon name="search"/><span><strong>Evaluate a new role</strong><small>Start with a job description</small></span><Icon name="arrow"/></button>
          </div></section>
          <section className={d.panel}><h2>CV Studio</h2><p>Confirmed experience. A document ready for your review.</p><div className={d.cvPreview}><div className={d.paper} aria-hidden="true"><b>{userName}</b><i/><i/><i/><hr/><i/><i/><i/></div><div><h3>{summary.cvs[0]?'Your latest tailored CV':'Your next tailored CV'}</h3><p className={d.tag}>{summary.cvs[0]?'Validation passed':'Built from confirmed facts'}</p><button className={d.secondary} onClick={()=>summary.cvs.length?setView('cvs'):evaluateRole()}>{summary.cvs[0]?'Review CVs':'Evaluate a role first'}</button></div></div></section></div>
        </div>
        <section className={d.panel} aria-label="Recent activity"><div className={d.panelHeading}><h2>Recent activity</h2><span className={d.subtle}>Your latest work</span></div>{summary.visible.slice(0,4).map((item:DashboardJob)=><button className={d.activity} key={item.id} onClick={()=>openJob(item.id)}><Icon name={item.operation==='tailor'?'file':'layers'}/><strong>{operationLabel(item.operation)}</strong><span>{item.company||item.role||statusLabel[item.status]}</span><span className={d.tag}>{statusLabel[item.status]||'Updating'}</span><time dateTime={item.created_at}>{shortDate(item.created_at)}</time></button>)}{!summary.visible.length&&<div className={d.empty}><Icon name="layers"/><h3>{search?'No matching work yet.':'Your next move starts with one role.'}</h3><p>{search?'Try another company or role.':'Paste a posting, review the fit, and prepare a CV grounded in your experience.'}</p>{!search&&<button className={d.secondary} onClick={evaluateRole}>Evaluate your first role</button>}</div>}</section>
      </>}
      <section className={d.workbench} hidden={view!=='opportunities'} aria-label="Evaluation workspace">{children}</section>
      {view==='cvs'&&<section className={d.documentGrid} aria-label="CV library">{summary.cvs.filter((item:DashboardJob)=>shown.has(item.id)).map((item:DashboardJob)=><article className={d.panel} key={item.id}><div className={d.documentIcon}><Icon name="file"/></div><p className={d.tag}>Validation passed</p><h2>Tailored CV</h2><p>Created {shortDate(item.created_at)} from your confirmed profile.</p><div className={d.documentActions}><a className={d.primary} href={`${base}/artifacts/${item.id}/pdf`}>Download PDF</a><button className={d.secondary} onClick={()=>openJob(item.id)}>View details</button></div></article>)}{!summary.cvs.some((item:DashboardJob)=>shown.has(item.id))&&<div className={d.panel}><h2>{search?'No matching CVs.':'Your CV library starts here.'}</h2><p>Complete a role evaluation, then prepare a tailored CV. Documents appear here after validation.</p><button className={d.primary} onClick={evaluateRole}>Evaluate a role</button></div>}</section>}
      {view==='profile'&&<ProfileEditor tenantId={tenantId} blocked={recovery||summary.inProgress.length>0}/>}
      {view==='settings'&&<section className={d.panel}><h2>Processing and privacy</h2><dl className={d.profileDetails}><div><dt>AI processing</dt><dd>{executionMode==='local'?'On the service operator’s computer':'Configured by the service operator'}</dd></div><div><dt>Workspace storage</dt><dd>Hosted account, profile and document storage</dd></div><div><dt>Application submission</dt><dd>You review and send every application yourself</dd></div></dl><ProcessingNotice mode={executionMode}/><p>Automatic retention limits are not available in this preview. See the available account controls below.</p></section>}
      {view==='settings'&&<DataControls tenantId={tenantId} onDeletionRequested={()=>setDeletionRequested(true)}/>}
      <footer className={d.footer}><Icon name="shield"/><ProcessingNotice mode={executionMode}/></footer>
    </main>
  </div>;
}
