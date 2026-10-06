import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import staticFiles from '@fastify/static';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import {createPool} from './repositories/db.mjs';
import {register,recover,authenticate,limit} from './services/accounts.mjs';
import {command} from './services/commands.mjs';
import {snapshot,changes} from './services/sync.mjs';
import {marketPage} from './services/market.mjs';
import {catalog,contentVersion} from './domain/catalog.mjs';
import {ApiError} from './services/errors.mjs';
import {scheduler} from './jobs/scheduler.mjs';
import {eventHub,stream} from './transport/events.mjs';
import {commandSchemas,registerSchema,recoverSchema} from './transport/schemas.mjs';
export async function buildApp(cfg,{pool:externalPool}={}){
 const pool=externalPool??createPool(cfg),app=Fastify({logger:cfg.log===false?false:{level:cfg.log??'info',redact:['req.headers.authorization','body','token','code']},disableRequestLogging:true,bodyLimit:16384,requestTimeout:15000,connectionTimeout:30000,keepAliveTimeout:10000,trustProxy:cfg.trustProxy??false,ajv:{customOptions:{removeAdditional:false}}});
 app.decorate('pool',pool);const metrics={requests:0,errors:0,httpBytes:0,wsMessages:0,wsBytes:0,connections:0,latencyMs:0};app.decorate('metrics',metrics);
 const {hub,close:closeHub}=await eventHub(pool,app.log);let stopScheduler;
 app.addHook('onResponse',async(req,reply)=>{metrics.requests++;metrics.latencyMs+=reply.elapsedTime;if(reply.statusCode>=500)metrics.errors++;metrics.httpBytes+=Number(reply.getHeader('content-length')??0);});
 app.addHook('onSend',async(req,reply,payload)=>{reply.header('X-Content-Type-Options','nosniff');if((req.url.startsWith('/api/')&&!req.url.startsWith('/api/v3/catalog'))||req.url.startsWith('/avatars/'))reply.header('Cache-Control','no-store');return payload;});
 app.setErrorHandler((e,req,reply)=>{
  const database=e.code&&/^[0-9A-Z]{5}$/.test(e.code);const status=e.validation?400:database?503:e.statusCode??(e.message?.match(/[А-Яа-я]/)?400:500);
  if(status>=500)app.log.error({code:e.code??'INTERNAL',requestId:req.id},'Request failed');
  if(e.retryAfter)reply.header('Retry-After',e.retryAfter);
  reply.code(status).send({error:{code:e.validation?'INVALID_REQUEST':database?'UNAVAILABLE':e.code??(status>=500?'INTERNAL':'INVALID_COMMAND'),message:status>=500?'Сервер временно недоступен':e.validation?'Проверь параметры запроса':e.message,requestId:req.id}});
 });
 await app.register(websocket,{options:{maxPayload:1024,perMessageDeflate:false}});
 app.addHook('onRequest',async(req,reply)=>{if(req.url.startsWith('/avatars/')){const owner=req.url.split('/')[2];if(!/^[a-f0-9-]{36}$/.test(owner)||!(await pool.query('SELECT 1 FROM profiles WHERE id=$1',[owner])).rowCount)return reply.code(404).send();}});
 await app.register(staticFiles,{root:fileURLToPath(new URL('../public',import.meta.url)),prefix:'/',maxAge:'1h',index:false});
 if(process.env.AVATAR_ROOT&&fs.existsSync(process.env.AVATAR_ROOT))await app.register(staticFiles,{root:path.resolve(process.env.AVATAR_ROOT),prefix:'/avatars/',decorateReply:false,index:false,maxAge:0});
 app.get('/health',async()=>({ok:true}));
 app.get('/ready',async(req,reply)=>{const r=await pool.query('SELECT 1 FROM content_versions WHERE version=$1',[contentVersion]);if(!r.rowCount)return reply.code(503).send({ok:false});return {ok:true,contentVersion};});
 app.get('/metrics',async(req,reply)=>{if(cfg.metricsToken&&req.headers.authorization==='Bearer '+cfg.metricsToken){const due=await pool.query('SELECT count(*) pending,max(extract(epoch FROM now()-due_at)*1000) AS lag_ms FROM arenas WHERE due_at<now()');return {...metrics,pool:{total:pool.totalCount,idle:pool.idleCount,waiting:pool.waitingCount,errors:pool.errorCount},scheduler:due.rows[0]};}return reply.code(404).send();});
 app.get('/account-deletion',async(req,reply)=>reply.sendFile('account-deletion.html'));
 app.post('/api/v3/account/register',{schema:{body:registerSchema}},async(req,reply)=>{await limit(pool,'register:'+req.ip,10,900);return reply.code(201).send(await register(pool,req.body.nick));});
 app.post('/api/v3/account/recover',{schema:{body:recoverSchema}},async req=>{await limit(pool,'recover:'+req.ip,5,900);return recover(pool,req.body.code);});
 async function auth(req){req.user=await authenticate(pool,req.headers.authorization?.startsWith('Bearer ')?req.headers.authorization.slice(7):null);}
 app.get('/api/v3/bootstrap',{preHandler:auth},req=>snapshot(pool,req.user.profile_id));
 app.get('/api/v3/profile',{preHandler:auth},async req=>{const s=await snapshot(pool,req.user.profile_id);return {profile:s.profile,revision:s.revision};});
 app.get('/api/v3/matches/:id',{preHandler:auth},async req=>{const s=await snapshot(pool,req.user.profile_id);if(s.match?.id!==req.params.id)throw new ApiError(404,'NOT_FOUND','Партия недоступна');return {match:s.match,cursor:s.cursor};});
 app.get('/api/v3/catalog',{preHandler:auth},async(req,reply)=>{reply.header('Cache-Control','private,max-age=3600');reply.header('ETag','"'+contentVersion+'"');if(req.headers['if-none-match']==='"'+contentVersion+'"')return reply.code(304).send();return {version:contentVersion,...catalog};});
 app.get('/api/v3/market',{preHandler:auth,schema:{querystring:{type:'object',additionalProperties:false,properties:{symbol:{type:'string',maxLength:20},offset:{type:'integer',minimum:0,maximum:10000},desc:{type:'boolean'}}}}},req=>marketPage(pool,req.user.profile_id,req.query));
 for(const [kind,body] of Object.entries(commandSchemas))app.post('/api/v3/commands/'+kind,{preHandler:auth,schema:{body}},async req=>{await limit(pool,'commands:'+req.user.profile_id,120,60);if(['report','recovery-code'].includes(kind))await limit(pool,kind+':'+req.user.profile_id,5,900);return command(pool,req.user,kind,req.body,req.headers['idempotency-key']);});
 const cursorQuery={type:'object',required:['cursor'],additionalProperties:false,properties:{cursor:{type:'string',pattern:'^[0-9]{1,19}$'}}};
 app.get('/api/v3/changes',{preHandler:auth,schema:{querystring:cursorQuery}},async(req,reply)=>{
  await limit(pool,'longpoll:'+req.user.profile_id,60,60);
  // Install wakeup before reading history to close the read/subscribe race.
  let wake;const pending=new Promise(resolve=>{wake=id=>{if(id===null||id===req.user.profile_id)resolve();};hub.on('change',wake);});
  let timer;try{let page=await changes(pool,req.user.profile_id,req.query.cursor);if(page.events.length)return page;await Promise.race([pending,new Promise(resolve=>{timer=setTimeout(resolve,25000);req.raw.once('close',resolve);})]);await authenticate(pool,req.headers.authorization.slice(7));return changes(pool,req.user.profile_id,req.query.cursor);}finally{clearTimeout(timer);hub.off('change',wake);}
 });
 const connections=new Map();
 app.get('/api/v3/events',{websocket:true,preValidation:async req=>{await auth(req);await limit(pool,'ws:'+req.user.profile_id,30,60);if((connections.get(req.user.profile_id)??0)>=3||metrics.connections>=1000)throw new ApiError(429,'CONNECTION_LIMIT','Лимит соединений');},schema:{querystring:cursorQuery}},(socket,req)=>{const id=req.user.profile_id;connections.set(id,(connections.get(id)??0)+1);socket.once('close',()=>connections.set(id,Math.max(0,(connections.get(id)??1)-1)));stream(socket,req,pool,hub,metrics);});
 app.addHook('onReady',async()=>{if(cfg.scheduler!==false)stopScheduler=scheduler(pool,app.log);});
 app.addHook('preClose',async()=>{for(const socket of app.websocketServer.clients)socket.close(1001,'Server shutdown');});
 app.addHook('onClose',async()=>{if(stopScheduler)await stopScheduler();await closeHub();if(!externalPool)await pool.end();});
 return app;
}
