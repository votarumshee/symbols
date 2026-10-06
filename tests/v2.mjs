import assert from 'node:assert/strict';import fs from 'node:fs';import {DatabaseSync} from 'node:sqlite';import worker from '../dist/server/index.js';import {freshProgress,PRICES} from '../dist/economy.mjs';import {createGame,shot} from '../dist/engine.mjs';import {startArena,arenaAction} from '../server/arena-engine.mjs';import {levelInfo,trialResult} from '../dist/progression.mjs';
const sql=new DatabaseSync(':memory:');for(const f of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(fs.readFileSync('drizzle/'+f,'utf8'));
class Query{constructor(s){this.s=s;this.args=[];}bind(...args){this.args=args;return this;}async first(){return sql.prepare(this.s).get(...this.args)??null;}async all(){return {results:sql.prepare(this.s).all(...this.args)};}async run(){return {meta:sql.prepare(this.s).run(...this.args)};}}
const DB={prepare:s=>new Query(s),batch:async qs=>{sql.exec('BEGIN');try{const r=[];for(const q of qs)r.push(await q.run());sql.exec('COMMIT');return r;}catch(e){sql.exec('ROLLBACK');throw e;}}};
let now=Date.now();Date.now=()=>now;
async function api(route,body={},user=null){const res=await worker.fetch(new Request('https://game.test/api/'+route,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://game.test',...(user?{Authorization:'Bearer '+user.token}:{})},body:JSON.stringify(body)}),{DB});const d=await res.json();if(!res.ok)throw Error(d.error);return d;}
async function user(n){const p=freshProgress();p.human.unlocked.push('circle');const u=await api('register',{nick:'Тест '+n,progress:p});sql.prepare('UPDATE profiles SET data=? WHERE id=?').run(JSON.stringify(p),u.id);await api('v2/profile',{},u);return u;}
async function seedSymbols(u){const row=sql.prepare('SELECT data FROM vaults WHERE profile_id=?').get(u.id);const data=JSON.parse(row.data);for(const t of Object.keys(PRICES))data.inventory[t]=(data.inventory[t]??0)+50;sql.prepare('UPDATE vaults SET data=? WHERE profile_id=?').run(JSON.stringify(data),u.id);return api('v2/profile',{},u);}
const a=await user('А'),b=await user('Б'),c=await user('В'),d=await user('Г');
assert.equal((await api('v2/profile',{},a)).profile.inventory.circle,1);
let r=await seedSymbols(a);assert.equal(r.profile.inventory.sword,50);assert.equal(r.profile.inventory.circle,51);assert.equal(r.profile.inventory.arrow,undefined);await assert.rejects(()=>api('v2/promo',{code:'U50B34'},a),/не действует/);
await api('v2/promo',{code:'BOSS4229'},b);let funded=JSON.parse(sql.prepare('SELECT data FROM vaults WHERE profile_id=?').get(b.id).data);funded.balanceCents=100100;funded.balance=1001;sql.prepare('UPDATE vaults SET data=? WHERE profile_id=?').run(JSON.stringify(funded),b.id);
await api('v2/sell',{symbol:'sword',price:700},a);let list=(await api('v2/market',{},a)).listings;assert.equal(list.length,1);assert.equal((await api('v2/profile',{},a)).profile.inventory.sword,49);await api('v2/buy',{id:list[0].id},b);assert.equal((await api('v2/profile',{},b)).profile.inventory.sword,1);assert.equal((await api('v2/profile',{},a)).profile.balance,701);await assert.rejects(()=>api('v2/buy',{id:list[0].id},c),/недоступно/);
await api('v2/sell',{symbol:'circle',price:5},a);list=(await api('v2/market',{},a)).listings;await api('v2/cancel',{id:list[0].id},a);assert.equal((await api('v2/profile',{},a)).profile.inventory.circle,51);
await assert.rejects(()=>api('v2/sell',{symbol:'arrow',price:5},a),/Неизвестный символ/);await assert.rejects(()=>api('v2/sell',{symbol:'sword',price:0},a),/Цена/);
for(const u of [a,b,c,d])r=await api('v2/start',{mode:'team',small:true},u);assert.equal(r.game.players.length,4);assert.equal(r.game.status,'setup');const id=r.game.id;for(let i=0;i<4;i++){r=await api('v2/poll',{},[a,b,c,d][i]);r=await api('v2/action',{revision:r.revision,action:{type:'king',index:56+Math.floor(i/2)}},[a,b,c,d][i]);}assert.equal(r.game.status,'play');assert.equal(r.game.g.kingHp.length,4);assert.equal(r.game.g.boards.flat().filter(t=>t?.type==='king').length,4);
r=await api('v2/action',{revision:r.revision,action:{type:'sword',index:14,dir:0}},a);assert.equal(r.profile.inventory.sword,48);const rev=r.revision;r=await api('v2/action',{revision:rev-1,action:{type:'sword',index:15,dir:0}},a);assert.equal(r.profile.inventory.sword,48);await assert.rejects(()=>api('v2/action',{revision:rev,action:{type:'arrow',index:15,dir:0}},a),/ход/);await assert.rejects(()=>api('v2/sell',{symbol:'sword',price:5},a),/партию/);
await api('v2/leave',{},b);r=await api('v2/poll',{},a);assert.equal(r.game.status,'done');assert.equal(r.profile.xp,0);
r=await api('v2/start',{mode:'duel',small:true},a);assert.equal(r.game.status,'waiting');now+=9000;r=await api('v2/poll',{},a);assert.equal(r.game.status,'setup');assert.equal(r.game.players[1].bot,true);
// Isolated four-king hit: destroying one king does not end the team match.
const s={size:[10,14],players:Array.from({length:4},(_,i)=>({id:String(i),bot:true,inventory:{}}))};startArena(s,now);for(let i=0;i<4;i++)arenaAction(s,{type:'king',index:56+Math.floor(i/2)},i,now);s.g.boards[0][14]={type:'sword',dir:0,seat:0};shot(s.g,{player:0,index:14},true);assert.equal(s.g.kingHp[1],0);assert.equal(s.g.kingHp[3],100);assert.equal(s.g.winner,null);s.g.boards[0][15]={type:'sword',dir:0,seat:0};shot(s.g,{player:0,index:15},true);assert.equal(s.g.winner,0);
assert.equal(levelInfo(259).level,1);assert.equal(levelInfo(260).level,2);assert.equal(levelInfo(560).level,3);assert.equal(levelInfo(660).level,4);assert.ok(levelInfo(999999).level>300);
let p={rank:{index:14,name:'Элита'},rankProgress:0,trialRun:[]};for(let i=0;i<5;i++)trialResult(p,true,0,9999);assert.equal(p.rank.index,15);p={rank:{index:14,name:'Элита'},rankProgress:0,trialRun:[]};trialResult(p,true,0,10000);assert.equal(p.rank.index,13);
console.log('PASS v2: migration, promo once, escrow, sale, cancel, inventory consumption, replay, four humans/kings, bot fill, XP thresholds and strict rank time.');
// Server awards are calculated from validated state, and never repeated by polling.
const e=await user('Д'),f=await user('Е');await api('v2/start',{mode:'duel',small:true},e);r=await api('v2/start',{mode:'duel',small:true},f);
r=await api('v2/action',{revision:r.revision,action:{type:'king',index:56}},e);r=await api('v2/action',{revision:r.revision,action:{type:'king',index:56}},f);
const battle=r.game;battle.g.boards[0][14]={type:'tank',dir:0,seat:0};battle.g.pending=[{player:0,index:14,actor:0}];for(const i of [0,14,28])battle.g.boards[1][i]={type:'smile'};battle.actor=1;battle.g.current=1;battle.started=now-15000;sql.prepare('UPDATE arenas SET data=? WHERE id=?').run(JSON.stringify(battle),battle.id);
r=await api('v2/action',{revision:r.revision,action:{type:'smile',index:2}},f);r=await api('v2/poll',{},e);assert.equal(r.game.status,'done');assert.equal(r.profile.xp,1200);assert.equal(r.profile.balance,4);assert.equal(r.profile.quests.clean,1);assert.equal(r.profile.quests.blocks,1);const again=await api('v2/poll',{},e);assert.equal(again.profile.xp,1200);assert.equal(again.profile.balance,4);
await api('sync',{nick:'Тест Д',progress:freshProgress()},e).catch(()=>{});assert.equal((await api('v2/profile',{},e)).profile.xp,1200);
// Friend room waits for a human, no timed bot insertion.
r=await api('v2/start',{mode:'room',small:true},e);const code=r.game.code;now+=9000;r=await api('v2/poll',{},e);assert.equal(r.game.status,'waiting');r=await api('v2/start',{mode:'room',code},f);assert.equal(r.game.status,'setup');assert.equal(r.game.players.filter(p=>!p.bot).length,2);
console.log('PASS v2: exact 15-second reward, only one-buck quests, idempotent settlement, legacy sync isolation and friend rooms.');
// Newly registered accounts cannot import a fabricated wallet or inventory.
const forged=freshProgress();forged.human.balance=999999;forged.human.unlocked.push(...Object.keys(PRICES));const fresh=await api('register',{nick:'Новый игрок',progress:forged});r=await api('v2/profile',{progress:forged},fresh);assert.equal(r.profile.balance,1);assert.equal(r.profile.inventory.sword,0);
// Recovery retains the server vault, including purchases and experience.
const rc=await api('recovery-code',{nick:'Тест А',progress:freshProgress()},a);const recovered=await api('recover',{code:rc.code});assert.equal((await api('v2/profile',{},recovered)).profile.inventory.sword,48);
// Bot-only 2v2 simulation keeps stocks and turn ownership coherent.
const sim={size:[10,14],level:1,players:Array.from({length:4},(_,i)=>({id:'sim'+i,bot:true,inventory:{}}))};startArena(sim,now);const {arenaBotMove}=await import('../server/arena-engine.mjs');for(let i=0;i<100&&sim.status!=='done';i++){arenaAction(sim,arenaBotMove(sim),sim.actor,now+i*1000);assert.ok(sim.g.playerStocks.every(stock=>Object.values(stock).every(n=>Number.isInteger(n)&&n>=0)));}
console.log('PASS v2: no fabricated registration funds, restored inventory and full four-player battle.');
// A health booster must not hide actual damage for clean-win rewards.
const heal={size:[10,14],players:[{id:'0',bot:true,inventory:{}},{id:'1',bot:true,inventory:{}}]};startArena(heal,now);arenaAction(heal,{type:'king',index:56},0,now);arenaAction(heal,{type:'king',index:56},1,now);heal.g.boards[1][14]={type:'arrow',dir:0,seat:1};heal.g.pending=[{player:1,index:14,actor:1}];arenaAction(heal,{type:'powerful',index:57,dir:6},0,now);assert.equal(heal.g.kingHp[0],140);assert.equal(heal.damage[0],20);
console.log('PASS v2: temporary health cannot mask received damage.');

// Exact cents, unrestricted ordinary prices, old listings, and pagination beyond 200.
const sellerC=await user('Продавец'),buyerC=await user('Покупатель');
await seedSymbols(sellerC);
let wallet=JSON.parse(sql.prepare('SELECT data FROM vaults WHERE profile_id=?').get(buyerC.id).data);wallet.balance=10;delete wallet.balanceCents;sql.prepare('UPDATE vaults SET data=? WHERE profile_id=?').run(JSON.stringify(wallet),buyerC.id);
await api('v2/sell',{symbol:'sword',price:'4,25'},sellerC);
let offer=(await api('v2/market',{symbol:'sword'},buyerC)).listings.find(l=>l.seller===sellerC.id);assert.equal(offer.priceCents,425);
r=await api('v2/buy',{id:offer.id},buyerC);assert.equal(r.profile.balanceCents,575);assert.equal(r.profile.balance,5.75);
assert.equal((await api('v2/profile',{},sellerC)).profile.balanceCents,525);
for(const price of ['0.01','100','150','2000'])await api('v2/sell',{symbol:'sword',price},sellerC);
await assert.rejects(()=>api('v2/sell',{symbol:'sword',price:'1.001'},sellerC),/Цена/);
for(let i=0;i<205;i++)sql.prepare("INSERT INTO listings(id,seller,symbol,price,status,created) VALUES(?,?,?,?,'open',?)").run('old-cent-'+i,sellerC.id,'circle',20,now+i);
let offset=0,all=[];do{const page=await api('v2/market',{symbol:'circle',offset},buyerC);all.push(...page.listings);offset=page.nextOffset;}while(offset!==null);
assert.equal(all.length,205);assert.equal(new Set(all.map(l=>l.id)).size,205);assert.equal(all[0].priceCents,2000);
console.log('PASS exact cents, comma input, free seller prices, legacy listing migration, and all 205 offers reachable.');
const bulk=await user('Оптовик');await seedSymbols(bulk);r=await api('v2/sell',{symbol:'sword',price:'4.25',quantity:49},bulk);assert.equal(r.profile.inventory.sword,1);const offers=(await api('v2/market',{symbol:'sword'},bulk)).listings.filter(l=>l.seller===bulk.id);assert.equal(offers.length,49);assert.ok(offers.every(l=>l.priceCents===425));assert.equal(new Set(offers.map(l=>l.id)).size,49);await assert.rejects(()=>api('v2/sell',{symbol:'sword',price:1,quantity:2},bulk),/количество/);assert.equal((await api('v2/profile',{},bulk)).profile.inventory.sword,1);console.log('PASS bulk sale: 49 separate offers from 50 copies, one retained, overselling rejected.');
