// Pure shared presentation/source contract. No scoring rubric or candidate facts.
/** @param {any} job */
export function postingContext(job){return `Company: ${job.company}\nRole: ${job.title}\nLocation: ${job.location}\nSource: ${job.source}\n\n${job.description}${job.visaText?`\n\nAdditional source policy text:\n${job.visaText}`:''}`;}
/** @param {any} a @param {any} b */
export function samePosting(a,b){return ['url','company','title','location','source','description','visaText'].every(key=>String(a?.[key]||'')===String(b?.[key]||''))&&a?.descriptionAvailable===b?.descriptionAvailable;}
/** @param {unknown} value */
export function evaluationScore(value){const text=String(value??'');if(!/^\s*(?:[0-4](?:\.\d+)?|5(?:\.0+)?)\s*(?:\/\s*5)?\s*$/.test(text))return null;return Number(text.split('/')[0].trim());}
/** @param {any} item */
export function rankedScore(item){return item?.match?.status==='succeeded'&&!item.match.stale?evaluationScore(item.match.score):null;}
/** @param {any} a @param {any} b */
export function compareMatches(a,b){const x=rankedScore(a),y=rankedScore(b);return (y??-1)-(x??-1)||String(b.posting?.postedAt||b.created_at||'').localeCompare(String(a.posting?.postedAt||a.created_at||''))||String(a.id).localeCompare(String(b.id));}
/** @param {string|null} state */
export function pipelineStage(state){if(['Applied','Responded','Assessment'].includes(state||''))return 'Applied';if(state==='Interview')return 'Interviewing';if(state==='Offer')return 'Offer';if(['Hired','Rejected','Discarded','SKIP'].includes(state||''))return 'Closed';return 'Reviewing';}
