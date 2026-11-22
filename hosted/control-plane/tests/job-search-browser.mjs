import assert from 'node:assert/strict';
export async function verifyJobSearch(page){
 let mode='ok',requests=0,mutations=0;
 const job={id:'synthetic-search',url:'https://himalayas.app/companies/example/jobs/synthetic',applicationLink:'https://himalayas.app/companies/example/jobs/synthetic?utm_source=api',title:'Synthetic Reporting Engineer',company:'Synthetic Example',description:'Build reporting tools with Python. Review requirements before applying.',expiresAt:new Date(Date.now()+3600000).toISOString(),locations:['United States'],employmentType:'Full Time'};
 const watch=request=>{if(request.method()==='POST'&&request.url().includes('/api/hosted/'))mutations++;};page.on('request',watch);
 await page.route('**/api/hosted/tenants/*/discover?*',async route=>{requests++;const url=new URL(route.request().url());assert.equal(url.searchParams.get('q'),'reporting');assert.equal(url.searchParams.get('country'),'US');await route.fulfill({status:mode==='error'?503:200,json:mode==='error'?{error:'search_unavailable'}:{jobs:mode==='empty'?[]:[job],page:Number(url.searchParams.get('page')),hasMore:mode!=='empty',fetchedAt:new Date().toISOString()}});});
 try{
 await page.getByRole('button',{name:'Opportunities',exact:true}).click();
 await page.getByLabel('Role or keywords',{exact:true}).fill('reporting');await page.getByRole('button',{name:'Search jobs',exact:true}).click();
 await page.getByRole('heading',{name:job.title,exact:true}).waitFor();assert.equal(await page.getByRole('link',{name:'Apply on Himalayas',exact:true}).getAttribute('href'),job.applicationLink);
 await page.getByRole('button',{name:'Use this job',exact:true}).click();assert.match(await page.locator('#posting-text').inputValue(),/Company: Synthetic Example/);assert.match(await page.locator('#posting-text').inputValue(),/Build reporting tools/);assert.equal(mutations,0);
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 mode='empty';await page.getByRole('button',{name:'Next page',exact:true}).click();await page.getByText(/No matching open jobs on this page/).waitFor();assert.equal(await page.getByRole('button',{name:'Next page',exact:true}).isDisabled(),true);
 mode='error';await page.getByRole('button',{name:'Search jobs',exact:true}).click();await page.getByText('Could not load jobs. Please try again.',{exact:true}).waitFor();assert.match(await page.locator('#posting-text').inputValue(),/Build reporting tools/);assert.equal(mutations,0);assert.equal(requests,3);
 await page.setViewportSize({width:1280,height:720});console.log('PASS job discovery: US query, source/apply links, explicit import without mutation, pagination/empty/error preservation and mobile layout');
 }finally{page.off('request',watch);await page.unroute('**/api/hosted/tenants/*/discover?*');}
}
