import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import worker from '../../.reference/dist/server/index.js';
import {openDatabase} from '../../.reference/scripts/local-db.mjs';
const {DB,sql}=openDatabase(new URL('../artifacts/ui-parity/web.sqlite',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1'));
for(const n of fs.readdirSync('.reference/drizzle').filter(n=>n.endsWith('.sql')).sort()) { try {sql.exec(fs.readFileSync('.reference/drizzle/'+n,'utf8'));} catch(e){if(!e.message.includes('already exists'))throw e;} }
http.createServer(async(req,res)=>{try{if(req.url.startsWith('/api/')){let b='';for await(const c of req)b+=c;const r=await worker.fetch(new Request('http://127.0.0.1:8787'+req.url,{method:req.method,headers:req.headers,body:b||undefined}),{DB});res.writeHead(r.status,Object.fromEntries(r.headers));res.end(Buffer.from(await r.arrayBuffer()));}else{const file=path.resolve('.reference/dist','.'+(req.url==='/'?'/index.html':req.url.split('?')[0]));if(!file.startsWith(path.resolve('.reference/dist')+path.sep))throw Error('path');res.setHeader('Content-Type',({'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}}catch(e){res.writeHead(500);res.end(e.message);}}).listen(8787,'127.0.0.1');
