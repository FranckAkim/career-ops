// Conservative posting-text evidence, not a candidate eligibility decision.
const H=String.raw`\bh[\s-]{0,3}1[\s-]{0,3}b\b`;
const O=String.raw`\b(?:(?:stem[ -]+)?opt(?![ -]*(?:in|out)\b)|optional practical training)\b`;
const re=source=>new RegExp(source,'i');
const hToken=re(H),oToken=re(O);
const genericRefusal=/\b(?:(?:no|without) (?:visa |work |employment |immigration |future )?sponsorship|(?:cannot|can't|unable to|not able to|do not|does not|will not|won't|don't|doesn't) (?:provide |offer )?(?:visa |work |employment |immigration )?sponsor(?:ship)?|(?:visa |work |employment )?sponsorship (?:is |will be )?(?:not available|not offered|not provided|unavailable)|(?:must|should) not require (?:visa |work |employment )?sponsorship)\b/i;
const citizenshipOnly=/\b(?:us (?:citizens?|citizenship) (?:is |are )?(?:required|only)|(?:must|need to) be (?:a )?us citizen|(?:us )?citizens and permanent residents only|only (?:hire |accept |consider )?(?:us )?citizens|permanent residents only|(?:us )?citizens or (?:permanent residents|green card holders) only)\b/i;
const negativeBefore=token=>re(String.raw`\b(?:no|not accepting|do not accept|does not accept|cannot accept|can't accept|unable to accept|not eligible for|ineligible for|not open to|(?:do not|does not|don't|doesn't|will not|cannot|can't|unable to|not able to) (?:accept|consider|hire|support|allow|sponsor))\b.{0,45}${token}`);
const negativeAfter=token=>re(String.raw`${token}.{0,45}\b(?:not accepted|not eligible|ineligible|not supported|not considered|not permitted|not allowed|not available|not offered|unavailable|cannot apply|may not apply)\b`);
const hNegative=re(String.raw`\b(?:cannot|can't|unable to|not able to|do not|does not|will not|won't|don't|doesn't)\b.{0,25}\b(?:sponsor|support|offer|provide|accept)\b.{0,40}${H}`);
const hPositive=[re(String.raw`\b(?:sponsor|sponsors|sponsoring|sponsorship for)\b.{0,40}${H}`),re(String.raw`${H}.{0,30}\b(?:sponsorship|transfers?)\b.{0,30}\b(?:available|provided|offered|supported|possible|welcome|accepted|yes)\b`),re(String.raw`\b(?:offer|provide|support|accept)\b.{0,30}${H}.{0,20}\b(?:sponsorship|transfers?|petitions?)\b`)];
const oPositive=[re(String.raw`\b(?:accept|accepts|welcome|welcomes|consider|considers|hire|hires|hiring|support|supports|allow|allows|open to)\b.{0,45}${O}`),re(String.raw`${O}.{0,50}\b(?:accepted|welcome|eligible|encouraged to apply|may apply|can apply|considered|supported|allowed)\b`)];
function snippets(text){
 // Normalize punctuation; skip questions rather than treating them as policy.
 const normalized=text.normalize('NFKC').replace(/[\u2010-\u2015\u2212]/g,'-').replace(/[\u2018\u2019]/g,"'").replace(/\bU\.S\.(?:A\.)?/gi,'US');
 return (normalized.match(/[^.!?;\n]+[.!?;]?/g)||[]).filter(s=>!s.trim().endsWith('?')).flatMap(s=>s.replace(/[.!;]$/,'').split(/\b(?:but|however|whereas)\b/i)).map(s=>s.trim()).filter(Boolean);
}
function status(yes,no,incomplete){return no.length?(yes.length?'conflicting':'negative'):yes.length&&!incomplete?'positive':'unknown';}
export function classifyWorkAuthorization(text,{incomplete=false}={}){
 const hYes=[],hNo=[],oYes=[],oNo=[];
 const add=(list,s)=>{if(list.length<2&&!list.includes(s.slice(0,240)))list.push(s.slice(0,240));};
 for(const s of snippets(typeof text==='string'?text.slice(0,100000):'')){
  const h=hToken.test(s),o=oToken.test(s)&&!(/\bopt (?:to|for|into)\b/.test(s)),citizenship=citizenshipOnly.test(s);
  // A statement about OPT not needing sponsorship is not an employer refusal.
  const refusal=genericRefusal.test(s)&&!(/\bno sponsorship (?:is )?required (?:for|under)\b/i.test(s)&&o);
  const hn=citizenship||refusal||(h&&(hNegative.test(s)||negativeBefore(H).test(s)||negativeAfter(H).test(s)));
  const on=citizenship||(o&&(negativeBefore(O).test(s)||negativeAfter(O).test(s)));
  if(hn)add(hNo,s);else if(h&&hPositive.some(pattern=>pattern.test(s))&&!/\b(?:need|require|requiring)\b.{0,30}\bsponsorship\b/i.test(s))add(hYes,s);
  if(on)add(oNo,s);else if(o&&oPositive.some(pattern=>pattern.test(s)))add(oYes,s);
 }
 return {version:1,h1b:{status:status(hYes,hNo,incomplete),evidence:[...hYes,...hNo].slice(0,3)},opt:{status:status(oYes,oNo,incomplete),evidence:[...oYes,...oNo].slice(0,3)},incomplete:!!incomplete};
}
export function matchesWorkAuthorization(evidence,mode='any',includeUnknown=false){
 if(mode==='any')return true;
 const accept=value=>value?.status==='positive'||includeUnknown&&value?.status==='unknown';
 if(mode==='h1b')return accept(evidence.h1b);if(mode==='opt')return accept(evidence.opt);
 if(mode==='either')return accept(evidence.h1b)||accept(evidence.opt);
 if(mode==='both')return accept(evidence.h1b)&&accept(evidence.opt);return false;
}
