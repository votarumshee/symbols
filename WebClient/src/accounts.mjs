import {STORAGE_KEY,freshProgress} from './economy.mjs';
const REGISTRY='symbols-accounts-v1',ACTIVE='symbols-active-account';
export function accounts(storage){
 let entries=JSON.parse(storage.getItem(REGISTRY)||'null')??[{id:'original'}];
 if(!Array.isArray(entries)||!entries.some(e=>e.id==='original'))throw Error('Не удалось прочитать список аккаунтов');
 const active=storage.getItem(ACTIVE)||'original';if(!entries.some(e=>e.id===active))throw Error('Аккаунт не найден');
 const key=(id,k)=>id==='original'?k:`symbols-account:${id}:${k}`;
 return {active,storage:{getItem:k=>storage.getItem(key(active,k)),setItem:(k,v)=>storage.setItem(key(active,k),v)},
 list:()=>entries.map((e,i)=>{let p=null;try{p=JSON.parse(storage.getItem(key(e.id,STORAGE_KEY))||'null');}catch{}return {id:e.id,name:p?.nick||`Аккаунт ${i+1}`,balance:p?.human?.balance??1,rank:p?.rank??null};}),
 create:()=>{const id=crypto.randomUUID();storage.setItem(key(id,STORAGE_KEY),JSON.stringify(freshProgress()));const next=[...entries,{id}];storage.setItem(REGISTRY,JSON.stringify(next));entries=next;return id;},
 restore:(data,code)=>{let id=entries.find(e=>{try{return JSON.parse(storage.getItem(key(e.id,'symbols-session'))||'null')?.id===data.id;}catch{return false;}})?.id;if(!id){id=crypto.randomUUID();const next=[...entries,{id}];storage.setItem(REGISTRY,JSON.stringify(next));entries=next;}storage.setItem(key(id,STORAGE_KEY),JSON.stringify(data.profile));storage.setItem(key(id,'symbols-session'),JSON.stringify({id:data.id,token:data.token}));storage.setItem(key(id,'symbols-recovery-code'),code);return id;},
 select:id=>{if(!entries.some(e=>e.id===id))throw Error('Аккаунт не найден');storage.setItem(REGISTRY,JSON.stringify(entries));storage.setItem(ACTIVE,id);}};
}
