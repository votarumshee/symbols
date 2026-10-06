// Synthetic test-only accounts. Credentials stay in ignored test assets, never stdout.
import fs from 'node:fs';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
const base=process.env.SYMBOLS_TEST_URL??'http://127.0.0.1:8080';
if(!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw Error('Local test Server only');
const fixture=new URL('../app/src/androidTest/assets/multi-fixture.json',import.meta.url);
async function request(route,session,body){const r=await fetch(base+'/api/v3/'+route,{method:body?'POST':'GET',headers:{'content-type':'application/json',...(session?{authorization:'Bearer '+session.token,'Idempotency-Key':randomUUID()}:{})},body:body?JSON.stringify(body):undefined});if(!r.ok)throw Error(route+': HTTP '+r.status);return r.json();}
if(process.argv[2]==='prepare'){
 const sessions=[];for(let i=0;i<4;i++){const s=await request('account/register',null,{nick:'Android pair '+i});sessions.push({...s,nick:'Android pair '+i});}
 fs.mkdirSync(new URL('../app/src/androidTest/assets/',import.meta.url),{recursive:true});fs.writeFileSync(fixture,JSON.stringify(sessions));console.log('Prepared four synthetic accounts; credentials not logged');
}else{
 const sessions=JSON.parse(fs.readFileSync(fixture));
 const adb=process.env.ADB??'adb';const devices=(process.env.SYMBOLS_DEVICES??'emulator-5556,emulator-5558').split(',');
 const run=(device,args)=>new Promise((resolve,reject)=>{const p=spawn(adb,['-s',device,...args]);let out='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>out+=d);p.on('exit',code=>code?reject(Error(out)):resolve(out));});
 const reports=[];
 for(const [mode,small] of [['room',true],['duel',false],['team',true]]){
  for(let i=0;i<(mode==='team'?4:2);i++){
   const old=await request('bootstrap',sessions[i]);if(old.match&&old.match.status!=='done')await request('commands/leave',sessions[i],{matchId:old.match.id,revision:old.match.revision});
  }
  await request('commands/start',sessions[0],{mode,small});
  const first=await request('bootstrap',sessions[0]);
  for(let i=1;i<(mode==='team'?4:2);i++)await request('commands/start',sessions[i],{mode,small,...(mode==='room'?{code:first.match.code}:{})});
  const results=await Promise.all(devices.map((device,role)=>run(device,['shell','am','instrument','-w','-e','class','com.votarumshee.symbols.MultiplayerTest','-e','role',String(role),'-e','mode',mode,'-e','small',String(small),'com.votarumshee.symbols.dev.test/androidx.test.runner.AndroidJUnitRunner'])));
  const ok=results.every(r=>r.includes('OK (1 test)'));reports.push({mode,small,devices,ok,output:results});console.log({mode,small,ok});if(!ok)break;
 }
 const dest=new URL('../artifacts/android-pair.json',import.meta.url);fs.mkdirSync(new URL('../artifacts/',import.meta.url),{recursive:true});fs.writeFileSync(dest,JSON.stringify(reports,null,2));if(reports.some(r=>!r.ok))process.exitCode=1;
}
