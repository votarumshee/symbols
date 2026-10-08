import fs from 'node:fs';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
const exec=promisify(execFile),adb='Client/.tools/sdk/platform-tools/adb.exe',device=process.argv[2]||'emulator-5556',pkg='com.votarumshee.symbols.dev.qa';
const run=async(...args)=>(await exec(adb,['-s',device,...args],{maxBuffer:4e6})).stdout;const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function dump(){for(let attempt=0;;attempt++){try{await run('shell','uiautomator','dump','/sdcard/ui-parity.xml');break;}catch(e){if(attempt>=2)throw e;await sleep(500);}}let xml=await run('shell','cat','/sdcard/ui-parity.xml');return [...xml.matchAll(/<node\b[^>]+>/g)].map(m=>Object.fromEntries([...m[0].matchAll(/([\w-]+)="([^"]*)"/g)].map(a=>[a[1],a[2]])));}
async function tapText(text){for(let n=0;n<8;n++){const v=(await dump()).find(n=>n.text===text);if(v){const b=v.bounds.match(/\d+/g).map(Number);await run('shell','input','tap',String((b[0]+b[2])/2),String((b[1]+b[3])/2));await sleep(700);return;}await sleep(400);}throw Error('Missing '+text);}
async function shot(name){await run('shell','screencap','-p','/sdcard/parity.png');await run('pull','/sdcard/parity.png','Client/artifacts/ui-parity/android-'+device+'-'+name+'.png');fs.writeFileSync('Client/artifacts/ui-parity/android-'+device+'-'+name+'.json',JSON.stringify(await dump()));}

await run('shell','am','force-stop',pkg);await run('shell','am','start','-n',pkg+'/com.votarumshee.symbols.MainActivity');await sleep(1300);await shot('home-owned');
await tapText('Профиль');await run('shell','input','tap','540','440');await sleep(800);await shot('avatars');await run('shell','input','keyevent','4');await sleep(500);
await tapText('Магазин');await tapText('Штурм');await shot('case');await run('shell','input','keyevent','4');await run('shell','input','keyevent','4');
await tapText('Магазин');await tapText('Скины');await tapText('Меч');await shot('skins');await run('shell','input','keyevent','4');
try{await run('shell','wm','size','840x1860');await sleep(1400);await shot('narrow-home');await tapText('Инвентарь');await shot('narrow-inventory');await run('shell','input','keyevent','4');}finally{await run('shell','wm','size','reset');}
console.log('supplementary cosmetics and narrow viewport captured');
