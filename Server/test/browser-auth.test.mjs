import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createPool,one} from '../src/repositories/db.mjs';
import {migrate} from '../scripts/migrate.mjs';
import {seed} from '../scripts/seed.mjs';
import {buildApp} from '../src/app.mjs';
import {hash} from '../src/services/accounts.mjs';
import {config} from '../src/config/env.mjs';
import {maintain} from '../src/jobs/scheduler.mjs';

test('WEB_ORIGIN accepts only exact secure or local origins',()=>{
 for(const webOrigin of ['https://symbols.votarumshee.com','http://127.0.0.1:8790','http://localhost:8790'])assert.equal(config({DATABASE_URL:'unused',WEB_ORIGIN:webOrigin}).webOrigin,webOrigin);
 for(const value of ['http://example.com','https://symbols.votarumshee.com/','https://evil@example.com','null','https://example.com/path'])assert.throws(()=>config({DATABASE_URL:'unused',WEB_ORIGIN:value}));
});
const databaseUrl=process.env.TEST_DATABASE_URL;
test('browser cookie auth and native compatibility',{skip:!databaseUrl,timeout:90000},async t=>{
 const admin=createPool({databaseUrl}),name='symbols_browser_'+randomUUID().replaceAll('-','');await admin.query('CREATE DATABASE '+name);
 const url=new URL(databaseUrl);url.pathname='/'+name;
 const cfg={databaseUrl:url.href,poolMax:10,log:false,scheduler:false,webOrigin:'https://symbols.example.test'};
 const pool=createPool(cfg);let app,cookie,id;
 const request=(route,{method='GET',body,headers={},...opts}={})=>app.inject({method,url:'/api/web/v3/'+route,headers:Object.fromEntries(Object.entries({...(cookie?{cookie}:{}),...(id?{'x-symbols-account':id}:{}),...(method==='POST'?{origin:cfg.webOrigin,'idempotency-key':randomUUID()}:{}),...headers}).filter(([,v])=>v!==undefined)),...(body!==undefined?{payload:body}:{}),...opts});
 function noToken(response){assert.ok(!/"(?:token|token_hash|authorization)"\s*:/i.test(response.body));}
 try{
  await migrate(url.href);await seed(pool);app=await buildApp(cfg,{pool});await app.listen({host:'127.0.0.1',port:0});
  await t.test('anonymous sessions are empty, cookie-free; unsafe origins cannot register',async()=>{
   let r=await request('account/sessions');assert.deepEqual(r.json(),{accounts:[],activeId:null});assert.equal(r.headers['set-cookie'],undefined);
   for(const origin of [undefined,'null','https://attacker.test','https://symbols.example.test.attacker.test']){r=await request('account/register',{method:'POST',body:{nick:'Denied'},headers:{origin}});assert.equal(r.statusCode,403);}
   r=await request('account/register',{method:'POST',body:{nick:'Denied'},headers:{'sec-fetch-site':'cross-site'}});assert.equal(r.statusCode,403);
   assert.equal((await one(pool,'SELECT count(*) n FROM profiles')).n,'0');
  });
  await t.test('registration returns no Bearer; persistent cookie is secure and opaque',async()=>{
   const r=await request('account/register',{method:'POST',body:{nick:'Browser A'}});assert.equal(r.statusCode,201,r.body);noToken(r);id=r.json().id;
   const sc=r.headers['set-cookie'];for(const flag of ['HttpOnly','Secure','SameSite=Strict','Path=/','Max-Age=2592000'])assert.ok(sc.includes(flag),flag);assert.ok(!sc.includes('Domain='));cookie=sc.split(';')[0];
   const secret=cookie.split('=')[1];assert.match(secret,/^[a-f0-9]{64}$/);assert.ok(await one(pool,'SELECT 1 FROM browser_sessions WHERE id_hash=$1',[hash(secret)]));assert.equal(await one(pool,'SELECT 1 FROM account_sessions WHERE token_hash=$1',[hash(secret)]),null);
   const s=await request('bootstrap');assert.equal(s.statusCode,200,s.body);assert.equal(s.json().profile.nick,'Browser A');noToken(s);assert.equal(s.headers['cache-control'],'no-store');
   assert.equal((await app.inject({url:'/api/v3/bootstrap',headers:{cookie}})).statusCode,401);
   assert.equal((await app.inject({url:'/api/v3/bootstrap',headers:{authorization:'Bearer '+secret}})).statusCode,401);
  });
  await t.test('cookie persists across server restart and separate cookie-only context',async()=>{
   await app.close();app=await buildApp(cfg,{pool});await app.listen({host:'127.0.0.1',port:0});
   const r=await app.inject({url:'/api/web/v3/account/sessions',headers:{cookie}});assert.deepEqual(r.json(),{accounts:[{id,nick:'Browser A'}],activeId:id});noToken(r);
   assert.equal((await app.inject({url:'/api/web/v3/bootstrap',headers:{cookie,'x-symbols-account':id}})).statusCode,200);
  });
  let a,b;
  await t.test('multi-account new/switch persists; queued wrong-account commands rejected',async()=>{
   a=id;assert.equal((await request('account/new',{method:'POST',body:{}})).statusCode,200);assert.equal((await request('account/sessions')).json().activeId,null);
   assert.equal((await request('bootstrap')).statusCode,401);
   let r=await request('account/register',{method:'POST',body:{nick:'Browser B'}});assert.equal(r.statusCode,201,r.body);noToken(r);b=r.json().id;
   assert.equal(r.headers['set-cookie'],undefined);r=await request('account/sessions');assert.equal(r.json().accounts.length,2);assert.equal(r.json().activeId,b);
   assert.equal((await request('commands/nickname',{method:'POST',body:{nick:'Wrong account'}})).statusCode,409);
   id=b;assert.equal((await request('bootstrap')).json().profile.nick,'Browser B');
   assert.equal((await request('account/switch',{method:'POST',body:{id:a}})).statusCode,200);id=a;
   assert.equal((await request('bootstrap')).json().profile.nick,'Browser A');
   assert.equal((await request('account/switch',{method:'POST',body:{id:randomUUID()}})).statusCode,401);
  });
  await t.test('all authenticated mutations reject CSRF and preserve profile',async()=>{
   for(const origin of [undefined,'https://attacker.test']){const r=await request('commands/nickname',{method:'POST',body:{nick:'CSRF'},headers:{origin}});assert.equal(r.statusCode,403);}
   assert.equal((await request('account/switch',{method:'POST',body:{id:b},headers:{origin:'https://attacker.test'}})).statusCode,403);
   assert.equal((await request('bootstrap')).json().profile.nick,'Browser A');
  });
  await t.test('browser error contract preserves codes, Retry-After and security headers',async()=>{
   let r=await request('bootstrap',{headers:{'x-symbols-account':b}});assert.equal(r.statusCode,409);assert.equal(r.json().error.code,'ACCOUNT_CHANGED');assert.equal(r.headers['x-content-type-options'],'nosniff');
   r=await request('changes?cursor=999999');assert.equal(r.statusCode,409);assert.equal(r.json().error.code,'SNAPSHOT_REQUIRED');
   const key=hash('commands:'+a);await pool.query("INSERT INTO recovery_limits(key,count,expires) VALUES($1,120,now()+interval '1 minute') ON CONFLICT(key) DO UPDATE SET count=120,expires=excluded.expires",[key]);
   r=await request('commands/nickname',{method:'POST',body:{nick:'Throttled'}});assert.equal(r.statusCode,429);assert.equal(r.json().error.code,'RATE_LIMIT');assert.ok(Number(r.headers['retry-after'])>0);await pool.query('DELETE FROM recovery_limits WHERE key=$1',[key]);
  });
  await t.test('moderation lists are private and survive switching, report/unblock mutate DB',async()=>{
   assert.equal((await request('commands/block',{method:'POST',body:{target:b}})).statusCode,200);
   let r=await request('moderation');assert.deepEqual(r.json(),{blocked:[{id:b,nick:'Browser B'}]});noToken(r);
   r=await request('commands/report',{method:'POST',body:{target:b,reason:'Synthetic test report'}});assert.equal(r.statusCode,200);assert.ok(await one(pool,'SELECT 1 FROM reports WHERE id=$1 AND owner=$2 AND target=$3',[r.json().reportId,a,b]));
   await request('account/switch',{method:'POST',body:{id:b}});id=b;assert.deepEqual((await request('moderation')).json(),{blocked:[]});
   await request('account/switch',{method:'POST',body:{id:a}});id=a;assert.equal((await request('moderation')).json().blocked.length,1);
   assert.equal((await request('commands/unblock',{method:'POST',body:{target:b}})).statusCode,200);assert.deepEqual((await request('moderation')).json(),{blocked:[]});assert.equal(await one(pool,'SELECT 1 FROM blocks WHERE owner=$1 AND target=$2',[a,b]),null);
  });
  await t.test('public pages and deletion script are available without Bearer in web code',async()=>{
   for(const page of ['privacy','support','account-deletion']){let r=await app.inject({url:'/'+page,headers:{host:'symbols.example.test'}});assert.equal(r.statusCode,200,r.body);assert.match(r.headers['content-type'],/html/);r=await app.inject({url:'/'+page,headers:{host:'api.example.test'}});assert.equal(r.statusCode,302);assert.equal(r.headers.location,cfg.webOrigin+'/'+page);}
   const js=await app.inject('/account-deletion.mjs');assert.equal(js.statusCode,200);assert.ok(js.body.includes('/api/web/v3/'));assert.ok(!js.body.includes('Bearer'));assert.equal((await app.inject('/policy.css')).statusCode,200);
  });
  await t.test('logout revokes selected session and preserves other account',async()=>{
   let r=await request('commands/logout',{method:'POST',body:{}});assert.equal(r.statusCode,200,r.body);assert.equal(r.json().loggedOut,true);assert.equal((await request('bootstrap')).statusCode,401);
   r=await request('account/sessions');assert.deepEqual(r.json(),{accounts:[{id:b,nick:'Browser B'}],activeId:null});
   assert.equal((await request('account/switch',{method:'POST',body:{id:a}})).statusCode,401);
   await request('account/switch',{method:'POST',body:{id:b}});id=b;
  });
  let recoveryCode;
  await t.test('native recovery revokes browser access; browser recovery revokes native access',async()=>{
   const r=await request('commands/recovery-code',{method:'POST',body:{}});assert.equal(r.statusCode,200,r.body);recoveryCode=r.json().code;
   const n=await app.inject({method:'POST',url:'/api/v3/account/recover',payload:{code:recoveryCode}});assert.equal(n.statusCode,200,n.body);const native=n.json();assert.ok(native.token);
   assert.equal((await request('bootstrap')).statusCode,401);assert.deepEqual((await request('account/sessions')).json(),{accounts:[],activeId:null});
   assert.equal((await app.inject({url:'/api/v3/bootstrap',headers:{authorization:'Bearer '+native.token}})).statusCode,200);
   const recovered=await request('account/recover',{method:'POST',body:{code:recoveryCode}});assert.equal(recovered.statusCode,200,recovered.body);noToken(recovered);assert.equal(recovered.json().id,b);
   assert.equal((await app.inject({url:'/api/v3/bootstrap',headers:{authorization:'Bearer '+native.token}})).statusCode,401);
   assert.equal((await request('bootstrap')).statusCode,200);
  });
  await t.test('long poll terminates on revocation without leaking later events',async()=>{
   const s=(await request('bootstrap')).json();const polling=request('changes?cursor='+s.cursor);
   await new Promise(resolve=>setTimeout(resolve,50));await pool.query('UPDATE account_sessions SET revoked=now() WHERE profile_id=$1',[b]);await pool.query("SELECT pg_notify('symbols_events',$1)",[b]);
   const r=await polling;assert.equal(r.statusCode,401,r.body);noToken(r);
   await request('account/recover',{method:'POST',body:{code:recoveryCode}});
  });
  await t.test('confirmed deletion erases credentials and account; missing confirmation refused',async()=>{
   assert.equal((await request('commands/delete-account',{method:'POST',body:{}})).statusCode,400);
   const r=await request('commands/delete-account',{method:'POST',body:{confirm:true}});assert.equal(r.statusCode,200,r.body);assert.equal(r.json().deleted,true);
   assert.equal(await one(pool,'SELECT 1 FROM profiles WHERE id=$1',[b]),null);assert.equal((await request('bootstrap')).statusCode,401);assert.deepEqual((await request('account/sessions')).json(),{accounts:[],activeId:null});
   assert.equal((await request('account/recover',{method:'POST',body:{code:recoveryCode}})).statusCode,401);
  });
  await t.test('expired browser cookie cannot authorize; native register still works',async()=>{
   await pool.query('UPDATE browser_sessions SET expires=now()-interval \'1 second\'');assert.deepEqual((await request('account/sessions')).json(),{accounts:[],activeId:null});
   const r=await app.inject({method:'POST',url:'/api/v3/account/register',payload:{nick:'Native'}});assert.equal(r.statusCode,201,r.body);const n=r.json();assert.ok(n.token);assert.equal((await app.inject({url:'/api/v3/bootstrap',headers:{authorization:'Bearer '+n.token}})).statusCode,200);
  });
  await t.test('expired browser records and references are removed by maintenance',async()=>{
   await maintain(pool);assert.equal((await one(pool,'SELECT count(*) n FROM browser_sessions')).n,'0');assert.equal((await one(pool,'SELECT count(*) n FROM browser_accounts')).n,'0');cookie=null;id=null;
  });
  await t.test('account limit atomically rolls back registration and recovery revocation',async()=>{
   await pool.query('DELETE FROM recovery_limits');
   for(let i=0;i<8;i++){const r=await request('account/register',{method:'POST',body:{nick:'Slot '+i}});assert.equal(r.statusCode,201,r.body);if(r.headers['set-cookie'])cookie=r.headers['set-cookie'].split(';')[0];id=r.json().id;}
   const count=async()=>({profiles:(await one(pool,'SELECT count(*) n FROM profiles')).n,sessions:(await one(pool,'SELECT count(*) n FROM account_sessions')).n,accounts:(await one(pool,'SELECT count(*) n FROM browser_accounts')).n});
   const before=await count();let r=await request('account/register',{method:'POST',body:{nick:'Overflow'}});assert.equal(r.statusCode,409,r.body);assert.equal(r.json().error.code,'ACCOUNT_LIMIT');assert.deepEqual(await count(),before);
   const n=(await app.inject({method:'POST',url:'/api/v3/account/register',payload:{nick:'Other device'}})).json();assert.ok(n.token);
   const nativeHeaders={authorization:'Bearer '+n.token,'idempotency-key':randomUUID()};
   const code=(await app.inject({method:'POST',url:'/api/v3/commands/recovery-code',headers:nativeHeaders,payload:{}})).json().code;assert.ok(code);
   const beforeRecover=await count();r=await request('account/recover',{method:'POST',body:{code}});assert.equal(r.statusCode,409,r.body);assert.equal(r.json().error.code,'ACCOUNT_LIMIT');assert.deepEqual(await count(),beforeRecover);
   assert.equal((await app.inject({url:'/api/v3/bootstrap',headers:nativeHeaders})).statusCode,200);assert.equal((await request('account/sessions')).json().activeId,id);
   const sameCode=(await request('commands/recovery-code',{method:'POST',body:{}})).json().code;
   r=await request('account/recover',{method:'POST',body:{code:sameCode}});assert.equal(r.statusCode,200,r.body);assert.equal(r.json().id,id);assert.equal((await request('account/sessions')).json().accounts.length,8);
  });
 }finally{if(app)await app.close();await pool.end();await admin.query('DROP DATABASE '+name+' WITH (FORCE)');await admin.end();}
});
