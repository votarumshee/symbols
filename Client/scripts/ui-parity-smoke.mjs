import pg from '../../Server/node_modules/pg/lib/index.js';
import fs from 'node:fs';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
const exec=promisify(execFile),adb='Client/.tools/sdk/platform-tools/adb.exe',device=process.argv[2]||'emulator-5556',pkg='com.votarumshee.symbols.dev.qa';
const run=async(...args)=>(await exec(adb,['-s',device,...args],{maxBuffer:4e6})).stdout;const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function dump(){for(let attempt=0;;attempt++){try{await run('shell','uiautomator','dump','/sdcard/ui-parity.xml');break;}catch(e){if(attempt>=2)throw e;await sleep(500);}}let xml=await run('shell','cat','/sdcard/ui-parity.xml');return [...xml.matchAll(/<node\b[^>]+>/g)].map(m=>Object.fromEntries([...m[0].matchAll(/([\w-]+)="([^"]*)"/g)].map(a=>[a[1],a[2]])));}
async function tapText(text){for(let n=0;n<8;n++){const v=(await dump()).find(n=>n.text===text);if(v){const b=v.bounds.match(/\d+/g).map(Number);await run('shell','input','tap',String((b[0]+b[2])/2),String((b[1]+b[3])/2));await sleep(700);return;}await sleep(400);}throw Error('Missing '+text);}
async function shot(name){await run('shell','screencap','-p','/sdcard/parity.png');await run('pull','/sdcard/parity.png','Client/artifacts/ui-parity/android-'+device+'-'+name+'.png');fs.writeFileSync('Client/artifacts/ui-parity/android-'+device+'-'+name+'.json',JSON.stringify(await dump()));}
const pool=new pg.Pool({connectionString:'postgres://symbols_test@127.0.0.1:5457/symbols_ui_test'});
async function arena(){const nick=device.endsWith('5556')?'Parity36':'Parity26';const r=await pool.query("select revision,data->>'status' status from arenas where data->'players' @> $1::jsonb order by updated desc limit 1",[JSON.stringify([{nick}])]);return r.rows[0];}
await run('install','-r','Client/app/build/outputs/apk/dev/qa/app-dev-qa.apk');await run('shell','pm','clear',pkg);await run('shell','am','start','-n',pkg+'/com.votarumshee.symbols.MainActivity');await sleep(1800);
const edit=(await dump()).find(n=>n.class==='android.widget.EditText');const b=edit.bounds.match(/\d+/g).map(Number);await run('shell','input','tap',String((b[0]+b[2])/2),String((b[1]+b[3])/2));await run('shell','input','text',device.endsWith('5556')?'Parity36':'Parity26');await run('shell','input','keyevent','4');await tapText('Создать аккаунт');await sleep(1600);await shot('home');
await tapText('Инвентарь');await shot('inventory');await tapText('На главную');await tapText('Играть');await shot('modes');await tapText('Двое на одном устройстве');await shot('setup');
async function cell(col,row){const n=(await dump()).find(n=>n['content-desc'].startsWith('Поле 10 на 14'));if(!n)throw Error('board semantics missing');const b=n.bounds.match(/\d+/g).map(Number);const size=(b[2]-b[0])/14;await run('shell','input','tap',String(Math.round(b[0]+size*(col+.5))),String(Math.round(b[1]+size*(row+.5))));await sleep(1800);}
await cell(0,9);await cell(0,9);await shot('board');await tapText('Стрелочка');await shot('selected');await cell(1,5);await shot('direction');await tapText('↑');await tapText('Смайлик');await cell(2,5);await shot('move');
await tapText('Стрелочка');await tapText('Отмена');await shot('cancel');
const beforePan=await arena();await tapText('Увеличить');await shot('zoom');await run('shell','input','swipe','850','1050','300','1050','500');await shot('pan');const afterPan=await arena();if(afterPan.revision!==beforePan.revision)throw Error('Pan/zoom changed game revision');await tapText('Уменьшить');
await run('shell','input','keyevent','3');await sleep(1000);await run('shell','am','start','-n',pkg+'/com.votarumshee.symbols.MainActivity');await sleep(1000);await shot('foreground');await run('shell','am','force-stop',pkg);await run('shell','am','start','-n',pkg+'/com.votarumshee.symbols.MainActivity');await sleep(1500);await shot('restart');
await tapText('Меню');await tapText('Подтвердить');await shot('result');await tapText('На главную');await shot('home-final');console.log({device,result:'PASS',gestures:'king direct x2, arrow/cell/direction, smile immediate, cancel, zoom/pan, background/restart, leave/result/home'});



await pool.end();

