import {transaction,one} from '../repositories/db.mjs';
import {tick} from '../services/game.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export async function step(pool,now=Date.now()){return transaction(pool,async c=>{const row=await one(c,'SELECT * FROM arenas WHERE due_at<=$1 ORDER BY due_at FOR UPDATE SKIP LOCKED LIMIT 1',[new Date(now)]);return row?tick(c,row,now):false;});}
export async function maintain(pool){return transaction(pool,async c=>{
 const vs=(await c.query("SELECT profile_id,cursor FROM vaults v WHERE cursor-event_floor>10000 OR EXISTS(SELECT 1 FROM events WHERE owner=v.profile_id AND created<now()-interval '24 hours') ORDER BY profile_id LIMIT 100 FOR UPDATE SKIP LOCKED")).rows;
 for(const v of vs){const removed=await one(c,"WITH removed AS (DELETE FROM events WHERE owner=$1 AND (created<now()-interval '24 hours' OR cursor<$2::bigint-10000) RETURNING cursor) SELECT max(cursor) AS n FROM removed",[v.profile_id,v.cursor]);if(removed.n)await c.query('UPDATE vaults SET event_floor=greatest(event_floor,$2) WHERE profile_id=$1',[v.profile_id,removed.n]);}
 await c.query("DELETE FROM commands WHERE created<now()-interval '7 days'");await c.query('DELETE FROM recovery_limits WHERE expires<now()');await c.query("DELETE FROM account_sessions WHERE expires<now()-interval '7 days'");
 const deletions=(await c.query('SELECT profile_id FROM avatar_deletions ORDER BY created FOR UPDATE SKIP LOCKED LIMIT 100')).rows;
 const root=path.resolve(process.env.AVATAR_ROOT??fileURLToPath(new URL('../../public/avatars',import.meta.url)));
 for(const r of deletions){if(/^[a-f0-9-]{36}$/.test(r.profile_id)){const target=path.resolve(root,r.profile_id);if(!target.startsWith(root+path.sep))throw Error('Invalid avatar path');await fs.rm(target,{recursive:true,force:true});}await c.query('DELETE FROM avatar_deletions WHERE profile_id=$1',[r.profile_id]);}
});}
export function scheduler(pool,log){let stopped=false,timer,running=Promise.resolve(),turn=0;const loop=()=>{running=(async()=>{try{for(let i=0;i<30&&!stopped;i++)if(!await step(pool))break;if(++turn%240===0)await maintain(pool);}catch(e){log.error({code:e.code??'SCHEDULER_ERROR'},'Scheduler step failed');}if(!stopped)timer=setTimeout(loop,250);})();};loop();return async()=>{stopped=true;clearTimeout(timer);await running;};}
