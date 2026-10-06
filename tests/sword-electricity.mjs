import assert from 'node:assert/strict';
import {createGame,shot,TYPES} from '../dist/engine.mjs';
import {freshProgress,validateProgress,settle,purchase,PRICES} from '../dist/economy.mjs';
for(const [h,w] of [[10,14],[28,20]]){
 const scene=(weapon,blocks)=>{const g=createGame(h,w);g.setup=2;g.boards[0][w+3]={type:weapon,dir:0};g.boards[1][(g.rows-1)*w+3]={type:'king'};blocks.forEach((type,i)=>g.boards[1][i*w+3]={type});return g;};
 let g=scene('sword',['circle','circle']);assert.equal(shot(g,{player:0,index:w+3}).hits[1],150);assert.equal(g.boards[1][3].type,'circle');shot(g,{player:0,index:w+3},true);assert.equal(g.boards[1][3],null);
 g=scene('sword',['circle','circle','circle']);assert.equal(shot(g,{player:0,index:w+3},true).hits[1],0);assert.equal(g.boards[1][2*w+3].type,'circle');
 for(const weapon of ['arrow','laser','tank']){g=scene(weapon,['electricity']);g.boards[0][w+2]={type:'powerful',dir:2};assert.equal(shot(g,{player:0,index:w+3},true).hits[1],0);assert.equal(g.boards[1][3].type,'electricity');}
 g=scene('sword',['electricity']);assert.equal(shot(g,{player:0,index:w+3},true).hits[1],200);
 g=scene('tank',['circle']);const result=shot(g,{player:0,index:w+3},true);assert.equal(result.hits[1],200);const p=freshProgress();settle(p,{id:'one',mode:'bot',events:[result]});assert.equal(p.human.balance,2);settle(p,{id:'one',mode:'bot',events:[result]});assert.equal(p.human.balance,2);settle(p,{id:'two',mode:'local',events:[result]});assert.equal(p.human.balance,2);
}
const old=freshProgress();delete old.human.counts.breach;delete old.bot.counts.breach;old.human.unlocked.push('circle');assert.equal(validateProgress(old).human.counts.breach,0);assert.ok(old.human.unlocked.includes('circle'));
assert.equal(PRICES.sword,750);assert.equal(PRICES.circle,20);assert.equal(PRICES.electricity,75);assert.equal(PRICES.tank,200);assert.equal(TYPES.sword.stock,2);assert.equal(TYPES.electricity.stock,5);assert.equal(TYPES.circle.stock,10);
old.human.balance=1000;purchase(old,'sword');assert.equal(old.human.balance,250);
console.log('PASS: sword penetration and loss, electric shield immunity, tank circle, quest isolation/idempotency, old saves and prices.');
