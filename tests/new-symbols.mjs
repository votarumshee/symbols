import assert from 'node:assert/strict';
import {createGame,action,shot,boosts,grantKingHealth,botAction} from '../dist/engine.mjs';
for(const [h,w] of [[28,20],[10,14]]){
 const rows=h/2,last=(rows-1)*w;
 function scene(type='laser',units=0){const g=createGame(h,w);g.setup=2;g.boards[0][last+10]={type:'king'};g.boards[1][last+10]={type:'king'};g.boards[0][w+10]={type,dir:0};for(let i=0;i<units;i++)g.boards[0][w+9-i]={type:'point',dir:2};g.boards[1][2*w+10]={type:'feedback'};return g;}
 for(const [type,n,reflect,damage] of [['arrow',0,true,20],['arrow',10,true,320],['laser',0,true,100],['laser',6,true,100],['laser',9,true,100],['laser',10,false,50],['tank',0,true,200],['tank',1,false,200]]){
  const g=scene(type,n),r=shot(g,{player:0,index:w+10},true);assert.equal(r.reflected,reflect,`${type}/${n}`);assert.equal(r.hits[reflect?0:1],damage);assert.equal(!!g.boards[1][2*w+10],reflect);
 }
 let g=scene();g.boards[0][2*w+10]={type:'feedback'};let r=shot(g,{player:0,index:w+10},true);assert.deepEqual(r.hits,[0,0]);assert.equal(r.reflected,true);assert.ok(g.boards[0][2*w+10]);
 g=scene('laser',1);g.boards[0][2*w+10]={type:'circle'};r=shot(g,{player:0,index:w+10},true);assert.equal(r.hits[0],100);assert.equal(g.boards[0][2*w+10],null);
 g=scene('laser',0);g.boards[0][2*w+10]={type:'circle'};r=shot(g,{player:0,index:w+10},true);assert.equal(r.hits[0],0);assert.ok(g.boards[0][2*w+10]);
 g=scene('laser');g.boards[0][w+9]={type:'inspect',dir:2};g.boards[0][w+8]={type:'powerful',dir:2};g.boards[0][w+7]={type:'point',dir:2};assert.equal(boosts(g,0,w+10),10);assert.equal(shot(g,{player:0,index:w+10}).hits[1],50);
 g=createGame(h,w);g.setup=2;g.boards[0][last+10]={type:'king'};g.boards[1][last+10]={type:'king'};
 for(const [type,amount] of [['point',10],['inspect',30],['powerful',60]]){g.current=0;const before=g.hp[0];action(g,{type,index:last+9,dir:2});assert.equal(g.hp[0],before+amount);grantKingHealth(g);assert.equal(g.hp[0],before+amount);g.current=0;g.extra=2;const turn=g.turn;const pending=[{player:1,index:0}];g.pending=pending;action(g,{type:'erase',index:last+9});assert.equal(g.hp[0],before);assert.equal(g.current,0);assert.equal(g.turn,turn);assert.equal(g.extra,2);assert.deepEqual(g.pending,pending);g.pending=[];g.extra=0;}
 assert.equal(g.hp[0],100);assert.equal(g.maxHp[0],100);g.current=0;action(g,{type:'point',index:last+9,dir:2});assert.equal(g.hp[0],110);
 g=scene('tank',1);g.pending=[{player:0,index:w+10}];g.current=1;action(g,{type:'smile',index:0});assert.equal(g.boards[0][w+10],null);assert.equal(g.winner,0);
 g=scene('tank',0);g.pending=[{player:0,index:w+10}];g.current=1;action(g,{type:'smile',index:0});assert.equal(g.boards[0][w+10],null);assert.equal(g.winner,1);
 g=scene('tank');g.boards[1][2*w+10]={type:'smile'};g.boards[1][2*w+9]={type:'powerful',dir:2};assert.equal(shot(g,{player:0,index:w+10}).hits[1],200);
 for(let level=0;level<5;level++){g=createGame(h,w);for(let n=0;n<45&&g.winner===null;n++)action(g,botAction(g,level));assert.ok(g.hp.every(x=>x>=0));assert.ok(Object.values(g.stocks[0]).every(x=>x>=0));}
 console.log(`${h}x${w}: reflection, second triangle, laser threshold, tank, temporary health, free removal, stocks and 5 bots OK`);
}
