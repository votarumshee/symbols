import {v2} from './v2.mjs';
import {recordMatch} from '../dist/history.mjs';
import {createGame,action,TYPES} from '../dist/engine.mjs';
import {settle,freshProgress,validateProgress,BASE,mergeOnlineEarnings} from '../dist/economy.mjs';
import {cleanNick} from '../dist/profile.mjs';
import {assets} from './assets.mjs';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const uid=()=>crypto.randomUUID();
const hash=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(b=>b.toString(16).padStart(2,'0')).join('');
const profile=async(db,id)=>db.prepare('SELECT * FROM profiles WHERE id=?').bind(id).first();
const match=async(db,id)=>db.prepare('SELECT * FROM matches WHERE id=?').bind(id).first();
const makeGame=(state)=>{const [h,w]=state.size;const g=createGame(h,w);g.allowed=state.players.map(p=>p.unlocked);for(let p=0;p<2;p++)for(const t of Object.keys(g.stocks[p]))if(!g.allowed[p].includes(t))g.stocks[p][t]=0;return g;};
function publicPlayer(p){const d=JSON.parse(p.data);return {id:p.id,nick:p.nick,rank:d.rank??null,unlocked:d.human.unlocked};}
async function change(db,m,s,status=m.status){const updated=await db.prepare('UPDATE matches SET state=?,status=?,revision=revision+1,updated=? WHERE id=? AND revision=? RETURNING *').bind(JSON.stringify(s),status,Date.now(),m.id,m.revision).first();return updated??await match(db,m.id);}
async function settleMatch(db,m,s,events,winner,receipt){const people=await Promise.all([profile(db,m.p0),profile(db,m.p1)]);const statements=[db.prepare('UPDATE matches SET state=?,status=?,revision=revision+1,updated=? WHERE id=? AND revision=?').bind(JSON.stringify(s),winner===null?m.status:'done',Date.now(),m.id,m.revision)];for(let p=0;p<2;p++){const person=people[p],data=JSON.parse(person.data);const ownEvents=events.map(e=>({...e,rewards:(e.rewards??[]).filter(r=>r.owner===p).map(r=>({...r,owner:0}))}));const paid=settle(data,{id:receipt,mode:'online',events:ownEvents});if(winner!==null)recordMatch(data,{id:m.id,at:Date.now(),mode:'online',opponent:s.players[1-p].nick,outcome:winner===p?'win':'loss',turns:s.g?.turn??0,hp:s.g?.hp?.[p]??0,method:'normal'});data.onlineCounts??={arrow:0,smile:0};for(const award of paid)data.onlineCounts[award.quest]=(data.onlineCounts[award.quest]??0)+1;statements.push(db.prepare('UPDATE profiles SET data=? WHERE id=? AND EXISTS(SELECT 1 FROM matches WHERE id=? AND revision=? AND json_extract(state,\'$.receipt\')=?)').bind(JSON.stringify(data),person.id,m.id,m.revision+1,receipt));}await db.batch(statements);return match(db,m.id);}
async function advance(db,m){if(!m||!m.p1||m.status==='done')return m;let s=JSON.parse(m.state);const now=Date.now();if(m.status==='warmup'&&now>=s.warmupEnd){s.g=makeGame(s);s.events=[];s.phase='play';m=await change(db,m,s,'play');s=JSON.parse(m.state);}if(m.status==='play'||m.status==='warmup'){const [a,b]=await Promise.all([profile(db,m.p0),profile(db,m.p1)]);const stale=[now-a.seen>=30000,now-b.seen>=30000];if(stale.some(Boolean)){s.g??=makeGame(s);s.g.winner=stale[0]?1:0;s.reason='Соперник не вернулся за 30 секунд';s.receipt=m.id+':disconnect';m=await settleMatch(db,m,s,[],s.g.winner,s.receipt);}}return m;}
async function reply(db,me,m){m=await advance(db,m);const fresh=await profile(db,me.id);const total=await db.prepare('SELECT count(*) AS n FROM profiles WHERE seen>?').bind(Date.now()-12000).first();if(!m)return {profile:JSON.parse(fresh.data),nick:fresh.nick,online:total.n,match:null};const s=JSON.parse(m.state),seat=m.p0===me.id?0:1;let reconnect=null;if(m.p1&&['play','warmup'].includes(m.status)){const other=await profile(db,seat===0?m.p1:m.p0);if(Date.now()-other.seen>6000)reconnect=Math.max(0,Math.ceil((30000-(Date.now()-other.seen))/1000));}return {profile:JSON.parse(fresh.data),nick:fresh.nick,online:total.n,serverNow:Date.now(),match:{id:m.id,code:m.code,kind:m.kind,status:m.status,revision:m.revision,seat,state:s,reconnect}};}
export default {async fetch(request,env){const url=new URL(request.url);if(/^\/avatars\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.jpg$/.test(url.pathname)){try{const file=await env.AVATARS?.get(url.pathname.slice(1));return file?new Response(file.body,{headers:{'Content-Type':'image/jpeg','Cache-Control':'public,max-age=31536000,immutable','X-Content-Type-Options':'nosniff'}}):new Response('Not found',{status:404});}catch{return new Response('Image unavailable',{status:503});}}if(!url.pathname.startsWith('/api/')){const asset=assets[url.pathname==='/'?'/index.html':url.pathname];return asset?new Response(asset.binary?Uint8Array.from(atob(asset.body),c=>c.charCodeAt(0)):asset.body,{headers:{'Content-Type':asset.type,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'}}):new Response('Not found',{status:404});}
 try{
 if(request.method!=='POST')return json({error:'Method not allowed'},405);if(request.headers.get('Origin')&&request.headers.get('Origin')!==url.origin)return json({error:'Origin mismatch'},403);
 if(Number(request.headers.get('Content-Length')||0)>100000)return json({error:'Request too large'},413);
 const db=env.DB,b=await request.json(),route=url.pathname.slice(5),now=Date.now();
 if(route==='recover'){
 const limitKey=await hash('recover:'+ (request.headers.get('CF-Connecting-IP')||'unknown'));
 const limit=await db.prepare('INSERT INTO recovery_limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires<? THEN 1 ELSE count+1 END, expires=CASE WHEN expires<? THEN excluded.expires ELSE expires END RETURNING count').bind(limitKey,now+900000,now,now).first();
 if(limit.count>5)return json({error:'Слишком много попыток. Подожди 15 минут.'},429);
 const code=String(b.code??'').replace(/\s/g,'');if(!/^\d{9}$/.test(code))throw Error('Введи 9 цифр кода');
 const entry=await db.prepare('SELECT * FROM recovery WHERE code_hash=?').bind(await hash(code)).first();if(!entry)throw Error('Код не найден. Проверь цифры');
 const person=await profile(db,entry.profile_id);const token=uid()+uid();await db.batch([db.prepare('INSERT INTO account_sessions(token_hash,profile_id,created) VALUES(?,?,?)').bind(await hash(token),person.id,now),db.prepare('UPDATE profiles SET seen=? WHERE id=?').bind(now,person.id)]);return json({id:person.id,token,profile:JSON.parse(person.data)});
 }
 if(route==='register'){const nick=cleanNick(b.nick);const data=freshProgress();data.newEconomy=true;data.nick=nick;const id=uid(),token=uid()+uid();await db.prepare('INSERT INTO profiles(id,token_hash,nick,data,seen) VALUES(?,?,?,?,?)').bind(id,await hash(token),nick,JSON.stringify(data),now).run();return json({id,token,profile:data});}
 const token=request.headers.get('Authorization')?.replace(/^Bearer /,'');if(!token)return json({error:'Нужно войти в игру'},401);const tokenHash=await hash(token);let me=await db.prepare('SELECT * FROM profiles WHERE token_hash=? OR id IN (SELECT profile_id FROM account_sessions WHERE token_hash=?)').bind(tokenHash,tokenHash).first();if(!me)return json({error:'Сессия не найдена'},401);
 if(route==='avatar-upload')throw Error('Загрузка аватарок отключена');
 if(route.startsWith('v2/')){await db.prepare('UPDATE profiles SET seen=? WHERE id=?').bind(now,me.id).run();return json(await v2(db,me,route.slice(3),{...b,avatarStored:false},now));}
 let m=me.match_id?await match(db,me.match_id):null;
 // Check the old timestamp first; returning after the grace period must not revive a lost duel.
 m=await advance(db,m);
 await db.prepare('UPDATE profiles SET seen=? WHERE id=?').bind(now,me.id).run();
 if(route==='recovery-code'){
 if(m&&m.status!=='done')throw Error('Сначала заверши онлайн-дуэль');
 const d=mergeOnlineEarnings(validateProgress(b.progress),JSON.parse(me.data));d.nick=cleanNick(b.nick);if(JSON.parse(me.data).newEconomy)d.newEconomy=true;
 const existing=await db.prepare('SELECT * FROM recovery WHERE profile_id=?').bind(me.id).first();
 const cached=String(b.code??'');let code=existing&&await hash(cached)===existing.code_hash?cached:null;
 if(!code){for(let i=0;i<10;i++){const n=crypto.getRandomValues(new Uint32Array(1))[0];if(n>=3600000000)continue;const candidate=String(100000000+n%900000000);if(!await db.prepare('SELECT profile_id FROM recovery WHERE code_hash=?').bind(await hash(candidate)).first()){code=candidate;break;}}if(!code)throw Error('Не удалось создать код. Попробуй ещё раз');}
 await db.batch([db.prepare('INSERT INTO recovery(profile_id,code_hash) VALUES(?,?) ON CONFLICT(profile_id) DO UPDATE SET code_hash=excluded.code_hash').bind(me.id,await hash(code)),db.prepare('UPDATE profiles SET data=?,nick=? WHERE id=?').bind(JSON.stringify(d),d.nick,me.id)]);return json({code});
 }
 if(route==='sync'){if(m&&m.status!=='done')return json({error:'Сначала заверши онлайн-дуэль'},409);const d=mergeOnlineEarnings(validateProgress(b.progress),JSON.parse(me.data));d.nick=cleanNick(b.nick);if(JSON.parse(me.data).newEconomy)d.newEconomy=true;await db.prepare('UPDATE profiles SET data=?,nick=? WHERE id=?').bind(JSON.stringify(d),d.nick,me.id).run();return json(await reply(db,me,m));}
 if(route==='nickname'){const nick=cleanNick(b.nick),d=JSON.parse(me.data);d.nick=nick;await db.prepare('UPDATE profiles SET nick=?,data=? WHERE id=?').bind(nick,JSON.stringify(d),me.id).run();return json({nick});}
 if(route==='poll')return json(await reply(db,me,m));
 if(route==='leave'){if(m&&m.status!=='done'){const s=JSON.parse(m.state);if(m.p1){s.g??=makeGame(s);s.g.winner=m.p0===me.id?1:0;s.reason='Соперник вышел';s.receipt=m.id+':leave';await settleMatch(db,m,s,[],s.g.winner,s.receipt);}else await change(db,m,s,'done');}await db.prepare('UPDATE profiles SET match_id=NULL WHERE id=?').bind(me.id).run();return json(await reply(db,me,null));}
 if(route==='create'||route==='queue'||route==='join'){
  if(m&&m.status!=='done')return json(await reply(db,me,m));
  if(route!=='create'){
   let waiting;if(route==='join'){const code=String(b.code??'').toUpperCase();if(!/^[A-Z0-9]{6}$/.test(code))throw Error('Код комнаты состоит из 6 символов');waiting=await db.prepare("SELECT * FROM matches WHERE code=? AND status='waiting' AND p1 IS NULL").bind(code).first();}
   else waiting=await db.prepare("SELECT m.* FROM matches m JOIN profiles p ON p.id=m.p0 WHERE m.kind='random' AND m.status='waiting' AND m.p1 IS NULL AND m.p0<>? AND m.p0<>? AND p.seen>? ORDER BY m.updated LIMIT 1").bind(me.id,me.last_opponent??'',now-12000).first();
   if(waiting){const host=await profile(db,waiting.p0);if(now-host.seen>30000)throw Error('Создатель комнаты сейчас не в сети');let s=JSON.parse(waiting.state);s.players=[publicPlayer(host),publicPlayer(me)];s.choices=[null,null];s.round=0;if(waiting.kind==='room'){s.warmupEnd=now+30000;s.g=makeGame(s);}const joined=await db.prepare("UPDATE matches SET p1=?,state=?,status=?,revision=revision+1,updated=? WHERE id=? AND status='waiting' AND p1 IS NULL RETURNING *").bind(me.id,JSON.stringify(s),waiting.kind==='room'?'warmup':'negotiate',now,waiting.id).first();if(!joined)throw Error('Соперник уже найден другим игроком. Повтори поиск.');await db.prepare('UPDATE profiles SET match_id=? WHERE id=?').bind(joined.id,me.id).run();return json(await reply(db,me,joined));}
   if(route==='join')throw Error('Комната не найдена или уже занята');
  }
  const size=b.size??[28,20];createGame(...size);const id=uid(),code=route==='create'?uid().replaceAll('-','').slice(0,6).toUpperCase():null;const s={size,players:[publicPlayer(me)],choices:[null,null],round:0,g:null,events:[]};await db.batch([db.prepare('INSERT INTO matches(id,code,kind,status,p0,state,updated) VALUES(?,?,?,?,?,?,?)').bind(id,code,route==='create'?'room':'random','waiting',me.id,JSON.stringify(s),now),db.prepare('UPDATE profiles SET match_id=? WHERE id=?').bind(id,me.id)]);return json(await reply(db,me,await match(db,id)));
 }
 if(!m||![m.p0,m.p1].includes(me.id))throw Error('Дуэль не найдена');const seat=m.p0===me.id?0:1,s=JSON.parse(m.state);
 if(route==='size'){
  createGame(...b.size);
  for(let attempt=0;attempt<4;attempt++){
   if(m.status!=='negotiate')return json(await reply(db,me,m));const v=JSON.parse(m.state);v.choices[seat]=b.size;let status='negotiate';
   if(v.choices.every(Boolean)){if(JSON.stringify(v.choices[0])===JSON.stringify(v.choices[1])){v.size=v.choices[0];v.warmupEnd=now+30000;v.g=makeGame(v);status='warmup';}else if(v.round===0){v.round=1;v.previous=v.choices;v.choices=[null,null];}else{v.rematch=true;status='done';}}
   const saved=await db.prepare('UPDATE matches SET state=?,status=?,revision=revision+1,updated=? WHERE id=? AND revision=? RETURNING *').bind(JSON.stringify(v),status,now,m.id,m.revision).first();
   if(saved){if(v.rematch)await db.batch([db.prepare('UPDATE profiles SET last_opponent=? WHERE id=?').bind(m.p1,m.p0),db.prepare('UPDATE profiles SET last_opponent=? WHERE id=?').bind(m.p0,m.p1)]);return json(await reply(db,me,saved));}m=await match(db,m.id);
  }
  throw Error('Выбор обновился. Попробуй ещё раз.');
 }
 if(route==='action'){
  if(!['play','warmup'].includes(m.status))return json(await reply(db,me,m));if(b.revision!==m.revision)return json(await reply(db,me,m));if(s.g.current!==seat)throw Error('Сейчас ход соперника');
  const result=action(s.g,b.action);s.events=result.events;s.lastResult={cancelled:!!result.cancelled,free:!!result.free};s.receipt=m.id+':'+m.revision+':'+uid();
  if(m.status==='warmup'){if(s.g.winner!==null)s.g=makeGame(s);m=await change(db,m,s);}else m=await settleMatch(db,m,s,result.events,s.g.winner,s.receipt);
  return json(await reply(db,me,m));
 }
 return json({error:'Неизвестное действие'},404);
 }catch(e){console.error('Symbols API:',e.message);return json({error:e.message?.includes('D1')?'Сервер временно недоступен. Попробуй ещё раз.':e.message||'Ошибка сервера'},400);}
}};
