import {CASES} from '../dist/cases.mjs';
import {levelInfo} from '../dist/progression.mjs';
// Append each future symbol here once, using its permanent inventory key.
export const SYMBOL_RELEASES=['arrowx2'];
export function syncEntitlements(d){let changed=false;const earned=Math.floor(levelInfo(d.xp).level/10),already=d.levelCaseMilestone??0;if(earned>already){d.cases??={};d.levelRewards??=[];for(let step=already+1;step<=earned;step++){const c=CASES[Math.floor(crypto.getRandomValues(new Uint32Array(1))[0]/4294967296*CASES.length)];d.cases[c.id]=(d.cases[c.id]??0)+1;d.levelRewards.push({level:step*10,case:c.id});}d.levelCaseMilestone=earned;changed=true;}return changed;}
