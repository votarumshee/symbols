export function parseMoney(value){const text=String(value??'').trim().replace(',','.');if(!/^\d+(?:\.\d{1,2})?$/.test(text))throw Error('Цена: укажи положительную сумму, не больше двух цифр после запятой');const [whole,fraction='']=text.split('.');const cents=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));if(cents<1n||cents>BigInt(Number.MAX_SAFE_INTEGER))throw Error('Цена вне точного числового диапазона');return Number(cents);}
const spendableLimit=BigInt(Number.MAX_SAFE_INTEGER);
export function walletTotal(d){
 if(!Number.isSafeInteger(d.balanceCents)||d.balanceCents<0)throw Error('Недопустимый целочисленный баланс');
 const reserve=d.rubyReserveCents===undefined?'0':d.rubyReserveCents;
 if(typeof reserve!=='string'||!/^(0|[1-9][0-9]{0,79})$/.test(reserve))throw Error('Недопустимый резерв рубинов');
 return BigInt(d.balanceCents)+BigInt(reserve);
}
export function normalizeWallet(d){walletTotal(d);d.balance=d.balanceCents/100;return d;}
export function addMoney(d,cents){
 if(typeof cents!=='bigint'&&!Number.isSafeInteger(cents))throw Error('Недопустимая сумма');
 const total=walletTotal(d)+BigInt(cents);
 if(total<0n||total.toString().length>80)throw Error('Баланс вне точного числового диапазона');
 // Preserve the bounded legacy wallet/SQL BIGINT contract; all overflow is exact decimal text.
 const spendable=total>spendableLimit?spendableLimit:total;
 d.balanceCents=Number(spendable);
 if(total>spendable||d.rubyReserveCents!==undefined)d.rubyReserveCents=(total-spendable).toString();
 d.balance=d.balanceCents/100;
}
export function money(cents){const n=BigInt(cents);return (n/100n).toLocaleString('ru-RU')+','+(n%100n).toString().padStart(2,'0');}
