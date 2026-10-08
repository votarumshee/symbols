import pg from '../../Server/node_modules/pg/lib/index.js';
import {register,authenticate} from '../../Server/src/services/accounts.mjs';
import {command} from '../../Server/src/services/commands.mjs';
import {randomUUID} from 'node:crypto';
const pool=new pg.Pool({connectionString:'postgres://symbols_test@127.0.0.1:5457/symbols_ui_test'});
const session=await register(pool,'Продавец UI');const user=await authenticate(pool,session.token);
const row=(await pool.query('select data from vaults where profile_id=$1',[session.id])).rows[0];row.data.inventory.sword=2;
await pool.query('update vaults set data=$2 where profile_id=$1',[session.id,row.data]);
await command(pool,user,'sell',{symbol:'sword',quantity:1,price:'100',skin:'classic'},randomUUID());await pool.end();console.log('One synthetic local market offer created.');
