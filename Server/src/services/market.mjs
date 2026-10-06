import {randomUUID} from 'node:crypto';
import {one,lockVaults} from '../repositories/db.mjs';
import {PRICES} from '../domain/economy.mjs';
import {skinsFor} from '../domain/skins.mjs';
import {parseMoney,addMoney} from '../domain/money.mjs';
import {saveVaults} from './state.mjs';
import {requireValue} from './errors.mjs';
export async function marketCommand(c,id,kind,b,key,now){
 if(kind==='sell'){
  const [v]=await lockVaults(c,[id]),t=b.symbol,skin=b.skin&&b.skin!=='classic'?skinsFor(t).find(s=>s.id===b.skin):null;
  requireValue(Object.hasOwn(PRICES,t),'Неизвестный символ');requireValue(!b.skin||b.skin==='classic'||skin,'Скин не найден');
  const price=parseMoney(b.price)+(skin?skin.price*90:0),quantity=b.quantity??1;
  requireValue(Number.isSafeInteger(price),'Цена вне диапазона');requireValue(Number.isSafeInteger(quantity)&&quantity>0&&quantity<=100&&quantity<=v.d.inventory[t],'Количество: от 1 до 100 доступных экземпляров');
  if(v.d.game){const g=await one(c,'SELECT status FROM arenas WHERE id=$1',[v.d.game]);requireValue(!g||g.status==='done','Сначала заверши партию');}
  if(skin){requireValue(quantity===1,'Со скином продаётся один экземпляр');const owned=v.d.ownedSkins[t]??[],i=owned.indexOf(skin.id);requireValue(i>=0,'Скин не принадлежит тебе');owned.splice(i,1);if(v.d.skins?.[t]===skin.id&&!owned.includes(skin.id))v.d.skins[t]='classic';}
  v.d.inventory[t]-=quantity;const ids=Array.from({length:quantity},()=>randomUUID());
  await c.query("INSERT INTO listings(id,seller,symbol,skin,price_cents,status,created) SELECT unnest($1::text[]),$2,$3,$4,$5,'open',$6",[ids,id,t,skin?.id??null,price,new Date(now)]);
  await saveVaults(c,[v],null,key,now);return {listingIds:ids};
 }
 const l=await one(c,"SELECT * FROM listings WHERE id=$1 AND status='open' FOR UPDATE",[b.id]);requireValue(l,'Предложение недоступно',409);
 requireValue(kind==='cancel'?l.seller===id:l.seller!==id,'Недоступное предложение',403);
 if(kind==='buy')requireValue(!await one(c,'SELECT 1 FROM blocks WHERE (owner=$1 AND target=$2) OR (owner=$2 AND target=$1)',[id,l.seller]),'Взаимодействие недоступно',403);
 const vs=await lockVaults(c,kind==='buy'?[id,l.seller]:[id]),v=vs.find(v=>v.profile_id===id),cents=Number(l.price_cents);
 if(kind==='buy'){requireValue(v.d.balanceCents>=cents,'Не хватает рубинов');addMoney(v.d,-cents);addMoney(vs.find(v=>v.profile_id===l.seller).d,cents);}
 v.d.inventory[l.symbol]=(v.d.inventory[l.symbol]??0)+1;
 if(l.skin){v.d.ownedSkins[l.symbol]??=[];v.d.ownedSkins[l.symbol].push(l.skin);v.d.skins??={};v.d.skins[l.symbol]=l.skin;}
 const r=await c.query("UPDATE listings SET status=$2,buyer=$3 WHERE id=$1 AND status='open'",[l.id,kind==='buy'?'sold':'cancelled',kind==='buy'?id:null]);requireValue(r.rowCount===1,'Предложение изменилось',409);
 await saveVaults(c,vs,null,key,now);return {listingId:l.id,status:kind==='buy'?'sold':'cancelled'};
}
export async function marketPage(c,id,{symbol=null,offset=0,desc=false}={}){
 requireValue(Number.isSafeInteger(offset)&&offset>=0&&offset<=10000,'Недопустимая страница');
 const rows=(await c.query(`SELECT l.id,l.seller,l.symbol,l.skin,l.price_cents AS "priceCents",l.created,v.data->>'nick' AS nick
 FROM listings l JOIN vaults v ON v.profile_id=l.seller WHERE l.status='open' AND ($1::text IS NULL OR l.symbol=$1)
 AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.owner=$2 AND b.target=l.seller) OR (b.owner=l.seller AND b.target=$2))
 ORDER BY l.price_cents ${desc?'DESC':'ASC'},l.created,l.id LIMIT 61 OFFSET $3`,[symbol,id,offset])).rows;
 return {listings:rows.slice(0,60),nextOffset:rows.length>60?offset+60:null};
}
