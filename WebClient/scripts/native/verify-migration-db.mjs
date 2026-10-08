import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import pg from '../../../Server/node_modules/pg/lib/index.js';
const pool=new pg.Pool({connectionString:'postgres://symbols_test@127.0.0.1:5457/symbols_ui_test'});
try{
 const f=JSON.parse(await fs.readFile(new URL('../../artifacts/transition/fixture/expected-private.json',import.meta.url),'utf8'));
 const balances=[];
 for(let i=0;i<f.sessions.length;i++){
  const s=f.sessions[i];const {rows:[v]}=await pool.query('SELECT balance_cents,data FROM vaults WHERE profile_id=$1',[s.id]);
  assert.equal(String(v.balance_cents),String(34567+100*i));assert.equal(v.data.inventory.teleport,3+i);balances.push({nick:s.nick,balanceCents:String(v.balance_cents),teleport:v.data.inventory.teleport});
  const {rows:[q]}=await pool.query('SELECT count(*)::int AS n FROM commands WHERE owner=$1 AND key=$2',[s.id,f.pending[i].key]);assert.equal(q.n,0,'unknown journal must never auto replay');
 }
 const report={passed:true,checks:['migrated account balances and inventory unchanged in PostgreSQL','neither unknown action nor unknown purchase replayed during migration/relaunch/switch'],accounts:balances,productionChanged:false};
 await fs.writeFile(new URL('../../artifacts/transition/migration-database.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await pool.end();}
