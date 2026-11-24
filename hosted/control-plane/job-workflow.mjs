import {ControlError} from './queue.mjs';
export function jobWorkflow(raw){
 const fail=()=>{throw new ControlError('invalid_request');};
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>!['state','appliedOn','deadline','followUpOn','contact','notes','nextAction'].includes(k)))fail();
 const {state='new',appliedOn='',deadline='',followUpOn='',contact='',notes='',nextAction=''}=raw;
 if(!['new','seen','dismissed'].includes(state))fail();
 for(const date of [appliedOn,deadline,followUpOn])if(typeof date!=='string'||(date!==''&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)))fail();
 for(const [value,max] of [[contact,300],[notes,4000],[nextAction,500]])if(typeof value!=='string'||value.length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value))fail();
 return {state,appliedOn,deadline,followUpOn,contact:contact.trim(),notes:notes.trim(),nextAction:nextAction.trim()};
}
