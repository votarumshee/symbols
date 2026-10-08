// Run from repo root after ui-parity-smoke on the local API/DB only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import pg from '../../Server/node_modules/pg/lib/index.js';
const exec=promisify(execFile), serial=process.argv[2] || 'emulator-5554';
assert.match(serial,/^emulator-\d+$/);
const nick=serial==='emulator-5554'?'Parity26':'Parity36';
const adb='Client/.tools/sdk/platform-tools/adb.exe';
const run=async(...args)=>(await exec(adb,['-s',serial,...args],{maxBuffer:4e6})).stdout;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const pool=new pg.Pool({connectionString:'postgres://symbols_test@127.0.0.1:5457/symbols_ui_test'});
async function nodes(){
 await run('shell','uiautomator','dump','/sdcard/root-doubletap.xml');
 const xml=await run('shell','cat','/sdcard/root-doubletap.xml');
 return [...xml.matchAll(/<node\b[^>]+>/g)].map(m=>Object.fromEntries([...m[0].matchAll(/([\w-]+)="([^"]*)"/g)].map(a=>[a[1],a[2]])));
}
function center(node){const b=node.bounds.match(/\d+/g).map(Number);return [Math.round((b[0]+b[2])/2),Math.round((b[1]+b[3])/2)];}
async function tapText(text){
 let n;
 for(let attempt=0;attempt<6;attempt++){
  n=(await nodes()).find(n=>n.text===text);
  if(n)break;
  if(text!=='Смайлик')break;
  await run('shell','input','swipe','900','1650','180','1650','300');
 }
 assert.ok(n,`Missing ${text}`);await run('shell','input','tap',...center(n).map(String));await sleep(700);
}
async function arena(){return (await pool.query("select revision,data from arenas where data->'players' @> $1::jsonb order by updated desc limit 1",[JSON.stringify([{nick}])])).rows[0];}
async function cell(col,row,double=false){
 const n=(await nodes()).find(n=>n['content-desc'].startsWith('Поле 10 на 14'));
 assert.ok(n,'Small board visible');const b=n.bounds.match(/\d+/g).map(Number),size=(b[2]-b[0])/14;
 const x=Math.round(b[0]+size*(col+.5)),y=Math.round(b[1]+size*(row+.5));
 if(double){
  // One input injector: separate `input tap` processes have variable startup delay.
  // AOSP MonkeySourceScript supports Tap and UserWait; no random events are used.
  const script='Client/artifacts/ui-parity/root-doubletap.events';
  fs.writeFileSync(script,`type= raw events\ncount= 3\nspeed= 1.0\nstart data >>\nTap(${x},${y},10)\nUserWait(80)\nTap(${x},${y},10)\n`);
  await run('push',script,'/sdcard/root-doubletap.events');
  const output=await run('shell','monkey','-p','com.votarumshee.symbols.dev.qa','-f','/sdcard/root-doubletap.events','1');
  fs.appendFileSync('Client/artifacts/ui-parity/root-doubletap-monkey.log',output);
 } else await run('shell','input','tap',String(x),String(y));
 await sleep(900);
}
try {
 if((await nodes()).some(n=>n.text==='Меню')){
  await tapText('Меню');
  if((await nodes()).some(n=>n.text==='Подтвердить')){await tapText('Подтвердить');await tapText('На главную');}
 }
 await tapText('Играть');await tapText('Двое на одном устройстве');
 const setup=await arena();await cell(2,9,true);const oneKing=await arena();
 assert.equal(Number(oneKing.revision),Number(setup.revision)+1,'Double tap must place exactly one king');
 await cell(4,9);await tapText('Смайлик');
 const before=await arena();await cell(3,5,true);const after=await arena();
 assert.equal(Number(after.revision),Number(before.revision)+1,'Double tap must send exactly one move');
 await run('shell','screencap','-p','/sdcard/root-doubletap.png');
 await run('pull','/sdcard/root-doubletap.png','Client/artifacts/ui-parity/root-doubletap.png');
 const result={serial,pass:true,setupRevisions:[setup.revision,oneKing.revision],moveRevisions:[before.revision,after.revision]};
 fs.writeFileSync('Client/artifacts/ui-parity/root-doubletap-result.json',JSON.stringify(result,null,2));
 console.log(result);
 await tapText('Меню');await tapText('Подтвердить');await tapText('На главную');
} finally {await pool.end();}
