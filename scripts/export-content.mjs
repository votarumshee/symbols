import fs from 'node:fs';
import {TYPES,BOOSTERS,DIRS} from '../dist/engine.mjs';
import {BASE,PRICES,QUESTS} from '../dist/economy.mjs';
import {CASES,casePrice} from '../dist/cases.mjs';
import {FRAMES} from '../dist/frames.mjs';
import {SKINS,SKIN_SYMBOLS} from '../dist/skins.mjs';
import {AVATARS} from '../dist/avatars.mjs';
import {RARITIES,SYMBOL_RARITY} from '../dist/rarity.mjs';
import {RANKS} from '../dist/profile.mjs';
import {LEVEL_NAMES} from '../dist/history.mjs';
import {NEW_QUESTS,levelThreshold} from '../dist/progression.mjs';
import {upgradePrices} from '../dist/upgrades.mjs';
const records=[],relations=[];
const add=(category,key,payload)=>records.push({category,key:String(key),payload});
const link=(category,key,relation,targetCategory,targetKey)=>relations.push({category,key:String(key),relation,targetCategory,targetKey:String(targetKey)});
for(const [id,t] of Object.entries(TYPES)){add('symbol',id,{...t,stock:Number.isFinite(t.stock)?t.stock:null,unlimited:!Number.isFinite(t.stock),free:BASE.includes(id),referencePriceRubies:PRICES[id]??null,boost:BOOSTERS[id]??0});link('symbol',id,'rarity','rarity',SYMBOL_RARITY[id]);}
add('symbol','king',{name:'Король',baseHp:100,free:true});
for(const [id,r] of Object.entries(RARITIES))add('rarity',id,r);
for(let n=1;n<=300;n++)add('level',n,{level:n,xp:levelThreshold(n),next:levelThreshold(n+1)});
for(const q of NEW_QUESTS)add('quest',q.id,q);
for(const q of QUESTS)add('legacyQuest',q.id,{...q,activeInV2:false});
for(const c of CASES){add('case',c.id,{...c,priceCents:casePrice(c)});c.drops.forEach(([symbol,weight])=>{add('caseDrop',c.id+':'+symbol,{case:c.id,symbol,weight,denominator:10000});link('caseDrop',c.id+':'+symbol,'case','case',c.id);link('caseDrop',c.id+':'+symbol,'symbol','symbol',symbol);});}
for(const f of FRAMES){add('frame',f.id,f);link('frame',f.id,'level','level',f.level);}
for(const skin of SKINS)add('skin',skin.id,skin);
for(const symbol of SKIN_SYMBOLS)for(const skin of SKINS){add('symbolSkin',symbol+':'+skin.id,{symbol,skin:skin.id});link('symbolSkin',symbol+':'+skin.id,'symbol','symbol',symbol);link('symbolSkin',symbol+':'+skin.id,'skin','skin',skin.id);}
for(const [id,emoji,name] of AVATARS)add('avatar',id,{id,emoji,name});
for(const [id,priceCents,symbol,quantity] of [['thunderlion',50000,'arrowx2',5],['firec',100000,'inspect',1]]){add('avatarBundle',id,{priceCents,symbol,quantity});link('avatarBundle',id,'avatar','avatar',id);link('avatarBundle',id,'symbol','symbol',symbol);}
RANKS.forEach((name,index)=>add('rank',index,{index,name}));LEVEL_NAMES.forEach((name,index)=>add('difficulty',index,{index,name}));
for(const symbol of ['king',...Object.keys(TYPES).filter(t=>Number.isFinite(TYPES[t].stock))])upgradePrices(symbol).forEach((price,index)=>{const key=symbol+':'+(index+1);add('upgrade',key,{symbol,level:index+1,priceRubies:price,increment:symbol==='king'?10:1});link('upgrade',key,'symbol','symbol',symbol);});
add('settings','runtime',{currency:'rubies',moneyScale:100,boardSizes:[[28,20],[10,14]],directions:DIRS,queueTimeoutMs:8000,turnTimeoutMs:90000,skinSurchargePercent:90,activePromoCodes:[],xpWin:100,xpLoss:25,xpQuest:50,perfectDuelXp:1200,perfectDuelMaxMs:15000,levelCasesEvery:10,initialRubies:1,trialGames:5,levelsAfter300:'dist/progression.mjs: levelThreshold',source:'server/v2.mjs'});
const content={sourceCommit:'453f22d1cef29bf771fb61906354600aae8179b3',note:'Export snapshot of code constants; catalog tables are export additions, not runtime inputs.',records,relations};
fs.writeFileSync('database/content.json',JSON.stringify(content,null,2)+'\n');
console.log('Content',records.length,'records',relations.length,'relations');
