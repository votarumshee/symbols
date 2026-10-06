import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'symbols-smoke-')),db=path.join(tmp,'test.sqlite'),port=18787;
let server;
const start=()=>new Promise((resolve,reject)=>{server=spawn(process.execPath,['scripts/local-server.mjs'],{env:{...process.env,SYMBOLS_DB:db,PORT:String(port)},stdio:['ignore','pipe','pipe']});server.once('error',reject);server.stdout.once('data',resolve);server.once('exit',code=>{if(code)reject(Error('server '+code));});});
const stop=()=>new Promise(resolve=>{server.once('exit',resolve);server.kill('SIGTERM');});
async function api(route,body={},token){const r=await fetch('http://127.0.0.1:'+port+'/api/'+route,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});const d=await r.json();assert.equal(r.status,200,d.error);return d;}
try{
 assert.equal(spawnSync(process.execPath,['scripts/init-db.mjs',db],{stdio:'ignore'}).status,0);
 await start();assert.equal((await fetch('http://127.0.0.1:'+port)).status,200);
 const a=await api('register',{nick:'Синтетический тест'});
 await api('v2/nickname',{nick:'Проверка сохранения'},a.token);
 const g=await api('v2/start',{mode:'trial',small:true},a.token);
 assert.equal(g.game.status,'setup');
 await stop();await start();
 const p=await api('v2/profile',{},a.token);assert.equal(p.profile.nick,'Проверка сохранения');assert.equal(p.profile.game,g.game.id);
 console.log('PASS HTTP assets/register/profile/trial and disk persistence across restart.');
 await stop();
}finally{if(server&&!server.killed)server.kill();fs.rmSync(tmp,{recursive:true,force:true});}
