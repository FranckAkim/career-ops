import {ControlError,hash} from './queue.mjs';
const check=(value,code='invalid_coverage_configuration')=>{if(!value)throw new ControlError(code);};
const deployment=/^dpl_[A-Za-z0-9]{20,64}$/;
const project=/^prj_[A-Za-z0-9]{20,64}$/;
function origin(value){let url;try{url=new URL(value);}catch{throw new ControlError('invalid_coverage_configuration');}check(url.origin===value&&url.protocol==='https:'&&!url.username&&!url.password&&/^[a-z0-9-]+\.vercel\.app$/.test(url.hostname));return url;}
function inventory(value,projectId){
 check(value?.complete===true&&value.projectId===projectId&&Array.isArray(value.deployments)&&value.deployments.length>0&&value.deployments.length<=1000,'deployment_inventory_incomplete');
 const rows=value.deployments.map(d=>{check(deployment.test(d.id)&&typeof d.url==='string','deployment_inventory_incomplete');const url=origin('https://'+d.url);return {id:d.id,url:url.hostname,state:d.readyState??d.state,plan:d.plan??null,maxDuration:d.configFunctionTimeout??null};}).sort((a,b)=>a.id.localeCompare(b.id));
 check(new Set(rows.map(d=>d.id)).size===rows.length&&new Set(rows.map(d=>d.url)).size===rows.length,'deployment_inventory_incomplete');return rows;
}
function policy(value,projectId,canonical){
 check(value?.id===projectId&&Array.isArray(value.productionAliases)&&value.productionAliases.length<=1000&&Number.isSafeInteger(value.bypassCount)&&value.bypassCount>=0&&value.domainInventoryComplete===true&&Array.isArray(value.domains)&&value.domains.length>0&&value.domains.length<=1000,'deployment_policy_unavailable');
 const domains=value.domains.map(d=>({name:origin('https://'+d.name).hostname,verified:d.verified===true,gitBranch:d.gitBranch??null,customEnvironmentId:d.customEnvironmentId??null,redirect:d.redirect??null,redirectStatusCode:d.redirectStatusCode??null})).sort((a,b)=>a.name.localeCompare(b.name));
 check(new Set(domains.map(d=>d.name)).size===domains.length,'deployment_policy_unavailable');
 const productionDomains=domains.filter(d=>!d.gitBranch&&!d.customEnvironmentId),productionNames=new Set(productionDomains.map(d=>d.name));
 const protectedAliases=[...new Set([...value.productionAliases.filter(name=>!productionNames.has(name)),...domains.filter(d=>d.gitBranch||d.customEnvironmentId).map(d=>d.name)])].map(name=>origin('https://'+name).hostname).sort();
 const canonicalDomain=productionDomains.find(d=>d.name===canonical.hostname);
 return {projectId,scope:value.ssoProtection?.deploymentType??null,bypassCount:value.bypassCount,productionId:value.productionId,canonicalAlias:value.productionAliases.includes(canonical.hostname)&&canonicalDomain?.verified===true&&!canonicalDomain.redirect,domains,protectedAliases,redirectDomains:productionDomains.filter(d=>d.name!==canonical.hostname)};
}
async function prefix(response){
 const reader=response.body?.getReader();if(!reader)return '';const chunks=[];let bytes=0;
 try{while(true){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>65536)throw Error('response_limit');chunks.push(Buffer.from(value));}return Buffer.concat(chunks).toString('utf8');}
 finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
