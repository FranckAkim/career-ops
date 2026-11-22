import css from './job-search.module.css';
export type PostingMetadata={applicationLink?:string;applicationKind?:string;sourceName?:string;sourceHost?:string;checkedAt?:string|null;workplaceType?:string|null;employmentType?:string|null;applicationDeadline?:string|null;department?:string|null;requisitionId?:string|null;salary?:{min:number;max:number;currency:string;period:string}|null};
const labels:Record<string,string>={remote:'Remote',hybrid:'Hybrid',onsite:'On-site',full_time:'Full-time',part_time:'Part-time',contract:'Contract',temporary:'Temporary',internship:'Internship'};
function safeLink(value:string|undefined){try{const u=new URL(value||'');return u.protocol==='https:'&&!u.username&&!u.password&&!u.port?u.href:null;}catch{return null;}}
export function PostingDetails({job}:{job:PostingMetadata&{source:string;postedAt:string|null}}){
 const salary=job.salary;
 return <div className={css.metadata}>
 <p>{job.sourceName?`Employer ATS: ${job.sourceName}`:`Source: ${job.source}`}{job.sourceHost?` · ${job.sourceHost}`:''}</p>
 <p>{job.postedAt?`${job.source==='ashby-full'?'Published / republished':'Source posting date'}: ${job.postedAt}`:'Posting date not supplied'}{job.checkedAt?<> · Checked <time dateTime={job.checkedAt}>{new Date(job.checkedAt).toISOString().replace('T',' ').slice(0,16)} UTC</time></>:' · Check time unavailable; run a new search'}</p>
 <p>{labels[job.workplaceType||'']||'Work arrangement not supplied'} · {labels[job.employmentType||'']||'Employment type not supplied'}</p>
 {salary?<p>Annualized base pay: {salary.currency} {salary.min.toLocaleString('en-US')}{salary.max!==salary.min?`–${salary.max.toLocaleString('en-US')}`:''} / year. Source range; check location and hours.</p>:<p>Pay range not supplied in structured source data; check the description.</p>}
 {job.applicationDeadline?<p>Apply by: <time dateTime={job.applicationDeadline}>{new Date(job.applicationDeadline).toISOString().replace('T',' ').slice(0,16)} UTC</time></p>:null}{job.department?<p>Department: {job.department}</p>:null}{job.requisitionId?<p>Requisition: {job.requisitionId}</p>:null}
 </div>;
}
export function PostingLinks({job}:{job:PostingMetadata&{url:string}}){
 const posting=safeLink(job.url),application=safeLink(job.applicationLink)||posting;
 return <>{application?<a href={application} target="_blank" rel="noopener noreferrer">Apply on employer site ↗</a>:null}{posting&&posting!==application?<a href={posting} target="_blank" rel="noopener noreferrer">View employer posting ↗</a>:null}<span className={css.linkNote}>{job.applicationKind==='form'?'Opens the employer’s application form.':'Opens the posting with application instructions.'} You review and submit on the employer site.</span></>;
}
