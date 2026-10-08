import {transaction,one} from '../repositories/db.mjs';
import {profileView,matchView} from '../transport/projection.mjs';
import {contentVersion} from '../domain/catalog.mjs';
import {ApiError,requireValue} from './errors.mjs';
export async function snapshot(pool,id){return transaction(pool,async c=>{
 const v=await one(c,'SELECT * FROM vaults WHERE profile_id=$1',[id]);requireValue(v,'Аккаунт недоступен',401);
 const a=v.data.game?await one(c,'SELECT * FROM arenas WHERE id=$1',[v.data.game]):null;
 return {apiVersion:3,contentVersion,serverTime:new Date().toISOString(),cursor:v.cursor,revision:v.revision,profile:profileView(v.data),match:a?matchView(a.data,id,a.revision):null};
},{readOnly:true});}
export async function changes(pool,id,cursor,tokenHash=null){
 requireValue(typeof cursor==='string'&&/^\d{1,19}$/.test(cursor)&&BigInt(cursor)<=9223372036854775807n,'Неверный cursor');
 // A single statement has one MVCC snapshot; counters and events cannot race.
 const v=await one(pool,`SELECT v.cursor,v.event_floor,
 coalesce((SELECT jsonb_agg(e.payload ORDER BY e.cursor) FROM
 (SELECT cursor,payload FROM events WHERE owner=v.profile_id AND cursor>$2 ORDER BY cursor LIMIT 100) e),'[]') AS events
 FROM vaults v WHERE profile_id=$1 AND ($3::text IS NULL OR EXISTS(
 SELECT 1 FROM account_sessions WHERE token_hash=$3 AND profile_id=v.profile_id AND revoked IS NULL AND expires>now()))`,[id,cursor,tokenHash]);
 requireValue(v,'Аккаунт недоступен',401,'UNAUTHORIZED');
  if(BigInt(cursor)<BigInt(v.event_floor)||BigInt(cursor)>BigInt(v.cursor))throw new ApiError(409,'SNAPSHOT_REQUIRED','Нужен новый снимок');
  const events=v.events;
  return {events,cursor:events.at(-1)?.cursor??cursor,hasMore:events.length===100};
}
