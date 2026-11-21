const blockKeys=['A','B','C','D','E','F','G'];
const fields=['company','role','score','archetype','legitimacy','blocks'];
const legitimacy=['High Confidence','Proceed with Caution','Suspicious'];
export function evaluationResponseFormat(){
  return {type:'json_schema',json_schema:{name:'career_evaluation',strict:true,schema:{type:'object',additionalProperties:false,required:fields,
    properties:{company:{type:'string',minLength:1,maxLength:200},role:{type:'string',minLength:1,maxLength:200},score:{type:'number',minimum:0,maximum:5},
      archetype:{type:'string',minLength:1,maxLength:200},legitimacy:{type:'string',enum:legitimacy},blocks:{type:'object',additionalProperties:false,required:blockKeys,
        properties:Object.fromEntries(blockKeys.map(key=>[key,{type:'string',minLength:1,maxLength:1800}]))}}}}};
}
export function evaluationMarkdown(text){
  const fail=()=>{throw new Error('model_evaluation_schema_invalid');};
  if(typeof text!=='string'||Buffer.byteLength(text)>24000)fail();
  let value;try{value=JSON.parse(text);}catch{fail();}
  const exact=(object,keys)=>object&&typeof object==='object'&&!Array.isArray(object)&&Object.keys(object).length===keys.length&&keys.every(key=>Object.hasOwn(object,key));
  if(!exact(value,fields)||!exact(value.blocks,blockKeys)||!Number.isFinite(value.score)||value.score<0||value.score>5||!legitimacy.includes(value.legitimacy))fail();
  for(const key of ['company','role','archetype'])if(typeof value[key]!=='string'||!value[key].trim()||value[key].length>200||/[\r\n\x00-\x1f]/.test(value[key]))fail();
  for(const key of blockKeys)if(typeof value.blocks[key]!=='string'||!value.blocks[key].trim()||value.blocks[key].length>1800||/---(?:SCORE_SUMMARY|END_SUMMARY)---/.test(value.blocks[key]))fail();
  return blockKeys.map(key=>`## Block ${key}\n${value.blocks[key]}`).join('\n\n')+`\n\n---SCORE_SUMMARY---\nCOMPANY: ${value.company}\nROLE: ${value.role}\nSCORE: ${value.score}\nARCHETYPE: ${value.archetype}\nLEGITIMACY: ${value.legitimacy}\n---END_SUMMARY---`;
}
