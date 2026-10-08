import assert from 'node:assert/strict';import fs from 'node:fs';import {DatabaseSync} from 'node:sqlite';import worker from '../dist/server/index.js';import {freshProgress,PRICES} from '../dist/economy.mjs';import {createGame,shot} from '../dist/engine.mjs';import {startArena,arenaAction} from '../legacy/arena-engine.mjs';import {levelInfo,trialResult} from '../dist/progression.mjs';
const sql=new DatabaseSync(':memory:');for(const f of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(fs.readFileSync('drizzle/'+f,'utf8'));
class Query{constructor(s){this.s=s;this.args=[];}bind(...args){this.args=args;return this;}async first(){return sql.prepare(this.s).get(...this.args)??null;}async all(){return {results:sql.prepare(this.s).all(...this.args)};}async run(){return {meta:sql.prepare(this.s).run(...this.args)};}}
const DB={prepare:s=>new Query(s),batch:async qs=>{sql.exec('BEGIN');try{const r=[];for(const q of qs)r.push(await q.run());sql.exec('COMMIT');return r;}catch(e){sql.exec('ROLLBACK');throw e;}}};
let now=Date.now();Date.now=()=>now;
async function api(route,body={},user=null){const res=await worker.fetch(new Request('https://game.test/api/'+route,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://game.test',...(user?{Authorization:'Bearer '+user.token}:{})},body:JSON.stringify(body)}),{DB});const d=await res.json();if(!res.ok)throw Error(d.error);return d;}
async function user(n){const p=freshProgress();p.human.unlocked.push('circle');const u=await api('register',{nick:'Тест '+n,progress:p});sql.prepare('UPDATE profiles SET data=? WHERE id=?').run(JSON.stringify(p),u.id);await api('v2/profile',{},u);return u;}

const a=await user('Аватар');
for(const code of ['U50B34','M4FX','M4FX5267'])await assert.rejects(()=>api('v2/promo',{code},a),/не действует/);
let r=await api('v2/promo',{code:'Boss 4229'},a);assert.equal(r.profile.balanceCents,5100);await assert.rejects(()=>api('v2/promo',{code:'BOSS4229'},a),/использован/);
for(const name of ['lion','fox','wolf','cat','panda','dragon','robot','alien','eagle','owl']){r=await api('v2/avatar',{avatar:name},a);assert.equal(r.profile.avatar,name);}
await assert.rejects(()=>api('v2/avatar',{avatar:'https://evil.invalid/a.jpg'},a),/аватарку/);
await assert.rejects(()=>api('v2/avatar',{avatar:'/avatars/'+a.id+'/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg',avatarStored:true},a),/аватарку/);
await api('v2/nickname',{nick:'Победитель'},a);r=await api('v2/start',{mode:'trial',small:true},a);assert.equal(r.game.players[0].avatar,'owl');assert.equal(r.game.players[0].nick,'Победитель');
await assert.rejects(()=>api('v2/instant',{},a),/недоступна/);
const objects=new Map();const AVATARS={put:async(k,v)=>objects.set(k,v),get:async k=>objects.has(k)?{body:objects.get(k)}:null,delete:async k=>objects.delete(k)};
const upload=await worker.fetch(new Request('https://game.test/api/avatar-upload',{method:'POST',headers:{Authorization:'Bearer '+a.token,'Content-Type':'application/json'},body:JSON.stringify({image:'data:image/jpeg;base64,/9j/2Q=='})}),{DB,AVATARS});assert.equal(upload.status,200);const data=await upload.json();assert.match(data.profile.avatar,new RegExp('^/avatars/'+a.id+'/'));assert.equal((await api('v2/profile',{},a)).profile.avatar,data.profile.avatar);const img=await worker.fetch(new Request('https://game.test'+data.profile.avatar),{DB,AVATARS});assert.equal(img.status,200);assert.equal(img.headers.get('Content-Type'),'image/jpeg');
console.log('PASS promo removals, 50 bucks once, 10 avatars, saved upload, public image, match identity and instant rejection.');

// Previously redeemed unlimited code remains valid; new redemption stays blocked.
let old=JSON.parse(sql.prepare('SELECT data FROM vaults WHERE profile_id=?').get(a.id).data);old.claims.push('M4FX5267');sql.prepare('UPDATE vaults SET data=? WHERE profile_id=?').run(JSON.stringify(old),a.id);
r=await api('v2/instant',{},a);assert.equal(r.profile.xp,1000);assert.equal(r.game.results[a.id].xp,1000);assert.equal(r.profile.balanceCents,5100);
r=await api('v2/instant',{},a);assert.equal(r.profile.xp,1000);
const opponent=await user('Соперник');await api('v2/start',{mode:'duel',small:true},a);r=await api('v2/start',{mode:'duel',small:true},opponent);
r=await api('v2/instant',{revision:r.revision},a);assert.equal(r.profile.xp,2000);assert.equal(r.game.results[a.id].won,true);assert.equal(r.game.results[opponent.id].won,false);assert.equal(r.game.results[opponent.id].xp,0);
assert.equal((await api('v2/poll',{},opponent)).game.status,'done');assert.equal((await api('v2/poll',{},a)).profile.xp,2000);
await assert.rejects(()=>api('v2/promo',{code:'M4FX5267'},a),/не действует/);
console.log('PASS grandfathered infinite win awards 1000 exactly once against bots and humans; promo remains disabled.');
