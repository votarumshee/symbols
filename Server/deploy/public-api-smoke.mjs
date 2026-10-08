// Safe production smoke: read-only HTTP and unauthorized WSS only.
import assert from 'node:assert/strict';
import WebSocket from 'ws';
const origin='https://symbols-api.votarumshee.com';
const results=[];
for(const [path,status] of [['/health',200],['/ready',200],['/api/v3/bootstrap',401],['/account-deletion',200],['/metrics',404],['/metrics/',404]]){
 const r=await fetch(origin+path,{signal:AbortSignal.timeout(15000)});
 assert.equal(r.status,status,path);assert.equal(r.headers.get('x-symbols-acceptance'),null);
 assert.match(r.headers.get('strict-transport-security')??'',/max-age=31536000/);
 if(path==='/health'||path==='/ready')assert.equal((await r.json()).ok,true);
 results.push({path,status});
}
const redirect=await fetch(origin.replace('https:','http:')+'/',{redirect:'manual'});assert.equal(redirect.status,308);assert.equal(redirect.headers.get('location'),origin+'/');
for(const token of [null,'invalid'])await new Promise((resolve,reject)=>{
 const s=new WebSocket(origin.replace('https:','wss:')+'/api/v3/events?cursor=0',{headers:token?{Authorization:'Bearer '+token}:{},handshakeTimeout:15000});
 s.once('unexpected-response',(_,r)=>{try{assert.equal(r.statusCode,401);r.resume();s.terminate();resolve();}catch(e){s.terminate();reject(e);}});
 s.once('open',()=>{s.close();reject(Error('Unauthenticated WSS opened'));});s.once('error',reject);
});
console.log(JSON.stringify({result:'PASS',utc:new Date().toISOString(),results,httpRedirect:308,wssUnauthorized:401,temporaryMarker:false},null,2));
