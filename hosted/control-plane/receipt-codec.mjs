import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const deployment=/^dpl_[A-Za-z0-9]{20,64}$/;
const project=/^prj_[A-Za-z0-9]{20,64}$/;
const digest=/^[a-f0-9]{64}$/;
const fail=code=>{const error=new Error(code);error.code=code;throw error;};
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');
const definitions={
 resource_work_complete:{prefix:'CAREER_REQUEST_RESOURCE_COMPLETE ',stamp:'completedAt',domain:'career-workspace/request-resource-completion/v1'},
 resource_work_admitted:{prefix:'CAREER_REQUEST_RESOURCE_ADMITTED ',stamp:'admittedAt',domain:'career-workspace/request-resource-admission/v1'}
};
// Pure Node codec also used by isolated provider fixtures, with no DB/Blob code.
export function requestReceiptCodec(kind){
 const config=Object.hasOwn(definitions,kind)?definitions[kind]:null;if(!config)fail('receipt_configuration_required');const {prefix,stamp,domain}=config,fields=['activityId',stamp,'deploymentId','instanceId','kind','projectId','schema'];
 const canonical=p=>JSON.stringify({schema:1,kind,projectId:p.projectId,activityId:p.activityId,deploymentId:p.deploymentId,instanceId:p.instanceId,[stamp]:p[stamp]});
 const valid=p=>exact(p,fields)&&p.schema===1&&p.kind===kind&&typeof p.projectId==='string'&&project.test(p.projectId)&&typeof p.activityId==='string'&&uuid.test(p.activityId)&&typeof p.deploymentId==='string'&&deployment.test(p.deploymentId)&&typeof p.instanceId==='string'&&uuid.test(p.instanceId)&&typeof p[stamp]==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(p[stamp])&&Number.isFinite(Date.parse(p[stamp]));
 const key=secret=>{if(typeof secret!=='string'||secret.length<32)fail('receipt_configuration_required');return createHmac('sha256',secret).update(domain).digest();};
 return {
  prefix,validateSecret:key,
  issue({secret,...identity}){const payload={schema:1,kind,...identity};if(!valid(payload))fail('invalid_execution_identity');const signature=createHmac('sha256',key(secret)).update(canonical(payload)).digest('hex');return prefix+payload.activityId+' '+Buffer.from(JSON.stringify({payload,signature})).toString('base64url');},
  read({logText,secret,projectId,activity}){
   const signingKey=key(secret);if(typeof logText!=='string'||Buffer.byteLength(logText)>1000000||!project.test(projectId))fail('receipt_not_verified');
   const found=new Map();let count=0;const pattern=new RegExp(prefix+'([a-f0-9-]{36}) ([A-Za-z0-9_-]{1,2048})','gi');
   for(const match of logText.matchAll(pattern)){
    if(++count>1000)fail('receipt_not_verified');
    try{const token=match[2],bytes=Buffer.from(token,'base64url');if(bytes.toString('base64url')!==token)continue;const envelope=JSON.parse(bytes.toString('utf8'));if(!exact(envelope,['payload','signature'])||!valid(envelope.payload)||!digest.test(envelope.signature))continue;
     const p=envelope.payload;if(match[1]!==p.activityId||p.projectId!==projectId||p.activityId!==activity.id||p.deploymentId!==activity.deployment_id||p.instanceId!==activity.instance_id)continue;
     if(!timingSafeEqual(createHmac('sha256',signingKey).update(canonical(p)).digest(),Buffer.from(envelope.signature,'hex')))continue;
     const evidenceHash=createHash('sha256').update(bytes).digest('hex');found.set(evidenceHash,{payload:p,evidenceHash});
    }catch{/* Malformed lines confer no authority. */}
   }
   return [...found.values()];
  }
 };
}
