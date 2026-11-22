'use client';
import {useEffect,useRef,useState} from 'react';
import {readMachineSummary} from '@/lib/machine-summary.mjs';
import {splitSections} from '@/lib/report-sections.mjs';
import {splitPipeTables,parsePipeTable} from '@/lib/report-tables.mjs';
import css from './job-search.module.css';
export type MatchInfo={jobId:string;status:string;score:number|null;stale:boolean;createdAt:string;applicationNumber:number|null;applicationStatus:string|null};
export function MatchExplanation({base,match,onOpen}:{base:string;match:MatchInfo|null|undefined;onOpen?:(id:string)=>void}){
 const[report,setReport]=useState(''),[shown,setShown]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState('');const request=useRef<AbortController|null>(null);
 useEffect(()=>{setReport('');setShown(false);setError('');setLoading(false);return()=>request.current?.abort();},[base,match?.jobId]);
 if(!match)return <p className={css.matchNotice}>Not evaluated against your CV yet. Save this role and choose Evaluate CV match.</p>;
 const ready=match.status==='succeeded';
 async function explain(){if(shown){setShown(false);return;}setShown(true);if(report||!match)return;const controller=new AbortController();request.current=controller;setLoading(true);setError('');try{const response=await fetch(`${base}/artifacts/${match.jobId}/report`,{signal:controller.signal,cache:'no-store'});if(!response.ok)throw Error();const text=await response.text();if(text.length>2000000)throw Error();if(!controller.signal.aborted)setReport(text);}catch{if(!controller.signal.aborted)setError('Could not load the evaluation. Close and reopen this explanation to retry.');}finally{if(!controller.signal.aborted)setLoading(false);}}
 const summary=report?readMachineSummary(report):null;
 // Only report-owned sections before the archived, untrusted job description.
 const sections=report?splitSections(report.split(/^##\s+Job Description\b/im)[0]).sections:[];
 const matrix=sections.find(section=>section.letter==='B'||/^match with cv$/i.test(section.heading));
 const experience=sections.find(section=>section.letter==='C'||/level and strategy/i.test(section.heading));
 const tables=matrix?splitPipeTables(matrix.content).filter(part=>part.type==='table').map(part=>parsePipeTable(part.text)).filter(Boolean):[];
 return <section className={css.matchPanel} aria-label="CV match assessment"><p><strong>{ready&&match.score!==null?`Profile match: ${match.score.toFixed(1)} / 5`:['queued','running','cancel_requested'].includes(match.status)?'CV match evaluation in progress':ready?'Evaluation complete; numeric score unavailable':`Evaluation ${match.status.replaceAll('_',' ')}`}</strong></p>
 {match.stale?<p role="status">Your profile changed after this assessment. It is excluded from best-match ranking; evaluate again.</p>:ready?<p>Based on your confirmed profile and the saved posting. This is an AI assessment, not a hiring prediction.</p>:null}
 <p>H-1B/OPT posting evidence is shown separately. A match score does not establish work eligibility.</p>
 {ready?<><button type="button" onClick={()=>void explain()} disabled={loading}>{shown?'Hide match explanation':'Why this match?'}</button>{onOpen?<button type="button" onClick={()=>onOpen(match.jobId)}>Open evaluation &amp; CV actions</button>:null}</>:null}
 {shown?<div>{loading?<p role="status">Loading match evidence…</p>:null}{error?<p role="alert">{error}</p>:null}{report?<>
 {summary?.decision?<p>{summary.decision}</p>:null}
 <h4>Matching skills and strengths</h4>{summary?.strengths.length?<ul>{summary.strengths.slice(0,12).map((item,index)=><li key={index}>{item.slice(0,1000)}</li>)}</ul>:<p>The evaluator did not provide a separate strengths summary. Review its requirement evidence below.</p>}
 <h4>Missing or partial requirements</h4>{summary?.softGaps.length?<ul>{summary.softGaps.slice(0,12).map((item,index)=><li key={index}>{item.slice(0,1000)}</li>)}</ul>:<p>No separate gap summary was supplied. This does not mean every requirement is met.</p>}
 {tables.map((table,index)=>table?<div className={css.matchTable} key={index} tabIndex={0} role="region" aria-label="Requirement evidence"><table><thead><tr>{table.header.slice(0,6).map((cell,i)=><th key={i} scope="col">{cell}</th>)}</tr></thead><tbody>{table.rows.slice(0,30).map((row,i)=><tr key={i}>{row.slice(0,6).map((cell,j)=><td key={j}>{cell.slice(0,2000)}</td>)}</tr>)}</tbody></table></div>:null)}
 <h4>Experience and seniority</h4>{experience?<p className={css.matchText}>{experience.content.slice(0,8000)}</p>:<p>No separate experience assessment was provided. Check the original report before making a decision.</p>}
 {summary?.hardStops.length?<><h4>Other concerns from the evaluator</h4><ul>{summary.hardStops.slice(0,12).map((item,index)=><li key={index}>{item.slice(0,1000)}</li>)}</ul></>:null}
 <a href={`${base}/artifacts/${match.jobId}/report`}>Download original evaluation</a>
 </>:null}</div>:null}
 </section>;
}
