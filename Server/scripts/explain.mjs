import fs from 'node:fs';
import {createPool} from '../src/repositories/db.mjs';
import {config} from '../src/config/env.mjs';
if(process.env.NODE_ENV==='production'||!process.env.DATABASE_URL?.includes('test'))throw Error('Use disposable test DB');
const pool=createPool(config()),c=await pool.connect();try{
 await c.query('BEGIN');await c.query("INSERT INTO profiles(id,nick) VALUES('explain-synthetic','Тест плана')");await c.query("INSERT INTO vaults(profile_id,data,balance_cents) VALUES('explain-synthetic','{\"balanceCents\":0,\"nick\":\"Тест плана\"}',0)");
 await c.query("INSERT INTO listings(id,seller,symbol,price_cents,status,created) SELECT 'explain-'||n,'explain-synthetic',CASE WHEN n%2=0 THEN 'sword' ELSE 'circle' END,n,'open',now() FROM generate_series(1,20000) n");
 await c.query("INSERT INTO events(owner,cursor,payload) SELECT 'explain-synthetic',n,'{}' FROM generate_series(1,20000) n");await c.query('ANALYZE listings');await c.query('ANALYZE events');
 const queries={market:"SELECT id,price_cents FROM listings WHERE status='open' AND symbol='sword' ORDER BY price_cents,created,id LIMIT 61",events:"SELECT payload FROM events WHERE owner='explain-synthetic' AND cursor>19900 ORDER BY cursor LIMIT 100",scheduler:'SELECT id FROM arenas WHERE due_at<=now() ORDER BY due_at FOR UPDATE SKIP LOCKED LIMIT 1'};
 const plans={};for(const [name,sql] of Object.entries(queries))plans[name]=(await c.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+sql)).rows[0]['QUERY PLAN'];
 fs.mkdirSync('reports',{recursive:true});fs.writeFileSync('reports/explain.json',JSON.stringify(plans,null,2));console.log('Saved plans for 20000 listings and 20000 events; synthetic writes rolled back.');
}finally{await c.query('ROLLBACK');c.release();await pool.end();}
