// Public source metadata only. Never fetch a browser-supplied URL.
const names={greenhouse:'Greenhouse',lever:'Lever',ashby:'Ashby',workday:'Workday',icims:'iCIMS',bamboohr:'BambooHR',paylocity:'Paylocity'};
function https(value){try{const u=new URL(value);return typeof value==='string'&&value.length<=4096&&u.protocol==='https:'&&!u.username&&!u.password&&!u.port?u:null;}catch{return null;}}
function roleUrl(value,provider){
 const u=https(value);if(!u||/%2f|%5c|%2e/i.test(u.pathname))return null;
 const p=u.pathname.replace(/\/$/,'');let ok=false;
 if(provider==='greenhouse')ok=['boards.greenhouse.io','boards.eu.greenhouse.io','job-boards.greenhouse.io','job-boards.eu.greenhouse.io'].includes(u.hostname)&&/^\/[^/]+\/jobs\/\d+$/.test(p);
 if(provider==='lever')ok=['jobs.lever.co','jobs.eu.lever.co'].includes(u.hostname)&&/^\/[^/]+\/[^/]+$/.test(p);
 if(provider==='ashby')ok=u.hostname==='jobs.ashbyhq.com'&&/^\/[^/]+\/[^/]+$/.test(p);
 if(provider==='workday')ok=/^[a-z0-9-]+\.wd\d+\.myworkdayjobs\.com$/.test(u.hostname)&&/^\/(?:[^/]+\/)?[^/]+\/job\/.+\/[^/]+$/.test(p);
 if(provider==='icims')ok=/^[a-z0-9-]+\.icims\.com$/.test(u.hostname)&&/^\/jobs\/\d+\/[^/]+\/job$/.test(p);
 if(provider==='bamboohr')ok=/^[a-z0-9-]+\.bamboohr\.com$/.test(u.hostname)&&/^\/careers\/\d+$/.test(p);
 if(provider==='paylocity')ok=u.hostname==='recruiting.paylocity.com'&&/^\/Recruiting\/Jobs\/Details\/\d+$/.test(p);
 if(!ok)return null;u.search='';u.hash='';u.pathname=p;return u;
}
export function handshakeUrl(value){
 const u=https(value);if(!u||u.hostname!=='app.joinhandshake.com'||!/^\/(?:stu\/)?jobs\/[1-9]\d*\/?$/.test(u.pathname))return null;
 return 'https://app.joinhandshake.com/stu/jobs/'+u.pathname.match(/\d+\/?$/)[0].replace(/\/$/,'');
}
export function postingDetails(job){
 if(job.source==='handshake-import'){
  const url=handshakeUrl(job.url);if(!url)return {};
  const date=Date.parse(job.importedAt);
  return {postingUrl:url,applicationLink:url,applicationKind:'posting',sourceName:'Handshake (imported)',sourceHost:'app.joinhandshake.com',checkedAt:null,provenance:'user_import',importedAt:Number.isFinite(date)?new Date(date).toISOString():null};
 }
 const provider=String(job.source||'').replace(/-full$/,'');if(!Object.hasOwn(names,provider)||job.source!==provider+'-full')return {};
 let posting=roleUrl(job.url,provider);
 // Greenhouse can return a custom employer URL. Its source-owned board/id
 // supplies a direct ATS destination without trusting that external hostname.
 const identity=job.listingIdentity;
 if(!posting&&provider==='greenhouse'&&identity?.ats_provider==='greenhouse'&&/^[a-z0-9_-]+$/i.test(identity.board_slug||'')&&/^\d+$/.test(identity.posting_id||''))posting=roleUrl(`https://job-boards.greenhouse.io/${identity.board_slug}/jobs/${identity.posting_id}`,provider);
 if(!posting)return {};
 let application=posting.href,applicationKind='posting';const supplied=https(job.applicationLink);
 // Accept only the same role's form on the exact same ATS host.
 if(supplied&&supplied.hostname===posting.hostname&&[posting.pathname+'/apply',posting.pathname+'/application'].includes(supplied.pathname.replace(/\/$/,''))){supplied.search='';supplied.hash='';application=supplied.href;applicationKind='form';}
 const checked=Date.parse(job.sourceCheckedAt??job.checkedAt),checkedAt=Number.isFinite(checked)?new Date(checked).toISOString():null;
 const deadline=typeof job.applicationDeadline==='string'?Date.parse(job.applicationDeadline):NaN;
 const salary=job.salary;
 const compensation=salary&&[salary.min,salary.max].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1e9)&&salary.min<=salary.max&&/^[A-Z]{3}$/.test(salary.currency||'')?{min:salary.min,max:salary.max,currency:salary.currency,period:'year'}:null;
 return {postingUrl:posting.href,applicationLink:application,applicationKind,sourceName:names[provider],sourceHost:posting.hostname,checkedAt,
  workplaceType:['remote','hybrid','onsite'].includes(job.workplaceType)?job.workplaceType:null,
  employmentType:['full_time','part_time','contract','temporary','internship'].includes(job.employmentType)?job.employmentType:null,
  salary:compensation,applicationDeadline:Number.isFinite(deadline)?new Date(deadline).toISOString():null,department:typeof job.department==='string'?job.department.slice(0,200):null,
  requisitionId:typeof job.requisitionId==='string'?job.requisitionId.slice(0,120):null};
}
export function postingDate(value,{now=Date.now(),sinceDays=14}={}){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
 const ms=Date.parse(value+'T00:00:00Z'),today=Math.floor(now/86400000)*86400000;
 if(!Number.isFinite(ms)||new Date(ms).toISOString().slice(0,10)!==value||ms>today||ms<today-sinceDays*86400000)return null;
 return value;
}
