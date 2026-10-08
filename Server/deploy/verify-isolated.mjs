import assert from 'node:assert/strict';
import {buildApp} from '/app/src/app.mjs';
import {migrate} from '/app/scripts/migrate.mjs';
import {seed} from '/app/scripts/seed.mjs';
import {createPool} from '/app/src/repositories/db.mjs';
import {authenticate} from '/app/src/services/accounts.mjs';
import {snapshot} from '/app/src/services/sync.mjs';
import {command} from '/app/src/services/commands.mjs';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs';
const cfg={databaseUrl:process.env.DATABASE_URL,log:false,scheduler:false};
assert.ok(new URL(cfg.databaseUrl).pathname.includes('test'));
const pool=createPool(cfg);
let app;
try {
 if(process.env.MODE==='seed') {
  await migrate(cfg.databaseUrl);await seed(pool);
  app=await buildApp(cfg,{pool});
  const response=await app.inject({method:'POST',url:'/api/v3/account/register',payload:{nick:'Restore Drill'}});
  assert.equal(response.statusCode,201);
  const account=response.json(), user=await authenticate(pool,account.token);
  const key=randomUUID();
  const started=await command(pool,user,'start',{mode:'trial',small:true},key);
  assert.deepEqual(await command(pool,user,'start',{mode:'trial',small:true},key),started);
  const snap=await snapshot(pool,user.profile_id);
  fs.writeFileSync('/verify-state/account.json',JSON.stringify({token:account.token,id:user.profile_id,snapshot:snap}),{mode:0o600});
  console.log('Synthetic registration, bootstrap, trial match and idempotency passed');
 } else {
  const expected=JSON.parse(fs.readFileSync('/verify-state/account.json','utf8'));
  const user=await authenticate(pool,expected.token);
  const snap=await snapshot(pool,user.profile_id);
  assert.deepEqual(snap.profile,expected.snapshot.profile);
  assert.deepEqual(snap.match,expected.snapshot.match);
  assert.equal(snap.cursor,expected.snapshot.cursor);
  assert.equal((await pool.query('select count(*) n from game_content')).rows[0].n,'676');
  assert.equal((await pool.query('select count(*) n from game_content_links')).rows[0].n,'456');
  console.log('Synthetic restored authentication, complete progress/inventory/balance/match/cursor verified');
 }
} finally {if(app)await app.close();await pool.end();}
