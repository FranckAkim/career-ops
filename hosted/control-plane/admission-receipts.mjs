import {requestReceiptCodec} from './receipt-codec.mjs';
const codec=requestReceiptCodec('resource_work_admitted');
export const admissionPrefix=codec.prefix;
export const issueAdmissionReceipt=input=>codec.issue(input);
export function admissionEvidence(input){return codec.read(input).map(({payload:p,evidenceHash})=>({admitted:true,activityId:p.activityId,deploymentId:p.deploymentId,instanceId:p.instanceId,evidenceHash}));}
