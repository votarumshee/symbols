import {randomBytes} from 'node:crypto';
import {one,transaction} from '../repositories/db.mjs';
import {hash,registerInTransaction,recoverInTransaction,limit} from '../services/accounts.mjs';
import {command} from '../services/commands.mjs';
import {snapshot,changes} from '../services/sync.mjs';
import {marketPage} from '../services/market.mjs';
import {catalog,contentVersion} from '../domain/catalog.mjs';
import {ApiError} from '../services/errors.mjs';
import {commandSchemas,registerSchema,recoverSchema} from './schemas.mjs';
import {moderation} from '../services/moderation.mjs';

const cookieName='__Host-symbols-browser',lifetime=2592000;
function cookie(req){const value=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1);return /^[a-f0-9]{64}$/.test(value??'')?hash(value):null;}
function setCookie(reply,value){reply.header('Set-Cookie',`${cookieName}=${value}; Path=/; Max-Age=${lifetime}; HttpOnly; Secure; SameSite=Strict`);}
const unauthorized=()=>new ApiError(401,'UNAUTHORIZED','Сессия недоступна. Войди по коду восстановления.');

// Browser credentials never cross into JavaScript. Only hashes of native sessions
// are referenced by the opaque browser session; native Bearer routes stay separate.
export async function browserRoutes(app,{pool,cfg,hub}){
 app.addHook('onRequest',async(req,reply)=>{
  reply.header('Cache-Control','no-store');
  if(!cfg.webOrigin)throw new ApiError(503,'WEB_DISABLED','Браузерный вход не настроен');
  if(req.headers['sec-fetch-site']==='cross-site')throw new ApiError(403,'ORIGIN_DENIED','Недопустимый источник запроса');
  if(!['GET','HEAD','OPTIONS'].includes(req.method)&&req.headers.origin!==cfg.webOrigin)throw new ApiError(403,'ORIGIN_DENIED','Недопустимый источник запроса');
 });
 async function browser(req){const id=cookie(req);return id?one(pool,'SELECT * FROM browser_sessions WHERE id_hash=$1 AND expires>now()',[id]):null;}
 async function auth(req){
  const b=await browser(req);if(!b?.active_profile)throw unauthorized();
  const u=await one(pool,`SELECT s.profile_id,s.token_hash FROM browser_accounts a JOIN account_sessions s ON s.token_hash=a.token_hash
   WHERE a.browser_id=$1 AND a.profile_id=$2 AND s.expires>now() AND s.revoked IS NULL`,[b.id_hash,b.active_profile]);
  if(!u)throw unauthorized();
  // Pin every request to the JS account generation; a cookie switch must not
  // silently send a queued command as another account.
  if(req.headers['x-symbols-account']!==u.profile_id)throw new ApiError(409,'ACCOUNT_CHANGED','Аккаунт изменился. Обнови страницу.');
  req.user=u;req.browser=b;
 }
 async function attach(req,reply,kind,value){
  let secret;
  const result=await transaction(pool,async c=>{
   const id=cookie(req);let b=id?await one(c,'SELECT * FROM browser_sessions WHERE id_hash=$1 AND expires>now() FOR UPDATE',[id]):null;
   if(!b){secret=randomBytes(32).toString('hex');b={id_hash:hash(secret)};}
   if(secret)await c.query("INSERT INTO browser_sessions(id_hash,expires) VALUES($1,now()+interval '30 days')",[b.id_hash]);
   // Registration/recovery and attachment form one transaction: a full browser
   // account list must not orphan a new profile or revoke an existing session.
   const session=await(kind==='register'?registerInTransaction(c,value):recoverInTransaction(c,value));
   await c.query(`DELETE FROM browser_accounts a USING account_sessions s WHERE a.browser_id=$1 AND a.token_hash=s.token_hash AND (s.revoked IS NOT NULL OR s.expires<=now())`,[b.id_hash]);
   const count=await one(c,'SELECT count(*) n FROM browser_accounts WHERE browser_id=$1 AND profile_id<>$2',[b.id_hash,session.id]);
   if(Number(count.n)>=8)throw new ApiError(409,'ACCOUNT_LIMIT','Можно сохранить до восьми аккаунтов. Сначала выйди из одного.');
   await c.query(`INSERT INTO browser_accounts(browser_id,profile_id,token_hash) VALUES($1,$2,$3) ON CONFLICT(browser_id,profile_id) DO UPDATE SET token_hash=excluded.token_hash`,[b.id_hash,session.id,hash(session.token)]);
   await c.query('UPDATE browser_sessions SET active_profile=$2 WHERE id_hash=$1',[b.id_hash,session.id]);
   return {id:session.id,expiresIn:session.expiresIn};
  });
  if(secret)setCookie(reply,secret);
  return result;
 }
 app.get('/account/sessions',async req=>{
  const b=await browser(req);if(!b)return {accounts:[],activeId:null};
  const accounts=(await pool.query(`SELECT a.profile_id id,p.nick FROM browser_accounts a JOIN account_sessions s ON s.token_hash=a.token_hash JOIN profiles p ON p.id=a.profile_id
   WHERE a.browser_id=$1 AND s.expires>now() AND s.revoked IS NULL ORDER BY p.created,a.profile_id`,[b.id_hash])).rows;
  return {accounts,activeId:accounts.some(a=>a.id===b.active_profile)?b.active_profile:null};
 });
 const object=properties=>({type:'object',additionalProperties:false,properties});
 app.post('/account/switch',{schema:{body:{...object({id:{type:'string',maxLength:80}}),required:['id']}}},async req=>{
  const b=await browser(req);if(!b)throw unauthorized();
  const changed=await pool.query(`UPDATE browser_sessions b SET active_profile=$2 WHERE b.id_hash=$1 AND EXISTS(SELECT 1 FROM browser_accounts a JOIN account_sessions s ON s.token_hash=a.token_hash WHERE a.browser_id=b.id_hash AND a.profile_id=$2 AND s.revoked IS NULL AND s.expires>now())`,[b.id_hash,req.body.id]);
  if(!changed.rowCount)throw unauthorized();return {id:req.body.id};
 });
 app.post('/account/new',{schema:{body:object({})}},async req=>{const b=await browser(req);if(b)await pool.query('UPDATE browser_sessions SET active_profile=NULL WHERE id_hash=$1',[b.id_hash]);return {activeId:null};});
 app.post('/account/register',{schema:{body:registerSchema}},async(req,reply)=>{await limit(pool,'register:'+req.ip,10,900);return reply.code(201).send(await attach(req,reply,'register',req.body.nick));});
 app.post('/account/recover',{schema:{body:recoverSchema}},async(req,reply)=>{await limit(pool,'recover:'+req.ip,5,900);return attach(req,reply,'recover',req.body.code);});
 app.get('/bootstrap',{preHandler:auth},req=>snapshot(pool,req.user.profile_id));
 app.get('/moderation',{preHandler:auth},req=>moderation(pool,req.user.profile_id));
 app.get('/profile',{preHandler:auth},async req=>{const s=await snapshot(pool,req.user.profile_id);return {profile:s.profile,revision:s.revision};});
 app.get('/matches/:id',{preHandler:auth},async req=>{const s=await snapshot(pool,req.user.profile_id);if(s.match?.id!==req.params.id)throw new ApiError(404,'NOT_FOUND','Партия недоступна');return {match:s.match,cursor:s.cursor};});
 app.get('/catalog',{preHandler:auth},async()=>({version:contentVersion,...catalog}));
 app.get('/market',{preHandler:auth,schema:{querystring:{type:'object',additionalProperties:false,properties:{symbol:{type:'string',maxLength:20},offset:{type:'integer',minimum:0,maximum:10000},desc:{type:'boolean'}}}}},req=>marketPage(pool,req.user.profile_id,req.query));
 for(const [kind,body] of Object.entries(commandSchemas))app.post('/commands/'+kind,{preHandler:auth,schema:{body}},async req=>{
  await limit(pool,'commands:'+req.user.profile_id,120,60);if(['report','recovery-code'].includes(kind))await limit(pool,kind+':'+req.user.profile_id,5,900);
  const result=await command(pool,req.user,kind,req.body,req.headers['idempotency-key']);
  if(['logout','delete-account'].includes(kind))await transaction(pool,async c=>{await c.query('DELETE FROM browser_accounts WHERE browser_id=$1 AND profile_id=$2',[req.browser.id_hash,req.user.profile_id]);await c.query('UPDATE browser_sessions SET active_profile=NULL WHERE id_hash=$1 AND active_profile=$2',[req.browser.id_hash,req.user.profile_id]);});
  return result;
 });
 app.get('/changes',{preHandler:auth,schema:{querystring:{type:'object',required:['cursor'],additionalProperties:false,properties:{cursor:{type:'string',pattern:'^[0-9]{1,19}$'}}}}},async req=>{
  await limit(pool,'longpoll:'+req.user.profile_id,60,60);
  let wake,timer,close;const pending=new Promise(resolve=>{wake=id=>{if(id===null||id===req.user.profile_id)resolve();};hub.on('change',wake);close=resolve;req.raw.once('close',close);});
  try{let page=await changes(pool,req.user.profile_id,req.query.cursor,req.user.token_hash);if(page.events.length)return page;await Promise.race([pending,new Promise(resolve=>{timer=setTimeout(resolve,25000);})]);await auth(req);return changes(pool,req.user.profile_id,req.query.cursor,req.user.token_hash);}
  finally{clearTimeout(timer);hub.off('change',wake);req.raw.off('close',close);}
 });
}
