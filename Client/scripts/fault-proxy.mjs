// Local integration fault injector; never deploy. No credential/request logging.
import http from 'node:http';
import WebSocket,{WebSocketServer} from '../../Server/node_modules/ws/wrapper.mjs';
let settings={};const sockets=new Set();
const server=http.createServer(async(req,res)=>{
 const chunks=[];for await(const c of req)chunks.push(c);const body=Buffer.concat(chunks);
 if(req.url==='/control'){
  settings=JSON.parse(body.toString());if(settings.disconnect)for(const s of sockets)s.close();res.end('{}');return;
 }
 if(settings.delay)await new Promise(r=>setTimeout(r,settings.delay));
 const command=req.url.startsWith('/api/v3/commands/');
 if(command&&settings.status){const status=settings.status;delete settings.status;res.writeHead(status,{'content-type':'application/json','retry-after':'1'});res.end(JSON.stringify({error:{code:'INJECTED',message:'Synthetic failure'}}));return;}
 const upstream=http.request({hostname:'127.0.0.1',port:8080,path:req.url,method:req.method,headers:req.headers},response=>{
  if(command&&settings.dropAfterCommit){response.resume();response.on('end',()=>res.destroy());return;}
  res.writeHead(response.statusCode,response.headers);response.pipe(res);
 });upstream.on('error',()=>{res.writeHead(503);res.end();});upstream.end(body);
});
const wss=new WebSocketServer({noServer:true});server.on('upgrade',(req,socket,head)=>{
 wss.handleUpgrade(req,socket,head,down=>{
  sockets.add(down);const up=new WebSocket('ws://127.0.0.1:8080'+req.url,{headers:{authorization:req.headers.authorization}});
  up.on('message',(data,binary)=>{if(!settings.dropEvents&&down.readyState===1)down.send(data,{binary});});
  up.on('error',()=>down.close());up.on('close',()=>down.close());down.on('close',()=>{up.close();sockets.delete(down);});
 });
});server.listen(8081,'127.0.0.1',()=>console.log('Synthetic fault proxy on loopback 8081'));
