import {chromium} from 'playwright';
import {browserOptions,webOrigin,apiOrigin,databaseUrl} from './environment.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import pg from '../../Server/node_modules/pg/lib/index.js';
const out=new URL('../artifacts/',import.meta.url);await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch(browserOptions);
const context=await browser.newContext({viewport:{width:411,height:780}});
const page=await context.newPage(),errors=[],requests=[];
page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().includes('/api/'))requests.push({url:r.url(),method:r.method()});});
const pool=new pg.Pool({connectionString:databaseUrl});
const shot=async name=>{await page.locator('.entry-loading').waitFor({state:'hidden'});return page.screenshot({path:new URL(name+'.png',out).pathname.replace(/^\/([A-Z]:)/,'$1')});};
const click=async selector=>{await page.waitForFunction(()=>document.querySelector('#app').dataset.busy!=='true');await page.locator(selector).first().click();};
const cell=(side,index)=>`[data-side="${side}"][data-index="${index}"]`;
const waitSymbol=(side,index,type)=>page.locator(cell(side,index)+`[data-symbol="${type}"]`).waitFor();
try {
 await page.goto(webOrigin);await page.locator('#next-dialog input').fill('WebProof');await click('#next-dialog button.primary');await page.locator('[data-nav="modes"]').waitFor();
 const account=await page.evaluate(async()=>{const a=await (await fetch('/api/web/v3/account/sessions')).json();return {id:a.activeId};});
 // Controlled, per-account fixture in the existing disposable local test database.
 await pool.query("UPDATE vaults SET data=jsonb_set(jsonb_set(jsonb_set(data,'{tutorialDone}','true'),'{inventory,teleport}','5'),'{balanceCents}','200000'),balance_cents=200000 WHERE profile_id=$1",[account.id]);
 await page.reload();await page.locator('[data-nav="modes"]').waitFor();await shot('browser-home');
 for(const tab of ['inventory','upgrades','shop','market','quests']){await click(`[data-nav="${tab}"]`);await page.waitForTimeout(150);await shot('browser-'+tab);await click('[data-nav="home"]');}
 await click('[data-nav="modes"]');await click('[data-start="local"]');await page.locator(cell(0,65)).waitFor();
 await click(cell(0,65));await waitSymbol(0,65,'king');await click(cell(1,65));await waitSymbol(1,65,'king');
 await click('[data-piece="arrow"]');await click(cell(0,4));await shot('browser-direction');await click('[data-direction="0"]');await waitSymbol(0,4,'arrow');
 await click('[data-piece="smile"]');await click(cell(1,3));await waitSymbol(1,3,'smile');
 await click('[data-piece="teleport"]');await click(cell(0,4));await click(cell(0,2));await click('[data-direction="0"]');await waitSymbol(0,2,'arrow');await waitSymbol(0,4,'empty');await shot('browser-board');
 const before=(await pool.query("SELECT a.id,a.revision,a.data FROM arenas a JOIN arena_members m ON m.arena_id=a.id WHERE m.profile_id=$1 ORDER BY a.updated DESC LIMIT 1",[account.id])).rows[0];
 assert.equal(before.data.g.boards[0][2].type,'arrow');assert.equal(before.data.g.boards[0][4],null);
 await page.reload();await waitSymbol(0,2,'arrow');
 await context.setOffline(true);await click('[data-piece="smile"]');await click(cell(1,8));await page.locator('#resolve-operation').waitFor();
 await context.setOffline(false);await click('#resolve-operation');await page.waitForTimeout(500);
 const after=(await pool.query('SELECT revision FROM arenas WHERE id=$1',[before.id])).rows[0];assert.equal(after.revision,before.revision,'offline move must not replay');
 // Resume accepts a new deliberate move.
 if(await page.locator('[data-piece="smile"]').count())await click('[data-piece="smile"]');await click(cell(1,8));await waitSymbol(1,8,'smile');
 const nativeStorage=await page.evaluate(()=>Object.keys(localStorage));assert(!nativeStorage.some(k=>k.includes('session')));
 assert.equal(requests.filter(r=>/\/api\/(?:v2|register|recover)/.test(r.url)).length,0);
 assert.deepEqual(errors,[]);
 const report={passed:true,checks:['original screens','API v3 only','local match king placement','directed shot','teleport source cleared / destination verified in PostgreSQL','reload restores account and match','offline move never replayed','explicit move after reconnect'],browser:'Chrome',viewport:'411x780',requests:requests.length,errors};
 await fs.writeFile(new URL('browser-report.json',out),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(e){await shot('browser-failure');console.error(e);console.error('Page errors:',errors);console.error((await page.locator('body').innerText()).slice(-2500));process.exitCode=1;}
finally{await context.close();await browser.close();await pool.end();}
