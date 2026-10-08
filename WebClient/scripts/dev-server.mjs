// Local-only same-origin static host + API proxy. Never expose this development server.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../www/',import.meta.url));
const api=new URL(process.env.SYMBOLS_LOCAL_API??'http://127.0.0.1:8080');
if(api.protocol!=='http:'||!['127.0.0.1','localhost'].includes(api.hostname))throw Error('Local API only');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'};
http.createServer(async(req,res)=>{
  if(req.url.startsWith('/api/v3/') || req.url.startsWith('/api/web/v3/')) {
    const upstream=http.request(new URL(req.url,api),{method:req.method,headers:{...req.headers,host:api.host}},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});
    upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();});
    res.on('close',()=>upstream.destroy());req.pipe(upstream);return;
  }
  try {
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(root))throw Error('path');
    const data=await fs.readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]??'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(data);
  }catch{res.writeHead(404);res.end('Not found');}
}).listen(Number(process.env.SYMBOLS_WEB_PORT??8790),'127.0.0.1',()=>console.log('Shared client: http://127.0.0.1:8790'));
