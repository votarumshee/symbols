import {PRICES} from './economy.mjs';
import {requireValue} from '../services/errors.mjs';
import {addMoney} from './money.mjs';

export const PROMO_100_RUBIES='1000000000000000000000000000000000000';

export function redeemPromo(d,code){
 code=typeof code==='string'?code.trim():'';
 requireValue(['10','100'].includes(code),'Промокод не найден');
 requireValue(!(d.claims??[]).includes('promo:'+code),'Этот промокод уже использован',409,'PROMO_CLAIMED');
 if(code==='100'){
  addMoney(d,BigInt(PROMO_100_RUBIES)*100n);
  d.claims=[...(d.claims??[]),'promo:100'];
  return {promo:'100',rubies:PROMO_100_RUBIES};
 }
 for(const symbol of Object.keys(PRICES)){
  requireValue(Number.isSafeInteger((d.inventory[symbol]??0)+25),'Недопустимый инвентарь');
 }
 for(const symbol of Object.keys(PRICES))d.inventory[symbol]=(d.inventory[symbol]??0)+25;
 d.claims=[...(d.claims??[]),'promo:10'];
 return {promo:'10',quantity:25};
}
