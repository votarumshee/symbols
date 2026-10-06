import {randomUUID} from 'node:crypto';
import {transaction,one,lockVaults} from '../repositories/db.mjs';
import {hash,recoveryCode,eraseAccount} from './accounts.mjs';
import {cosmetic} from '../domain/cosmetics.mjs';
import {syncEntitlements} from '../domain/entitlements.mjs';
import {start,move} from './game.mjs';
import {marketCommand} from './market.mjs';
import {saveVaults} from './state.mjs';
import {requireValue,ApiError} from './errors.mjs';
const cosmetics=['upgrade','frame','buy-case','open-case','skin','buy-skin','nickname','avatar','buy-avatar'];
export const commandKinds=[...cosmetics,'start','action','leave','sell','buy','cancel','recovery-code','logout','delete-account','report','block','unblock'];
function canonical(v){if(Array.isArray(v))return v.map(canonical);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])]));return v;}
export async function command(pool,user,kind,b,key,now=Date.now()){
 requireValue(commandKinds.includes(kind),'Неизвестная команда',404);requireValue(typeof key==='string'&&/^[a-zA-Z0-9_-]{8,80}$/.test(key),'Нужен Idempotency-Key');
 requireValue(!('progress' in b)&&!('balance' in b)&&!('balanceCents' in b),'Клиентский прогресс не принимается');
 const digest=hash(JSON.stringify(canonical({kind,b})));
 return transaction(pool,async c=>{
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['command:'+user.profile_id]);
  // Validate session again in the transaction so a concurrent logout/recovery cannot authorize a queued command.
  requireValue(await one(c,'SELECT 1 FROM account_sessions WHERE token_hash=$1 AND revoked IS NULL AND expires>now()',[user.token_hash]),'Сессия недоступна',401,'UNAUTHORIZED');
  const previous=await one(c,'SELECT * FROM commands WHERE owner=$1 AND key=$2',[user.profile_id,key]);
  if(previous){if(previous.request_hash!==digest)throw new ApiError(409,'IDEMPOTENCY_CONFLICT','Ключ уже использован с другими параметрами');return previous.result;}
  const id=user.profile_id;let result;
  if(kind==='start')result=await start(c,id,b,key,now);
  else if(['action','leave'].includes(kind))result=await move(c,id,kind,b,key,now);
  else if(['sell','buy','cancel'].includes(kind))result=await marketCommand(c,id,kind,b,key,now);
  else if(cosmetics.includes(kind)){
   const [v]=await lockVaults(c,[id]);syncEntitlements(v.d);result=cosmetic(v.d,kind,{...b,key:randomUUID()},now);await saveVaults(c,[v],null,key,now);
  }else if(kind==='recovery-code')result=await recoveryCode(c,id);
  else if(kind==='logout'){await c.query('UPDATE account_sessions SET revoked=now() WHERE token_hash=$1',[user.token_hash]);await c.query("SELECT pg_notify('symbols_events',$1)",[id]);result={loggedOut:true};}
  else if(kind==='delete-account'){requireValue(b.confirm===true,'Подтверди удаление');return eraseAccount(c,id);}
  else if(kind==='report'){requireValue(typeof b.reason==='string'&&b.reason.trim().length>=3&&b.reason.length<=500,'Причина: 3–500 символов');requireValue(b.target!==id&&await one(c,'SELECT 1 FROM profiles WHERE id=$1',[b.target]),'Игрок недоступен');const reportId=randomUUID();await c.query('INSERT INTO reports(id,owner,target,reason) VALUES($1,$2,$3,$4)',[reportId,id,b.target,b.reason]);result={reportId};}
  else{requireValue(b.target!==id&&await one(c,'SELECT 1 FROM profiles WHERE id=$1',[b.target]),'Игрок недоступен');await c.query(kind==='block'?'INSERT INTO blocks VALUES($1,$2) ON CONFLICT DO NOTHING':'DELETE FROM blocks WHERE owner=$1 AND target=$2',[id,b.target]);result={blocked:kind==='block'};}
  result={commandId:key,...result};const stored=kind==='recovery-code'?{commandId:key,code:null,regenerate:true}:result;
  await c.query('INSERT INTO commands(owner,key,kind,request_hash,result) VALUES($1,$2,$3,$4,$5)',[id,key,kind,digest,stored]);return result;
 });
}
