import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
import {DatabaseSync} from 'node:sqlite';
const count=Number(process.argv[2]??50),seconds=Number(process.argv[3]??15),root=path.resolve(process.env.BASELINE_ROOT??'../.reference');
const {default:worker}=await import(pathToFileURL(path.join(root,'dist/server/index.js'))),sql=new DatabaseSync(':memory:');
for(const f of fs.readdirSync(path.join(root,'drizzle')).filter(f=>f.endsWith('.sql')).sort())sql.exec(fs.readFileSync(path.join(root,'drizzle',f),'utf8'));
class Query{constructor(s){this.s=s;this.args=[];}bind(...a){this.args=a;return this;}async first(){return sql.prepare(this.s).get(...this.args)??null;}async all(){return {results:sql.prepare(this.s).all(...this.args)};}async run(){return {meta:sql.prepare(this.s).run(...this.args)};}}
const DB={prepare:s=>new Query(s),batch:async qs=>{sql.exec('BEGIN');try{const r=[];for(const q of qs)r.push(await q.run());sql.exec('COMMIT');return r;}catch(e){sql.exec('ROLLBACK');throw e;}}};
// Serialize the in-memory D1 adapter's batches, as SQLite owns one connection.
let serial=Promise.resolve();const server=http.createServer(async(req,res)=>{const chunks=[];for await(const b of req)chunks.push(b);const job=async()=>{const r=await worker.fetch(new Request('http://localhost'+req.url,{method:req.method,headers:req.headers,body:Buffer.concat(chunks)}),{DB});res.writeHead(r.status,Object.fromEntries(r.headers));res.end(await r.text());};serial=serial.then(job,job);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;let requests=0,bytes=0,errors=0;const times=[],users=[];
async function api(route,b={},u){const t=performance.now(),body=JSON.stringify(b),r=await fetch(base+'/api/'+route,{method:'POST',headers:{'Content-Type':'application/json',...(u?{authorization:'Bearer '+u.token}:{})},body});const text=await r.text();requests++;bytes+=Buffer.byteLength(body)+Buffer.byteLength(text);times.push(performance.now()-t);if(r.status>=500)errors++;if(!r.ok)throw Error(JSON.parse(text).error);return JSON.parse(text);}
const writes=()=>sql.prepare('SELECT total_changes() n').get().n;
try{
 for(let i=0;i<count;i++){const u=await api('register',{nick:'Нагрузка '+i});users.push(u);await api('v2/profile',{},u);const row=sql.prepare('SELECT data FROM vaults WHERE profile_id=?').get(u.id),d=JSON.parse(row.data);d.tutorialDone=true;sql.prepare('UPDATE vaults SET data=? WHERE profile_id=?').run(JSON.stringify(d),u.id);}
 for(const [i,u] of users.entries())await api('v2/start',{mode:i%4<2?'duel':'trial',small:true},u);
 const initial={requests,bytes,writes:writes()},cpu=process.cpuUsage(),started=performance.now();times.length=0;let peakRss=process.memoryUsage().rss;
 while(performance.now()-started<seconds*1000){
  await Promise.all(users.map(async u=>{const r=await api('v2/poll',{},u),s=r.game;if(!s||s.status==='done'||s.players[s.actor]?.id!==u.id)return;const board=s.g.boards[s.actor%2],index=s.status==='setup'?board.findIndex((v,i)=>!v&&i>=(s.g.rows-1)*s.g.width):board.findIndex(v=>!v);if(index>=0)await api('v2/action',{revision:r.revision,action:{type:s.status==='setup'?'king':'smile',index}},u);}));
  peakRss=Math.max(peakRss,process.memoryUsage().rss);await new Promise(r=>setTimeout(r,900));
 }
 const elapsed=(performance.now()-started)/1000,used=process.cpuUsage(cpu);const report={players:count,seconds:elapsed,httpRequests:requests-initial.requests,httpRps:(requests-initial.requests)/elapsed,httpPayloadBytes:bytes-initial.bytes,wsMessages:0,wsPayloadBytes:0,databaseRowWrites:writes()-initial.writes,technicalErrors:errors,p95HttpMs:times.sort((a,b)=>a-b)[Math.floor((times.length-1)*.95)],cpuPercentOneCore:(used.user+used.system)/1e6/elapsed*100,peakRssBytes:peakRss,hardware:{platform:process.platform,cpu:os.cpus()[0].model,node:process.version},notes:['Original v45 bundled Worker, SQLite in-memory D1 adapter, loopback HTTP. Not production Cloudflare timing.','Same small-board mode mix and placement rule as load.mjs; baseline advances bots on polls. Payload excludes headers/TLS.']};fs.mkdirSync('reports',{recursive:true});fs.writeFileSync('reports/baseline-'+count+'.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await new Promise(r=>server.close(r));sql.close();}
