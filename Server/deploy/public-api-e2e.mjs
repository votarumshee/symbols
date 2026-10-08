// Run only while the domain routes to the dedicated synthetic acceptance DB.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import WebSocket from 'ws';
if(process.env.SYMBOLS_ISOLATED_ACCEPTANCE!=='yes') throw Error('Explicit isolated routing confirmation required');
const marker=process.env.SYMBOLS_ACCEPTANCE_MARKER;
if(!/^[0-9a-f]{12}$/.test(marker??''))throw Error('Exact temporary route marker required');
const deadline=setTimeout(()=>{console.error('Acceptance timed out');process.exit(1);},120000);deadline.unref();
const origin='https://symbols-api.votarumshee.com';
const checks=[];
const ok=name=>{checks.push(name);console.log('PASS '+name);};
async function req(path,{token,body,key,headers={},status=200}={}){
 const r=await fetch(origin+path,{method:body?'POST':'GET',headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json','Idempotency-Key':key??randomUUID()}:{}),...headers},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(35000)});
 assert.equal(r.status,status,path);return r;
}
const data=async(path,opt)=>(await req(path,opt)).json();
async function deniedWs(token){return new Promise((resolve,reject)=>{const s=new WebSocket(origin.replace('https:','wss:')+'/api/v3/events?cursor=0',{headers:token?{Authorization:'Bearer '+token}:{},handshakeTimeout:15000});s.on('unexpected-response',(_,r)=>{assert.equal(r.statusCode,401);r.resume();s.terminate();resolve();});s.on('open',()=>{s.close();reject(Error('Unauthorized upgrade'));});s.on('error',reject);});}
async function ws(token,cursor){
 const s=new WebSocket(origin.replace('https:','wss:')+'/api/v3/events?cursor='+cursor,{headers:{Authorization:'Bearer '+token},handshakeTimeout:15000});
 const queue=[];let waiter;let pings=0;
 s.on('message',raw=>{queue.push(JSON.parse(raw));if(waiter){waiter();waiter=null;}});s.on('ping',()=>pings++);
 const closed=new Promise(resolve=>s.once('close',(code)=>resolve(code)));
 await new Promise((resolve,reject)=>{s.once('open',resolve);s.once('error',reject);});
 return {s,closed,get pings(){return pings;},async next(){if(!queue.length)await Promise.race([new Promise(r=>waiter=r),new Promise((_,reject)=>setTimeout(()=>reject(Error('WS event timeout')),15000))]);return queue.shift();}};
}
assert.equal((await req('/ready')).headers.get('x-symbols-acceptance'),marker,'Refusing mutation outside isolated route');
await req('/health');ok('trusted HTTPS health/readiness and isolated route guard');
await req('/api/v3/bootstrap',{status:401});await req('/api/v3/bootstrap',{token:'invalid',status:401});await deniedWs();await deniedWs('invalid');ok('HTTP and WSS authorization rejected');
const session=await data('/api/v3/account/register',{body:{nick:'PublicReview'},status:201});
const token=session.token;const cmd=(kind,body={},key)=>data('/api/v3/commands/'+kind,{token,body,key});
let state=await data('/api/v3/bootstrap',{token});
const cat=await req('/api/v3/catalog',{token});await req('/api/v3/catalog',{token,headers:{'If-None-Match':cat.headers.get('etag')},status:304});ok('registration bootstrap catalog ETag304');
let socket=await ws(token,state.cursor);const startKey=randomUUID();const started=await cmd('start',{mode:'local',small:true},startKey);assert.deepEqual(await cmd('start',{mode:'local',small:true},startKey),started);
let event=await socket.next();let last=event.cursor;assert.equal(event.events.length,1);
state=await data('/api/v3/bootstrap',{token});
for(let i=0;i<2;i++){await cmd('action',{matchId:state.match.id,revision:state.match.revision,action:{type:'king',index:56}});event=await socket.next();last=event.cursor;state=await data('/api/v3/bootstrap',{token});}
assert.equal(state.match.status,'play');
const leaveBody={matchId:state.match.id,revision:state.match.revision},leaveKey=randomUUID();const done=await cmd('leave',leaveBody,leaveKey);event=await socket.next();last=event.cursor;
state=await data('/api/v3/bootstrap',{token});assert.equal(state.match.status,'done');const balance=state.profile.balanceCents;
assert.deepEqual(await cmd('leave',leaveBody,leaveKey),done);assert.equal((await data('/api/v3/bootstrap',{token})).profile.balanceCents,balance);ok('WSS match start actions completion and idempotent balance');
await new Promise(r=>setTimeout(r,22000));assert.ok(socket.pings>0);ok('real WSS heartbeat ping/pong');
socket.s.close();await socket.closed;await cmd('nickname',{nick:'ReplayReview'});
socket=await ws(token,last);const replay=await socket.next();assert.equal(replay.events.length,1);assert.equal(replay.events[0].profilePatch.nick,'ReplayReview');assert.ok(BigInt(replay.cursor)>BigInt(last));last=replay.cursor;socket.s.close();await socket.closed;
socket=await ws(token,last);const pending=socket.next();await cmd('nickname',{nick:'NextReview'});const next=await pending;assert.equal(next.events.length,1);assert.ok(BigInt(next.events[0].cursor)>BigInt(last));last=next.cursor;ok('disconnect cursor replay excludes already applied events');
const poll=data('/api/v3/changes?cursor='+last,{token});await new Promise(r=>setTimeout(r,500));await cmd('nickname',{nick:'PollReview'});const page=await poll;assert.equal(page.events.length,1);assert.equal(page.events[0].profilePatch.nick,'PollReview');ok('long-poll wakeup fallback');
const old=await ws(token,'9223372036854775807');assert.equal((await old.next()).error.code,'SNAPSHOT_REQUIRED');await old.closed;
await req('/api/v3/changes?cursor=9223372036854775807',{token,status:409});state=await data('/api/v3/bootstrap',{token});assert.ok(state.cursor);ok('SNAPSHOT_REQUIRED HTTP/WSS and fresh bootstrap');
await cmd('logout');assert.equal(await socket.closed,1008);await req('/api/v3/bootstrap',{token,status:401});await deniedWs(token);ok('session revocation closes WSS and denies HTTP/reconnect');
for(let i=0;i<6;i++)await req('/api/v3/account/recover',{body:{code:'invalid-synthetic-review'},headers:{'X-Forwarded-For':'198.51.100.'+(i+1)},status:i<5?400:429});ok('spoofed X-Forwarded-For cannot bypass per-IP recovery limit');
console.log(JSON.stringify({result:'PASS',utc:new Date().toISOString(),checks},null,2));
