import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createPool,one} from '../../Server/src/repositories/db.mjs';
import {migrate} from '../../Server/scripts/migrate.mjs';
import {seed} from '../../Server/scripts/seed.mjs';
import {buildApp} from '../../Server/src/app.mjs';
import {register} from '../../Server/src/services/accounts.mjs';
import {step} from '../../Server/src/jobs/scheduler.mjs';
import {PRICES} from '../../Server/src/domain/economy.mjs';
import {TYPES} from '../../Server/src/domain/engine.mjs';
import {maxUpgrade} from '../../Server/src/domain/upgrades.mjs';
import {SKINS} from '../../Server/src/domain/skins.mjs';
import {CASES,casePrice} from '../../Server/src/domain/cases.mjs';
import {levelThreshold} from '../../Server/src/domain/progression.mjs';

const databaseUrl=process.env.TEST_DATABASE_URL;
// API/DB acceptance, not a substitute for UI taps. All fixtures live in a new
// temporary database, and every tested mutation goes through HTTP schemas/auth.
test('K05 functional API v3 matrix',{skip:!databaseUrl,timeout:120000},async t=>{
 const admin=createPool({databaseUrl}),name='symbols_functions_'+randomUUID().replaceAll('-','');await admin.query('CREATE DATABASE '+name);
 const url=new URL(databaseUrl);url.pathname='/'+name;const pool=createPool({databaseUrl:url.href,poolMax:12});let app;
 async function user(nick='Acceptance player',extra={}){const u=await register(pool,nick);const r=await one(pool,'SELECT data FROM vaults WHERE profile_id=$1',[u.id]);Object.assign(r.data,{tutorialDone:true,balanceCents:100000000,balance:1000000,inventory:Object.fromEntries(Object.keys(PRICES).map(k=>[k,100])),...extra});await pool.query('UPDATE vaults SET data=$2,balance_cents=$3 WHERE profile_id=$1',[u.id,r.data,r.data.balanceCents]);return u;}
 async function response(u,path,body,key=randomUUID()){return app.inject({url:'/api/v3/'+path,method:body===undefined?'GET':'POST',headers:{authorization:'Bearer '+u.token,'idempotency-key':key},...(body===undefined?{}:{payload:body})});}
 async function req(u,path,body,key){const r=await response(u,path,body,key);assert.ok(r.statusCode>=200&&r.statusCode<300,`${path}: ${r.statusCode} ${r.body}`);return r.json();}
 const cmd=(u,kind,body={},key)=>req(u,'commands/'+kind,body,key),snap=u=>req(u,'bootstrap');
 async function act(u,action,key){const s=await snap(u);return cmd(u,'action',{matchId:s.match.id,revision:s.match.revision,action},key);}
 async function setup(users){let s=await snap(users[0]);while(s.match.status==='setup'){const seat=s.match.actor,u=users[seat]??users[0];await act(u,{type:'king',index:s.match.board.boards[0].length-5+Math.floor(seat/2)});s=await snap(users[0]);}return s;}
 async function leave(u){const s=await snap(u);if(s.match&&s.match.status!=='done')await cmd(u,'leave',{matchId:s.match.id,revision:s.match.revision});}
 async function local(){const u=await user();await cmd(u,'start',{mode:'local',small:true});await setup([u]);return u;}
 try{
  await migrate(url.href);await seed(pool);app=await buildApp({databaseUrl:url.href,log:false,scheduler:false},{pool});
  await t.test('all six modes on both sizes; tutorial advice and owned local seats',async()=>{
   for(const small of [true,false])for(const mode of ['play','duel','room','team','trial','local']){
    const a=await user('Mode '+mode,{tutorialDone:mode!=='play'}),users=[a];await cmd(a,'start',{mode,small});let s=await snap(a);
    assert.deepEqual(s.match.size,small?[10,14]:[28,20]);assert.equal(s.match.mode,mode);
    if(mode==='play'){assert.equal(s.match.tutorial,true);assert.equal(s.match.advice.move.type,'king');assert.ok(s.match.advice.text.length>5);}
    if(['duel','room','team'].includes(mode)){
     for(let i=1;i<(mode==='team'?4:2);i++){const u=await user('Partner '+i);users.push(u);await cmd(u,'start',{mode,small,...(mode==='room'?{code:s.match.code}:{})});}
     s=await setup(users);assert.equal(s.match.status,'play');assert.equal(s.match.players.length,users.length);assert.ok(s.match.players.every(p=>!p.bot));
     const before=await snap(users[1]);const result=await act(a,{type:'smile',index:2});const other=await snap(users[1]);assert.equal(other.match.board.boards[0][2].type,'smile');
     const page=await req(users[1],'changes?cursor='+before.cursor);assert.ok(page.events.some(e=>e.commandId===result.commandId));assert.equal(new Set(other.match.players.map(p=>p.id)).size,users.length);
    }
    if(mode==='local'){s=await setup([a]);assert.deepEqual(s.match.seats,[0,1]);assert.equal(s.match.board.boards[0].filter(p=>p?.type==='king').length,1);assert.equal(s.match.board.boards[1].filter(p=>p?.type==='king').length,1);}
    await leave(a);
   }
  });
  await t.test('eight directed placements, erase, teleport source/target/direction, angry extra turns',async()=>{
   for(let dir=0;dir<8;dir++){const a=await local();await act(a,{type:'arrow',index:16,dir});const s=await snap(a);assert.equal(s.match.board.boards[0][16].type,'arrow');assert.equal(s.match.board.boards[0][16].dir,dir);const row=await one(pool,'SELECT data FROM arenas WHERE id=$1',[s.match.id]);assert.equal(row.data.g.boards[0][16].dir,dir);await leave(a);}
   const a=await local();await act(a,{type:'arrow',index:16,dir:0});await act(a,{type:'smile',index:17});
   const before=(await snap(a)).profile.inventory.teleport;await act(a,{type:'teleport',source:16,index:18,dir:3});let s=await snap(a);assert.equal(s.match.board.boards[0][16],null);assert.equal(s.match.board.boards[0][18].type,'arrow');assert.equal(s.match.board.boards[0][18].dir,3);assert.equal(s.profile.inventory.teleport,before-1);
   await act(a,{type:'smile',index:19});await act(a,{type:'erase',index:18,side:0});s=await snap(a);assert.equal(s.match.board.boards[0][18],null);assert.equal(s.match.actor,0);
   const angry=s.profile.inventory.angry;await act(a,{type:'angry'});s=await snap(a);assert.equal(s.match.actor,0);assert.equal(s.match.board.extra,2);assert.equal(s.profile.inventory.angry,angry-1);
   await act(a,{type:'smile',index:20});s=await snap(a);assert.equal(s.match.actor,0);assert.equal(s.match.board.extra,1);await act(a,{type:'smile',index:21});s=await snap(a);assert.equal(s.match.actor,1);assert.equal(s.match.board.extra,0);await leave(a);
  });
  await t.test('normal room win: server result, history, quests, level rewards are awarded once',async()=>{
   const a=await user('Winner'),b=await user('Opponent');await cmd(a,'start',{mode:'room',small:true});await cmd(b,'start',{mode:'room',code:(await snap(a)).match.code});await setup([a,b]);
   let s=await snap(a);const row=await one(pool,'SELECT data FROM arenas WHERE id=$1',[s.match.id]),g=row.data.g;
   // Controlled endgame fixture: API move must resolve a real pending shot.
   g.boards[0][14]={type:'tank',dir:0,seat:0};g.pending=[{player:0,index:14,actor:0}];
   for(const i of [0,14,28])g.boards[1][i]={type:'smile'};
   const oldKing=g.boards[1].findIndex(p=>p?.type==='king');g.boards[1][oldKing]=null;g.boards[1][56]={type:'king',seat:1,dir:0};row.data.actor=1;g.current=1;row.data.started=Date.now()-10000;
   await pool.query('UPDATE arenas SET data=$2 WHERE id=$1',[s.match.id,row.data]);
   const before=await snap(a),current=await snap(b),key=randomUUID(),body={matchId:current.match.id,revision:current.match.revision,action:{type:'smile',index:2}};
   const result=await cmd(b,'action',body,key);assert.deepEqual(await cmd(b,'action',body,key),result);s=await snap(a);
   assert.equal(s.match.status,'done');assert.equal(s.match.result.won,true);assert.equal(s.profile.xp,1200);assert.equal(s.profile.balanceCents,String(BigInt(before.profile.balanceCents)+300n));assert.equal(s.profile.quests.clean,1);assert.equal(s.profile.quests.blocks,1);assert.equal(s.profile.history.length,1);assert.equal(s.profile.history[0].id,s.match.id);assert.equal(s.profile.history[0].xp,1200);
   // Earn a level milestone through a server cosmetic command, once only.
   const v=await one(pool,'SELECT data FROM vaults WHERE profile_id=$1',[a.id]);v.data.xp=levelThreshold(10);await pool.query('UPDATE vaults SET data=$2 WHERE profile_id=$1',[a.id,v.data]);await cmd(a,'nickname',{nick:'Level reward'});s=await snap(a);assert.equal(s.profile.level.level,10);assert.equal(s.profile.levelRewards.filter(r=>r.level===10).length,1);const cases=Object.values(s.profile.cases).reduce((a,b)=>a+b,0);await cmd(a,'nickname',{nick:'Level reward two'});assert.equal(Object.values((await snap(a)).profile.cases).reduce((a,b)=>a+b,0),cases);
  });
  await t.test('trial result advances rank progress; local result has no economic reward',async()=>{
   const a=await user('Trial');await cmd(a,'start',{mode:'trial',small:true});await act(a,{type:'king',index:65});await step(pool,Date.now()+1000);let s=await snap(a),row=await one(pool,'SELECT data FROM arenas WHERE id=$1',[s.match.id]);
   const g=row.data.g;g.playerStocks[1]={...Object.fromEntries(Object.keys(TYPES).map(k=>[k,0])),smile:100};const oldKing=g.boards[1].findIndex(p=>p?.type==='king');g.boards[1][oldKing]=null;g.boards[1][56]={type:'king',seat:1,dir:0};g.boards[0][14]={type:'tank',dir:0,seat:0};g.pending=[{player:0,index:14,actor:0}];row.data.actor=1;g.current=1;row.data.turnAt=Date.now()-500;row.data.started=Date.now()-1000;await pool.query('UPDATE arenas SET data=$2,due_at=now() WHERE id=$1',[s.match.id,row.data]);await step(pool,Date.now()+1000);s=await snap(a);assert.equal(s.match.status,'done');assert.equal(s.match.result.won,true);assert.equal(s.profile.rankProgress,20);assert.equal(s.profile.trialRun.length,1);
   const l=await local(),before=await snap(l);await leave(l);const after=await snap(l);assert.equal(after.profile.xp,before.profile.xp);assert.equal(after.profile.balanceCents,before.profile.balanceCents);assert.equal(after.profile.history[0].xp,0);
  });
  await t.test('market skin sale/buy/cancel; pagination, filter, sort, exact cents and blocking effect',async()=>{
   const a=await user('Seller'),b=await user('Buyer');await cmd(a,'buy-skin',{symbol:'sword',skin:'frost'});let before=await snap(a);const sale=await cmd(a,'sell',{symbol:'sword',skin:'frost',price:'4.25',quantity:1});let s=await snap(a);assert.equal(s.profile.inventory.sword,before.profile.inventory.sword-1);assert.ok(!s.profile.ownedSkins.sword.includes('frost'));
   const listing=await one(pool,'SELECT * FROM listings WHERE id=$1',[sale.listingIds[0]]);assert.equal(listing.price_cents,String(425+SKINS.find(s=>s.id==='frost').price*90));const bb=await snap(b);await cmd(b,'buy',{id:listing.id});s=await snap(b);assert.equal(s.profile.balanceCents,String(BigInt(bb.profile.balanceCents)-BigInt(listing.price_cents)));assert.ok(s.profile.ownedSkins.sword.includes('frost'));assert.equal(s.profile.skins.sword,'frost');assert.equal((await one(pool,'SELECT status FROM listings WHERE id=$1',[listing.id])).status,'sold');
   const returned=await cmd(b,'sell',{symbol:'sword',skin:'frost',price:'1',quantity:1});await cmd(b,'cancel',{id:returned.listingIds[0]});assert.ok((await snap(b)).profile.ownedSkins.sword.includes('frost'));assert.equal((await one(pool,'SELECT status FROM listings WHERE id=$1',[returned.listingIds[0]])).status,'cancelled');
   await cmd(a,'sell',{symbol:'sword',skin:'classic',price:'2',quantity:61});await cmd(a,'sell',{symbol:'circle',skin:'classic',price:'3',quantity:1});const first=await req(b,'market?symbol=sword&desc=false&offset=0'),second=await req(b,'market?symbol=sword&desc=false&offset='+first.nextOffset);assert.equal(first.listings.length,60);assert.equal(first.nextOffset,60);assert.equal(second.listings.length,1);assert.equal(second.nextOffset,null);assert.equal(new Set([...first.listings,...second.listings].map(l=>l.id)).size,61);assert.ok([...first.listings,...second.listings].every(l=>l.symbol==='sword'));
   const desc=await req(b,'market?desc=true&offset=0');assert.equal(desc.listings[0].symbol,'circle');assert.ok(desc.listings.every((l,i,a)=>i===0||BigInt(a[i-1].priceCents)>=BigInt(l.priceCents)));
   await cmd(b,'block',{target:a.id});assert.equal((await req(b,'market?offset=0')).listings.length,0);assert.equal((await response(b,'commands/buy',{id:first.listings[0].id})).statusCode,403);await cmd(b,'unblock',{target:a.id});assert.equal((await req(b,'market?symbol=sword&offset=0')).listings.length,60);await cmd(b,'buy',{id:first.listings[0].id});assert.equal((await one(pool,'SELECT status FROM listings WHERE id=$1',[first.listings[0].id])).status,'sold');
   await cmd(a,'start',{mode:'room',small:true});const code=(await snap(a)).match.code;await cmd(b,'block',{target:a.id});assert.equal((await response(b,'commands/start',{mode:'room',code})).statusCode,403);await cmd(b,'unblock',{target:a.id});await cmd(b,'start',{mode:'room',code});assert.equal((await snap(b)).match.id,(await snap(a)).match.id);await leave(a);
  });
  await t.test('cases, upgrade/max, frame, avatar and skin mutations match persisted inventory/wallet',async()=>{
   const a=await user('Cosmetics',{xp:levelThreshold(20)});let s=await snap(a);const c=CASES[0],balance=BigInt(s.profile.balanceCents);await cmd(a,'buy-case',{case:c.id});s=await snap(a);assert.equal(s.profile.balanceCents,String(balance-BigInt(casePrice(c))));const owned=s.profile.cases[c.id],inventory={...s.profile.inventory},key=randomUUID();const opened=await cmd(a,'open-case',{case:c.id},key);assert.deepEqual(await cmd(a,'open-case',{case:c.id},key),opened);s=await snap(a);assert.equal(s.profile.cases[c.id],owned-1);assert.equal(s.profile.inventory[opened.drop],inventory[opened.drop]+1);assert.equal(s.profile.lastCaseDrop.symbol,opened.drop);
   await cmd(a,'upgrade',{symbol:'king',level:0});s=await snap(a);assert.equal(s.profile.upgrades.king,1);const purchase=maxUpgrade({...s.profile,balanceCents:Number(s.profile.balanceCents)},'king'),before=BigInt(s.profile.balanceCents);await cmd(a,'upgrade',{symbol:'king',level:1,max:true});s=await snap(a);assert.equal(s.profile.upgrades.king,1+purchase.count);assert.equal(s.profile.balanceCents,String(before-BigInt(purchase.cost)));assert.equal((await response(a,'commands/upgrade',{symbol:'king',level:0})).statusCode,400);
   await cmd(a,'frame',{frame:2});assert.equal((await snap(a)).profile.frame,2);await cmd(a,'frame',{frame:null});assert.equal((await snap(a)).profile.frame,null);assert.equal((await response(a,'commands/frame',{frame:30})).statusCode,400);
   await cmd(a,'buy-avatar',{avatar:'firec'});s=await snap(a);assert.ok(s.profile.ownedAvatars.includes('firec'));assert.equal(s.profile.avatar,'firec');await cmd(a,'avatar',{avatar:'lion'});assert.equal((await snap(a)).profile.avatar,'lion');await cmd(a,'avatar',{avatar:'firec'});
   await cmd(a,'buy-skin',{symbol:'sword',skin:'frost'});assert.equal((await snap(a)).profile.skins.sword,'frost');await cmd(a,'skin',{symbol:'sword',skin:'classic'});s=await snap(a);assert.equal(s.profile.skins.sword,'classic');assert.ok(s.profile.ownedSkins.sword.includes('frost'));const persisted=await one(pool,'SELECT data,balance_cents FROM vaults WHERE profile_id=$1',[a.id]);assert.equal(persisted.balance_cents,s.profile.balanceCents);assert.equal(persisted.data.avatar,'firec');assert.equal(persisted.data.upgrades.king,s.profile.upgrades.king);
  });
 }finally{if(app)await app.close();await pool.end();await admin.query('DROP DATABASE '+name+' WITH (FORCE)');await admin.end();}
});
