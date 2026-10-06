import test from 'node:test';
import assert from 'node:assert/strict';
import * as original from './fixtures/original-engine.mjs';
import * as current from '../src/domain/engine.mjs';
import {catalog,records} from '../src/domain/catalog.mjs';
import {startArena,arenaAction} from '../src/domain/arena-engine.mjs';
import {levelInfo,trialResult} from '../src/domain/progression.mjs';
import {drawCase} from '../src/domain/cases.mjs';
import {matchView,profileView} from '../src/transport/projection.mjs';
test('catalog count, Cyrillic, references and probability totals',()=>{
 assert.equal(catalog.records.length,676);assert.equal(catalog.relations.length,456);
 const keys=new Set(catalog.records.map(r=>r.category+':'+r.key));assert.equal(keys.size,676);
 for(const r of catalog.relations){assert.ok(keys.has(r.category+':'+r.key));assert.ok(keys.has(r.targetCategory+':'+r.targetKey));}
 assert.equal(current.TYPES.inspect.name,'Осмотр');for(const c of records('case')){assert.equal(c.payload.drops.reduce((n,d)=>n+d[1],0),10000);assert.equal(drawCase(c.payload,0),c.payload.drops[0][0]);assert.equal(drawCase(c.payload,.99999999),c.payload.drops.at(-1)[0]);}
});
test('differential original engine: both sizes, controlled randomness and 200 bot moves',()=>{
 const realRandom=Math.random;let state=1;const random=()=>{state=(state*1664525+1013904223)>>>0;return state/4294967296;};
 try{for(const size of [[10,14],[28,20]]){const a=original.createGame(...size),b=current.createGame(...size);Math.random=()=>.4;
  for(let i=0;i<2;i++){const move={type:'king',index:(a.rows-1)*a.width+i};assert.deepEqual(current.action(b,move),original.action(a,move));}
  for(let i=0;i<200&&a.winner===null;i++){state=i+1;Math.random=random;const move=original.botAction(a,2);Math.random=()=>.4;assert.deepEqual(current.action(b,move),original.action(a,move));assert.deepEqual(b,a);}
 }}finally{Math.random=realRandom;}
});
test('team kings, public view and trial strict time',()=>{
 const s={id:'g',mode:'team',size:[10,14],players:Array.from({length:4},(_,i)=>({id:String(i),nick:'Тест',inventory:{sword:4},bot:false,upgrades:{}}))};
 startArena(s,100);for(let i=0;i<4;i++)arenaAction(s,{type:'king',index:56+Math.floor(i/2)},i,100);
 assert.equal(s.status,'play');assert.equal(s.g.kingHp.length,4);const view=matchView(s,'0','3');assert.ok(!('inventory' in view.players[1]));assert.ok(!('playerStocks' in view.board));assert.ok(!('results' in view));assert.deepEqual(view.seats,[0]);
 assert.equal(levelInfo(260).level,2);const p={rank:{index:14},rankProgress:0,trialRun:[]};trialResult(p,true,0,10000);assert.equal(p.rank.index,13);
});
test('client projection: authoritative level above 300 and allowlisted visual traces',()=>{
 const xp=1_000_000_000;
 const profile=profileView({xp,balanceCents:123456,secret:'private'});
 assert.deepEqual(profile.level,levelInfo(xp));assert.ok(profile.level.level>300);assert.equal(profile.balanceCents,'123456');assert.ok(!('secret' in profile));
 const s={id:'tutorial',mode:'play',tutorial:true,size:[10,14],players:[{id:'u',nick:'Игрок',inventory:{},upgrades:{}},{id:'b',nick:'Бот',bot:true,inventory:{},upgrades:{}}]};
 startArena(s,100);
 s.events=[{projectile:'arrow',private:'hidden',path:[{side:0,index:56,private:'hidden'}],impacts:[]}];
 const view=matchView(s,'u','1');
 assert.equal(view.advice.move.type,'king');assert.equal(view.advice.move.index,63);
 assert.deepEqual(view.effects,[{projectile:'arrow',path:[{side:0,index:56}],impacts:[]}]);
 assert.deepEqual(s.g.allowed,[[],[]]);
});
