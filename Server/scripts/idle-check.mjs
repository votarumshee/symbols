import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import WebSocket from 'ws';
import {config} from '../src/config/env.mjs';
import {createPool,one} from '../src/repositories/db.mjs';
import {migrate} from './migrate.mjs';
import {seed} from './seed.mjs';
import {buildApp} from '../src/app.mjs';
import {register} from '../src/services/accounts.mjs';
if(!process.env.DATABASE_URL?.includes('test')||process.env.NODE_ENV==='production')throw Error('Test database only');
const admin=createPool(config()),name='symbols_idle_test_'+randomUUID().replaceAll('-','');await admin.query('CREATE DATABASE '+name);const url=new URL(config().databaseUrl);url.pathname='/'+name;await migrate(url.href);const pool=createPool({databaseUrl:url.href,poolMax:12});await seed(pool);const app=await buildApp({log:false,scheduler:true},{pool}),sockets=[];
await app.listen({host:'127.0.0.1',port:0});let frames=0;
const wait=ms=>new Promise(r=>setTimeout(r,ms));const writes=()=>one(pool,'SELECT n FROM idle_write_audit');
try{for(let i=0;i<200;i++){const u=await register(pool,'Ожидание '+i),ws=new WebSocket('ws://127.0.0.1:'+app.server.address().port+'/api/v3/events?cursor=0',{headers:{authorization:'Bearer '+u.token}});sockets.push(ws);ws.on('message',()=>frames++);await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});}
 await pool.query("CREATE TABLE idle_write_audit(n bigint); INSERT INTO idle_write_audit VALUES(0); CREATE FUNCTION audit_idle() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN UPDATE idle_write_audit SET n=n+1; RETURN NULL; END'");
 for(const name of ['profiles','vaults','events','commands','account_sessions','recovery_limits','arenas'])await pool.query('CREATE TRIGGER audit_idle AFTER INSERT OR UPDATE OR DELETE ON '+name+' FOR EACH ROW EXECUTE FUNCTION audit_idle()');
 const before=await writes(),requests=app.metrics.requests;await wait(23000);const after=await writes(),r={players:200,seconds:23,httpRequests:app.metrics.requests-requests,applicationWsFrames:frames,databaseRowWrites:Number(after.n)-Number(before.n),note:'Includes a real 20s ping/pong cycle. Exact test-only row triggers avoid asynchronous pg_stat initialization counters. No matches or commands.'};if(r.databaseRowWrites||r.httpRequests)throw Error('Unexpected idle writes/requests '+JSON.stringify(r));fs.mkdirSync('reports',{recursive:true});fs.writeFileSync('reports/idle.json',JSON.stringify(r,null,2));console.log(r);
}finally{for(const s of sockets)s.terminate();await app.close();await pool.end();await admin.query('DROP DATABASE '+name+' WITH (FORCE)');await admin.end();}
