import {activeFrame} from './frames.mjs';
import {addMoney} from './money.mjs';
import {trialResult,levelInfo} from './progression.mjs';
import {syncEntitlements} from './entitlements.mjs';

export function member(v){return {id:v.profile_id,nick:v.d.nick,avatar:v.d.avatar??'lion',frame:activeFrame(v.d),level:levelInfo(v.d.xp).level,rank:v.d.rank,skins:v.d.skins??{},upgrades:v.d.upgrades??{},inventory:{...v.d.inventory},bot:false};}

export function roundRubies(won,damage,blocks,roll=Math.random){
 if(won&&damage===0&&blocks>=3)return 5;
 if(won&&damage===0)return roll()<0.5?2:0;
 return (won||blocks>=3)&&roll()<0.35?1:0;
}

export function finish(s,vs,now,method='normal'){
 if(s.awarded)return;
 s.awarded=true;const elapsed=s.started===null?0:now-s.started;s.results={};
 for(let seat=0;seat<s.players.length;seat++){
  const p=s.players[seat];if(p.bot||s.mode==='local'&&seat>0)continue;
  const v=vs.find(v=>v.profile_id===p.id),d=v.d,won=s.g.winner===seat%2;
  const eligible=method==='normal'&&s.started!==null&&s.mode!=='local',q=[];
  d.quests??={};
  if(eligible&&won&&s.damage[seat]===0){d.quests.clean=(d.quests.clean??0)+1;q.push('clean');}
  if(eligible&&s.blocks[seat]>=3){d.quests.blocks=(d.quests.blocks??0)+1;q.push('blocks');}
  const bucks=eligible?roundRubies(won,s.damage[seat],s.blocks[seat]):0;
  addMoney(d,bucks*100);
  let xp=eligible?(won?100:25)+q.length*50:0;
  if(eligible&&['duel','room'].includes(s.mode)&&won&&!s.damage[seat]&&elapsed<=15000)xp=1200;
  if(method==='promo'&&won&&p.id===s.instantWinner)xp=1000;
  d.xp+=xp;syncEntitlements(d);if(s.tutorial||eligible&&s.mode==='play')d.tutorialDone=true;
  let rank=null;if(s.mode==='trial')rank=trialResult(d,won,s.damage[seat],elapsed);
  const record={id:s.id,at:now,mode:s.mode,level:s.level,opponent:s.players.filter((_,i)=>i%2!==seat%2).map(p=>p.nick).join(', '),outcome:won?'win':'loss',elapsed,damage:s.damage[seat],xp,quests:q,method};
  d.history=[record,...d.history.filter(r=>r.id!==s.id)].slice(0,100);
  s.results[p.id]={won,xp,quests:q,rank,elapsed,level:levelInfo(d.xp),bucks};
 }
}
