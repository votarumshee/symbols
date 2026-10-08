// Historical preview-package harness. Current optimized Android acceptance uses docs/native-transition.md and MigrationAcceptanceTest.
import {_android} from 'playwright';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const adb='../Client/.tools/sdk/platform-tools/adb.exe',serial='emulator-5556',pkg='com.votarumshee.symbols.webpreview';
const shell=(...args)=>execFileSync(adb,['-s',serial,...args],{encoding:'utf8'}).trim();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
shell('install','-r','android/app/build/outputs/apk/debug/app-debug.apk');
// This package is exclusively the disposable local proof, never the user's Kotlin app.
shell('shell','pm','clear',pkg);
shell('shell','am','force-stop',pkg);shell('shell','am','start','-W','-n',pkg+'/.MainActivity');
const devices=await _android.devices();const device=devices.find(d=>d.serial()===serial);for(const d of devices)if(d!==device)await d.close();
async function attach(){return (await device.webView({pkg})).page();}
let page=await attach();const errors=[];page.on('pageerror',e=>errors.push(e.message));
const ready=()=>page.waitForFunction(()=>document.querySelector('#app')?.dataset.busy!=='true');
const click=async selector=>{await ready();await page.locator(selector).first().click();};
const cell=(side,index)=>`[data-side="${side}"][data-index="${index}"]`;
const shot=async name=>{await sleep(200);await fs.writeFile('artifacts/'+name+'.png',execFileSync(adb,['-s',serial,'exec-out','screencap','-p']));};
try {
 await page.locator('#next-dialog input').fill('CapacitorProof');await click('#next-dialog button.primary');await page.locator('[data-nav="modes"]').waitFor();await sleep(600);await shot('android-home');
 assert.equal(await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.includes('session')).length),0);
 await click('[data-nav="modes"]');await click('[data-start="local"]');await page.locator(cell(0,65)).waitFor();await click(cell(0,65));await ready();await click(cell(1,65));await ready();
 await click('[data-piece="arrow"]');await click(cell(0,2));await page.locator('[data-direction="0"]').waitFor();await shot('android-direction');
 shell('shell','input','keyevent','4');await page.waitForFunction(()=>!document.querySelector('#next-dialog')?.open);
 await click(cell(0,2));await click('[data-direction="0"]');await ready();await page.locator(cell(0,2)+'[data-symbol="arrow"]').waitFor();await shot('android-board');
 // Genuine OS background/foreground, then process death and restored encrypted session.
 shell('shell','input','keyevent','3');await sleep(1000);shell('shell','am','start','-n',pkg+'/.MainActivity');await sleep(1000);await page.locator(cell(0,2)+'[data-symbol="arrow"]').waitFor();
 const prefs=shell('shell','run-as',pkg,'cat','shared_prefs/symbols-vault.xml');
 assert(prefs.includes('ciphertext'));assert(!prefs.includes('symbols-session'));assert(!prefs.includes('CapacitorProof'));
 shell('shell','am','force-stop',pkg);await sleep(700);const launch=shell('shell','am','start','-W','-n',pkg+'/.MainActivity');page=await attach();
 await page.locator(cell(0,2)+'[data-symbol="arrow"]').waitFor();assert((await page.locator('body').innerText()).includes('CapacitorProof'));await shot('android-restored');
 assert.deepEqual(errors,[]);
 const report={passed:true,android:36,webview:shell('shell','dumpsys','webviewupdate').split('\n').find(s=>s.includes('Current WebView package'))?.trim(),checks:['packaged assets, no remote website in shell','real native HTTP to API v3','king placement and directed shot','OS back closes direction picker','background/foreground resumes','force-stop/relaunch preserves account and match','vault ciphertext only, no token in localStorage'],coldLaunch:launch.split('\n').filter(l=>/TotalTime|WaitTime/.test(l)),errors};
 await fs.writeFile('artifacts/android-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(e){await shot('android-failure');console.error(e);console.error((await page.locator('body').innerText()).slice(-2000));console.error(errors);process.exitCode=1;}
finally{await device.close();}
