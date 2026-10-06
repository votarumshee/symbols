import assert from 'node:assert/strict';import fs from 'node:fs';import {DatabaseSync} from 'node:sqlite';import worker from '../dist/server/index.js';import {freshProgress,PRICES} from '../dist/economy.mjs';import {createGame,shot} from '../dist/engine.mjs';import {startArena,arenaAction} from '../server/arena-engine.mjs';import {levelInfo,trialResult} from '../dist/progression.mjs';
const sql=new DatabaseSync(':memory:');for(const f of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(fs.readFileSync('drizzle/'+f,'utf8'));
class Query{constructor(s){this.s=s;this.args=[];}bind(...args){this.args=args;return this;}async first(){return sql.prepare(this.s).get(...this.args)??null;}async all(){return {results:sql.prepare(this.s).all(...this.args)};}async run(){return {meta:sql.prepare(this.s).run(...this.args)};}}
const DB={prepare:s=>new Query(s),batch:async qs=>{sql.exec('BEGIN');try{const r=[];for(const q of qs)r.push(await q.run());sql.exec('COMMIT');return r;}catch(e){sql.exec('ROLLBACK');throw e;}}};
let now=Date.now();Date.now=()=>now;
async function api(route,body={},user=null){const res=await worker.fetch(new Request('https://game.test/api/'+route,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://game.test',...(user?{Authorization:'Bearer '+user.token}:{})},body:JSON.stringify(body)}),{DB});const d=await res.json();if(!res.ok)throw Error(d.error);return d;}
async function user(n){const p=freshProgress();p.human.unlocked.push('circle');const u=await api('register',{nick:'Тест '+n,progress:p});sql.prepare('UPDATE profiles SET data=? WHERE id=?').run(JSON.stringify(p),u.id);await api('v2/profile',{},u);return u;}



const a=await user('Огонь');
await assert.rejects(()=>api('v2/avatar',{avatar:'firec'},a),/недоступна/);
await assert.rejects(()=>api('v2/buy-avatar',{avatar:'firec'},a),/Не хватает/);
let d=JSON.parse(sql.prepare('SELECT data FROM vaults WHERE profile_id=?').get(a.id).data);d.balanceCents=200000;d.balance=2000;sql.prepare('UPDATE vaults SET data=? WHERE profile_id=?').run(JSON.stringify(d),a.id);
const before=(await api('v2/profile',{},a)).profile;
for(const code of ['BOSS4229','10000B','1000000RE','2X','X2','U50B34'])await assert.rejects(()=>api('v2/promo',{code},a),/не действует/);
let r=await api('v2/buy-avatar',{avatar:'firec'},a);assert.equal(r.profile.balanceCents,100000);assert.equal(r.profile.inventory.inspect,before.inventory.inspect+1);assert.equal(r.profile.avatar,'firec');
r=await api('v2/buy-avatar',{avatar:'firec'},a);assert.equal(r.profile.balanceCents,100000);assert.equal(r.profile.inventory.inspect,before.inventory.inspect+1);
await api('v2/avatar',{avatar:'lion'},a);r=await api('v2/avatar',{avatar:'firec'},a);assert.equal(r.profile.avatar,'firec');
console.log('PASS all promos disabled, avatar ownership enforced, 1000 rubies and exactly one inspect, replay-safe bundle and re-equip.');
