// Isolated synthetic fixture; refuses databases without an explicit test name.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {openDatabase} from '../../.reference/scripts/local-db.mjs';
import worker from '../../.reference/dist/server/index.js';
import {createPool} from '../../Server/src/repositories/db.mjs';
import {importDatabase} from '../../Server/scripts/import.mjs';
const url=process.env.DATABASE_URL;if(!url||!new URL(url).pathname.includes('client_test'))throw Error('Use isolated symbols_client_test database');
const root=fileURLToPath(new URL('../.tools/',import.meta.url));fs.mkdirSync(root,{recursive:true});
const file=path.join(root,'legacy-fixture-'+Date.now()+'.sqlite'),{DB,sql}=openDatabase(file);
for(const name of fs.readdirSync(new URL('../../.reference/drizzle/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())sql.exec(fs.readFileSync(new URL('../../.reference/drizzle/'+name,import.meta.url),'utf8'));
let session;
async function legacy(route,body={}){const r=await worker.fetch(new Request('http://local/api/'+route,{method:'POST',headers:{'content-type':'application/json',...(session?{authorization:'Bearer '+session.token}:{})},body:JSON.stringify(body)}),{DB});if(!r.ok)throw Error('Legacy '+r.status);return r.json();}
session=await legacy('register',{nick:'Перенос Android'});await legacy('v2/profile');
const row=sql.prepare('SELECT data FROM vaults WHERE profile_id=?').get(session.id),data=JSON.parse(row.data);
Object.assign(data,{balanceCents:123456,balance:1234.56,xp:1860,tutorialDone:true,avatar:'lion',frame:1,rank:{index:0,name:'Бронза I'},rankProgress:40,history:[{id:'synthetic-old-match',at:1700000000000,mode:'duel',opponent:'Синтетический соперник',outcome:'win',xp:100,elapsed:5000,damage:0,quests:[]}],upgrades:{king:2,sword:1},ownedSkins:{sword:['neon']},skins:{sword:'neon'},ownedAvatars:['lion']});
Object.assign(data.inventory,{sword:3,circle:4});sql.prepare('UPDATE vaults SET data=? WHERE profile_id=?').run(JSON.stringify(data),session.id);
const progress=JSON.parse(sql.prepare('SELECT data FROM profiles WHERE id=?').get(session.id).data);
const recovery=await legacy('recovery-code',{nick:data.nick,progress});sql.close();
const pool=createPool({databaseUrl:url});try{
 const report=await importDatabase(pool,file,{dryRun:false});if(!report.ok)throw Error('Import reconciliation failed');
 // Private test runner arguments. Never commit this file or use real player codes.
 fs.writeFileSync(path.join(root,'import-fixture.json'),JSON.stringify({code:recovery.code,id:session.id,expected:data}));
 fs.writeFileSync(new URL('../docs/import-verification.json',import.meta.url),JSON.stringify({synthetic:true,source:'original exported Worker',ok:report.ok,profiles:report.targetProfiles,balanceCents:report.targetBalanceCents,ownershipVerified:report.ownershipVerified,openListingsVerified:report.openListingsVerified},null,2));
 console.log('Synthetic legacy account created through original Worker and imported; private fixture saved.');
}finally{await pool.end();}
