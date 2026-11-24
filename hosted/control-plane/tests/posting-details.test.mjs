import {test} from 'node:test';import assert from 'node:assert/strict';
import {postingDetails,postingDate} from '../posting-details.mjs';
import {savedPosting} from '../saved-jobs.mjs';
test('application links must identify the same role on the exact ATS host',()=>{
 const job={source:'lever-full',url:'https://jobs.lever.co/synthetic/role?utm_source=feed',applicationLink:'https://jobs.lever.co/synthetic/role/apply?utm_source=feed'};
 assert.equal(postingDetails(job).applicationLink,'https://jobs.lever.co/synthetic/role/apply');assert.equal(postingDetails(job).applicationKind,'form');
 for(const link of ['https://evil.test/apply','https://jobs.lever.co/other/role/apply','https://jobs.lever.co/synthetic/role2/apply','javascript:alert(1)','https://jobs.lever.co@evil.test/synthetic/role/apply'])assert.equal(postingDetails({...job,applicationLink:link}).applicationKind,'posting');
 for(const url of ['https://jobs.lever.co.evil.test/synthetic/role','https://jobs.lever.co/synthetic','https://jobs.lever.co/synthetic/role%2fapply','http://jobs.lever.co/synthetic/role','https://user@jobs.lever.co/synthetic/role'])assert.deepEqual(postingDetails({...job,url}),{});
 assert.deepEqual(postingDetails({...job,source:'greenhouse-full'}),{});
 assert.equal(postingDetails({source:'ashby-full',url:'https://jobs.ashbyhq.com/synthetic/role',applicationLink:'https://jobs.ashbyhq.com/synthetic/role/application'}).applicationKind,'form');
 assert.equal(postingDetails({source:'workday-full',url:'https://synthetic.wd5.myworkdayjobs.com/en-US/External/job/US-City/Engineer_R123'}).sourceName,'Workday');
 const greenhouse=postingDetails({source:'greenhouse-full',url:'https://employer.test/job?gh_jid=123',listingIdentity:{ats_provider:'greenhouse',board_slug:'synthetic',posting_id:'123'}});assert.equal(greenhouse.postingUrl,'https://job-boards.greenhouse.io/synthetic/jobs/123');
});
test('strict source dates reject missing, impossible, future and out-of-window dates',()=>{
 const opts={now:Date.parse('2026-11-22T12:00:00Z'),sinceDays:7};
 assert.equal(postingDate('2026-11-15',opts),'2026-11-15');
 for(const value of [null,'2026-11-23','2026-11-14','2026-02-30','invalid','2026-11-22T00:00:00Z'])assert.equal(postingDate(value,opts),null);
});
test('saved source copies preserve bounded details and never trust supplied source labels',()=>{
 const job={url:'https://jobs.lever.co/synthetic/role',source:'lever-full',title:'Engineer',company:'Synthetic',location:'United States',description:'Build reporting tools for synthetic teams.',descriptionAvailable:true,applicationLink:'https://jobs.lever.co/synthetic/role/apply',checkedAt:'2026-11-22T12:00:00Z',sourceName:'Forged',sourceHost:'evil.test',employmentType:'full_time',salary:{min:100000,max:140000,currency:'USD'},department:'Engineering'};
 const saved=savedPosting(job);assert.equal(saved.sourceName,'Lever');assert.equal(saved.sourceHost,'jobs.lever.co');assert.equal(saved.applicationKind,'form');assert.equal(saved.salary.period,'year');assert.equal(saved.checkedAt,new Date(job.checkedAt).toISOString());assert.equal(saved.department,'Engineering');
 assert.equal(postingDetails({...job,salary:{min:NaN,max:140000,currency:'USD'}}).salary,null);
});

test('expanded ATS role destinations reject lookalike hosts, board pages and foreign application redirects',()=>{
 const cases=[['icims','https://careers-synthetic.icims.com/jobs/123/software-engineer/job','iCIMS'],['bamboohr','https://synthetic.bamboohr.com/careers/123','BambooHR'],['paylocity','https://recruiting.paylocity.com/Recruiting/Jobs/Details/123','Paylocity']];
 for(const [source,url,name] of cases){const job={source:source+'-full',url,applicationLink:'https://evil.test/apply'};assert.equal(postingDetails(job).sourceName,name);assert.equal(postingDetails(job).applicationLink,url);assert.equal(postingDetails(job).applicationKind,'posting');assert.deepEqual(postingDetails({...job,url:url.replace('.com/','.com.evil.test/')}),{});assert.deepEqual(postingDetails({...job,url:url.replace('123','%2f123')}),{});}
 for(const [source,url] of [['icims','https://careers-synthetic.icims.com/jobs/search'],['bamboohr','https://synthetic.bamboohr.com/careers'],['paylocity','https://recruiting.paylocity.com/Recruiting/Jobs/All/123']])assert.deepEqual(postingDetails({source:source+'-full',url}),{});
});

test('24-hour window uses exact source time across midnight and rejects future, stale and inconsistent timestamps',()=>{
 const opts={now:Date.parse('2026-11-22T12:00:00Z'),sinceDays:1};
 for(const time of ['2026-11-21T12:00:00.000Z','2026-11-21T23:59:59.000Z','2026-11-22T12:00:00.000Z'])assert.equal(postingDate(time.slice(0,10),{...opts,postedTimestamp:time}),time.slice(0,10));
 for(const time of ['2026-11-21T11:59:59.999Z','2026-11-22T12:00:00.001Z','invalid'])assert.equal(postingDate(time.slice(0,10),{...opts,postedTimestamp:time}),null);
 assert.equal(postingDate('2026-11-21',opts),null);assert.equal(postingDate('2026-11-22',opts),'2026-11-22');
 assert.equal(postingDate('2026-11-22',{...opts,postedTimestamp:'2026-11-21T23:00:00Z'}),null);
});
