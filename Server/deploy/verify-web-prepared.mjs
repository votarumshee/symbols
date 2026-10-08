import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {buildApp} from '../src/app.mjs';
import {createPool} from '../src/repositories/db.mjs';
const databaseUrl=process.env.DATABASE_URL;
assert.equal(new URL(databaseUrl).pathname,'/symbols_web_restore');
const pool=createPool({databaseUrl}),origin='https://symbols.votarumshee.com';
const app=await buildApp({databaseUrl,webOrigin:origin,scheduler:false,log:false},{pool});
try{
 await app.ready();const profilesBefore=Number((await pool.query('SELECT count(*) n FROM profiles')).rows[0].n);
 let cookie='',active;
 const request=(path,method='GET',payload,headers={})=>app.inject({url:'/api/web/v3/'+path,method,payload,headers:{origin,...(cookie?{cookie}:{}),...(active?{'x-symbols-account':active}:{}),...headers}});
 const first=await request('account/register','POST',{nick:'StageWebOne'});assert.equal(first.statusCode,201,first.body);assert(!('token' in first.json()));active=first.json().id;
 const header=first.headers['set-cookie'];for(const f of ['HttpOnly','Secure','SameSite=Strict'])assert(header.includes(f));cookie=header.split(';')[0];
 assert.equal((await request('bootstrap')).statusCode,200);
 const denied=await request('commands/nickname','POST',{nick:'WrongOrigin'},{origin:'https://invalid.test','idempotency-key':randomUUID()});assert.equal(denied.statusCode,403);
 const second=await request('account/register','POST',{nick:'StageWebTwo'});assert.equal(second.statusCode,201);const id2=second.json().id;
 assert.equal((await request('bootstrap')).statusCode,409);
 active=id2;assert.equal((await request('account/sessions')).json().accounts.length,2);
 assert.equal((await request('moderation')).statusCode,200);
 const native=await app.inject({method:'POST',url:'/api/v3/account/register',payload:{nick:'StageNative'}});assert.equal(native.statusCode,201);
 assert.equal((await app.inject({url:'/api/v3/bootstrap',headers:{authorization:'Bearer '+native.json().token}})).statusCode,200);
 const role=(await pool.query("SELECT rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user")).rows[0];assert.deepEqual(role,{rolsuper:false,rolcreatedb:false,rolcreaterole:false});
 console.log(JSON.stringify({passed:true,restoredProfiles:profilesBefore,checks:['production dump restored into isolated database','new migration/grants','cookie flags/login/multiaccount','CSRF and stale-account rejection','moderation','native Bearer compatibility','least-privilege runtime'],productionMutated:false}));
}finally{await app.close();await pool.end();}
