import {chromium} from 'playwright';
import {browserOptions,webOrigin,apiOrigin,databaseUrl} from './environment.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import pg from '../../Server/node_modules/pg/lib/index.js';
import {register} from '../../Server/src/services/accounts.mjs';
const pool=new pg.Pool({connectionString:databaseUrl});
const browser=await chromium.launch(browserOptions);
const users=await Promise.all(['WebBuyer','Seller','Teammate','Opponent'].map(n=>register(pool,n)));
for(const u of users)await pool.query("UPDATE vaults SET data=jsonb_set(jsonb_set(jsonb_set(data,'{tutorialDone}','true'),'{inventory,teleport}','5'),'{balanceCents}','200000'),balance_cents=200000 WHERE profile_id=$1",[u.id]);
let cookieActive=false;
const req=async(u,path,body)=>{if(cookieActive&&u.id===users[0].id){const r=await p.evaluate(async({path,body,id})=>{const r=await fetch('/api/web/v3/'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-Symbols-Account':id,'Idempotency-Key':crypto.randomUUID()},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};},{path,body,id:u.id});if(r.status>=400)throw Error(JSON.stringify(r.data));return r.data;}const r=await fetch(apiOrigin+'/api/v3/'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+u.token,'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID()},body:body?JSON.stringify(body):undefined});const d=await r.json();if(!r.ok)throw Error(JSON.stringify(d));return d;};
const ctx=await browser.newContext({viewport:{width:411,height:780},reducedMotion:'reduce'});
const recovery=await req(users[0],"commands/recovery-code",{});
const recovered=await ctx.request.post(webOrigin+"/api/web/v3/account/recover",{headers:{Origin:webOrigin},data:{code:recovery.code}});assert.equal(recovered.status(),200);cookieActive=true;
const p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
const ready=()=>p.waitForFunction(()=>document.querySelector('#app').dataset.busy!=='true');
const click=async s=>{await ready();await p.locator(s).first().click();};
const cell=(side,i)=>`[data-side="${side}"][data-index="${i}"]`;
const snap=()=>req(users[0],'bootstrap');
const screenshot=name=>p.screenshot({path:'artifacts/'+name+'.png'});
try {
 await p.goto(webOrigin);await p.locator('[data-nav="modes"]').waitFor();
 await req(users[1],'commands/sell',{symbol:'teleport',price:'4.25',quantity:2,skin:'classic'});
 await click('[data-nav="market"]');await click('[data-market-symbol="teleport"]');
 const balance=(await snap()).profile.balanceCents;
 await click('[data-buy]');await ready();assert.equal(Number((await snap()).profile.balanceCents),Number(balance)-425);await screenshot('browser-market-purchase');
 await click('#market-back');await click('[data-nav="home"]');await click('[data-nav="shop"]');await click('[data-case]');
 await click('#buy-case');await p.waitForFunction(()=>Number(document.querySelector('#case-owned')?.textContent)>0);
 await click('#open-case');await p.locator('.case-win').waitFor();assert((await snap()).profile.lastCaseDrop);await screenshot('browser-case-result');
 await click('#next-dialog [data-close]');await click('[data-nav="home"]');await click('[data-nav="modes"]');await click('[data-start="team"]');
 for(const u of users.slice(1))await req(u,'commands/start',{mode:'team',small:true});
 await p.locator(cell(0,65)).waitFor();await click(cell(0,65));await ready();
 for(let seat=1;seat<4;seat++){const s=await req(users[seat],'bootstrap');assert.equal(s.match.actor,seat);await req(users[seat],'commands/action',{matchId:s.match.id,revision:s.match.revision,action:{type:'king',index:seat>=2?66:65}});}
 await p.locator(cell(0,66)+'[data-symbol="king"]').waitFor();
 await click('[data-piece="arrow"]');await click(cell(0,2));await click('[data-direction="0"]');await ready();
 let s=await req(users[1],'bootstrap');assert.equal(s.match.actor,1);await req(users[1],'commands/action',{matchId:s.match.id,revision:s.match.revision,action:{type:'smile',index:3}});
 await p.locator(cell(1,3)+'[data-symbol="smile"]').waitFor();await screenshot('browser-team');
 // Idle menus have no repeated bootstrap/profile polling.
 let profileReads=0;p.on('request',r=>{if(/\/api\/(?:web\/)?v3\/(bootstrap|profile)$/.test(r.url()))profileReads++;});
 await p.waitForTimeout(11000);assert.equal(profileReads,0);
 assert.deepEqual(errors,[]);
 const report={passed:true,checks:['market purchase debits exactly 425 cents','case buy/open and server drop','four-player team starts without bots','opponent event updates board via long poll','no snapshot/profile polling during 11 seconds idle'],errors};
 await fs.writeFile('artifacts/integration-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(e){await screenshot('integration-failure');console.error(e);console.error((await p.locator('body').innerText()).slice(-2200));console.error(errors);process.exitCode=1;}
finally{await ctx.close();await browser.close();for(const u of users){try{const s=await req(u,'bootstrap');if(s.match&&s.match.status!=='done')await req(u,'commands/leave',{matchId:s.match.id,revision:s.match.revision});}catch{}}await pool.end();}
