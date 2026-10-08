import pg from '../../Server/node_modules/pg/lib/index.js';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
const exec=promisify(execFile),adb='Client/.tools/sdk/platform-tools/adb.exe',device=process.argv[2]||'emulator-5556',pkg='com.votarumshee.symbols.dev.qa';
const run=async(...args)=>(await exec(adb,['-s',device,...args],{maxBuffer:4e6})).stdout;const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function dump(){for(let attempt=0;;attempt++){try{await run('shell','uiautomator','dump','/sdcard/ui-parity.xml');break;}catch(e){if(attempt>=2)throw e;await sleep(500);}}let xml=await run('shell','cat','/sdcard/ui-parity.xml');return [...xml.matchAll(/<node\b[^>]+>/g)].map(m=>Object.fromEntries([...m[0].matchAll(/([\w-]+)="([^"]*)"/g)].map(a=>[a[1],a[2]])));}
async function tapText(text){for(let n=0;n<8;n++){const v=(await dump()).find(n=>n.text===text);if(v){const b=v.bounds.match(/\d+/g).map(Number);await run('shell','input','tap',String((b[0]+b[2])/2),String((b[1]+b[3])/2));await sleep(700);return;}await sleep(400);}throw Error('Missing '+text);}
async function shot(name){await run('shell','screencap','-p','/sdcard/parity.png');await run('pull','/sdcard/parity.png','Client/artifacts/ui-parity/android-'+device+'-'+name+'.png');fs.writeFileSync('Client/artifacts/ui-parity/android-'+device+'-'+name+'.json',JSON.stringify(await dump()));}


const pool=new pg.Pool({connectionString:'postgres://symbols_test@127.0.0.1:5457/symbols_ui_test'});
async function request(route,session,body){const r=await fetch('http://127.0.0.1:8080/api/v3/'+route,{method:body?'POST':'GET',headers:{'content-type':'application/json',...(session?{authorization:'Bearer '+session.token,'Idempotency-Key':randomUUID()}:{})},body:body?JSON.stringify(body):undefined});if(!r.ok)throw Error(route+' HTTP '+r.status+' '+await r.text());return r.json();}
async function arena(){return (await pool.query("select id,revision,data from arenas where data->'players' @> $1::jsonb order by updated desc limit 1",[JSON.stringify([{nick:'Parity36'}])])).rows[0];}
async function cell(col,row){const n=(await dump()).find(n=>n['content-desc'].startsWith('Поле 10 на 14'));assert.ok(n,'board semantics');const b=n.bounds.match(/\d+/g).map(Number);const size=(b[2]-b[0])/14;await run('shell','input','tap',String(Math.round(b[0]+size*(col+.5))),String(Math.round(b[1]+size*(row+.5))));await sleep(1100);}
async function shelf(name){for(let i=0;i<8;i++){if((await dump()).some(n=>n.text===name)){await tapText(name);return;}await run('shell','input','swipe','900','1650','180','1650','400');}throw Error('shelf missing '+name);}
const reports=[];
await run('install','-r','Client/app/build/outputs/apk/dev/qa/app-dev-qa.apk');await run('shell','am','force-stop',pkg);await run('shell','am','start','-n',pkg+'/com.votarumshee.symbols.MainActivity');await sleep(1600);if((await dump()).some(n=>n.text==='Меню')){await tapText('Меню');if((await dump()).some(n=>n.text==='Подтвердить')){await tapText('Подтвердить');await tapText('На главную');}}
for(const mode of ['play','team']){
 const peers=[];for(let i=1;i<(mode==='team'?4:2);i++){const peer=await request('account/register',null,{nick:'UI '+mode+' peer '+i});await pool.query("update vaults set data=jsonb_set(data,'{tutorialDone}','true'::jsonb) where profile_id=$1",[peer.id]);peers.push(peer);}
 await tapText('Играть');await tapText(mode==='team'?'Дуэль 2 на 2':'Поиск соперника');
 await shot(mode==='play'?'waiting':'team-waiting');
 for(const peer of peers)await request('commands/start',peer,{mode,small:true});
 await sleep(1000);let a=await arena();assert.equal(a.data.status,'setup');assert.equal(a.data.players.length,mode==='team'?4:2);assert.ok(a.data.players.every(p=>!p.bot),'real peers joined before bot fallback');
 const own=a.data.players.findIndex(p=>p.nick==='Parity36');const played=new Set();let offTurnChecked=false;
 while(true){a=await arena();if(a.data.status!=='setup'&&played.size===a.data.players.length)break;const actor=a.data.actor;const setup=a.data.status==='setup';const before=Number(a.revision);
  if(actor===own){if(setup)await cell(Math.floor(actor/2),9);else{await shelf('Смайлик');await cell(4+Math.floor(actor/2),5);played.add(actor);}}
  else {if(!offTurnChecked){await sleep(300);const nodes=await dump();assert.ok(nodes.some(n=>/ставит|другого участника/.test(n.text)),'opponent turn status');await cell(8,5);assert.equal(Number((await arena()).revision),before,'opponent turn ignores taps');await shot(mode+'-other-turn');offTurnChecked=true;}
   const peer=peers.find(p=>p.id===a.data.players[actor].id);assert.ok(peer);await request('commands/action',peer,{matchId:a.id,revision:String(a.revision),action:{type:setup?'king':'smile',index:setup?56+Math.floor(actor/2):4+Math.floor(actor/2),side:actor%2}});if(!setup)played.add(actor);await sleep(400);
  }
  assert.equal(Number((await arena()).revision),before+1,'exactly one revision per actual turn');
 }
 await sleep(500);await shot(mode+'-board');assert.deepEqual([...played].sort(),a.data.players.map((_,i)=>i));
 if(mode==='play'){const latest=await arena();await request('commands/leave',peers[0],{matchId:latest.id,revision:String(latest.revision)});await sleep(1500);}else{await tapText('Меню');await tapText('Подтвердить');}await sleep(400);assert.equal((await arena()).data.status,'done');await shot(mode==='play'?'result':'team-result');await tapText('На главную');reports.push({mode,ownSeat:own,playerCount:a.data.players.length,turns:[...played],opponentTapIgnored:true,status:'PASS'});
}
fs.writeFileSync('Client/artifacts/ui-parity/multiplayer-ui.json',JSON.stringify(reports,null,2));await pool.end();console.log(reports);
