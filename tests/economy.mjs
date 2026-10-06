import assert from 'node:assert/strict';
import {freshProgress,validateProgress,purchase,settle,botShopping,BASE,PRICES} from '../dist/economy.mjs';
import {createGame,action,shot,botAction} from '../dist/engine.mjs';
let p=freshProgress();assert.equal(p.human.balance,1);assert.deepEqual(p.human.unlocked,BASE);assert.equal(validateProgress(JSON.parse(JSON.stringify(p))).human.balance,1);
assert.throws(()=>purchase(p,'tank'));assert.equal(p.human.balance,1);
const reward=(owner,quest)=>({rewards:[{owner,quest}]});
settle(p,{id:'hit',mode:'bot',events:[reward(0,'arrow'),reward(1,'arrow')]});assert.equal(p.human.balance,6);assert.equal(p.bot.balance,5);
settle(p,{id:'hit',mode:'bot',events:[reward(0,'arrow')]});assert.equal(p.human.balance,6);
settle(p,{id:'hit2',mode:'bot',events:[reward(0,'arrow')]});assert.equal(p.human.balance,11);purchase(p,'circle');assert.equal(p.human.balance,1);assert.ok(p.human.unlocked.includes('circle'));assert.throws(()=>purchase(p,'circle'));
settle(p,{id:'local',mode:'local',events:[reward(0,'smile'),reward(1,'smile')]});assert.equal(p.human.balance,21);assert.equal(p.bot.balance,5);
for(let i=0;i<5;i++)settle(p,{id:'localwin'+i,mode:'local',winner:0});assert.equal(p.human.balance,21);assert.equal(p.human.streak,0);
for(let i=0;i<10;i++)settle(p,{id:'botwin'+i,mode:'bot',winner:0});assert.equal(p.human.balance,121);assert.equal(p.human.streak,0);assert.equal(p.human.counts.streak,2);
for(let i=0;i<4;i++)settle(p,{id:'streak'+i,mode:'bot',winner:0});assert.equal(p.human.streak,4);settle(p,{id:'loss',mode:'bot',winner:1});assert.equal(p.human.streak,0);assert.equal(p.bot.streak,1);
const reloaded=validateProgress(JSON.parse(JSON.stringify(p)));assert.equal(reloaded.human.balance,121);assert.ok(reloaded.human.unlocked.includes('circle'));assert.equal(reloaded.bot.streak,1);
p=freshProgress();p.human.balance=1000;for(const [t,price] of Object.entries(PRICES)){const before=p.human.balance;purchase(p,t);assert.equal(p.human.balance,before-price);}assert.equal(p.human.unlocked.length,12);
p=freshProgress();p.bot.balance=30;botShopping(p);assert.equal(p.bot.balance,0);assert.ok(p.bot.unlocked.includes('circle')&&p.bot.unlocked.includes('inspect'));assert.equal(p.human.balance,1);
for(const [h,w] of [[28,20],[10,14]]){
 let g=createGame(h,w);g.setup=2;const last=(g.rows-1)*w;g.boards[0][last+6]={type:'king'};g.boards[1][last+6]={type:'king'};g.boards[0][w+6]={type:'arrow',dir:0};assert.deepEqual(shot(g,{player:0,index:w+6}).rewards,[{owner:0,quest:'arrow'}]);
 g.boards[1][2*w+6]={type:'smile'};assert.deepEqual(shot(g,{player:0,index:w+6}).rewards,[]);g.boards[0][w+5]={type:'point',dir:2};assert.deepEqual(shot(g,{player:0,index:w+6}).rewards,[{owner:0,quest:'smile'},{owner:0,quest:'arrow'}]);
 g.boards[1][2*w+6]={type:'feedback'};assert.deepEqual(shot(g,{player:0,index:w+6}).rewards,[{owner:1,quest:'arrow'}]);
 g=createGame(h,w);g.allowed=[[...BASE],[...BASE]];for(let owner=0;owner<2;owner++)for(const t of Object.keys(g.stocks[owner]))if(!BASE.includes(t))g.stocks[owner][t]=0;
 action(g,{type:'king',index:last});action(g,{type:'king',index:last});assert.throws(()=>action(g,{type:'laser',index:0,dir:0}),/магазине/);
 for(let level=0;level<5;level++)for(let n=0;n<15&&g.winner===null;n++){const a=botAction(g,level);assert.ok(BASE.includes(a.type));action(g,a);}
}
console.log('Economy passed: reward ownership, repeats, idempotency, 5-win cycles, loss reset, prices, reload, locked symbols, bots, both boards.');
