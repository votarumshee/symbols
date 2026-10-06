import fs from 'node:fs';
import {performance} from 'node:perf_hooks';
const base=process.env.SYMBOLS_BASELINE_URL??'http://127.0.0.1:8787';
const duration=Number(process.env.SYMBOLS_MEASURE??600)*1000;
async function scenario(active){
 let session,requests=0,sent=0,received=0,game,revision;
 const latency=[];
 async function api(route,body={}){const payload=JSON.stringify(body),start=performance.now();const r=await fetch(base+'/api/'+route,{method:'POST',headers:{'content-type':'application/json',...(session?{authorization:'Bearer '+session.token}:{})},body:payload});const text=await r.text();requests++;sent+=Buffer.byteLength(payload);received+=Buffer.byteLength(text);if(!r.ok)throw Error('Baseline '+r.status);const value=JSON.parse(text);if(value.game){game=value.game;revision=value.revision;}if(route==='v2/action')latency.push(performance.now()-start);return value;}
 session=await api('register',{nick:active?'Трафик игра':'Трафик покой'});await api('v2/profile');
 if(active){await api('v2/start',{mode:'local',small:true});for(let i=0;i<2;i++)await api('v2/action',{revision,action:{type:'king',index:56}});}
 requests=sent=received=0;latency.length=0;const start=performance.now();let nextPoll=900,nextProfile=10000,nextAction=9000;
 while(performance.now()-start<duration){const elapsed=performance.now()-start;
  if(active&&elapsed>=nextPoll){await api('v2/poll');nextPoll+=900;}
  if(!active&&elapsed>=nextProfile){await api('v2/profile');nextProfile+=10000;}
  if(active&&elapsed>=nextAction){const side=game.actor%2,index=game.g.boards[side].findIndex(v=>!v);await api('v2/action',{revision,action:{type:'smile',index}});nextAction+=9000;}
  await new Promise(r=>setTimeout(r,20));
 }
 const report={scenario:active?'active-local':'idle',seconds:(performance.now()-start)/1000,httpRequests:requests,sentPayloadBytes:sent,receivedHttpPayloadBytes:received,wsMessages:0,wsPayloadBytes:0,p95CommandResponseMs:latency.sort((a,b)=>a-b)[Math.floor((latency.length-1)*.95)]??null,notes:['Original unchanged exported Worker + SQLite, Node HTTP driver uses next.mjs cadence: game 900ms, home profile 10000ms.','Same 10x14 local match, smile every 9s, initialization excluded. Payload bytes exclude HTTP headers/TLS. Not browser render timing.']};
 fs.mkdirSync(new URL('../artifacts/measurements/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('../artifacts/measurements/baseline-'+(active?'active':'idle')+'.json',import.meta.url),JSON.stringify(report,null,2));
 console.log({scenario:report.scenario,seconds:report.seconds,httpRequests:requests});
}
await Promise.all([scenario(false),scenario(true)]);
