import fs from 'node:fs';
import os from 'node:os';
import {performance} from 'node:perf_hooks';
import {randomUUID} from 'node:crypto';
import WebSocket from 'ws';
import {createPool,one} from '../src/repositories/db.mjs';
import {config} from '../src/config/env.mjs';
import {buildApp} from '../src/app.mjs';
import {register} from '../src/services/accounts.mjs';
import {migrate} from './migrate.mjs';
import {seed} from './seed.mjs';
if(process.env.NODE_ENV==='production'||!process.env.DATABASE_URL?.includes('test'))throw Error('Use a disposable database with test in its name');
const count=Number(process.argv[2]??50),seconds=Number(process.argv[3]??20),admin=createPool(config()),dbName='symbols_load_test_'+randomUUID().replaceAll('-','');
await admin.query('CREATE DATABASE '+dbName);const target=new URL(config().databaseUrl);target.pathname='/'+dbName;
const cfg={...config(),databaseUrl:target.href,log:false,scheduler:true,poolMax:12};await migrate(cfg.databaseUrl);const pool=createPool(cfg);await seed(pool);const app=await buildApp(cfg,{pool});
await app.listen({host:'127.0.0.1',port:0});const base='http://127.0.0.1:'+app.server.address().port;
let http=0,httpBytes=0,wsMessages=0,wsBytes=0,errors=0,conflicts=0;const latencies=[],delivery=[],clients=[];
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function request(u,route,body,key){const start=performance.now(),payload=body===undefined?undefined:JSON.stringify(body);const r=await fetch(base+'/api/v3/'+route,{method:body===undefined?'GET':'POST',headers:{authorization:'Bearer '+u.token,...(payload?{'Content-Type':'application/json','Idempotency-Key':key??randomUUID()}: {})},body:payload});const text=await r.text();http++;httpBytes+=Buffer.byteLength(text)+Buffer.byteLength(payload??'');latencies.push(performance.now()-start);if(r.status>=500)errors++;if(r.status===409)conflicts++;if(!r.ok)throw Error(String(r.status));return text?JSON.parse(text):null;}
function apply(u,event){if(BigInt(event.cursor)<=BigInt(u.cursor))return;u.cursor=event.cursor;if(event.match?.snapshot)u.match=event.match.snapshot;else if(event.match?.patch&&u.match){const delta=structuredClone(event.match.patch);if(delta.board){const cells=delta.board.cells??[];delete delta.board.cells;Object.assign(u.match.board,delta.board);for(const cell of cells)u.match.board.boards[cell.side][cell.index]=cell.value;delete delta.board;}Object.assign(u.match,delta);}delivery.push(Date.now()-Date.parse(event.serverTime));}
function connect(u){return new Promise((resolve,reject)=>{u.ws=new WebSocket(base.replace('http','ws')+'/api/v3/events?cursor='+u.cursor,{headers:{authorization:'Bearer '+u.token}});u.ws.on('message',bytes=>{wsMessages++;wsBytes+=bytes.length;const frame=JSON.parse(bytes);for(const e of frame.events??[])apply(u,e);});u.ws.once('open',resolve);u.ws.once('error',reject);});}
const stats=()=>one(pool,"SELECT tup_inserted,tup_updated,tup_deleted FROM pg_stat_database WHERE datname=current_database()");
try{
 for(let i=0;i<count;i++){const u=await register(pool,'Нагрузка '+i);clients.push(u);await pool.query("UPDATE vaults SET data=jsonb_set(data,'{tutorialDone}','true') WHERE profile_id=$1",[u.id]);}
 for(const [i,u] of clients.entries()){await request(u,'commands/start',{mode:i%4<2?'duel':'trial',small:true});const snap=await request(u,'bootstrap');u.cursor=snap.cursor;u.match=snap.match;await connect(u);}
 // Measure steady traffic separately from registration/bootstrap.
 await wait(1000);latencies.length=0;delivery.length=0;const initial={http,httpBytes,wsMessages,wsBytes},before=await stats(),cpu=process.cpuUsage(),started=performance.now();let peakRss=process.memoryUsage().rss,reconnected=false;
 while(performance.now()-started<seconds*1000){
  await Promise.all(clients.map(async u=>{const s=u.match;if(!s||s.status==='done'||!s.seats.includes(s.actor))return;const side=s.actor%2,board=s.board.boards[side];const index=s.status==='setup'?board.findIndex((v,i)=>!v&&i>=(s.board.rows-1)*s.board.width):board.findIndex(v=>!v);if(index<0)return;try{await request(u,'commands/action',{matchId:s.id,revision:s.revision,action:{type:s.status==='setup'?'king':'smile',index}});}catch(e){if(e.message==='409'){const snap=await request(u,'bootstrap');u.match=snap.match;u.cursor=snap.cursor;}}}));
  if(!reconnected&&performance.now()-started>seconds*500){reconnected=true;await Promise.all(clients.filter((_,i)=>i%5===0).map(async u=>{u.ws.close();await connect(u);}));}
  peakRss=Math.max(peakRss,process.memoryUsage().rss);await wait(900);
 }
 const elapsed=(performance.now()-started)/1000,used=process.cpuUsage(cpu);await wait(1200);const after=await stats();
 const percentile=(values,p)=>[...values].sort((a,b)=>a-b)[Math.floor((values.length-1)*p)]??0;
 const report={players:count,seconds:elapsed,scenario:'half duel / half trial, small board, one legal placement per eligible player per ~0.9s, 20% reconnect once; no profile polling',hardware:{platform:process.platform,cpu:os.cpus()[0].model,logicalCpus:os.cpus().length,totalRamBytes:os.totalmem(),node:process.version},postgres:(await one(pool,'SELECT version() v')).v,dbBytes:(await one(pool,'SELECT pg_database_size(current_database()) n')).n,httpRequests:http-initial.http,httpRps:(http-initial.http)/elapsed,httpPayloadBytes:httpBytes-initial.httpBytes,wsMessages:wsMessages-initial.wsMessages,wsPayloadBytes:wsBytes-initial.wsBytes,technicalErrors:errors,revisionConflicts:conflicts,p95HttpMs:percentile(latencies,.95),p95EventFromCommandStartMs:percentile(delivery,.95),cpuPercentOneCore:(used.user+used.system)/1e6/elapsed*100,peakRssBytes:peakRss,databaseRowWrites:Object.fromEntries(Object.keys(before).map(k=>[k,Number(after[k])-Number(before[k])])),pollingReferenceRequests:count*elapsed/.9+count*elapsed/10,notes:['CPU/RAM include in-process load driver; PostgreSQL runs separately in Docker.','Payload bytes exclude headers/TLS. Event latency starts before transaction, conservatively includes lock/commit time.','Polling reference is calculated until paired baseline run; it is not a measured baseline.']};
 fs.mkdirSync('reports',{recursive:true});fs.writeFileSync('reports/load-'+count+'.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{for(const u of clients)u.ws?.terminate();await app.close();await pool.end();await admin.query('DROP DATABASE '+dbName+' WITH (FORCE)');await admin.end();}
