import {records} from "./catalog.mjs";
import {RANKS} from './profile.mjs';
export const THRESHOLDS=records('level').map(r=>r.payload.xp);
export function levelThreshold(level){if(level<=6)return THRESHOLDS[Math.max(0,level-1)];const n=level-6;return 1000+Math.floor(n/2)*250+(n%2)*100;}
export function levelInfo(xp=0){let level=1;if(xp>=1000){const delta=xp-1000;level=6+Math.floor(delta/250)*2+(delta%250>=100?1:0);}else while(level<6&&xp>=THRESHOLDS[level])level++;return {level,xp,start:levelThreshold(level),next:levelThreshold(level+1),frame:level>=10};}
export const NEW_QUESTS=records('quest').map(r=>r.payload);
export function trialResult(data,won,damage,elapsed){const before={rank:data.rank?{...data.rank}:null,progress:data.rankProgress??0};const index=data.rank?.index??-1;data.trialRun??=[];const target=index+1;const qualifies=won&&(target<13||damage===0)&&(target<15||elapsed<10000);
 if(qualifies){data.trialRun.push({won,damage,elapsed});data.rankProgress=Math.min(100,(data.rankProgress??0)+20);if(data.trialRun.length===5){const next=Math.min(18,index+1);data.rank={index:next,name:RANKS[next]};data.rankProgress=0;data.trialRun=[];}}
 else{data.trialRun=[];data.rankProgress=(data.rankProgress??0)-20;if(data.rankProgress<0){if(index>=0){data.rank=index>0?{index:index-1,name:RANKS[index-1]}:null;data.rankProgress=80;}else data.rankProgress=0;}}
 return {before,after:{rank:data.rank,progress:data.rankProgress},qualifies};}
