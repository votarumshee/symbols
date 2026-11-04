import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createPool,one} from '../src/repositories/db.mjs';
import {migrate} from '../scripts/migrate.mjs';
import {seed} from '../scripts/seed.mjs';
import {buildApp} from '../src/app.mjs';
import {register,authenticate} from '../src/services/accounts.mjs';
import {command} from '../src/services/commands.mjs';
import {snapshot} from '../src/services/sync.mjs';
import {wishesPage} from '../src/services/wishes.mjs';
import {step} from '../src/jobs/scheduler.mjs';
import {PRICES} from '../src/domain/economy.mjs';

const databaseUrl=process.env.TEST_DATABASE_URL;
test('player wishes, promo and beginner matchmaking in PostgreSQL',{skip:!databaseUrl,timeout:90000},async t=>{
 assert.ok(['localhost','127.0.0.1'].includes(new URL(databaseUrl).hostname));
 const admin=createPool({databaseUrl}),name='symbols_wishes_'+randomUUID().replaceAll('-',''),url=new URL(databaseUrl);url.pathname='/'+name;
 await admin.query('CREATE DATABASE '+name);const pool=createPool({databaseUrl:url.href});let app;
 const user=async nick=>{const s=await register(pool,nick);return {...s,...await authenticate(pool,s.token)};};
 const run=(u,k,b={},key=randomUUID(),now)=>command(pool,u,k,b,key,now);
 try{
  await migrate(url.href);await seed(pool);app=await buildApp({webOrigin:'https://symbols.example.test',log:false,scheduler:false},{pool});
  await t.test('promo race, replay and state restoration grant exactly 25 per consumable',async()=>{
   const u=await user('Промокод'),keys=[randomUUID(),randomUUID()];
   const outcomes=await Promise.allSettled(keys.map(key=>run(u,'promo',{code:'10'},key)));
   assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
   assert.equal((await run(u,'promo',{code:'10'},keys[outcomes.findIndex(r=>r.status==='fulfilled')])).quantity,25);
   const s=await snapshot(pool,u.id);for(const symbol of Object.keys(PRICES))assert.equal(s.profile.inventory[symbol],25);
   assert.equal(s.profile.balanceCents,'100');assert.equal(s.profile.xp,0);
   assert.deepEqual((await one(pool,'SELECT data FROM vaults WHERE profile_id=$1',[u.id])).data.claims,['promo:10']);
  });
  await t.test('shared feed, desired-state like races, sorting, blocks and account deletion',async()=>{
   const a=await user('Автор'),b=await user('Читатель');const key=randomUUID(),idea=await run(a,'wish',{text:'Добавьте символ ★'},key);
   assert.deepEqual(await run(a,'wish',{text:'Добавьте символ ★'},key),idea);
   await run(a,'wish',{text:'Вторая идея'});
   await Promise.all([run(b,'wish-like',{id:idea.wishId,liked:true}),run(b,'wish-like',{id:idea.wishId,liked:true})]);
   let feed=await wishesPage(pool,b.id,{});assert.equal(feed.wishes[0].id,idea.wishId);assert.equal(feed.wishes[0].likes,1);assert.equal(feed.wishes[0].liked,true);
   assert.notEqual((await wishesPage(pool,b.id,{sort:'new'})).wishes[0].id,idea.wishId);
   await run(b,'wish-like',{id:idea.wishId,liked:false});await run(b,'wish-like',{id:idea.wishId,liked:false});
   assert.equal((await one(pool,'SELECT count(*) n FROM wish_likes WHERE wish_id=$1',[idea.wishId])).n,'0');
   await run(b,'block',{target:a.id});assert.equal((await wishesPage(pool,b.id,{})).wishes.length,0);
   await assert.rejects(run(b,'wish-like',{id:idea.wishId,liked:true}));await run(b,'unblock',{target:a.id});
   await run(b,'wish-like',{id:idea.wishId,liked:true});await run(a,'delete-account',{confirm:true});
   assert.equal((await wishesPage(pool,b.id,{})).wishes.length,0);assert.equal((await one(pool,'SELECT count(*) n FROM wish_likes')).n,'0');
  });
  await t.test('pagination and submission limit; invalid native/browser writes rejected',async()=>{
   const u=await user('Лента');for(let i=0;i<31;i++)await pool.query('INSERT INTO wishes(id,owner,body) VALUES($1,$2,$3)',[randomUUID(),u.id,'Идея '+i]);
   const a=await wishesPage(pool,u.id,{}),b=await wishesPage(pool,u.id,{offset:a.nextOffset});assert.equal(a.wishes.length,30);assert.equal(b.wishes.length,1);assert.equal(b.nextOffset,null);
   const key=randomUUID();await assert.rejects(run(u,'wish',{text:'Лимит'},key),e=>e.code==='WISH_LIMIT');
   assert.equal(await one(pool,'SELECT 1 FROM commands WHERE owner=$1 AND key=$2',[u.id,key]),null);
   const headers={authorization:'Bearer '+u.token,'idempotency-key':randomUUID()};
   assert.equal((await app.inject({url:'/api/v3/wishes'})).statusCode,401);
   assert.equal((await app.inject({url:'/api/v3/wishes?sort=bad',headers})).statusCode,400);
   assert.equal((await app.inject({method:'POST',url:'/api/v3/commands/wish',headers,payload:{text:'x'}})).statusCode,400);
   const registration=await app.inject({method:'POST',url:'/api/web/v3/account/register',headers:{origin:'https://symbols.example.test'},payload:{nick:'Браузер'}});
   const cookie=registration.headers['set-cookie'].split(';')[0],browserHeaders={cookie,origin:'https://symbols.example.test','x-symbols-account':registration.json().id,'idempotency-key':randomUUID()};
   assert.equal((await app.inject({method:'POST',url:'/api/web/v3/commands/wish',headers:{...browserHeaders,origin:'https://evil.test'},payload:{text:'Запрещено'}})).statusCode,403);
   assert.equal((await app.inject({method:'POST',url:'/api/web/v3/commands/wish',headers:browserHeaders,payload:{text:'Идея из браузера'}})).statusCode,200);
   assert.equal((await app.inject({url:'/api/web/v3/wishes',headers:browserHeaders})).statusCode,200);
  });
  await t.test('humans match by experience before 10s; beginner bot fills only after deadline',async()=>{
   const a=await user('Новичок А'),b=await user('Новичок Б'),expert=await user('Опытный'),now=Date.now();
   await pool.query("UPDATE vaults SET data=jsonb_set(data,'{xp}','2000') WHERE profile_id=$1",[expert.id]);
   await run(expert,'start',{mode:'duel',small:true},randomUUID(),now);
   const match=await run(a,'start',{mode:'duel',small:true},randomUUID(),now);
   await run(b,'start',{mode:'duel',small:true},randomUUID(),now+9999);
   const s=await snapshot(pool,a.id);assert.equal(s.match.id,match.matchId);assert.equal(s.match.status,'setup');assert.ok(s.match.players.every(p=>!p.bot));
   assert.notEqual((await snapshot(pool,expert.id)).match.id,match.matchId);
   const u=await user('Первый вход');const start=await run(u,'start',{mode:'play',small:true},randomUUID(),now);
   await step(pool,now+9999);assert.equal((await snapshot(pool,u.id)).match.status,'waiting');
   for(let i=0;i<3&&(await snapshot(pool,u.id)).match.status==='waiting';i++)await step(pool,now+10000);
   const after=await snapshot(pool,u.id);assert.equal(after.match.id,start.matchId);assert.equal(after.match.status,'setup');assert.equal(after.match.level,0);assert.equal(after.match.players[1].bot,true);
  });
 }finally{if(app)await app.close();await pool.end();await admin.query('DROP DATABASE '+name+' WITH (FORCE)');await admin.end();}
});
