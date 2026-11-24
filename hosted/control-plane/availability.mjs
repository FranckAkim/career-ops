import {postingDetails} from './posting-details.mjs';
export function availabilityInput(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(key=>!['kind','url','source'].includes(key))||raw.kind!=='availability'||typeof raw.url!=='string'||typeof raw.source!=='string'||raw.source==='handshake-import')throw Error('invalid_availability_input');
 const details=postingDetails(raw);if(!details.postingUrl||details.postingUrl!==raw.url)throw Error('invalid_availability_input');
 return {kind:'availability',url:details.postingUrl,source:raw.source};
}
export function availabilityResult(verdict,now=Date.now()){
 const state=verdict?.result==='active'?'active':verdict?.result==='expired'?'expired':'unknown';
 return {state,checkedAt:new Date(now).toISOString(),provenance:'ats_api',code:/^[a-z0-9_]{1,100}$/.test(verdict?.code||'')?verdict.code:'unconfirmed'};
}
