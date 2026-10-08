import {records} from "./catalog.mjs";
import {TYPES} from './engine.mjs';
import {BASE} from './economy.mjs';
export const symbolName=t=>t==='king'?'Король':TYPES[t]?.name??t;
export const hasSymbol=(p,t)=>t==='king'||BASE.includes(t)||(p.inventory?.[t]??0)>0;
export function upgradePrices(t){return records('upgrade').filter(r=>r.payload.symbol===t).map(r=>r.payload.priceRubies);}
export function upgradeLevel(p,t){return Math.max(0,Math.min(upgradePrices(t).length,Math.floor(p.upgrades?.[t]??0)));}
export function upgradeInfo(p,t){const level=upgradeLevel(p,t),prices=upgradePrices(t),unlimited=t!=='king'&&!Number.isFinite(TYPES[t]?.stock);return {level,price:unlimited||level>=prices.length?null:prices[level],unlimited,value:t==='king'?100+level*10:unlimited?Infinity:TYPES[t].stock+level};}

export function maxUpgrade(p,t){const info=upgradeInfo(p,t);let count=0,cost=0;if(info.unlimited)return {count,cost};const prices=upgradePrices(t);for(let i=info.level;i<prices.length;i++){const next=prices[i]*100;if(cost+next>(p.balanceCents??0))break;cost+=next;count++;}return {count,cost};}
