import {records} from "./catalog.mjs";
export const DIRS=[[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]];
export const BOOSTERS={point:1,inspect:3,powerful:6};
export const ATTACKS=['arrow','arrowx2','laser','tank','sword'];
export const DIRECTED=[...ATTACKS,...Object.keys(BOOSTERS)];
export const TYPES=Object.fromEntries(records('symbol').filter(r=>r.key!=='king').map(r=>[r.key,{name:r.payload.name,stock:r.payload.unlimited?Infinity:r.payload.stock}]));
export function createGame(height=28,width=20){
 if(!((height===28&&width===20)||(height===10&&width===14)))throw Error('Неизвестный размер поля');
 const stock=()=>Object.fromEntries(Object.entries(TYPES).filter(([,t])=>Number.isFinite(t.stock)).map(([k,t])=>[k,t.stock]));
 return {width,rows:height/2,height,boards:[Array(height/2*width).fill(null),Array(height/2*width).fill(null)],hp:[100,100],maxHp:[100,100],stocks:[stock(),stock()],current:0,setup:0,pending:[],extra:0,turn:1,winner:null};
}
export function boostTarget(g,p,index){const t=g.boards[p][index];if(!BOOSTERS[t?.type])return null;let x=index%g.width,y=Math.floor(index/g.width);const [dx,dy]=DIRS[t.dir];for(let k=0;k<Math.max(g.width,g.rows);k++){x+=dx;y+=dy;if(x<0||x>=g.width||y<0||y>=g.rows)break;const i=y*g.width+x,target=g.boards[p][i];if(target&&!BOOSTERS[target.type])return i;}return null;}
export function boosts(g,p,index){let n=0;for(let i=0;i<g.boards[p].length;i++){const t=g.boards[p][i];if(BOOSTERS[t?.type]&&boostTarget(g,p,i)===index)n+=BOOSTERS[t.type];}return n;}
// Health bonuses exist only while a booster has a clear line to the king.
export function grantKingHealth(g){if(g.multi){for(let p=0;p<2;p++)for(let i=0;i<g.boards[p].length;i++){const t=g.boards[p][i];if(t?.type!=="king")continue;const max=(g.kingBase?.[t.seat]??100)+boosts(g,p,i)*10;g.kingHp[t.seat]=Math.max(0,g.kingHp[t.seat]+max-g.kingMax[t.seat]);g.kingMax[t.seat]=max;}for(let p=0;p<2;p++){g.hp[p]=g.kingHp.reduce((n,h,i)=>n+(i%2===p?h:0),0);g.maxHp[p]=g.kingMax.reduce((n,h,i)=>n+(i%2===p&&g.kingHp[i]>0?h:0),0);}return;}for(let p=0;p<2;p++){const king=g.boards[p].findIndex(t=>t?.type==='king');const maximum=100+(king<0?0:boosts(g,p,king)*10);g.hp[p]=Math.max(0,g.hp[p]+maximum-g.maxHp[p]);g.maxHp[p]=maximum;}}
function checkWinner(g){if(g.hp.some(h=>h<=0))g.winner=g.hp[0]<=0?1:0;}

