import {PRICES} from './economy.mjs';
import {requireValue} from '../services/errors.mjs';

export function redeemPromo(d,code){
 requireValue(typeof code==='string'&&code.trim()==='10','Промокод не найден');
 requireValue(!(d.claims??[]).includes('promo:10'),'Этот промокод уже использован',409,'PROMO_CLAIMED');
 for(const symbol of Object.keys(PRICES)){
  requireValue(Number.isSafeInteger((d.inventory[symbol]??0)+25),'Недопустимый инвентарь');
 }
 for(const symbol of Object.keys(PRICES))d.inventory[symbol]=(d.inventory[symbol]??0)+25;
 d.claims=[...(d.claims??[]),'promo:10'];
 return {promo:'10',quantity:25};
}
