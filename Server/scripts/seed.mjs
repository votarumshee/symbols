import {fileURLToPath} from 'node:url';
import {catalog,contentVersion} from '../src/domain/catalog.mjs';
import {createPool,transaction} from '../src/repositories/db.mjs';
import {config} from '../src/config/env.mjs';
export async function seed(pool){return transaction(pool,async c=>{
 await c.query('SELECT pg_advisory_xact_lock(830013)');
 if(catalog.records.length!==676||catalog.relations.length!==456)throw Error('Unexpected catalog counts');
 for(const r of catalog.records){await c.query('INSERT INTO game_content(category,key,payload,version) VALUES($1,$2,$3,$4) ON CONFLICT(category,key) DO UPDATE SET payload=excluded.payload,version=excluded.version',[r.category,r.key,r.payload,contentVersion]);}
 for(const r of catalog.relations)await c.query('INSERT INTO game_content_links VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',[r.category,r.key,r.relation,r.targetCategory,r.targetKey]);
 await c.query('INSERT INTO content_versions(version) VALUES($1) ON CONFLICT DO NOTHING',[contentVersion]);
 return {version:contentVersion,records:676,relations:456};
});}
if(process.argv[1]===fileURLToPath(import.meta.url)){const p=createPool(config());try{console.log(await seed(p));}finally{await p.end();}}
