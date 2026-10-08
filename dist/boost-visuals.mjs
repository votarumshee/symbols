import {BOOSTERS,DIRS,boostTarget} from './engine.mjs';
// Visualize only real connections, using the same target lookup as combat.
export function boostVisuals(g,player){
 const cells=new Map(),targets=new Set();
 for(let source=0;source<g.boards[player].length;source++){
  const booster=g.boards[player][source];if(!BOOSTERS[booster?.type])continue;
  const target=boostTarget(g,player,source);if(target===null)continue;targets.add(target);
  const [dx,dy]=DIRS[booster.dir];let x=source%g.width+dx,y=Math.floor(source/g.width)+dy;
  while(y*g.width+x!==target){const index=y*g.width+x;if(!cells.has(index))cells.set(index,{dir:booster.dir,count:0});cells.get(index).count++;x+=dx;y+=dy;}
 }
 return {cells,targets};
}
export function lightning(dir,occupied=false){return `<svg class="boost-bolt${occupied?' alongside-symbol':''}" viewBox="0 0 32 32" aria-hidden="true"><path transform="rotate(${dir*45} 16 16)" d="M18 3 7 18h8l-1 11 11-16h-8Z" fill="currentColor" stroke="#975000" stroke-width="1.1" stroke-linejoin="round"/></svg>`;}
