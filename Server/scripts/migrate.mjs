import {runner} from 'node-pg-migrate';
import {fileURLToPath} from 'node:url';
import {createPool} from '../src/repositories/db.mjs';
import {config} from '../src/config/env.mjs';
export async function migrate(databaseUrl){return runner({databaseUrl,dir:fileURLToPath(new URL('../migrations',import.meta.url)),direction:'up',migrationsTable:'schema_migrations',checkOrder:true,singleTransaction:true,log:()=>{}});}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const cfg=config();
 if(process.argv[2]==='status'){const p=createPool(cfg);try{const exists=await p.query("SELECT to_regclass('schema_migrations') name");console.log(exists.rows[0].name?(await p.query('SELECT name,run_on FROM schema_migrations ORDER BY id')).rows:[]);}finally{await p.end();}}
 else console.log({applied:(await migrate(cfg.databaseUrl)).map(m=>m.name)});
}
