import {ControlError} from './queue.mjs';
import {handshakeUrl} from './posting-details.mjs';
export function handshakeInput(raw){
 const fail=()=>{throw new ControlError('invalid_request');};
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>!['url','title','company','location','description','acknowledged'].includes(k))||raw.acknowledged!==true)fail();
 const url=handshakeUrl(raw.url);if(!url)fail();
 const fields={};for(const [key,limit,minimum]of [['title',200,1],['company',200,1],['location',300,0],['description',30000,20]]){
  const value=raw[key]??(key==='location'?'':null);if(typeof value!=='string'||value.includes('\0')||value.trim().length<minimum||value.length>limit)fail();fields[key]=value.replace(/\r\n?/g,'\n').trim();
 }
 return {...fields,location:fields.location||'Location not supplied',id:url,url,source:'handshake-import',postedAt:null,descriptionAvailable:true,importedAt:new Date().toISOString()};
}
