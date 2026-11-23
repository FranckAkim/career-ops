import {postingDetails,postingDate} from '../control-plane/posting-details.mjs';
import {classifyWorkAuthorization,matchesWorkAuthorization} from '../control-plane/work-authorization.mjs';
import {buildWorkplaceFilter,visaFilterText} from '../../scan.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {serializePortals} from '../../web/src/lib/core/portals-serialize.mjs';
import {scannerArgs} from '../../web/src/lib/core/scan-args.mjs';
import {discoveryInput} from '../control-plane/discovery.mjs';
const sources=['greenhouse','lever','ashby','workday'];
export function scanConfiguration(raw){
 const input=discoveryInput(raw);
 // Exactly the same ephemeral filter serializer and scanner arguments as Explore.
 const roles=input.q.split(',').map(s=>s.trim()).filter(Boolean),locations=input.location.split(',').map(s=>s.trim()).filter(Boolean);
 // Country-only US searches reuse core state/city safeguards. Never widen a
 // city-specific or mixed-country search, and never add bare 'remote'.
 const usOnly=locations.length>0&&locations.every(s=>/^(?:united states(?: of america)?|usa|u\.?s\.?a?\.?|us remote)$/i.test(s));
 // Reuse the core AND grammar; preserve explicit word:/stem:/+ expressions.
 const positive=roles.map(s=>input.titleMatch==='all_words'&&!/(?:\b(?:word|stem):|\s\+\s)/i.test(s)?s.split(/\s+/).join(' + '):s);
 const filters={positive,negative:[],allow:usOnly?['United States']:locations,block:[],blockHard:[],alwaysAllow:usOnly?['United States']:[]};
 let portals=serializePortals(filters);if(input.workplace!=='any')portals+=`workplace_filter:\n  allow: [${JSON.stringify(input.workplace)}]\n  include_unknown: false\n`;
 return {input,portals,args:[...scannerArgs({ats:sources,json:true,sinceDays:input.sinceDays,limitPerAts:input.limitPerAts}),'--include-descriptions']};
}
export function scanResult(raw,{timedOut=false,code=0,live=[],workplace='any',authorization='any',includeUnknown=false,sinceDays=14,now=Date.now()}={}){
 const matchesWorkplace=buildWorkplaceFilter(workplace==='any'?undefined:{allow:[workplace],include_unknown:false});
 let filteredAuthorization=0,filteredQuality=0;
 const jobs=[],seen=new Set();const offers=Array.isArray(raw?.offers)?raw.offers:live;
 const ordered=[...offers].sort((a,b)=>String(b.postedAt||'').localeCompare(String(a.postedAt||'')));
 for(const offer of ordered){if(!matchesWorkplace(offer.workplaceType))continue;const details=postingDetails(offer),date=postingDate(offer.postedAt,{now,sinceDays}),checked=Date.parse(details.checkedAt);
  if((details.applicationDeadline&&Date.parse(details.applicationDeadline)<=now)||offer.isListed===false||!details.postingUrl||!date||!Number.isFinite(checked)||checked>now+60000||checked<now-300000||typeof offer.company!=='string'||!offer.company.trim()||typeof offer.title!=='string'||!offer.title.trim()){filteredQuality++;continue;}
  const url=new URL(details.postingUrl);if(seen.has(url.href))continue;
  const description=typeof offer.description==='string'?offer.description:'',visaText=typeof offer.visaText==='string'?offer.visaText.slice(0,4000):'',evidence=classifyWorkAuthorization(visaFilterText({description,visaText}),{incomplete:!!offer.descriptionTruncated||description.trim().length<20});
  if(!matchesWorkAuthorization(evidence,authorization,includeUnknown)){filteredAuthorization++;continue;}seen.add(url.href);
  jobs.push({id:url.href,url:url.href,...details,company:offer.company.slice(0,200),title:offer.title.slice(0,200),location:String(offer.location||'Location not supplied').slice(0,300),description:description.slice(0,30000),descriptionAvailable:description.trim().length>=20&&description.length<=30000&&!offer.descriptionTruncated,source:offer.source,visaText,authorization:evidence,postedAt:date});
 }
 const available=Number(raw?.companiesAvailable)||0,scanned=Number(raw?.companiesScanned)||0;
 const partial=timedOut||code!==0||!raw||raw.capHit===true||raw.stoppedEarly===true||Number(raw.unreachableBoards)>0||Number(raw.postingsDroppedNoDate)>0||Object.values(raw.datasetStatus||{}).some(s=>s!=='ok');
 const retained=jobs.length;
 jobs.splice(50);
 while(Buffer.byteLength(JSON.stringify(jobs))>2000000)jobs.pop();
 return {jobs,checkedAt:new Date(now).toISOString(),filteredQuality,sort:'newest',filteredAuthorization,authorizationFilter:authorization,includeUnknown,source:'career-ops ATS scanner',partial,timedOut,companiesScanned:scanned,companiesAvailable:available,unreachableBoards:Number(raw?.unreachableBoards)||0,capHit:raw?.capHit===true,displayCapped:retained>50||jobs.length<retained,description:'A bounded sample of employer boards, not a complete job-market search.'};
}
async function runSource({codeRoot,workRoot,input,signal,timeoutMs,source}){
 const config=scanConfiguration(input);config.args[config.args.indexOf('--ats')+1]=source;const root=await fs.mkdtemp(path.join(workRoot,'scan-'));
 let child;
 try{
  await fs.mkdir(path.join(root,'config'));await fs.writeFile(path.join(root,'portals.yml'),config.portals);await fs.writeFile(path.join(root,'config/profile.yml'),'location:\n  country: United States\n');
  const env={CAREER_OPS_DNS_LOOKUPS_PER_MIN:'200',PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,TEMP:root,TMP:root,CAREER_OPS_ROOT:root,CAREER_OPS_PORTALS:path.join(root,'portals.yml'),CAREER_OPS_PROFILE:path.join(root,'config/profile.yml')};for(const key of Object.keys(env))if(env[key]===undefined)delete env[key];
  return await new Promise((resolve,reject)=>{
   let output='',stderr='',timedOut=false,limited=false;const live=[];
   if(signal?.aborted){reject(new Error('scan_cancelled'));return;}
   child=spawn(process.execPath,[path.join(codeRoot,'scan-ats-full.mjs'),...config.args],{cwd:codeRoot,env,windowsHide:true,shell:false,stdio:['ignore','pipe','pipe']});
   child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
   const stop=()=>child.kill('SIGKILL');const timer=setTimeout(()=>{timedOut=true;stop();},timeoutMs);signal?.addEventListener('abort',stop,{once:true});if(signal?.aborted)stop();
   child.stdout.on('data',data=>{if(Buffer.byteLength(output)+Buffer.byteLength(data)>4000000){limited=true;stop();}else output+=data.toString('utf8');});
   child.stderr.on('data',data=>{stderr+=data.toString('utf8');if(stderr.length>100000)stderr=stderr.slice(-10000);let end;while((end=stderr.indexOf('\n'))>=0){const line=stderr.slice(0,end);stderr=stderr.slice(end+1);try{const ev=JSON.parse(line);if(ev.kind==='offer'&&live.length<500)live.push(ev);}catch{}}});
   child.on('error',()=>{clearTimeout(timer);signal?.removeEventListener('abort',stop);reject(new Error('scanner_start_failed'));});
   child.on('close',code=>{clearTimeout(timer);signal?.removeEventListener('abort',stop);if(signal?.aborted){reject(new Error('scan_cancelled'));return;}let raw;try{raw=JSON.parse(output.trim());}catch{}
    if(!raw&&!live.length&&!timedOut)reject(new Error('scanner_failed'));else resolve(scanResult(raw,{timedOut:timedOut||limited,code,live,workplace:config.input.workplace,authorization:config.input.authorization,includeUnknown:config.input.includeUnknown,sinceDays:config.input.sinceDays}));
   });
  });
 }finally{
  // Only the exact mkdtemp child of our private root, after the child has closed.
  if(path.dirname(path.resolve(root))!==path.resolve(workRoot)||!path.basename(root).startsWith('scan-'))throw new Error('unsafe_scratch_cleanup');
  await fs.rm(root,{recursive:true,force:true});
 }
}

