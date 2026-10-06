import {hasSymbol,upgradeInfo,maxUpgrade} from './upgrades.mjs';
import {SKINS,SKIN_SYMBOLS,ownsSkin,skinsFor} from './skins.mjs';
import {syncEntitlements} from './entitlements.mjs';
import {CASES,casePrice,drawCase} from './cases.mjs';
import {unlockedFrames,activeFrame} from './frames.mjs';
import {AVATARS} from './avatars.mjs';
import {parseMoney,normalizeWallet,addMoney} from './money.mjs';
import {BASE,PRICES} from './economy.mjs';
import {TYPES} from './engine.mjs';
import {cleanNick} from './profile.mjs';
import {trialResult,levelInfo} from './progression.mjs';
import {startArena,arenaAction,arenaBotMove} from './arena-engine.mjs';
export function cosmetic(d,route,b,now){const v={d}; if(route==='upgrade'){if(b.symbol!=='king'&&!TYPES[b.symbol])throw Error('Неизвестный символ');if(!hasSymbol(v.d,b.symbol))throw Error('Сначала получи этот символ');const info=upgradeInfo(v.d,b.symbol);if(info.price===null)throw Error(info.unlimited?'У этого символа уже нет лимита':'Максимальное улучшение');if(b.level!==info.level)throw Error('Улучшение уже изменилось. Обнови экран');if(v.d.balanceCents<info.price*100)throw Error('Не хватает рубинов');const purchase=b.max===true?maxUpgrade(v.d,b.symbol):{count:1,cost:info.price*100};addMoney(v.d,-purchase.cost);v.d.upgrades??={};v.d.upgrades[b.symbol]=info.level+purchase.count;return {};}
 if(route==='frame'){if(b.frame!==null&&(!Number.isInteger(b.frame)||b.frame<1||b.frame>unlockedFrames(v.d.xp)))throw Error('Эта рамка пока не открыта');v.d.frame=b.frame;return {};}
 if(route==='buy-case'||route==='open-case'){const c=CASES.find(c=>c.id===b.case);if(!c)throw Error('Кейс не найден');const key=String(b.key??'');if(!/^[a-f0-9-]{36}$/.test(key))throw Error('Повтори действие');v.d.caseReceipts??=[];const receipt=v.d.caseReceipts.find(r=>r.key===key);if(receipt){if(receipt.route!==route||receipt.case!==c.id)throw Error('Повтори действие');return {drop:receipt.drop??null};}v.d.cases??={};let drop=null;if(route==='buy-case'){if(v.d.balanceCents<casePrice(c))throw Error('Не хватает рубинов');addMoney(v.d,-casePrice(c));v.d.cases[c.id]=(v.d.cases[c.id]??0)+1;}else{if(!(v.d.cases[c.id]>0))throw Error('Сначала купи кейс');drop=drawCase(c);v.d.cases[c.id]--;v.d.inventory[drop]=(v.d.inventory[drop]??0)+1;v.d.lastCaseDrop={symbol:drop,case:c.id,at:now};}v.d.caseReceipts.push({key,route,case:c.id,drop});v.d.caseReceipts=v.d.caseReceipts.slice(-100);return {drop};}
 if(route==='skin'||route==='buy-skin'){const skin=skinsFor(b.symbol).find(s=>s.id===b.skin);if(!hasSymbol(v.d,b.symbol))throw Error('Сначала получи этот символ');if(!SKIN_SYMBOLS.includes(b.symbol)||!skin)throw Error('Расцветка недоступна');if(!ownsSkin(v.d,b.symbol,b.skin)){if(route!=='buy-skin')throw Error('Сначала купи скин');if(v.d.balanceCents<skin.price*100)throw Error('Не хватает рубинов');addMoney(v.d,-skin.price*100);v.d.ownedSkins[b.symbol]??=[];v.d.ownedSkins[b.symbol].push(b.skin);}v.d.skins??={};v.d.skins[b.symbol]=b.skin;return {};}
 if(route==='nickname'){v.d.nick=cleanNick(b.nick);return {};}
 if(route==='avatar'){if(!['lion','eagle'].includes(b.avatar)&&!(['thunderlion','firec'].includes(b.avatar)&&v.d.ownedAvatars?.includes(b.avatar)))throw Error('Эта аватарка недоступна');v.d.avatar=b.avatar;return {};}
 if(route==='buy-avatar'){const offers={thunderlion:{price:50000,symbol:'arrowx2',quantity:5},firec:{price:100000,symbol:'inspect',quantity:1}},offer=Object.hasOwn(offers,b.avatar)?offers[b.avatar]:null;if(!offer)throw Error('Товар не найден');if(v.d.ownedAvatars?.includes(b.avatar))return {};if(v.d.balanceCents<offer.price)throw Error('Не хватает рубинов');addMoney(v.d,-offer.price);v.d.ownedAvatars??=[];v.d.ownedAvatars.push(b.avatar);v.d.inventory[offer.symbol]=(v.d.inventory[offer.symbol]??0)+offer.quantity;v.d.avatar=b.avatar;return {};}

 throw Error("Неизвестная команда");
}
