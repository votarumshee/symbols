import {upgradeInfo} from '../dist/upgrades.mjs';
import {createGame,action,botAction,TYPES} from '../dist/engine.mjs';
import {BASE,PRICES} from '../dist/economy.mjs';
export function startArena(s,now){const count=s.players.length,g=createGame(...s.size);s.sharedUses=true;s.usedSymbols=s.players.map(()=>({}));g.multi=true;g.setup=2;g.kingBase=s.players.map(p=>p.bot?100:upgradeInfo(p,'king').value);g.kingHp=[...g.kingBase];g.kingMax=[...g.kingBase];g.hp=[0,1].map(side=>g.kingHp.reduce((sum,h,i)=>sum+(i%2===side?h:0),0));g.maxHp=[...g.hp];g.current=0;g.actor=0;g.allowed=[[],[]];g.playerStocks=s.players.map(p=>Object.fromEntries(Object.entries(TYPES).filter(([,v])=>Number.isFinite(v.stock)).map(([t,v])=>[t,p.bot?v.stock:(p.inventory[t]>0?upgradeInfo(p,t).value:0)])));s.g=g;s.setupSeat=0;s.actor=0;s.status='setup';s.started=null;s.created=now;s.turnAt=now;s.damage=Array(count).fill(0);s.blocks=Array(count).fill(0);s.events=[];s.result=null;return s;}
export function arenaAction(s,a,seat,now){if(s.status==='done')throw Error('Партия завершена');if(seat!==s.actor)throw Error('Сейчас ход другого игрока');const g=s.g,p=seat%2;
 if(s.status==='setup'){if(a.type!=='king'||!Number.isInteger(a.index)||a.index<(g.rows-1)*g.width||a.index>=g.rows*g.width||g.boards[p][a.index])throw Error('Выбери свободную клетку крайнего ряда');g.boards[p][a.index]={type:'king',seat,dir:0};s.setupSeat++;if(s.setupSeat===s.players.length){s.status='play';s.actor=0;s.started=now;g.current=0;}else s.actor=s.setupSeat;s.turnAt=now;return {events:[],consumed:null};}
 g.current=p;g.actor=seat;g.stocks[p]=g.playerStocks[seat];g.allowed[p]=s.players[seat].bot?Object.keys(TYPES):[...BASE,...Object.keys(PRICES).filter(t=>(s.players[seat].inventory[t]??0)>0||s.usedSymbols?.[seat]?.[t])];
 if(['erase','teleport'].includes(a.type)){const piece=g.boards[p][a.type==='teleport'?a.source:a.index];if(piece?.seat!==undefined&&piece.seat!==seat)throw Error('Можно удалить или перенести только свой символ');}
 const kings=new Map();g.boards.forEach((board,side)=>board.forEach((t,i)=>{if(t?.type==='king')kings.set(side+':'+i,t.seat);}));
 const type=a.type,prior=g.stocks[p][type],hp=[...g.kingHp];const result=action(g,a);let consumed=null;
 if(type in PRICES&&g.stocks[p][type]<prior){if(!s.sharedUses||!s.usedSymbols[seat][type]){consumed=type;if(!s.players[seat].bot)s.players[seat].inventory[type]--;if(s.sharedUses)s.usedSymbols[seat][type]=true;}}
 const direct=Array(hp.length).fill(0);for(const e of result.events)for(const impact of e.impacts??[])if(impact.kind==='king'){const owner=kings.get(impact.side+':'+impact.index);if(owner!==undefined)direct[owner]+=impact.damage;}for(let i=0;i<hp.length;i++)s.damage[i]+=Math.max(direct[i],hp[i]-g.kingHp[i],0);
 for(const e of result.events){const shooter=e.actor??(1-p);for(const c of e.impacts??[])if(c.kind==='destroyed'&&c.side!==shooter%2&&['smile','circle','feedback','electricity'].includes(c.symbol))s.blocks[shooter]++;}
 s.events=result.events;s.turnAt=now;
 if(g.winner!==null){s.status='done';s.finished=now;return {...result,consumed};}
 if(g.kingHp[seat]<=0||!result.free&&!result.angry&&!result.cancelled&&!g.extra){for(let n=1;n<=s.players.length;n++){const next=(seat+n)%s.players.length;if(g.kingHp[next]>0){s.actor=next;break;}}}
 g.current=s.actor%2;return {...result,consumed};}
export function arenaBotMove(s){const seat=s.actor,p=seat%2,g=s.g;
 if(s.status==='setup'){const free=[];for(let i=(g.rows-1)*g.width;i<g.rows*g.width;i++)if(!g.boards[p][i])free.push(i);return {type:'king',index:free[Math.floor(Math.random()*free.length)]};}
 g.current=p;g.stocks[p]=g.playerStocks[seat];g.allowed[p]=Object.keys(TYPES);const move=botAction(g,s.level??2);if(move.type==='erase'&&g.boards[p][move.index]?.seat!==seat){const own=g.boards[p].findIndex(t=>t&&t.type!=='king'&&t.seat===seat);if(own>=0)move.index=own;}return move;}
