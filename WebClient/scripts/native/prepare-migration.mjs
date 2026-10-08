import fs from 'node:fs/promises';
import path from 'node:path';
import pg from '../../../Server/node_modules/pg/lib/index.js';
import {register} from '../../../Server/src/services/accounts.mjs';
const out=new URL('../../artifacts/transition/fixture/',import.meta.url);
await fs.mkdir(new URL('src/',out),{recursive:true});await fs.mkdir(new URL('assets/',out),{recursive:true});
const pool=new pg.Pool({connectionString:'postgres://symbols_test@127.0.0.1:5457/symbols_ui_test'});
try{
 const sessions=await Promise.all(['MigrationOne','MigrationTwo'].map(async nick=>({...await register(pool,nick),nick})));
 for(let i=0;i<2;i++)await pool.query("UPDATE vaults SET data=jsonb_set(jsonb_set(jsonb_set(data,'{tutorialDone}','true'),'{inventory,teleport}',$2::jsonb),'{balanceCents}',$3::jsonb),balance_cents=$4 WHERE profile_id=$1",[sessions[i].id,String(3+i),String(34567+i*100),34567+i*100]);
 const createdAt=Date.now();const pending=sessions.map((s,i)=>({account:s.id,key:crypto.randomUUID(),kind:i?'action':'buy-case',body:i?{matchId:'migration-old-match',revision:'9007199254740993',action:{type:'arrow',index:2,dir:0}}:{case:'assault'},createdAt}));
 const data={sessions,active:sessions[1].id,pending};
 await fs.writeFile(new URL('assets/migration-fixture.json',out),JSON.stringify(data));
 await fs.writeFile(new URL('expected-private.json',out),JSON.stringify(data));
 await fs.copyFile(new URL('MigrationSeedActivity.kt',import.meta.url),new URL('src/MigrationSeedActivity.kt',out));
 await fs.writeFile(new URL('AndroidManifest.xml',out),'<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application><activity android:name="com.votarumshee.symbols.MigrationSeedActivity" android:exported="true" /></application></manifest>');
 console.log('Created two synthetic local accounts and pending journals. No credentials printed.');
}finally{await pool.end();}