// Each child scans a different fixed ATS. Vendor concurrency/backoff remains in
// core; two 200/min DNS budgets keep aggregate steady-state DNS pacing at 400/min (core startup bursts apply).
export async function scanSources(raw,scan,{signal,timeoutMs=240000}={}){
 const input=discoveryInput(raw),started=Date.now(),deadline=started+timeoutMs;
 const pending=['workday','greenhouse','lever','ashby'],completed=[];let next=0;
 async function worker(){while(next<pending.length){if(signal?.aborted)throw Error('scan_cancelled');const source=pending[next++],begin=Date.now(),remaining=deadline-begin;
  if(remaining<=0){completed.push({source,state:'timed_out',elapsedMs:0});continue;}
  try{const result=await scan({input,signal,source,timeoutMs:remaining});if(signal?.aborted)throw Error('scan_cancelled');completed.push({source,state:result.timedOut?'timed_out':'finished',elapsedMs:Date.now()-begin,result});}
  catch(error){if(signal?.aborted)throw Error('scan_cancelled');completed.push({source,state:'failed',elapsedMs:Date.now()-begin});}
 }}
 // Wait for every child to close/clean up even when a sibling is cancelled.
 const settled=await Promise.allSettled([worker(),worker()]);if(signal?.aborted||settled.some(r=>r.status==='rejected'))throw Error('scan_cancelled');
 const results=completed.flatMap(item=>item.result?[item.result]:[]);if(!results.length)throw Error('scanner_failed');
 const sum=key=>results.reduce((n,r)=>n+(Number(r[key])||0),0),rawResult={offers:results.flatMap(r=>r.jobs.map(j=>({...j,descriptionTruncated:!j.descriptionAvailable}))),companiesScanned:sum('companiesScanned'),companiesAvailable:sum('companiesAvailable'),unreachableBoards:sum('unreachableBoards'),capHit:results.some(r=>r.capHit),stoppedEarly:completed.some(r=>r.state!=='finished')||results.some(r=>r.partial)};
 const result=scanResult(rawResult,{workplace:input.workplace,authorization:input.authorization,includeUnknown:input.includeUnknown,sinceDays:input.sinceDays,timedOut:completed.some(r=>r.state==='timed_out')});
 result.filteredQuality+=sum('filteredQuality');result.filteredAuthorization+=sum('filteredAuthorization');result.displayCapped ||= results.some(r=>r.displayCapped);
 return {...result,durationMs:Date.now()-started,sourceTimings:completed.map(({source,state,elapsedMs})=>({source,state,elapsedMs}))};
}
export async function runDiscovery({codeRoot,workRoot,input,signal,timeoutMs=240000}){
 return scanSources(input,options=>runSource({...options,codeRoot,workRoot}),{signal,timeoutMs});
}
