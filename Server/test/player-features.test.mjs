import test from 'node:test';
import assert from 'node:assert/strict';
import {freshVault,BASE,PRICES} from '../src/domain/economy.mjs';
import {redeemPromo} from '../src/domain/promo.mjs';
import {matchLevel} from '../src/domain/matchmaking.mjs';
import {startArena,arenaAction,arenaBotMove} from '../src/domain/arena-engine.mjs';
import {finish,roundRubies} from '../src/domain/rewards.mjs';
import {matchView} from '../src/transport/projection.mjs';

test('promo 10 grants all consumables once without granting money or unlimited stock',()=>{
 const d=freshVault('Игрок');d.inventory.sword=4;
 assert.throws(()=>redeemPromo(d,'E'));
 redeemPromo(d,' 10 ');
 for(const t of Object.keys(PRICES))assert.equal(d.inventory[t],t==='sword'?29:25);
 assert.equal(d.balanceCents,100);assert.equal(d.xp,0);
 for(const t of BASE)assert.ok(!(t in d.inventory));
 const saved=structuredClone(d);assert.throws(()=>redeemPromo(d,'10'),e=>e.code==='PROMO_CLAIMED');assert.deepEqual(d,saved);
});

test('matchmaking difficulty follows XP boundaries',()=>{
 for(const [xp,level] of [[0,0],[249,0],[250,1],[999,1],[1000,2],[100000,2]])assert.equal(matchLevel({xp}),level);
});

test('beginner bot uses only basic symbols and can make poor moves',()=>{
 const s={level:0,size:[10,14],players:[{id:'h',inventory:{}},{id:'b',bot:true,inventory:{}}]};
 startArena(s,0);arenaAction(s,{type:'king',index:56},0,1);arenaAction(s,{type:'king',index:56},1,2);
 s.actor=1;const random=Math.random;Math.random=()=>0.99;
 try{const move=arenaBotMove(s);assert.ok(BASE.includes(move.type));assert.equal(move.type,'point');assert.equal(move.dir,7);
  for(const t of Object.keys(PRICES))assert.equal(s.g.playerStocks[1][t],0);
  arenaAction(s,move,1,3);
 }finally{Math.random=random;}
});

test('round ruby tiers and no-drop outcomes',()=>{
 assert.equal(roundRubies(true,0,3,()=>0.99),5);
 assert.equal(roundRubies(true,0,0,()=>0.1),2);assert.equal(roundRubies(true,0,0,()=>0.9),0);
 assert.equal(roundRubies(true,10,0,()=>0.1),1);assert.equal(roundRubies(true,10,0,()=>0.9),0);
 assert.equal(roundRubies(false,10,3,()=>0.1),1);assert.equal(roundRubies(false,10,0,()=>0),0);
});

function finished(mode='play'){
 const d=freshVault('Игрок'),s={id:'g',mode,level:0,size:[10,14],players:[{id:'h',nick:'Игрок',inventory:{}},{id:'b',bot:true,nick:'Бот',inventory:{}}]};
 startArena(s,0);s.started=100;s.status='done';s.finished=20000;s.g.winner=0;s.blocks[0]=3;
 return {d,s,vs:[{profile_id:'h',d}]};
}

test('round result persists winner, XP and five rubies exactly once across retry/restore',()=>{
 const {d,s,vs}=finished();finish(s,vs,20000);
 assert.equal(d.balanceCents,600);assert.equal(d.xp,200);
 assert.equal(s.results.h.bucks,5);assert.equal(s.results.h.won,true);
 assert.equal(matchView(s,'h','1').result.bucks,5);
 const saved=structuredClone(d);finish(JSON.parse(JSON.stringify(s)),vs,30000);assert.deepEqual(d,saved);
});

test('local, abandoned, timed-out and unstarted rounds cannot farm rubies',()=>{
 for(const [mode,method,unstarted] of [['local','normal'],['play','leave'],['play','timeout'],['play','normal',true]]){
  const {d,s,vs}=finished(mode);if(unstarted)s.started=null;finish(s,vs,20000,method);
  assert.equal(d.balanceCents,100);assert.equal(d.xp,0);assert.equal(s.results.h.bucks,0);
 }
});
