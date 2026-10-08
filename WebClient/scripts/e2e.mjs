import fs from 'node:fs/promises';import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';
import pg from '../../Server/node_modules/pg/lib/index.js';import {migrate} from '../../Server/scripts/migrate.mjs';import {seed} from '../../Server/scripts/seed.mjs';import {buildApp} from '../../Server/src/app.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),adminUrl=process.env.TEST_DATABASE_URL??'postgres://symbols_test@127.0.0.1:5457/postgres';
if(!['localhost','127.0.0.1'].includes(new URL(adminUrl).hostname))throw Error('E2E requires a local disposable database');
const admin=new pg.Pool({connectionString:adminUrl}),name='symbols_web_e2e_'+Date.now(),url=new URL(adminUrl);url.pathname='/'+name;
const apiPort=Number(process.env.SYMBOLS_E2E_API_PORT??8083),webPort=Number(process.env.SYMBOLS_E2E_WEB_PORT??8793),apiOrigin='http://127.0.0.1:'+apiPort,webOrigin='http://127.0.0.1:'+webPort;
const selectedTests=process.argv.length>2?process.argv.slice(2):(process.env.SYMBOLS_E2E_TESTS??'browser,integration,recovery,cosmetics,gameplay').split(',');
if(selectedTests.some(t=>!['browser','integration','recovery','cosmetics','gameplay'].includes(t)))throw Error('Unknown E2E suite');
let pool,app,web;const run=(script,env)=>new Promise((resolve,reject)=>{const c=spawn(process.execPath,[script],{cwd:root,env:{...process.env,...env},stdio:'inherit'});c.once('error',reject);c.once('exit',code=>code===0?resolve():reject(Error(script+' failed: '+code)));});
try{
 await admin.query('CREATE DATABASE '+name);await migrate(url.href);pool=new pg.Pool({connectionString:url.href});await seed(pool);
 app=await buildApp({databaseUrl:url.href,webOrigin,log:false,scheduler:true},{pool});await app.listen({host:'127.0.0.1',port:apiPort});
 web=spawn(process.execPath,['scripts/dev-server.mjs'],{cwd:root,env:{...process.env,SYMBOLS_LOCAL_API:apiOrigin,SYMBOLS_WEB_PORT:String(webPort)},stdio:'inherit'});
 for(let i=0;i<50;i++){try{if((await fetch(webOrigin)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const env={DATABASE_URL:url.href,SYMBOLS_WEB_ORIGIN:webOrigin,SYMBOLS_API_ORIGIN:apiOrigin};
 for(const test of selectedTests)await run('tests/'+test+'.mjs',env);
 await fs.mkdir(new URL('../artifacts/transition/',import.meta.url),{recursive:true});await fs.writeFile(new URL('../artifacts/transition/e2e.json',import.meta.url),JSON.stringify({passed:true,isolatedDatabase:true,tests:selectedTests,productionTouched:false},null,2));
}finally{web?.kill();if(app)await app.close();if(pool)await pool.end();await admin.query('DROP DATABASE IF EXISTS '+name+' WITH (FORCE)');await admin.end();}
