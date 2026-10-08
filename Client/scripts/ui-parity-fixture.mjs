import pg from '../../Server/node_modules/pg/lib/index.js';
const pool=new pg.Pool({connectionString:'postgres://symbols_test@127.0.0.1:5457/symbols_ui_test'});
const inventory=Object.fromEntries(['arrowx2','sword','circle','electricity','tank','laser','feedback','inspect','powerful','angry','teleport'].map(k=>[k,5]));
const cases=Object.fromEntries((await pool.query("select key from game_content where category='case'")).rows.map(r=>[r.key,2]));
for(const r of (await pool.query('select profile_id,data from vaults')).rows){Object.assign(r.data,{inventory:{...r.data.inventory,...inventory},cases,balanceCents:200000,balance:2000,xp:20000,frame:1,tutorialDone:true,ownedSkins:{sword:['neon']},skins:{sword:'neon'}});await pool.query('update vaults set data=$2,balance_cents=200000 where profile_id=$1',[r.profile_id,r.data]);}
await pool.end();console.log('Local synthetic ownership fixture installed; no production access.');
