import {RANKS} from './profile.mjs';
export function rankBadge(rank,size='small'){
 const n=Number.isInteger(rank?.index)&&rank.index>=0&&rank.index<RANKS.length?rank.index:null;
 if(n===null)return '<span class="unranked">Без звания</span>';
 const tile=n<12?Math.floor(n/4):n-9;
 return `<span class="rank-badge rank-badge-${size}" aria-label="${RANKS[n]}"><span class="rank-picture" style="--rank-x:${tile%5*25}%;--rank-y:${tile<5?0:100}%">${n===15?'<b class="rank-pro">Pro</b>':''}${n<12?`<b class="rank-stage">${['I','II','III','IV'][n%4]}</b>`:''}${n===16?'<span class="rank-awards">1 место · 1 место · 1 место</span>':''}</span><strong>${RANKS[n]}</strong></span>`;
}
