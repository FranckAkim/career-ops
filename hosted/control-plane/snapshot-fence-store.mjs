import {BlobNotFoundError} from '@vercel/blob';
import {BlobWriteFence} from './blob-write-fence.mjs';
import {ControlError} from './queue.mjs';
export function snapshotFenceStore(blob){
 const fence=new BlobWriteFence({credentials:blob.credentials,transport:{...blob.transport,async head(key,options){try{return await blob.transport.head(key,options);}catch(e){if(e instanceof BlobNotFoundError)return null;throw e;}}}});
 const key=(id,fileHash)=>{if(fileHash!==null&&!/^[a-f0-9]{64}$/.test(fileHash||''))throw new ControlError('invalid_snapshot');return blob.key(id,fileHash===null?'manifest.json':`files/${fileHash}`);};
 return {async sealInventoriedObject(id,fileHash){return fence.seal(key(id,fileHash));},async objectFenced(id,fileHash){return (await fence.inspect(key(id,fileHash))).sealed;}};
}
