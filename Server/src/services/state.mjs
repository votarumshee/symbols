import {one} from '../repositories/db.mjs';
import {profileView,matchView,patch,matchPatch} from '../transport/projection.mjs';
import {requireValue} from './errors.mjs';
export function dueAt(s){if(s.status==='waiting')return s.deadline==null?null:new Date(s.deadline);if(['setup','play'].includes(s.status))return new Date(s.turnAt+(s.players[s.actor].bot?450:90001));return null;}
export async function saveArena(c,s,previous){
 const r=await one(c,`INSERT INTO arenas(id,mode,status,data,revision,updated,due_at,code,size)
 VALUES($1,$2,$3,$4,0,now(),$5,$6,$7) ON CONFLICT(id) DO UPDATE SET
 status=excluded.status,data=excluded.data,revision=arenas.revision+1,updated=now(),due_at=excluded.due_at RETURNING revision`,[s.id,s.mode,s.status,s,dueAt(s),s.code,s.size.join('x')]);
 for(const id of new Set(s.players.filter(p=>!p.bot).map(p=>p.id)))await c.query('INSERT INTO arena_members VALUES($1,$2) ON CONFLICT DO NOTHING',[s.id,id]);
 return {s,revision:r.revision,previous};
}
export async function saveVaults(c,vs,game,commandId,now){
 for(const v of vs){
  requireValue(Number.isSafeInteger(v.d.balanceCents)&&v.d.balanceCents>=0,'Недопустимый баланс');
  requireValue(Object.values(v.d.inventory).every(n=>Number.isSafeInteger(n)&&n>=0),'Недопустимый инвентарь');
  const pp=patch(profileView(v.before),profileView(v.d));
  const belongs=game?.s.players.some(p=>!p.bot&&p.id===v.profile_id);
  if(!Object.keys(pp).length&&!belongs)continue;
  const row=await one(c,'UPDATE vaults SET data=$2,balance_cents=$3,revision=revision+1,cursor=cursor+1 WHERE profile_id=$1 RETURNING revision,cursor',[v.profile_id,v.d,v.d.balanceCents]);
  const oldGame=game?.previous&&game.previous.data.players.some(p=>!p.bot&&p.id===v.profile_id)?matchView(game.previous.data,v.profile_id,game.previous.revision):null;
  const event={eventId:v.profile_id+':'+row.cursor,cursor:row.cursor,type:'state.changed',entityId:belongs?game.s.id:v.profile_id,revision:row.revision,serverTime:new Date(now).toISOString(),...(commandId?{commandId}:{}),profilePatch:pp,...(belongs?{match:matchPatch(oldGame,matchView(game.s,v.profile_id,game.revision))}:{})};
  await c.query('INSERT INTO events(owner,cursor,payload) VALUES($1,$2,$3)',[v.profile_id,row.cursor,event]);
  // NOTIFY is delivered by PostgreSQL only after commit; durable events remain the source of truth.
  await c.query("SELECT pg_notify('symbols_events',$1)",[v.profile_id]);
 }
}
