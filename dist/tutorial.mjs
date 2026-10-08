import {action,shot,DIRS} from './engine.mjs';
export function tutorialAdvice(g){
 if(g.winner!==null||g.current!==0)return null;
 if(g.setup<2)return {move:{type:'king',index:(g.rows-1)*g.width+Math.floor(g.width/2)},text:'Поставь короля в подсвеченную клетку нижнего ряда. Его нужно защищать.'};
 const available=t=>g.allowed[0].includes(t)&&g.stocks[0][t]!==0;
 const incoming=g.pending.filter(a=>a.player===1);const danger=incoming.some(a=>shot(g,a).hits[0]>0);
 if(danger){for(const at of incoming)for(const c of shot(g,at).path){if(c.side!==0||g.boards[0][c.index])continue;for(const type of ['smile','circle','feedback']){if(!available(type))continue;const test=structuredClone(g);try{action(test,{type,index:c.index});if(test.hp[0]>=g.hp[0]&&test.winner!==1)return {move:{type,index:c.index},text:'В короля летит пуля! Поставь '+(type==='smile'?'смайлик':'блок')+' в подсвеченную клетку: он защитит короля.'};}catch{}}}}
 let best=null;
 if(available('arrow'))for(let index=0;index<g.boards[0].length;index++){if(g.boards[0][index])continue;for(const dir of [0,1,7]){const test=structuredClone(g);test.boards[0][index]={type:'arrow',dir};const prediction=shot(test,{player:0,index});if(prediction.hits[1]>0&&!prediction.hits[0]&&(!best||prediction.hits[1]>best.damage))best={move:{type:'arrow',index,dir},damage:prediction.hits[1]};}}
 if(best)return {move:best.move,text:`Поставь стрелочку в подсвеченную клетку и направь ${['вверх','вверх вправо','','','','','','вверх влево'][best.move.dir]}. Если бот не поставит защиту, король потеряет ${best.damage} жизней. Пуля полетит после ответа бота.`};
 if(available('point'))for(let index=0;index<g.boards[0].length;index++){if(g.boards[0][index])continue;for(let dir=0;dir<8;dir++){let x=index%g.width,y=Math.floor(index/g.width);const [dx,dy]=DIRS[dir];while(true){x+=dx;y+=dy;if(x<0||x>=g.width||y<0||y>=g.rows)break;const t=g.boards[0][y*g.width+x];if(t){if(t.type==='king')return {move:{type:'point',index,dir},text:'Прямого выстрела пока нет. Поставь точку к королю: пока она действует, у него будет на 10 жизней больше.'};break;}}}}
 const index=g.boards[0].findIndex(t=>!t);if(index>=0&&available('smile'))return {move:{type:'smile',index},text:'Поставь защитный смайлик. Затем попробуй найти свободную линию для стрелочки.'};
 return {move:null,text:'Удали свой отстрелянный символ, чтобы освободить место. Удаление не тратит ход.'};
}