async function inspectFenceURL(url,fetchPublic=fetch,canonicalRedirect=null){
 try{
  const response=await fetchPublic(url,{method:'GET',redirect:'manual',credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(15000)});
  let location=null;try{location=new URL(response.headers.get('location'));}catch{/* Ordinary application responses have no redirect. */}
  if(canonicalRedirect&&[301,302,307,308].includes(response.status)&&location?.href===canonicalRedirect+'/api/hosted/session'){await response.body?.cancel();return {kind:'canonical_redirect',status:response.status};}
  if([302,303,307,308].includes(response.status)&&location?.origin==='https://vercel.com'&&location.pathname==='/sso-api'&&location.searchParams.get('url')===url){await response.body?.cancel();return {kind:'vercel_authentication',status:response.status};}
  const body=await prefix(response),type=response.headers.get('content-type')??'';
  if(response.status===401&&type.includes('text/html')&&/<title>Authentication Required<\/title>/i.test(body))return {kind:'vercel_authentication',status:response.status};
  if(response.status===401&&type.includes('application/json')){try{if(JSON.parse(body).error==='unauthorized')return {kind:'application_unauthorized',status:401};}catch{/* Invalid responses cannot satisfy the probe. */}}
  if(response.status===200&&type.includes('text/html')&&body.includes('Career Workspace'))return {kind:'application_page',status:200};
  return {kind:'unverified',status:response.status};
 }catch{return {kind:'unverified',status:null};}
}
// Read-only public-ingress diagnostic. It intentionally grants no permission to
// clear activity markers or purge accounts, including after any duration passes.
export async function inspectDeploymentFence({projectId,canonicalOrigin,readProject,readInventory,fetchPublic=fetch}){
 check(project.test(projectId)&&typeof readProject==='function'&&typeof readInventory==='function'&&typeof fetchPublic==='function');const canonical=origin(canonicalOrigin);
 try{
  const before=policy(await readProject(),projectId,canonical),rows=inventory(await readInventory(),projectId),inventoryHash=hash(JSON.stringify(rows)),results=[];let next=0;
  await Promise.all(Array.from({length:3},async()=>{while(next<rows.length){const row=rows[next++];const result=row.state==='READY'?await inspectFenceURL(`https://${row.url}/api/hosted/session`,fetchPublic):{kind:'unverified',status:null};results.push({id:row.id,...result});}}));
  results.sort((a,b)=>a.id.localeCompare(b.id));
  const aliasResults=[];for(const name of before.protectedAliases)aliasResults.push({name,...await inspectFenceURL(`https://${name}/api/hosted/session`,fetchPublic)});
  const redirectResults=[];for(const domain of before.redirectDomains)redirectResults.push({name:domain.name,...await inspectFenceURL(`https://${domain.name}/api/hosted/session`,fetchPublic,canonicalOrigin)});
  const page=await inspectFenceURL(canonicalOrigin+'/hosted',fetchPublic),api=await inspectFenceURL(canonicalOrigin+'/api/hosted/session',fetchPublic),afterRows=inventory(await readInventory(),projectId),after=policy(await readProject(),projectId,canonical);
  const reasons=[];if(before.scope!=='all_except_custom_domains')reasons.push('standard_protection_required');if(before.bypassCount)reasons.push('configured_bypass_requires_review');if(!before.canonicalAlias||!rows.some(d=>d.id===before.productionId))reasons.push('production_alias_unverified');
  if(hash(JSON.stringify(afterRows))!==inventoryHash)reasons.push('deployment_inventory_changed');if(JSON.stringify(before)!==JSON.stringify(after))reasons.push('deployment_policy_changed');
  if(aliasResults.some(r=>r.kind!=='vercel_authentication'))reasons.push('branch_alias_not_verified');if(before.redirectDomains.some(d=>!d.verified||d.redirect!==canonical.hostname||d.redirectStatusCode!==308)||redirectResults.some(r=>r.kind!=='canonical_redirect'))reasons.push('registered_domain_redirect_not_verified');
  if(results.some(r=>r.kind!=='vercel_authentication'))reasons.push('generated_url_not_verified');if(page.kind!=='application_page'||api.kind!=='application_unauthorized')reasons.push('canonical_app_not_verified');
  const knownBounds=rows.filter(r=>r.plan==='hobby'&&Number.isSafeInteger(r.maxDuration)&&r.maxDuration>0&&r.maxDuration<=300);
  const body={schema:1,projectId,canonicalOrigin,inventoryHash,endInventoryHash:hash(JSON.stringify(afterRows)),policy:before,endingPolicy:after,results,aliasResults,redirectResults,page,api,reasons,reportedBounds:knownBounds.map(d=>({id:d.id,maxDuration:d.maxDuration}))};
  return {...body,reportHash:hash(JSON.stringify(body)),publicFenceVerified:reasons.length===0,generatedURLs:rows.length,protectedURLs:results.filter(r=>r.kind==='vercel_authentication').length,protectedAliases:aliasResults.filter(r=>r.kind==='vercel_authentication').length,registeredRedirects:redirectResults.filter(r=>r.kind==='canonical_redirect').length,reportedBoundsComplete:knownBounds.length===rows.length,maxReportedDurationSeconds:knownBounds.length?Math.max(...knownBounds.map(r=>r.maxDuration)):null,reasons,executionCoverageVerified:false,privilegedAccessExcluded:true};
 }catch(error){if(error instanceof ControlError)throw error;throw new ControlError('deployment_coverage_unavailable');}
}
