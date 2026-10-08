import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {one,transaction,lockVaults} from '../repositories/db.mjs';
import {cleanNick} from '../domain/profile.mjs';
import {freshVault} from '../domain/economy.mjs';
import {ApiError,requireValue} from './errors.mjs';
export const hash=s=>createHash('sha256').update(s).digest('hex');
export async function session(c,id){const token=randomBytes(32).toString('hex');await c.query("INSERT INTO account_sessions(token_hash,profile_id,expires) VALUES($1,$2,now()+interval '30 days')",[hash(token),id]);return {id,token,expiresIn:2592000};}
export async function registerInTransaction(c,nick){nick=cleanNick(nick);const id=randomUUID(),d=freshVault(nick);await c.query('INSERT INTO profiles(id,nick) VALUES($1,$2)',[id,nick]);await c.query('INSERT INTO vaults(profile_id,data,balance_cents) VALUES($1,$2,100)',[id,d]);return session(c,id);}
export async function register(pool,nick){return transaction(pool,c=>registerInTransaction(c,nick));}
export async function authenticate(c,token){if(!token||token.length>256)throw new ApiError(401,'UNAUTHORIZED','Нужно войти');const r=await one(c,'SELECT profile_id,token_hash FROM account_sessions WHERE token_hash=$1 AND expires>now() AND revoked IS NULL',[hash(token)]);if(!r)throw new ApiError(401,'UNAUTHORIZED','Сессия недоступна');return r;}
export async function limit(c,key,max,seconds){const r=await one(c,`INSERT INTO recovery_limits(key,count,expires) VALUES($1,1,now()+$2*interval '1 second') ON CONFLICT(key) DO UPDATE SET count=CASE WHEN recovery_limits.expires<now() THEN 1 ELSE recovery_limits.count+1 END,expires=CASE WHEN recovery_limits.expires<now() THEN excluded.expires ELSE recovery_limits.expires END RETURNING count,expires`,[hash(key),seconds]);if(r.count>max){const e=new ApiError(429,'RATE_LIMIT','Слишком много запросов');e.retryAfter=Math.max(1,Math.ceil((r.expires-Date.now())/1000));throw e;}}
export async function recoverInTransaction(c,code){
 code=String(code??'').replace(/\s/g,'');requireValue(/^(?:\d{9}|[a-f0-9]{32})$/.test(code),'Неверный код');
 const r=await one(c,'SELECT profile_id FROM recovery WHERE code_hash=$1 FOR UPDATE',[hash(code)]);requireValue(r,'Код недоступен',401,'UNAUTHORIZED');await c.query('UPDATE account_sessions SET revoked=now() WHERE profile_id=$1 AND revoked IS NULL',[r.profile_id]);await c.query("SELECT pg_notify('symbols_events',$1)",[r.profile_id]);return session(c,r.profile_id);
}
export async function recover(pool,code){return transaction(pool,c=>recoverInTransaction(c,code));}
export async function recoveryCode(c,id){const code=randomBytes(16).toString('hex');await c.query('INSERT INTO recovery VALUES($1,$2) ON CONFLICT(profile_id) DO UPDATE SET code_hash=excluded.code_hash',[id,hash(code)]);return {code};}
export async function eraseAccount(c,id){
 // Same resource order as gameplay/market: arenas, listings, then sorted vaults.
 const arenas=(await c.query('SELECT a.* FROM arenas a JOIN arena_members m ON m.arena_id=a.id WHERE m.profile_id=$1 ORDER BY a.id FOR UPDATE OF a',[id])).rows;
 await c.query("SELECT id FROM listings WHERE seller=$1 ORDER BY id FOR UPDATE",[id]);
 const ids=[...new Set([id,...arenas.flatMap(r=>r.data.players.filter(p=>!p.bot).map(p=>p.id))])];
 const vs=await lockVaults(c,ids),gameIds=arenas.map(r=>r.id);
 for(const v of vs)if(v.profile_id!==id){if(gameIds.includes(v.d.game))v.d.game=null;v.d.history=(v.d.history??[]).filter(h=>!gameIds.includes(h.id));
  await c.query('UPDATE vaults SET data=$2,revision=revision+1,cursor=cursor+1,event_floor=cursor+1 WHERE profile_id=$1',[v.profile_id,v.d]);await c.query('DELETE FROM events WHERE owner=$1',[v.profile_id]);await c.query("SELECT pg_notify('symbols_events',$1)",[v.profile_id]);}
 await c.query('DELETE FROM arenas WHERE id=ANY($1::text[])',[gameIds]);
 await c.query("UPDATE listings SET status='cancelled' WHERE seller=$1 AND status='open'",[id]);
 // Raw imported records are private; erase any archive row containing this identity.
 await c.query("DELETE FROM legacy_rows WHERE position($1 in data::text)>0",[id]);
 await c.query('INSERT INTO avatar_deletions(profile_id) VALUES($1) ON CONFLICT DO NOTHING',[id]);
 await c.query('DELETE FROM profiles WHERE id=$1',[id]);await c.query("SELECT pg_notify('symbols_events',$1)",[id]);return {deleted:true};
}
