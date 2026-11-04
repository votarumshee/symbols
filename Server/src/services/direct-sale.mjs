import {lockVaults,one} from '../repositories/db.mjs';
import {PRICES} from '../domain/economy.mjs';
import {addMoney} from '../domain/money.mjs';
import {saveVaults} from './state.mjs';
import {requireValue} from './errors.mjs';

export async function sellSymbol(c,id,b,key,now){
 const [v]=await lockVaults(c,[id]),quantity=b.quantity??1;
 requireValue(Object.hasOwn(PRICES,b.symbol),'Этот символ нельзя продать игре');
 requireValue(Number.isInteger(quantity)&&quantity>=1&&quantity<=100&&quantity<=(v.d.inventory[b.symbol]??0),'Количество: от 1 до 100 доступных экземпляров');
 if(v.d.game){const game=await one(c,'SELECT status FROM arenas WHERE id=$1',[v.d.game]);requireValue(!game||game.status==='done','Сначала заверши партию');}
 const creditedCents=PRICES[b.symbol]*50*quantity;
 requireValue(Number.isSafeInteger(creditedCents)&&creditedCents>0,'Недопустимая сумма продажи');
 v.d.inventory[b.symbol]-=quantity;addMoney(v.d,creditedCents);
 await saveVaults(c,[v],null,key,now);
 return {symbol:b.symbol,quantity,creditedCents:String(creditedCents)};
}
