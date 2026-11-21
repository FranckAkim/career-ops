import {admissionEvidence} from './admission-receipts.mjs';
import {ControlError,hash} from './queue.mjs';
const requestId=/^[A-Za-z0-9:_-]{10,200}$/;
const invocationId=/^[A-Za-z0-9_-]{16,100}$/;
const metric='vercel.function_invocation.count';
const groups=['deploymentId','requestId','invocationId','errorCode','httpStatus'];
// Both readers are authenticated operator capabilities. Application log messages
// alone, elapsed durations and generic HTTP errors never establish termination.
export function timeoutEvidence({secret,projectId,activity,logRecords,invocationResponse}){
 if(!Array.isArray(logRecords)||logRecords.length>100||invocationResponse?.projectId!==projectId||invocationResponse.complete!==true)return [];
 const response=invocationResponse.response,output='vercel_function_invocation_count_count';
 if(response?.query?.metric!==metric||response.query.aggregation!=='count'||!Array.isArray(response.query.groupBy)||[...response.query.groupBy].sort().join(',')!==[...groups].sort().join(',')||response.meta?.outputs?.[output]?.metric!==metric||response.meta.outputs[output].aggregation!=='count'||!Array.isArray(response.summary)||response.summary.length>100)return [];
 const admissions=new Map();
 for(const record of logRecords){
  if(record?.projectId!==projectId||record.deploymentId!==activity.deployment_id||record.source!=='function'||record.isSystemLog!==false||record.truncated!==false||!requestId.test(record.requestId||'')||typeof record.message!=='string'||Buffer.byteLength(record.message)>10000)continue;
  for(const receipt of admissionEvidence({secret,projectId,activity,logText:record.message}))admissions.set(record.requestId+'|'+receipt.evidenceHash,{receipt,requestId:record.requestId});
 }
 if(admissions.size!==1)return [];
 const admitted=[...admissions.values()][0],rows=response.summary.filter(row=>row.deploymentId===activity.deployment_id&&row.requestId===admitted.requestId&&row[output]>0);
 if(rows.length!==1)return [];const row=rows[0];
 if(row[output]!==1||row.errorCode!=='timeout'||String(row.httpStatus)!=='504'||!invocationId.test(row.invocationId||''))return [];
 const body={schema:1,kind:'execution_terminated',projectId,activityId:activity.id,deploymentId:activity.deployment_id,instanceId:activity.instance_id,admissionHash:admitted.receipt.evidenceHash,requestId:row.requestId,invocationId:row.invocationId,metric,errorCode:row.errorCode,httpStatus:504,count:1};
 return [{terminated:true,activityId:activity.id,deploymentId:activity.deployment_id,instanceId:activity.instance_id,evidenceHash:hash(JSON.stringify(body))}];
}
export function vercelTerminationVerifier({secret,projectId,readAdmissionLogs,readInvocationRecords}){
 if(typeof secret!=='string'||secret.length<32||!/^prj_[A-Za-z0-9]{20,64}$/.test(projectId)||typeof readAdmissionLogs!=='function'||typeof readInvocationRecords!=='function')throw new ControlError('termination_verifier_configuration_required');
 return async activity=>{
  try{
   const logRecords=await readAdmissionLogs({projectId,deploymentId:activity.deployment_id,activityId:activity.id});
   if(!Array.isArray(logRecords)||logRecords.length>100)return null;
   const ids=new Set();for(const record of logRecords){if(record.projectId===projectId&&record.deploymentId===activity.deployment_id&&record.source==='function'&&record.isSystemLog===false&&record.truncated===false&&requestId.test(record.requestId||'')&&typeof record.message==='string'&&Buffer.byteLength(record.message)<=10000&&admissionEvidence({secret,projectId,activity,logText:record.message}).length)ids.add(record.requestId);}
   if(ids.size!==1)return null;
   const invocationResponse=await readInvocationRecords({projectId,deploymentId:activity.deployment_id,requestId:[...ids][0],metric});
   return timeoutEvidence({secret,projectId,activity,logRecords,invocationResponse}).find(p=>p.evidenceHash===activity.evidenceHash)||null;
  }catch{throw new ControlError('termination_not_verified');}
 };
}
