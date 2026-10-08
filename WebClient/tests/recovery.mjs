import {chromium} from 'playwright';
import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {browserOptions,webOrigin} from './environment.mjs';
const browser=await chromium.launch(browserOptions),ctx=await browser.newContext(),p=await ctx.newPage(),errors=[];
const ready=page=>page.waitForFunction(()=>document.querySelector('#app').dataset.busy!=='true');
const click=async(page,sel)=>{await ready(page);await page.locator(sel).first().click();};
const home=page=>page.locator('[data-nav="modes"]').waitFor();
const accounts=page=>page.evaluate(async()=>await (await fetch('/api/web/v3/account/sessions')).json());
try {
 p.on('pageerror',e=>errors.push(e.message));await p.goto(webOrigin);await p.locator('#next-dialog input').fill('RecoveryProof');await click(p,'#next-dialog button.primary');await home(p);const first=(await accounts(p)).activeId;
 await click(p,'[data-profile]');await click(p,'#recover');await click(p,'#show-code');await p.waitForFunction(()=>document.querySelector('#recovery-code')?.textContent.length===32);const code=await p.locator('#recovery-code').innerText();
 const other=await browser.newContext(),q=await other.newPage();q.on('pageerror',e=>errors.push(e.message));await q.goto(webOrigin);await q.locator('#next-dialog [data-close]').click();await q.locator('#recovery-entry').click();await q.locator('#next-dialog input').fill(code);await q.locator('#next-dialog button.primary').click();await home(q);assert.equal((await accounts(q)).activeId,first);
 const oldStatus=await p.evaluate(async id=>(await fetch('/api/web/v3/bootstrap',{headers:{'X-Symbols-Account':id}})).status,first);assert.equal(oldStatus,401);
 await click(q,'[data-accounts]');await click(q,'#new-account');await q.locator('#next-dialog input').fill('SecondBrowser');await click(q,'#next-dialog button.primary');await home(q);const second=(await accounts(q)).activeId;assert.notEqual(first,second);assert.equal((await accounts(q)).accounts.length,2);
 // Fresh browser context with only persisted HttpOnly cookies, no DOM storage.
 const cookies=await other.cookies();assert(cookies.every(c=>c.httpOnly&&c.secure&&c.sameSite==='Strict'&&c.expires>0));await other.close();
 const persistent=await browser.newContext({storageState:{cookies,origins:[]}}),r=await persistent.newPage();await r.goto(webOrigin);await home(r);assert.equal((await accounts(r)).activeId,second);
 const storage=await r.evaluate(()=>JSON.stringify({local:{...localStorage},session:{...sessionStorage},cookie:document.cookie}));assert(!/token|bearer|__Host-symbols/i.test(storage));
 await click(r,'[data-accounts]');await Promise.all([r.waitForResponse(x=>x.url().endsWith('/account/switch')&&x.status()===200),click(r,'[data-cookie-account="'+first+'"]')]);await r.waitForFunction(()=>document.querySelector('.rank-corner small')?.textContent==='RecoveryProof');await home(r);assert.equal((await accounts(r)).activeId,first);
 await click(r,'[data-profile]');await click(r,'#privacy');assert((await r.locator('#next-dialog').innerText()).includes('HttpOnly'));await click(r,'#next-dialog [data-close]');
 await click(r,'[data-profile]');await click(r,'#logout');await click(r,'#confirm-account-end');await r.waitForFunction(async()=>{try{return (await(await fetch('/api/web/v3/account/sessions')).json()).accounts.length===1;}catch{return false;}});await r.locator('#next-dialog input').waitFor();assert.equal((await accounts(r)).accounts.length,1);
 await r.locator('#next-dialog [data-close]').click();await r.getByRole('button',{name:'Другие аккаунты'}).click();await Promise.all([r.waitForResponse(x=>x.url().endsWith('/account/switch')&&x.status()===200),r.locator('[data-cookie-account="'+second+'"]').click()]);await r.waitForFunction(()=>document.querySelector('.rank-corner small')?.textContent==='SecondBrowser');await home(r);
 await click(r,'[data-profile]');await click(r,'#delete-account');await click(r,'#confirm-account-end');await r.waitForFunction(async()=>{try{return (await(await fetch('/api/web/v3/account/sessions')).json()).accounts.length===0;}catch{return false;}});await r.locator('#next-dialog input').waitFor();assert.equal((await accounts(r)).accounts.length,0);
 assert.deepEqual(errors,[]);await persistent.close();const report={passed:true,checks:['recovery UI revokes original cookie','two accounts','HttpOnly Secure SameSite Strict persistent cookie','new browser context with cookies only restores login','account switch','bundled privacy','logout removes only selected account','delete remaining account','no browser JS bearer'],errors};await fs.writeFile('artifacts/recovery-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(e){await p.locator('#recovery-code').evaluateAll(nodes=>nodes.forEach(n=>n.textContent='[REDACTED]'));await p.screenshot({path:'artifacts/recovery-failure.png'});throw e;}finally{await ctx.close();await browser.close();}
