// Export-only Node host. The original Worker and its SQL remain unchanged.
import http from 'node:http';
import {Readable} from 'node:stream';
import worker from '../dist/server/index.js';
import {openDatabase} from './local-db.mjs';
const {DB,sql}=openDatabase(process.env.SYMBOLS_DB??'data/symbols.sqlite');
const host=process.env.HOST??'127.0.0.1',port=Number(process.env.PORT??8787);
const server=http.createServer(async(req,res)=>{
 try{
  const chunks=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>100000){res.writeHead(413).end();return;}chunks.push(chunk);}
  const headers=new Headers();for(const [k,v] of Object.entries(req.headers))if(v!==undefined)headers.set(k,Array.isArray(v)?v.join(','):v);
  headers.set('CF-Connecting-IP',req.socket.remoteAddress??'local');
  const request=new Request('http://'+(req.headers.host??host+':'+port)+req.url,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
  const response=await worker.fetch(request,{DB});
  res.writeHead(response.status,Object.fromEntries(response.headers));if(response.body)Readable.fromWeb(response.body).pipe(res);else res.end();
 }catch(e){console.error(e.message);res.writeHead(500,{'Content-Type':'application/json'}).end('{"error":"Local server error"}');}
});
server.listen(port,host,()=>console.log('Symbols: http://'+host+':'+port));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>{sql.close();process.exit(0);}));
