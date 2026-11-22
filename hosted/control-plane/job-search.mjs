import {ControlError} from './queue.mjs';

const endpoint='https://himalayas.app/jobs/api/search';
const MAX_BYTES=3000000;
export function searchInput(params){
  if([...params.keys()].some(k=>!['q','country','page','seniority'].includes(k))||[...params.keys()].some(k=>params.getAll(k).length!==1))throw new ControlError('invalid_request');
  const q=(params.get('q')||'').trim(),country=params.get('country')||'US',page=params.get('page')||'1',seniority=params.get('seniority')||'';
  if(q.length>120||/[\x00-\x1f]/.test(q)||!['US','worldwide'].includes(country)||!/^([1-9]|[1-4][0-9]|50)$/.test(page)||!['','Entry-level','Mid-level','Senior','Manager','Director','Executive'].includes(seniority))throw new ControlError('invalid_request');
  return {q,country,page:Number(page),seniority};
}
export function postingText(html){
  if(typeof html!=='string'||html.length>150000)return '';
  const entities={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
  return html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,' ').replace(/<\/?(?:p|div|h[1-6]|li|br|ul|ol)\b[^>]*>/gi,'\n').replace(/<[^>]*>/g,' ').replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,(all,key)=>{if(key[0]!=='#')return entities[key.toLowerCase()]||all;const n=key[1].toLowerCase()==='x'?parseInt(key.slice(2),16):Number(key.slice(1));return n>0&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff)?String.fromCodePoint(n):' ';}).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'').replace(/[ \t]+/g,' ').replace(/\n\s*\n/g,'\n\n').trim().slice(0,30000);
}
function publicUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='himalayas.app'&&!u.username&&!u.password&&!u.port&&u.pathname.startsWith('/companies/')&&value.length<=4096?value:null;}catch{return null;}}
export function normalizeJobs(data,now=Date.now()){
  if(!data||!Array.isArray(data.jobs)||data.jobs.length>100)throw new ControlError('search_unavailable');
  const seen=new Set();return data.jobs.slice(0,20).flatMap(job=>{
    const url=publicUrl(job.guid),applicationLink=publicUrl(job.applicationLink),description=postingText(job.description);
    const expires=Number(job.expiryDate)*1000;
    if(!url||!applicationLink||seen.has(url)||!Number.isFinite(expires)||expires<=now||typeof job.title!=='string'||typeof job.companyName!=='string'||description.length<20)return [];
    seen.add(url);
    return [{id:url,url,applicationLink,title:job.title.slice(0,180),company:job.companyName.slice(0,180),description,expiresAt:new Date(expires).toISOString(),locations:Array.isArray(job.locationRestrictions)?job.locationRestrictions.filter(x=>typeof x==='string').slice(0,20).map(x=>x.slice(0,80)):[],employmentType:typeof job.employmentType==='string'?job.employmentType.slice(0,60):'',source:'Himalayas'}];
  });
}
export class JobSearch{
  constructor({fetcher=fetch,now=Date.now}={}){this.fetcher=fetcher;this.now=now;this.cache=new Map();this.pending=new Map();this.cooldown=0;this.windowStart=0;this.windowCalls=0;}
  async search(params){
    const input=searchInput(params),key=JSON.stringify(input),cached=this.cache.get(key);
    if(cached&&cached.until>this.now())return {...cached.value,jobs:cached.value.jobs.filter(j=>Date.parse(j.expiresAt)>this.now())};
    if(this.pending.has(key))return this.pending.get(key);
    if(this.cooldown>this.now()||this.pending.size>=4)throw new ControlError('search_rate_limited');
    if(this.now()-this.windowStart>=60000){this.windowStart=this.now();this.windowCalls=0;}
    if(this.windowCalls>=30)throw new ControlError('search_rate_limited');this.windowCalls++;
    const task=this.load(input).then(value=>{if(this.cache.size>=32)this.cache.delete(this.cache.keys().next().value);this.cache.set(key,{until:this.now()+600000,value});return value;}).finally(()=>this.pending.delete(key));
    this.pending.set(key,task);return task;
  }
  async load(input){
    const url=new URL(endpoint);url.searchParams.set('q',input.q);url.searchParams.set('page',String(input.page));url.searchParams.set('sort','relevant');if(input.country==='US')url.searchParams.set('country','US');else url.searchParams.set('worldwide','true');if(input.seniority)url.searchParams.set('seniority',input.seniority);
    try{
      const response=await this.fetcher(url,{headers:{accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(12000)});
      if(response.status===429){this.cooldown=this.now()+60000;throw new ControlError('search_rate_limited');}
      if(!response.ok||!response.headers.get('content-type')?.includes('application/json')||Number(response.headers.get('content-length'))>MAX_BYTES)throw new ControlError('search_unavailable');
      const reader=response.body.getReader(),chunks=[];let bytes=0;
      try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>MAX_BYTES)throw new ControlError('search_unavailable');chunks.push(Buffer.from(value));}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
      const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      return {jobs:normalizeJobs(data,this.now()),page:input.page,hasMore:data.jobs.length>0&&input.page<50,source:'Himalayas',fetchedAt:new Date(this.now()).toISOString(),country:input.country};
    }catch(error){if(error instanceof ControlError)throw error;throw new ControlError('search_unavailable');}
  }
}
