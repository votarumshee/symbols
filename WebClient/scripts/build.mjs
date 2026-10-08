import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const root=fileURLToPath(new URL('../',import.meta.url));
const web=path.join(root,'www');
await fs.mkdir(web,{recursive:true});
for(const name of await fs.readdir(web))await fs.rm(path.join(web,name),{recursive:true,force:true});
// All maintained assets live in src; no dependency on historical dist.
for(const entry of await fs.readdir(path.join(root,'src'),{withFileTypes:true})) {
  if(entry.isFile() && /\.(mjs|css|svg|png|woff2?)$/.test(entry.name) && !['next.mjs','app.mjs'].includes(entry.name))
    await fs.copyFile(path.join(root,'src',entry.name),path.join(web,entry.name));
}
const endpoint=process.env.SYMBOLS_NATIVE_API??'http://10.0.2.2:8080';
const url=new URL(endpoint);
const content=JSON.parse(await fs.readFile(path.join(root,'../Server/content/catalog.json'),'utf8'));
const contentVersion=createHash('sha256').update(JSON.stringify(content)).digest('hex');
if(url.origin!==endpoint || !(url.protocol==='https:' || url.protocol==='http:' && ['10.0.2.2','localhost','127.0.0.1'].includes(url.hostname)))throw Error('Invalid native API origin');
await build({entryPoints:[path.join(root,'src/next.mjs')],bundle:true,format:'esm',target:'es2022',charset:'utf8',outfile:path.join(web,'client.js'),define:{__NATIVE_API__:JSON.stringify(endpoint),__CONTENT_VERSION__:JSON.stringify(contentVersion)}});
// Only our modules resolve through esbuild; original art modules remain shared files.
await fs.copyFile(path.join(root,'src/platform.css'),path.join(web,'platform.css'));
await fs.writeFile(path.join(web,'index.html'),`<!doctype html><html lang="ru"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#ff741f"><title>Символы</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'">
<link rel="stylesheet" href="style.css"><link rel="stylesheet" href="upgrade.css"><link rel="stylesheet" href="color.css"><link rel="stylesheet" href="next.css"><link rel="stylesheet" href="platform.css">
</head><body><main id="app"></main><script type="module" src="client.js"></script></body></html>`);
console.log('Built shared web assets (native API: '+endpoint+').');

await fs.writeFile(path.join(web,"build.json"),JSON.stringify({apiVersion:3,contentVersion,nativeApi:endpoint,assetVersion:createHash("sha256").update(await fs.readFile(path.join(web,"client.js"))).digest("hex")},null,2));

await fs.copyFile(path.join(root,'src/privacy.html'),path.join(web,'privacy.html'));
