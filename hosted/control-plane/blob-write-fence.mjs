import {ControlError} from './queue.mjs';
// Experimental operator primitive, not connected to account purge. These opaque
// markers must never be deleted while a late immutable create remains possible.
const marker=Buffer.from('career-workspace-content-erased-v1\n');
const validKey=/^(?:career-workspaces\/v1\/[a-f0-9]{64}|career-write-fence-proofs\/v1\/[a-f0-9-]{36})\/(?:manifest\.json|files\/[a-f0-9]{64})$/;
export class BlobWriteFence {
 constructor({transport,credentials}){if(!transport||!['head','get','put'].every(k=>typeof transport[k]==='function'))throw new ControlError('fence_configuration_required');this.transport=transport;this.credentials=credentials;}
 async inspect(key){
  if(typeof key!=='string'||!validKey.test(key))throw new ControlError('invalid_fence_key');
  let metadata;try{metadata=await this.transport.head(key,{...this.credentials,abortSignal:AbortSignal.timeout(15000)});}catch{throw new ControlError('fence_verification_failed');}
  // Adapter converts only SDK typed not-found into null; all other errors throw.
  if(metadata===null)return {present:false,sealed:false};
  if(typeof metadata?.etag!=='string'||!metadata.etag||!Number.isSafeInteger(metadata.size)||metadata.size<0)throw new ControlError('fence_verification_failed');
  if(metadata.size!==marker.length)return {present:true,sealed:false,etag:metadata.etag};
  let result,reader;try{
   result=await this.transport.get(key,{...this.credentials,access:'private',useCache:false,abortSignal:AbortSignal.timeout(15000)});
   if(result?.statusCode!==200)throw Error();reader=result.stream.getReader();let size=0;const chunks=[];
   while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>marker.length)throw Error();chunks.push(Buffer.from(value));}
   return {present:true,sealed:Buffer.concat(chunks).equals(marker),etag:metadata.etag};
  }catch{throw new ControlError('fence_verification_failed');}finally{if(reader){await reader.cancel().catch(()=>{});reader.releaseLock();}}
 }
 async seal(key){
  if(typeof key!=='string'||!validKey.test(key))throw new ControlError('invalid_fence_key');
  const before=await this.inspect(key);if(before.sealed)return {sealed:true,markerRetained:true,uploadSettlementVerified:false};
  try{await this.transport.put(key,Buffer.from(marker),{...this.credentials,access:'private',addRandomSuffix:false,allowOverwrite:before.present,...(before.present?{ifMatch:before.etag}:{}),contentType:'application/octet-stream',cacheControlMaxAge:60,abortSignal:AbortSignal.timeout(15000)});}catch{/* Lost replies are accepted only after verifying marker bytes. */}
  if(!(await this.inspect(key)).sealed)throw new ControlError('fence_not_verified');
  return {sealed:true,markerRetained:true,uploadSettlementVerified:false};
 }
}
