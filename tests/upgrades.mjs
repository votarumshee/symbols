import assert from 'node:assert/strict';import fs from 'node:fs';import {DatabaseSync} from 'node:sqlite';import worker from '../dist/server/index.js';import {freshProgress,PRICES} from '../dist/economy.mjs';import {createGame,shot} from '../dist/engine.mjs';import {startArena,arenaAction} from '../server/arena-engine.mjs';import {levelInfo,trialResult} from '../dist/progression.mjs';
const sql=new DatabaseSync(':memory:');for(const f of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(fs.readFileSync('drizzle/'+f,'utf8'));
class Query{constructor(s){this.s=s;this.args=[];}bind(...args){this.args=args;return this;}async first(){return sql.prepare(this.s).get(...this.args)??null;}async all(){return {results:sql.prepare(this.s).all(...this.args)};}async run(){return {meta:sql.prepare(this.s).run(...this.args)};}}
const DB={prepare:s=>new Query(s),batch:async qs=>{sql.exec('BEGIN');try{const r=[];for(const q of qs)r.push(await q.run());sql.exec('COMMIT');return r;}catch(e){sql.exec('ROLLBACK');throw e;}}};
let now=Date.now();Date.now=()=>now;
async function api(route,body={},user=null){const res=await worker.fetch(new Request('https://game.test/api/'+route,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://game.test',...(user?{Authorization:'Bearer '+user.token}:{})},body:JSON.stringify(body)}),{DB});const d=await res.json();if(!res.ok)throw Error(d.error);return d;}
async function user(n){const p=freshProgress();p.human.unlocked.push('circle');const u=await api('register',{nick:'Тест '+n,progress:p});sql.prepare('UPDATE profiles SET data=? WHERE id=?').run(JSON.stringify(p),u.id);await api('v2/profile',{},u);return u;}




const a=await user('Улучшения');let d=JSON.parse(sql.prepare('SELECT data FROM vaults WHERE profile_id=?').get(a.id).data);d.balanceCents=200000000;d.inventory.sword=1;sql.prepare('UPDATE vaults SET data=? WHERE profile_id=?').run(JSON.stringify(d),a.id);
let r=await api('v2/upgrade',{symbol:'king',level:0},a);assert.equal(r.profile.balanceCents,199995000);assert.equal(r.profile.upgrades.king,1);
await assert.rejects(()=>api('v2/upgrade',{symbol:'king',level:0},a),/изменилось/);
r=await api('v2/upgrade',{symbol:'sword',level:0},a);assert.equal(r.profile.upgrades.sword,1);
await assert.rejects(()=>api('v2/upgrade',{symbol:'arrow',level:0},a),/лимита/);
await assert.rejects(()=>api('v2/buy-skin',{symbol:'inspect',skin:'storm'},a),/получи/);
r=await api('v2/buy-skin',{symbol:'king',skin:'storm'},a);assert.equal(r.profile.skins.king,'storm');
const {upgradePrices}=await import('../dist/upgrades.mjs');assert.equal(upgradePrices('king').at(-1),500000);assert.equal(upgradePrices('sword').at(-1),100000);
const s={size:[10,14],players:[{id:'a',inventory:{sword:1},upgrades:{king:1,sword:1}},{id:'b',bot:true,inventory:{}}]};startArena(s,now);assert.equal(s.g.kingHp[0],110);assert.equal(s.g.playerStocks[0].sword,4);arenaAction(s,{type:'king',index:56},0,now);arenaAction(s,{type:'king',index:56},1,now);const {grantKingHealth}=await import('../dist/engine.mjs');grantKingHealth(s.g);assert.equal(s.g.kingHp[0],110);s.g.boards[0][42]={type:'point',dir:4};grantKingHealth(s.g);assert.equal(s.g.kingHp[0],120);s.g.boards[0][42]=null;grantKingHealth(s.g);assert.equal(s.g.kingHp[0],110);
console.log('PASS upgrade debit, stale replay rejected, ownership, king skins, price caps, match stocks and health with boosters.');
