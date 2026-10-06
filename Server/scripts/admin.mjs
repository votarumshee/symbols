import {createPool} from '../src/repositories/db.mjs';
import {config} from '../src/config/env.mjs';
const p=createPool(config());try{
 if(process.argv[2]==='reports')console.log((await p.query("SELECT id,target,reason,status,created FROM reports WHERE status='open' ORDER BY created LIMIT 100")).rows);
 else if(process.argv[2]==='resolve'&&process.argv[3])await p.query("UPDATE reports SET status='resolved' WHERE id=$1",[process.argv[3]]);
 else if(process.argv[2]==='revoke'&&process.argv[3]){await p.query('UPDATE account_sessions SET revoked=now() WHERE profile_id=$1',[process.argv[3]]);await p.query("SELECT pg_notify('symbols_events',$1)",[process.argv[3]]);}
 else throw Error('Usage: admin.mjs reports | resolve REPORT_ID | revoke PROFILE_ID');
}finally{await p.end();}