export function trace(g,p,index,dir){let side=p,x=index%g.width,y=Math.floor(index/g.width);let [dx,dy]=DIRS[dir];const cells=[];let crossed=false;for(let k=0;k<2*(g.width+g.rows);k++){x+=dx;y+=dy;if(x<0||x>=g.width)break;if(y<0&&!crossed){side=1-p;y=0;dy=1;crossed=true;}else if(y<0||y>=g.rows)break;cells.push({side,index:y*g.width+x});}return cells;}
// Remaining strength is consumed by pierced blocks, as in the initial prototype.
export function shot(g,attack,apply=false){
 const t=g.boards[attack.player][attack.index];const hits=[0,0],path=[],rewards=[],impacts=[];if(!t||!ATTACKS.includes(t.type))return {damage:0,hits,path,hitKing:false,reflected:false};
 const n=boosts(g,attack.player,attack.index),isArrow=['arrow','arrowx2'].includes(t.type);let power=isArrow?n+(t.type==='arrowx2'?1:0):3+n,damage=t.type==='arrowx2'?40+30*n:t.type==='sword'?250:t.type==='tank'?200:t.type==='laser'?100:20+30*n;
 let owner=attack.player,reflected=false,route=trace(g,attack.player,attack.index,t.dir),cursor=0;
 const destroyed=new Set();let circles=0;
 while(cursor<route.length){const c=route[cursor++];path.push({...c,reflected});const key=c.side+':'+c.index;const target=destroyed.has(key)?null:g.boards[c.side][c.index];if(!target)continue;
  if(t.type==='sword'&&(BOOSTERS[target.type]||['smile','circle','electricity','feedback'].includes(target.type))){if(target.type==='circle'&&circles>=2){impacts.push({...c,reflected,kind:'blocked'});break;}if(target.type==='circle')circles++;impacts.push({...c,reflected,kind:'destroyed',symbol:target.type});destroyed.add(key);if(c.side!==owner&&['smile','circle'].includes(target.type))rewards.push({owner,quest:target.type==='circle'?'breach':'smile'});if(apply)g.boards[c.side][c.index]=null;damage=Math.max(0,damage-50);if(!damage)break;continue;}
  if(target.type==='electricity'){impacts.push({...c,reflected,kind:'blocked'});break;}
  if(BOOSTERS[target.type]){const strength=isArrow?power:power-3;const destroys=target.type==='point'||target.type==='inspect'&&(!isArrow||strength>=3)||target.type==='powerful'&&(t.type==='tank'||t.type==='laser'&&strength>=2||isArrow&&strength>=5);impacts.push({...c,reflected,kind:destroys?'destroyed':'blocked'});if(destroys){destroyed.add(key);if(apply)g.boards[c.side][c.index]=null;if(t.type==='tank')continue;}break;}
  if(['smile','circle','feedback'].includes(target.type)){
   const b=boosts(g,c.side,c.index);let need;
   if(target.type==='feedback'){
    need=isArrow?Infinity:0;
    if(power<need){
     if(reflected){impacts.push({...c,reflected,kind:'blocked'});break;}
     impacts.push({...c,reflected,kind:'reflect'});reflected=true;owner=c.side;
     // Reverse every traversed cell exactly, then continue behind the firing piece.
     route=[...path.slice(0,-1).reverse().map(({side,index})=>({side,index})),{side:attack.player,index:attack.index},...trace(g,attack.player,attack.index,(t.dir+4)%8)];cursor=0;continue;
    }
   }else need=target.type==='smile'?(t.type==='tank'?1:1+b):(isArrow?Infinity:3+b);
   if(power<need){impacts.push({...c,reflected,kind:'blocked'});break;}
   impacts.push({...c,reflected,kind:'destroyed',symbol:target.type});power-=need;destroyed.add(key);if(c.side!==owner&&['smile','circle'].includes(target.type))rewards.push({owner,quest:target.type==='circle'?'breach':'smile'});if(apply)g.boards[c.side][c.index]=null;
   if(isArrow)damage=Math.max(0,damage-(target.type==='circle'?100:30));
   if(t.type==='laser'&&target.type==='feedback')damage=50;
  }else if(target.type==='king'){
   if(c.side!==owner){impacts.push({...c,reflected,kind:'king',damage});hits[c.side]+=damage;if(t.type==='arrow'&&damage>0)rewards.push({owner,quest:'arrow'});if(apply){if(g.multi){g.kingHp[target.seat]=Math.max(0,g.kingHp[target.seat]-damage);if(!g.kingHp[target.seat])g.boards[c.side][c.index]=null;}else g.hp[c.side]=Math.max(0,g.hp[c.side]-damage);}}break;
  }
 }
 if(apply){grantKingHealth(g);checkWinner(g);}
 return {projectile:t.type,direction:t.dir,impacts,damage:hits[0]+hits[1],hits,path,rewards,hitKing:hits[1-attack.player]>0,reflected};
}
export function action(g,a){
 if(g.winner!==null)throw Error('Партия завершена');const p=g.current,events=[];if(a.side!==undefined&&a.side!==p)throw Error('Нельзя удалить чужой символ или пулю. Выбери свою фигуру.');let teleportSource=null,teleportPiece=null,teleportPending=null;
 if(g.setup<2){if(a.type!=='king'||!Number.isInteger(a.index)||a.index<(g.rows-1)*g.width||a.index>=g.rows*g.width)throw Error('Поставь корону в нижний ряд');g.boards[p][a.index]={type:'king',dir:0};g.setup++;g.current=g.setup===2?Math.floor(Math.random()*2):1;return {events,setup:true};}
 if(!TYPES[a.type])throw Error('Неизвестный символ');if(g.allowed&&!g.allowed[p].includes(a.type))throw Error('Сначала открой этот символ в рынке');if(g.stocks[p][a.type]===0)throw Error('Запас закончился');
 if(a.type==='angry'){if(g.extra)throw Error('Сначала используй два хода');g.stocks[p].angry--;g.extra=2;return {events,angry:true};}
 if(!Number.isInteger(a.index)||a.index<0||a.index>=g.rows*g.width)throw Error('Выбери клетку своей половины');const existing=g.boards[p][a.index];
 if(a.type==='erase'){
  if(!existing||existing.type==='king')throw Error('Можно удалить свой символ, кроме короля');g.boards[p][a.index]=null;g.pending=g.pending.filter(v=>!(v.player===p&&v.index===a.index));grantKingHealth(g);checkWinner(g);return {events,free:true};
 }
 if(existing)throw Error('Эта клетка занята');if(a.type==='teleport'){if(!Number.isInteger(a.source)||a.source<0||a.source>=g.boards[p].length)throw Error('Выбери свой символ');const source=g.boards[p][a.source];if(!source||source.type==='king')throw Error('Нельзя переносить короля или пустую клетку');if(DIRECTED.includes(source.type)&&(!Number.isInteger(a.dir)||a.dir<0||a.dir>7))throw Error('Выбери направление');teleportSource=a.source;teleportPiece=source;teleportPending=g.pending.filter(v=>v.player===p&&v.index===a.source);g.pending=g.pending.filter(v=>!(v.player===p&&v.index===a.source));g.boards[p][a.source]=null;g.stocks[p].teleport--;a={...a,type:source.type};}if(DIRECTED.includes(a.type)&&(!Number.isInteger(a.dir)||a.dir<0||a.dir>7))throw Error('Выбери направление');
 g.boards[p][a.index]={type:a.type,dir:a.dir??0,spent:false,...(g.multi?{seat:g.actor}:{})};if(teleportSource===null&&a.type in g.stocks[p])g.stocks[p][a.type]--;grantKingHealth(g);
 const attacking=ATTACKS.includes(a.type),incoming=g.pending.filter(v=>v.player!==p);g.pending=g.pending.filter(v=>v.player===p);let hurt=false;
 for(const at of incoming){const result=shot(g,at,true);events.push({...result,player:at.player,actor:at.actor??at.player});if(result.hits[p]>0)hurt=true;const piece=g.boards[at.player][at.index];if(piece?.type==='tank')g.boards[at.player][at.index]=null;else if(piece)piece.spent=true;if(g.hp.some(h=>h<=0))break;}
 if(g.hp.some(h=>h<=0)){g.winner=g.hp[0]<=0?1:0;return {events};}
 grantKingHealth(g);
 if(attacking&&g.boards[p][a.index]&&hurt&&shot(g,{player:p,index:a.index}).hitKing){g.boards[p][a.index]=null;if(teleportSource!==null){g.boards[p][teleportSource]=teleportPiece;g.stocks[p].teleport++;g.pending.push(...teleportPending);}else if(a.type in g.stocks[p])g.stocks[p][a.type]++;grantKingHealth(g);checkWinner(g);return {events,cancelled:true};}
 if(attacking&&g.boards[p][a.index])g.pending.push({player:p,index:a.index,...(g.multi?{actor:g.actor}:{})});if(g.extra>0)g.extra--;if(!g.extra)g.current=1-p;g.turn++;return {events};
}
export function botAction(g,level=2){
 const p=g.current,b=g.boards[p];if(g.setup<2)return {type:'king',index:(g.rows-1)*g.width+Math.floor(Math.random()*g.width)};
 const empties=[];for(let i=0;i<b.length;i++)if(!b[i])empties.push(i);
 if(!empties.length)return {type:'erase',index:b.findIndex(t=>t&&t.type!=='king')};
 const choices=[],incoming=g.pending.filter(a=>a.player!==p),danger=incoming.reduce((n,a)=>n+shot(g,a).hits[p],0);
 if(danger&&level>0)for(const at of incoming)for(const c of shot(g,at).path)if(c.side===p&&!b[c.index])for(const type of ['smile','circle','feedback','electricity'])if(g.stocks[p][type]!==0)choices.push({type,index:c.index});
 const enemyKing=g.boards[1-p].findIndex(t=>t?.type==='king');
 for(const index of empties){
  for(const dir of [0,1,7])if(trace(g,p,index,dir).some(c=>c.side!==p&&c.index===enemyKing)){
   choices.push({type:'arrow',index,dir});if(level>=2)for(const type of ['arrowx2','laser','tank','sword'])if(g.stocks[p][type]>0)choices.push({type,index,dir});
  }
  if(level>=3)for(let dir=0;dir<8;dir++){
   let x=index%g.width,y=Math.floor(index/g.width);const [dx,dy]=DIRS[dir];
   for(let k=0;k<Math.max(g.width,g.rows);k++){x+=dx;y+=dy;if(x<0||x>=g.width||y<0||y>=g.rows)break;const t=b[y*g.width+x];if(t&&!BOOSTERS[t.type]){if(t.type==='king'||!t.spent&&[...ATTACKS,'circle','smile','feedback'].includes(t.type))for(const type of ['point','inspect','powerful'])if(g.stocks[p][type]!==0)choices.push({type,index,dir});break;}}
  }
 }
 const randomness=[1,.6,.25,.08,0][level];
 if(Math.random()<randomness||!choices.length){const types=['arrow','smile','point','feedback','tank','inspect','powerful'].filter(t=>g.stocks[p][t]!==0);return {type:types[Math.floor(Math.random()*types.length)],index:empties[Math.floor(Math.random()*empties.length)],dir:Math.floor(Math.random()*8)};}
 let best=null,bestScore=-Infinity;
 for(const a of choices){const c=structuredClone(g);let score=-100000;try{const r=action(c,a);if(r.cancelled)score=-10000;else if(c.winner===1-p)score=-100000;else if(c.winner===p)score=100000;else{score=(c.hp[p]-g.hp[p])*50+(g.hp[1-p]-c.hp[1-p])*30;for(const at of c.pending.filter(v=>v.player===p)){const prediction=shot(c,at);score+=prediction.hits[1-p]*(level>=3?3:1)-prediction.hits[p]*5;}if(BOOSTERS[a.type])score+=BOOSTERS[a.type]*3;if(['circle','laser','tank','feedback'].includes(a.type))score-=4;}score+=Math.random()*(level===4?.1:15);}catch{}if(score>bestScore){bestScore=score;best=a;}}
 return best;
}
