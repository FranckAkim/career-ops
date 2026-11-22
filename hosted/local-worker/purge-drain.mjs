import fs from'node:fs/promises';import path from'node:path';
// Private operator check, not a browser-selected path or a cleanup command.
// Remote source requests must also be confirmed settled by the operator.
export function localPurgeDrain(config,docker){
 if(!path.isAbsolute(config.workRoot||'')||!/^[a-f0-9]{32}$/.test(config.namespace||'')||typeof docker!=='function')throw Error('invalid_drain_config');
 return async()=>{try{
  if(await fs.realpath(config.workRoot)!==path.resolve(config.workRoot))return false;
  const containers=(await docker(['ps','-aq','--filter',`label=io.career-workspace.worker=${config.namespace}`])).trim();if(containers)return false;
  const discovery=config.discoveryWorkRoot||path.join(path.dirname(config.workRoot),'local-discovery-state');
  if(!path.isAbsolute(discovery))return false;
  try{const stat=await fs.lstat(discovery);if(!stat.isDirectory()||stat.isSymbolicLink()||await fs.realpath(discovery)!==path.resolve(discovery))return false;if((await fs.readdir(discovery)).some(name=>name.startsWith('scan-')))return false;}catch(error){if(error.code!=='ENOENT')return false;}
  const jobs=path.join(config.workRoot,'jobs');try{const stat=await fs.lstat(jobs);if(!stat.isDirectory()||stat.isSymbolicLink()||await fs.realpath(jobs)!==jobs)return false;return (await fs.readdir(jobs)).length===0;}catch(error){return error.code==='ENOENT';}
 }catch{return false;}};
}
