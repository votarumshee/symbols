import {hasSymbol,upgradeInfo,maxUpgrade} from './upgrades.mjs';
import {SKINS,SKIN_SYMBOLS,ownsSkin,skinsFor} from './skins.mjs';
import {syncEntitlements} from './entitlements.mjs';
import {CASES,casePrice,drawCase} from './cases.mjs';
import {unlockedFrames,activeFrame} from './frames.mjs';
import {AVATARS} from './avatars.mjs';
import {parseMoney,normalizeWallet,addMoney} from './money.mjs';
import {BASE,PRICES} from './economy.mjs';
import {TYPES} from './engine.mjs';
import {cleanNick} from './profile.mjs';
import {trialResult,levelInfo} from './progression.mjs';
import {startArena,arenaAction,arenaBotMove} from './arena-engine.mjs';
export function member(v){return {id:v.profile_id,nick:v.d.nick,avatar:v.d.avatar??'lion',frame:activeFrame(v.d),level:levelInfo(v.d.xp).level,rank:v.d.rank,skins:v.d.skins??{},upgrades:v.d.upgrades??{},inventory:{...v.d.inventory},bot:false};}
export function finish(s,vs,now,method='normal'){if(s.awarded)return;s.awarded=true;const elapsed=s.started===null?0:now-s.started;s.results={};for(let seat=0;seat<s.players.length;seat++){const p=s.players[seat];if(p.bot||s.mode==='local'&&seat>0)continue;const v=vs.find(v=>v.profile_id===p.id),d=v.d,won=s.g.winner===seat%2;const eligible=method==='normal'&&s.started!==null&&s.mode!=='local';const q=[];if(eligible&&won&&s.damage[seat]===0&&(s.mode!=='trial'?s.level>=2||s.players.some(p=>!p.bot&&p.id!==v.profile_id):s.level>=2)){addMoney(d,200);d.quests.clean++;q.push('clean');}if(eligible&&s.blocks[seat]>=3){addMoney(d,100);d.quests.blocks++;q.push('blocks');}let xp=eligible?(won?100:25)+q.length*50:0;if(eligible&&['duel','room'].includes(s.mode)&&won&&!s.damage[seat]&&elapsed<=15000)xp=1200;if(method==='promo'&&won&&p.id===s.instantWinner)xp=1000;d.xp+=xp;syncEntitlements(d);if(s.tutorial)d.tutorialDone=true;let rank=null;if(s.mode==='trial')rank=trialResult(d,won,s.damage[seat],elapsed);const record={id:s.id,at:now,mode:s.mode,level:s.level,opponent:s.players.filter((_,i)=>i%2!==seat%2).map(p=>p.nick).join(', '),outcome:won?'win':'loss',elapsed,damage:s.damage[seat],xp,quests:q,method};d.history=[record,...d.history.filter(r=>r.id!==s.id)].slice(0,100);s.results[p.id]={won,xp,quests:q,rank,elapsed,level:levelInfo(d.xp),bucks:q.reduce((n,id)=>n+(id==='clean'?2:1),0)};}}
