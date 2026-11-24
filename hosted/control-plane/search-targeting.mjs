// Explicit exclusions only. Unknown source metadata is retained.
export function targetingInput(raw={}) {
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>!['experience','employmentType','minimumSalary','excludedEmployers','negativeKeywords'].includes(k)))throw Error('invalid_targeting');
 const {experience='any',employmentType='any',minimumSalary=0,excludedEmployers=[],negativeKeywords=[]}=raw;
 if(!['any','entry','mid','senior'].includes(experience)||!['any','full_time','part_time','contract','temporary','internship'].includes(employmentType)||!Number.isInteger(minimumSalary)||minimumSalary<0||minimumSalary>1000000)throw Error('invalid_targeting');
 const list=value=>{if(!Array.isArray(value)||value.length>20||value.some(s=>typeof s!=='string'||!s.trim()||s.length>100||/[\x00-\x1f]/.test(s)))throw Error('invalid_targeting');return [...new Set(value.map(s=>s.trim().toLowerCase()))];};
 return {experience,employmentType,minimumSalary,excludedEmployers:list(excludedEmployers),negativeKeywords:list(negativeKeywords)};
}
export function targetingDecision(job,raw={}) {
 const input=targetingInput(raw),title=String(job.title||'').toLowerCase(),company=String(job.company||'').trim().toLowerCase();
 if(input.excludedEmployers.includes(company))return 'excluded_employer';
 const text=`${title}\n${String(job.description||'').toLowerCase()}`;
 if(input.negativeKeywords.some(word=>text.includes(word)))return 'negative_keyword';
 if(input.employmentType!=='any'&&job.employmentType&&job.employmentType!==input.employmentType)return 'employment_type';
 // A title is evidence of level only when it explicitly names one.
 const level=/\b(senior|sr\.?|staff|principal|lead)\b/.test(title)?'senior':/\b(junior|jr\.?|entry[ -]level|new grad|graduate|intern)\b/.test(title)?'entry':/\b(mid[ -]level|intermediate)\b/.test(title)?'mid':null;
 if(input.experience!=='any'&&level&&level!==input.experience)return 'experience';
 const salary=job.salary;
 if(input.minimumSalary&&salary?.currency==='USD'&&salary.period==='year'&&Number.isFinite(salary.max)&&salary.max<input.minimumSalary)return 'salary';
 return null;
}
