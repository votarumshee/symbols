import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import WebSocket from 'ws';
import {createPool,transaction,one} from '../src/repositories/db.mjs';
import {migrate} from '../scripts/migrate.mjs';
import {seed} from '../scripts/seed.mjs';
import {buildApp} from '../src/app.mjs';
import {register,authenticate,hash,recover} from '../src/services/accounts.mjs';
import {command} from '../src/services/commands.mjs';
import {snapshot,changes} from '../src/services/sync.mjs';
import {step,maintain} from '../src/jobs/scheduler.mjs';
import {importDatabase} from '../scripts/import.mjs';
import {freshVault} from '../src/domain/economy.mjs';
import {runner} from 'node-pg-migrate';
const url=process.env.TEST_DATABASE_URL;
test('PostgreSQL integration', {skip:!url,timeout:120000},async t=>{
 const admin=createPool({databaseUrl:url}),name='symbols_it_'+randomUUID().replaceAll('-','');await admin.query('CREATE DATABASE '+name);
 const dbUrl=new URL(url);dbUrl.pathname='/'+name;const cfg={databaseUrl:dbUrl.href,poolMax:12,log:false,scheduler:false};
 const pool=createPool(cfg);let app;
 const user=async nick=>{const r=await register(pool,nick);return {...r,...await authenticate(pool,r.token)};};
 const run=(u,k,b={},key=randomUUID(),now)=>command(pool,u,k,b,key,now);
 const fund=async(u,cents=1000000,inventory={sword:5,circle:5})=>{const v=await one(pool,'SELECT data FROM vaults WHERE profile_id=$1',[u.id]);Object.assign(v.data.inventory,inventory);v.data.balanceCents=cents;v.data.balance=cents/100;v.data.tutorialDone=true;await pool.query('UPDATE vaults SET data=$2,balance_cents=$3 WHERE profile_id=$1',[u.id,v.data,cents]);};
 try{
  await t.test('empty schema, repeat migrations/seed, rollback',async()=>{assert.equal((await migrate(dbUrl.href)).length,4);assert.equal((await migrate(dbUrl.href)).length,0);await seed(pool);await seed(pool);assert.equal((await one(pool,'SELECT count(*) n FROM game_content')).n,'676');assert.equal((await one(pool,'SELECT count(*) n FROM game_content_links')).n,'456');await assert.rejects(transaction(pool,async c=>{await c.query("INSERT INTO profiles(id,nick) VALUES('rollback','Тест')");throw Error('fault');}));assert.equal(await one(pool,"SELECT 1 FROM profiles WHERE id='rollback'"),null);});
  await t.test('failed migration leaves neither table nor journal receipt',async()=>{
   const dir=fs.mkdtempSync(path.join(os.tmpdir(),'symbols-migration-'));fs.writeFileSync(path.join(dir,'0001_bad.cjs'),"exports.up=pgm=>pgm.sql('CREATE TABLE must_rollback(id int); SELECT 1/0;');");
   try{await assert.rejects(runner({databaseUrl:dbUrl.href,dir,direction:'up',migrationsTable:'failed_test_migrations',singleTransaction:true,log:()=>{},logger:{info(){},warn(){},error(){}}}));assert.equal((await one(pool,"SELECT to_regclass('must_rollback') name")).name,null);}finally{fs.rmSync(dir,{recursive:true});}
  });
  app=await buildApp(cfg,{pool});await app.listen({host:'127.0.0.1',port:0});
  await t.test('HTTP contract rejects fabricated progress, ETag, no v2/sync',async()=>{
   let r=await app.inject({method:'POST',url:'/api/v3/account/register',payload:{nick:'Игрок',progress:{balance:99999}}});assert.equal(r.statusCode,400);
   r=await app.inject({method:'POST',url:'/api/v3/account/register',payload:{nick:'Новый игрок'}});assert.equal(r.statusCode,201);const u=r.json();const headers={authorization:'Bearer '+u.token};r=await app.inject({url:'/api/v3/bootstrap',headers});assert.equal(r.json().profile.balanceCents,'100');
   const cat=await app.inject({url:'/api/v3/catalog',headers});assert.equal((await app.inject({url:'/api/v3/catalog',headers:{...headers,'if-none-match':cat.headers.etag}})).statusCode,304);
   assert.equal((await app.inject({method:'POST',url:'/api/sync',headers,payload:{}})).statusCode,404);
  });
  await t.test('two buyers, exact cents, receipts and rollback on insufficient balance',async()=>{
   const a=await user('Продавец'),b=await user('Покупатель Б'),c=await user('Покупатель В');for(const u of [a,b,c])await fund(u);
   const key=randomUUID(),sale=await run(a,'sell',{symbol:'sword',price:'4,25'},key);assert.deepEqual(await run(a,'sell',{symbol:'sword',price:'4,25'},key),sale);
   await assert.rejects(run(a,'sell',{symbol:'sword',price:'4,26'},key),e=>e.code==='IDEMPOTENCY_CONFLICT');
   const bought=await Promise.allSettled([run(b,'buy',{id:sale.listingIds[0]}),run(c,'buy',{id:sale.listingIds[0]})]);assert.equal(bought.filter(r=>r.status==='fulfilled').length,1);
   assert.equal((await snapshot(pool,a.id)).profile.balanceCents,'1000425');assert.equal((await snapshot(pool,a.id)).profile.inventory.sword,4);
   const poor=await user('Без средств'),l=await run(a,'sell',{symbol:'sword',price:'999'});await assert.rejects(run(poor,'buy',{id:l.listingIds[0]}));assert.equal((await one(pool,'SELECT status FROM listings WHERE id=$1',[l.listingIds[0]])).status,'open');
  });
  await t.test('simultaneous move, revision conflict, atomic outbox, no hidden inventory',async()=>{
   const a=await user('Игрок А'),b=await user('Игрок Б');await fund(a);await fund(b);await run(a,'start',{mode:'duel',small:true});const r=await run(b,'start',{mode:'duel',small:true});const args={matchId:r.matchId,revision:r.revision,action:{type:'king',index:56}},key=randomUUID();
   const keys=[key,randomUUID()],results=await Promise.allSettled(keys.map(k=>run(a,'action',args,k)));assert.equal(results.filter(r=>r.status==='fulfilled').length,1);const winner=results.findIndex(r=>r.status==='fulfilled');assert.deepEqual(await run(a,'action',args,keys[winner]),results[winner].value);
   const snap=await snapshot(pool,a.id);assert.equal(snap.match.board.boards[0][56].type,'king');assert.ok(!('inventory' in snap.match.players[1]));assert.equal(snap.match.revision,'2');
   const events=await changes(pool,a.id,'0');assert.equal(events.events.at(-1).match.baseRevision,'1');assert.equal(events.events.at(-1).commandId,keys[winner]);
   await assert.rejects(run(await user('Чужой игрок'),'leave',{matchId:r.matchId,revision:'2'}),e=>e.statusCode===404);
  });
  await t.test('normal win rewards once and event-write fault rolls back economy',async()=>{
   const a=await user('Победитель'),b=await user('Соперник');await fund(a);await fund(b);
   const started=await run(a,'start',{mode:'room',small:true});let snap=await snapshot(pool,a.id);await run(b,'start',{mode:'room',code:snap.match.code});snap=await snapshot(pool,a.id);
   await run(a,'action',{matchId:started.matchId,revision:snap.match.revision,action:{type:'king',index:56}});snap=await snapshot(pool,b.id);await run(b,'action',{matchId:started.matchId,revision:snap.match.revision,action:{type:'king',index:56}});
   const row=await one(pool,'SELECT * FROM arenas WHERE id=$1',[started.matchId]),s=row.data,now=Date.now();s.g.boards[0][14]={type:'tank',dir:0,seat:0};s.g.pending=[{player:0,index:14,actor:0}];for(const i of [0,14,28])s.g.boards[1][i]={type:'smile'};s.actor=1;s.g.current=1;s.started=now-15000;
   await pool.query('UPDATE arenas SET data=$2 WHERE id=$1',[s.id,s]);const key=randomUUID(),body={matchId:s.id,revision:row.revision,action:{type:'smile',index:2}};await run(b,'action',body,key,now);await run(b,'action',body,key,now);const won=await snapshot(pool,a.id);assert.equal(won.match.status,'done');assert.equal(won.profile.xp,1200);assert.equal(won.profile.balanceCents,'1000300');
   await pool.query("CREATE FUNCTION fail_event_test() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN RAISE EXCEPTION ''injected event failure''; END'");await pool.query('CREATE TRIGGER fail_event BEFORE INSERT ON events FOR EACH ROW EXECUTE FUNCTION fail_event_test()');
   try{const before=await snapshot(pool,a.id);await assert.rejects(run(a,'sell',{symbol:'sword',price:'1'}));assert.equal((await snapshot(pool,a.id)).profile.inventory.sword,before.profile.inventory.sword);assert.equal((await one(pool,"SELECT count(*) n FROM listings WHERE seller=$1 AND status='open'",[a.id])).n,'0');}finally{await pool.query('DROP TRIGGER fail_event ON events');await pool.query('DROP FUNCTION fail_event_test()');}
  });
  await t.test('queue and bots run without polling; two schedulers execute once; timeout survives restart',async()=>{
   const a=await user('Таймер');await fund(a);const r=await run(a,'start',{mode:'team',small:true});let row=await one(pool,'SELECT * FROM arenas WHERE id=$1',[r.matchId]);const now=Date.now()+9000;await step(pool,now);row=await one(pool,'SELECT * FROM arenas WHERE id=$1',[r.matchId]);assert.equal(row.data.players.length,4);
   await run(a,'action',{matchId:r.matchId,revision:row.revision,action:{type:'king',index:56}},randomUUID(),now);const secondPool=createPool(cfg);
   try{const before=await one(pool,'SELECT revision FROM arenas WHERE id=$1',[r.matchId]);await Promise.all([step(pool,now+500),step(secondPool,now+500)]);row=await one(pool,'SELECT * FROM arenas WHERE id=$1',[r.matchId]);assert.equal(BigInt(row.revision),BigInt(before.revision)+1n);}finally{await secondPool.end();}
   await app.close();app=await buildApp(cfg,{pool});await app.listen({host:'127.0.0.1',port:0});
   // Complete remaining bot setup then expire the human turn.
   for(let i=1;i<=3;i++)await step(pool,now+500+i*500);
   for(let i=0;i<30;i++)if(!await step(pool,now+100000))break;const s=await snapshot(pool,a.id);assert.equal(s.match.status,'done');const xp=s.profile.xp;await step(pool,now+101000);assert.equal((await snapshot(pool,a.id)).profile.xp,xp);
  });
  await t.test('all modes, training and local two-seat ownership',async()=>{
   for(const mode of ['play','trial','local','room']){const u=await user('Режим '+mode);const r=await run(u,'start',{mode,small:false});let s=await snapshot(pool,u.id);assert.deepEqual(s.match.size,[28,20]);if(mode==='play')assert.equal(s.match.tutorial,true);if(mode==='local')assert.deepEqual(s.match.seats,[0,1]);if(mode==='room'){assert.equal(s.match.deadline,null);const b=await user('Гость комнаты');await run(b,'start',{mode:'room',code:s.match.code});s=await snapshot(pool,u.id);assert.equal(s.match.status,'setup');}await run(u,'leave',{matchId:r.matchId,revision:s.match.revision});}
  });
  await t.test('cosmetics, cases, upgrade, forbidden promo, repeated case open',async()=>{
   const a=await user('Покупки');await fund(a);await run(a,'upgrade',{symbol:'king',level:0});await run(a,'buy-skin',{symbol:'sword',skin:'frost'});await run(a,'buy-avatar',{avatar:'firec'});await run(a,'buy-case',{case:'guard'});const key=randomUUID(),r=await run(a,'open-case',{case:'guard'},key);assert.deepEqual(await run(a,'open-case',{case:'guard'},key),r);const s=await snapshot(pool,a.id);assert.equal(s.profile.upgrades.king,1);assert.equal(s.profile.avatar,'firec');assert.equal(s.profile.cases.guard,0);await assert.rejects(run(a,'promo',{code:'BOSS4229'}));
  });
  await t.test('websocket replays cursor gap and closes on revocation; expired cursor resync',async()=>{
   const a=await user('События'),s=await snapshot(pool,a.id);await run(a,'nickname',{nick:'Новое имя'});const addr=app.server.address();
   const ws=new WebSocket(`ws://127.0.0.1:${addr.port}/api/v3/events?cursor=${s.cursor}`,{headers:{authorization:'Bearer '+a.token}});
   const message=await new Promise((resolve,reject)=>{ws.once('message',d=>resolve(JSON.parse(d)));ws.once('error',reject);});assert.equal(message.events[0].profilePatch.nick,'Новое имя');
   const closed=new Promise(resolve=>ws.once('close',resolve));await run(a,'logout');await closed;await assert.rejects(authenticate(pool,a.token));
   await pool.query("UPDATE events SET created=now()-interval '2 days' WHERE owner=$1",[a.id]);await maintain(pool);await assert.rejects(changes(pool,a.id,'0'),e=>e.code==='SNAPSHOT_REQUIRED');
  });
  await t.test('private SQLite dry run, full import, reconciliation, repeat protection and old recovery',async()=>{
   const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'symbols-import-')),file=path.join(tmp,'old.sqlite'),sql=new DatabaseSync(file);const id='old-id-not-uuid',token='old-secret-session',d=freshVault('Старый игрок');d.balanceCents=425;d.balance=4.25;d.inventory.sword=7;d.ownedSkins={sword:['frost']};
   sql.exec(`CREATE TABLE profiles(id TEXT,token_hash TEXT,nick TEXT,data TEXT,seen INTEGER);CREATE TABLE vaults(profile_id TEXT,data TEXT,revision INTEGER);CREATE TABLE recovery(profile_id TEXT,code_hash TEXT);CREATE TABLE account_sessions(token_hash TEXT,profile_id TEXT,created INTEGER);CREATE TABLE listings(id TEXT,seller TEXT,symbol TEXT,skin TEXT,price REAL,price_cents INTEGER,status TEXT,buyer TEXT,created INTEGER);CREATE TABLE recovery_limits(key TEXT,count INTEGER,expires INTEGER);CREATE TABLE arenas(id TEXT,data TEXT);CREATE TABLE matches(id TEXT,state TEXT);CREATE TABLE operations(id TEXT,owner TEXT);`);
   sql.prepare('INSERT INTO profiles VALUES(?,?,?,?,?)').run(id,hash(token),d.nick,JSON.stringify({newEconomy:true}),Date.now());sql.prepare('INSERT INTO vaults VALUES(?,?,?)').run(id,JSON.stringify(d),3);sql.prepare('INSERT INTO recovery VALUES(?,?)').run(id,hash('123456789'));sql.prepare('INSERT INTO listings VALUES(?,?,?,?,?,?,?,?,?)').run('old-lot',id,'sword',null,4.25,425,'open',null,Date.now());sql.close();
   try{let r=await importDatabase(pool,file);assert.equal(r.ok,true,JSON.stringify(r));assert.equal(await one(pool,'SELECT 1 FROM profiles WHERE id=$1',[id]),null);r=await importDatabase(pool,file,{dryRun:false});assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.sourceBalanceCents,r.targetBalanceCents);assert.equal((await importDatabase(pool,file,{dryRun:false})).alreadyImported,true);assert.equal((await snapshot(pool,id)).profile.inventory.sword,7);const a=await recover(pool,'123456789');assert.equal(a.id,id);await assert.rejects(authenticate(pool,token));assert.equal((await authenticate(pool,a.token)).profile_id,id);}finally{fs.rmSync(tmp,{recursive:true});}
  });
  await t.test('blocking and deletion revoke credentials and remove progress',async()=>{
   const a=await user('Удаление'),b=await user('Второй');await run(a,'block',{target:b.id});await run(a,'start',{mode:'room'});const s=await snapshot(pool,a.id);await assert.rejects(run(b,'start',{mode:'room',code:s.match.code}),e=>e.statusCode===403);const code=await run(a,'recovery-code');assert.ok(code.code);
   const avatarRoot=path.resolve('public/avatars'),avatarDir=path.resolve(avatarRoot,a.id);assert.ok(avatarDir.startsWith(avatarRoot+path.sep));fs.mkdirSync(avatarDir,{recursive:true});fs.writeFileSync(path.join(avatarDir,'test.jpg'),Buffer.from([255,216,255,217]));
   try{assert.equal((await app.inject({url:'/avatars/'+a.id+'/test.jpg'})).statusCode,200);await run(a,'delete-account',{confirm:true});for(const prefix of ['/avatars/','/%61vatars/'])assert.equal((await app.inject({url:prefix+a.id+'/test.jpg'})).statusCode,404);}finally{fs.rmSync(avatarDir,{recursive:true,force:true});}
   await assert.rejects(authenticate(pool,a.token));assert.equal(await one(pool,'SELECT 1 FROM vaults WHERE profile_id=$1',[a.id]),null);await assert.rejects(recover(pool,code.code));
  });
 }finally{if(app)await app.close();await pool.end();await admin.query('DROP DATABASE '+name+' WITH (FORCE)');await admin.end();}
});
