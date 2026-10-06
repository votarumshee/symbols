// Black-box UI check of the exact minified APK; no test-only keep rules or embedded accounts.
import fs from 'node:fs';
import {execFile,spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
const exec=promisify(execFile),adb=process.env.ADB??'adb',device=process.argv[2]??'emulator-5556';
const pkg='com.votarumshee.symbols.dev.qa';
const run=async(...args)=>(await exec(adb,['-s',device,...args],{maxBuffer:4_000_000})).stdout;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let xml='';
async function dump(){await run('shell','uiautomator','dump','/sdcard/symbols-window.xml');xml=await run('shell','cat','/sdcard/symbols-window.xml');return [...xml.matchAll(/<node\b[^>]+>/g)].map(m=>Object.fromEntries([...m[0].matchAll(/([\w-]+)="([^"]*)"/g)].map(a=>[a[1],a[2]])));}
async function find(text,{scroll=false}={}){for(let i=0;i<12;i++){const nodes=await dump();const n=nodes.find(n=>n.text===text);if(n)return n;if(scroll)await run('shell','input','swipe','520','1500','520','500','300');else await sleep(350);}throw Error('UI missing: '+text);}
async function tapNode(n){const b=n.bounds.match(/\d+/g).map(Number);await run('shell','input','tap',String((b[0]+b[2])/2),String((b[1]+b[3])/2));}
async function tap(text,scroll=false){await tapNode(await find(text,{scroll}));}
async function shot(name){await run('shell','screencap','-p','/sdcard/symbols-qa.png');await run('pull','/sdcard/symbols-qa.png',new URL('../artifacts/screenshots/'+device+'-'+name+'.png',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1'));}
fs.mkdirSync(new URL('../artifacts/screenshots/',import.meta.url),{recursive:true});
await run('shell','pm','clear',pkg); // Dedicated QA package contains synthetic accounts only.
const cold=await run('shell','am','start','-W','-n',pkg+'/com.votarumshee.symbols.MainActivity');
await find('Твой первый ход');
await tapNode((await dump()).find(n=>n.class==='android.widget.EditText'));
await run('shell','input','text',device.endsWith('5556')?'QA36':'QA26');
await run('shell','input','keyevent','4');
await tap('Создать аккаунт');
await find('● На связи');
await shot('home');
await tap('Инвентарь',true);await find('Улучшить символы');await shot('inventory');
await tap('♛  СИМВОЛЫ');await tap('Играть  ↗',true);await tap('Двое на одном устройстве',true);await find('Твой ход');
if(process.env.SYMBOLS_TEST_SERVER_PID){
 if(!process.env.DATABASE_URL?.endsWith('/symbols_client_test'))throw Error('Restart is restricted to the synthetic database');
 process.kill(Number(process.env.SYMBOLS_TEST_SERVER_PID));
 const child=spawn(process.execPath,['src/main.mjs'],{cwd:fileURLToPath(new URL('../../Server/',import.meta.url)),env:{...process.env,PORT:'8080'},detached:true,windowsHide:true,stdio:'ignore'});child.unref();
 console.log({restartedTestServerPid:child.pid});
 for(let i=0;i<30;i++){try{if((await fetch('http://127.0.0.1:8080/ready')).ok)break;}catch{}await sleep(250);}
}
await run('shell','am','force-stop',pkg);await run('shell','am','start','-W','-n',pkg+'/com.votarumshee.symbols.MainActivity');await find('Твой ход');await find('● На связи');
await shot('match');
await tap('Выйти из партии',true);await tap('Подтвердить');await find('Баланс и награды обновлены сервером. Задания: ');
for(let i=0;i<4;i++)await run('shell','input','swipe','520','500','520','1500','250');
await find('Партия завершена');await shot('result');
await run('shell','dumpsys','gfxinfo',pkg,'reset');
for(let i=0;i<4;i++){await run('shell','input','swipe','520','1500','520','500','300');await run('shell','input','swipe','520','500','520','1500','300');}
const memory=await run('shell','dumpsys','meminfo',pkg),frames=await run('shell','dumpsys','gfxinfo',pkg);
const result={device,variant:'devQa',r8:true,ok:true,serverRestart:!!process.env.SYMBOLS_TEST_SERVER_PID,cold,memory,frames,notes:'Software-rendered AOSP emulator. Cold time is am start -W, not first server-ready frame. Frame stats are a short result-screen scroll, not a device benchmark.'};
fs.writeFileSync(new URL('../artifacts/qa-'+device+'.json',import.meta.url),JSON.stringify(result,null,2));
console.log({device,ok:true,coldStartMs:cold.match(/TotalTime: (\d+)/)?.[1]});
