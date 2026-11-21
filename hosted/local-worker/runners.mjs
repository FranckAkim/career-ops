import {ControlError} from '@hosted-career/control-plane/queue.mjs';
export function revisionRunner(images,create){
  const runners=new Map(Object.entries(images).map(([revision,image])=>[revision,create(image)]));
  return context=>{
    const run=runners.get(context.engineRevision);
    if(!run)throw new ControlError('engine_revision_mismatch');
    return run(context);
  };
}
