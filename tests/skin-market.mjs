import assert from 'node:assert/strict';import fs from 'node:fs';import {DatabaseSync} from 'node:sqlite';import worker from '../dist/server/index.js';import {freshProgress,PRICES} from '../dist/economy.mjs';import {createGame,shot} from '../dist/engine.mjs';import {startArena,arenaAction} from '../server/arena-engine.mjs';import {levelInfo,trialResult} from '../dist/progression.mjs';
const sql=new DatabaseSync(':memory:');for(const f of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(fs.readFileSync('drizzle/'+f,'utf8'));
class Query{constructor(s){this.s=s;this.args=[];}bind(...args){this.args=args;return this;}async first(){return sql.prepare(this.s).get(...this.args)??null;}async all(){return {results:sql.prepare(this.s).all(...this.args)};}async run(){return {meta:sql.prepare(this.s).run(...this.args)};}}
const DB={prepare:s=>new Query(s),batch:async qs=>{sql.exec('BEGIN');try{const r=[];for(const q of qs)r.push(await q.run());sql.exec('COMMIT');return r;}catch(e){sql.exec('ROLLBACK');throw e;}}};
let now=Date.now();Date.now=()=>now;
async function api(route,body={},user=null){const res=await worker.fetch(new Request('https://game.test/api/'+route,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://game.test',...(user?{Authorization:'Bearer '+user.token}:{})},body:JSON.stringify(body)}),{DB});const d=await res.json();if(!res.ok)throw Error(d.error);return d;}
async function user(n){const p=freshProgress();p.human.unlocked.push('circle');const u=await api('register',{nick:'Тест '+n,progress:p});sql.prepare('UPDATE profiles SET data=? WHERE id=?').run(JSON.stringify(p),u.id);await api('v2/profile',{},u);return u;}





async function fund(u,money,inventory={sword:5}){let d=(await api('v2/profile',{},u)).profile;d.balanceCents=money;d.inventory={...d.inventory,...inventory};sql.prepare('UPDATE vaults SET data=? WHERE profile_id=?').run(JSON.stringify(d),u.id);}
const a=await user('Продавец'),b=await user('Покупатель');await fund(a,2000000);await fund(b,2000000);
await api('v2/buy-skin',{symbol:'sword',skin:'storm'},a);
await assert.rejects(()=>api('v2/sell',{symbol:'sword',price:'10',quantity:2,skin:'storm'},a),/один экземпляр/);
await api('v2/sell',{symbol:'sword',price:'10',quantity:1,skin:'storm'},a);
let p=(await api('v2/profile',{},a)).profile;assert.ok(!p.ownedSkins.sword.includes('storm'));assert.equal(p.skins.sword,'classic');
let list=(await api('v2/market',{symbol:'sword'},b)).listings;assert.equal(list[0].priceCents,91000);assert.equal(list[0].skin,'storm');
await assert.rejects(()=>api('v2/sell',{symbol:'sword',price:'10',skin:'storm'},a),/не принадлежит/);
await assert.rejects(()=>api('v2/cancel',{id:list[0].id},b),/не твоё/);
await api('v2/cancel',{id:list[0].id},a);assert.ok((await api('v2/profile',{},a)).profile.ownedSkins.sword.includes('storm'));
await api('v2/sell',{symbol:'sword',price:'10',skin:'storm'},a);list=(await api('v2/market',{symbol:'sword'},b)).listings;
const sellerBefore=(await api('v2/profile',{},a)).profile.balanceCents;
const bought=await api('v2/buy',{id:list[0].id},b);assert.equal(bought.profile.balanceCents,1909000);assert.ok(bought.profile.ownedSkins.sword.includes('storm'));assert.equal(bought.profile.skins.sword,'storm');assert.equal((await api('v2/profile',{},a)).profile.balanceCents,sellerBefore+91000);
await assert.rejects(()=>api('v2/buy',{id:list[0].id},b),/недоступно/);
await api('v2/sell',{symbol:'sword',price:'2',quantity:2},b);assert.ok((await api('v2/profile',{},b)).profile.ownedSkins.sword.includes('storm'));list=(await api('v2/market',{symbol:'sword'},a)).listings;assert.ok(list.every(l=>!l.skin&&l.priceCents===200));
const c=await user('Максимум');await fund(c,36000);
let r=await api('v2/upgrade',{symbol:'king',level:0,max:true},c);assert.equal(r.profile.upgrades.king,3);assert.equal(r.profile.balanceCents,1000);await assert.rejects(()=>api('v2/upgrade',{symbol:'king',level:3,max:true},c),/Не хватает/);
await fund(c,200000000);r=await api('v2/upgrade',{symbol:'sword',level:0,max:true},c);const {upgradePrices}=await import('../dist/upgrades.mjs');assert.equal(r.profile.upgrades.sword,upgradePrices('sword').length);assert.equal(r.profile.balanceCents,200000000-upgradePrices('sword').reduce((a,b)=>a+b*100,0));await assert.rejects(()=>api('v2/upgrade',{symbol:'sword',level:r.profile.upgrades.sword,max:true},c),/Максимальное/);
console.log('PASS skin escrow/cancel/transfer, exact 90% surcharge, ordinary sales retain skins, replay protection, affordable max upgrades and cap.');
