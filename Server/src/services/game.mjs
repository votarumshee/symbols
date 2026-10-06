import {randomUUID} from 'node:crypto';
import {one,lockVaults} from '../repositories/db.mjs';
import {member,finish} from '../domain/rewards.mjs';
import {startArena,arenaAction,arenaBotMove} from '../domain/arena-engine.mjs';
import {PRICES} from '../domain/economy.mjs';
import {saveArena,saveVaults} from './state.mjs';
import {conflict,requireValue} from './errors.mjs';
const bot=n=>({id:'bot-'+randomUUID(),nick:'Бот '+n,bot:true,inventory:{}});
const humans=s=>s.players.filter(p=>!p.bot).map(p=>p.id);
async function blocked(c,id,others){return !!await one(c,'SELECT 1 FROM blocks WHERE (owner=$1 AND target=ANY($2::text[])) OR (target=$1 AND owner=ANY($2::text[])) LIMIT 1',[id,others]);}
export async function start(c,id,b,commandId,now){
 const mode=b.mode??'play',size=b.small?[10,14]:[28,20],capacity=mode==='team'?4:2;
 requireValue(['play','duel','team','trial','local','room'].includes(mode),'Неизвестный режим');
 // One short matchmaking transaction per mode/size, never held while waiting for opponents.
 await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['queue:'+mode+':'+size]);
 const current=await one(c,'SELECT data FROM vaults WHERE profile_id=$1',[id]);
 if(current.data.game){const old=await one(c,'SELECT id,status FROM arenas WHERE id=$1',[current.data.game]);if(old&&old.status!=='done')return {matchId:old.id};}
 let row=null;
 if(mode==='room'&&b.code){row=await one(c,"SELECT * FROM arenas WHERE mode='room' AND status='waiting' AND code=$1 FOR UPDATE",[String(b.code).trim().toUpperCase()]);requireValue(row,'Комната не найдена',404);requireValue(!await blocked(c,id,humans(row.data)),'Взаимодействие недоступно',403);}
 else if(!['trial','local','room'].includes(mode)&&!(mode==='play'&&!current.data.tutorialDone)){
  const candidates=(await c.query("SELECT * FROM arenas WHERE mode=$1 AND size=$2 AND status='waiting' ORDER BY updated LIMIT 30 FOR UPDATE",[mode,size.join('x')])).rows;
  for(const candidate of candidates)if(candidate.data.deadline>now&&candidate.data.players.length<capacity&&!await blocked(c,id,humans(candidate.data))){row=candidate;break;}
 }
 const vs=await lockVaults(c,[id,...(row?humans(row.data):[])]),v=vs.find(v=>v.profile_id===id);
 // Recheck after account lock: a simultaneous start in another mode may already have won.
 if(v.d.game){const old=await one(c,'SELECT id,status FROM arenas WHERE id=$1',[v.d.game]);if(old&&old.status!=='done')return {matchId:old.id};}
 let s;
 if(row){s=structuredClone(row.data);requireValue(!s.players.some(p=>p.id===id),'Ты уже в комнате');s.players.push(member(v));v.d.game=s.id;if(s.players.length===s.capacity)startArena(s,now);}
 else{s={id:randomUUID(),mode,size,capacity,players:[member(v)],status:'waiting',created:now,deadline:mode==='room'?null:now+8000,code:mode==='room'?randomUUID().replaceAll('-','').slice(0,6).toUpperCase():null,tutorial:mode==='play'&&!v.d.tutorialDone,level:mode==='trial'?(v.d.trialRun?.length??0):2,events:[],started:null};v.d.game=s.id;
  if(s.tutorial){s.level=0;s.players.push(bot(2));startArena(s,now);}
  if(mode==='trial'){s.players.push(bot(2));startArena(s,now);}
  if(mode==='local'){s.players.push({...member(v),nick:'Игрок 2'});startArena(s,now);}
 }
 const saved=await saveArena(c,s,row);await saveVaults(c,vs,saved,commandId,now);return {matchId:s.id,revision:saved.revision};
}
export async function move(c,id,kind,b,commandId,now){
 const row=await one(c,'SELECT * FROM arenas WHERE id=$1 FOR UPDATE',[b.matchId]);
 requireValue(row&&humans(row.data).includes(id),'Партия недоступна',404);
 if(String(b.revision)!==row.revision)throw conflict();
 requireValue(row.status!=='done','Партия завершена',409);
 const s=structuredClone(row.data),vs=await lockVaults(c,humans(s)),v=vs.find(v=>v.profile_id===id),seat=s.players.findIndex(p=>p.id===id);let method='normal';
 if(kind==='leave'){
  if(s.status==='waiting'){s.players=s.players.filter(p=>p.id!==id);v.d.game=null;if(!s.players.length){s.status='done';s.deadline=null;}}
  else{s.g.winner=1-seat%2;s.status='done';s.finished=now;method='leave';}
 }else{
  requireValue(['setup','play'].includes(s.status),'Дождись начала партии',409);
  if(now>s.turnAt+90000&&!s.players[s.actor].bot)throw conflict('Время хода истекло');
  const actor=s.mode==='local'?s.actor:seat,t=b.action?.type;
  requireValue(b.action&&typeof t==='string','Действие обязательно');
  requireValue(!(t in PRICES)||v.d.inventory[t]>0||s.usedSymbols?.[actor]?.[t],'Этот символ закончился');
  const r=arenaAction(s,b.action,actor,now);if(r.consumed){v.d.inventory[r.consumed]--;if(s.mode==='local')s.players.forEach(p=>p.inventory={...v.d.inventory});}
 }
 if(s.status==='done'&&s.g)finish(s,vs,now,method);
 const saved=await saveArena(c,s,row);await saveVaults(c,vs,saved,commandId,now);return {matchId:s.id,revision:saved.revision};
}
export async function tick(c,row,now){
 const s=structuredClone(row.data),vs=await lockVaults(c,humans(s));let changed=false;
 if(s.status==='waiting'&&s.deadline!=null&&now>=s.deadline){while(s.players.length<s.capacity)s.players.push(bot(s.players.length+1));startArena(s,now);changed=true;}
 else if(['setup','play'].includes(s.status)){
  const actor=s.players[s.actor];
  if(actor.bot&&now-s.turnAt>=450){try{arenaAction(s,arenaBotMove(s),s.actor,now);}catch{const i=s.g.boards[s.actor%2].findIndex(t=>!t);if(i>=0)arenaAction(s,{type:'smile',index:i},s.actor,now);else{s.g.winner=1-s.actor%2;s.status='done';s.finished=now;}}changed=true;}
  else if(!actor.bot&&now-s.turnAt>90000){s.g.winner=1-s.actor%2;s.status='done';s.finished=now;s.reason='Время на ход вышло';changed=true;}
 }
 if(changed){if(s.status==='done')finish(s,vs,now,s.reason?'timeout':'normal');const saved=await saveArena(c,s,row);await saveVaults(c,vs,saved,null,now);}
 return changed;
}
