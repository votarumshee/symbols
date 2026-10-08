import {createPool} from '../src/repositories/db.mjs';
import {config} from '../src/config/env.mjs';
import {register} from '../src/services/accounts.mjs';
if(process.env.NODE_ENV==='production')throw Error('Development only');
const p=createPool(config());try{const a=await register(p,'Тестовый игрок');console.log({id:a.id,note:'Use registration API to create a session; no tokens written to logs.'});}finally{await p.end();}
