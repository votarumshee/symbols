import {durableStore} from './storage.mjs';
import {Capacitor,CapacitorHttp,registerPlugin} from '@capacitor/core';
import {App} from '@capacitor/app';
export const native=Capacitor.isNativePlatform();
const vault=registerPlugin('SymbolsVault');
export let storageError=null;
export function markStorageError(){storageError=native?"Не удалось прочитать или сохранить защищённые данные. Восстанови доступ по коду. Старые данные сохранены.":"Браузер запретил сохранение данных. Разреши хранилище для сайта и повтори вход.";dispatchEvent(new Event("symbols-storage-error"));}
let values={};
if(native){try{values=JSON.parse((await vault.read()).value||'{}');}catch(e){storageError='Защищённое хранилище недоступно. Восстанови аккаунт по сохранённому коду. Старые данные сохранены.';}}
// Browser stores only public display preferences and pending command metadata.
// Authentication belongs exclusively to the server's opaque HttpOnly cookie.
let browserStorage;try{if(!native){browserStorage=localStorage;for(const store of [localStorage,sessionStorage])for(const k of Object.keys(store)){if(k.includes('symbols-session')||k.includes('recovery-code'))store.removeItem(k);}}}catch{markStorageError();}
const nativeStore=durableStore(values,value=>vault.write({value}),markStorageError);
const browserValues=new Map();
export const clientStorage=native?{getItem:key=>nativeStore.getItem(key),setItem(key,value){if(storageError)throw Error(storageError);nativeStore.setItem(key,value);},removeItem(key){if(storageError)throw Error(storageError);nativeStore.removeItem(key);}}:{
 getItem(key){try{return browserStorage?.getItem(key)??browserValues.get(key)??null;}catch{markStorageError();return null;}},
 setItem(key,value){if(key.includes('symbols-session')||key.includes('recovery-code'))return;if(storageError)throw Error(storageError);try{browserStorage.setItem(key,value);}catch{markStorageError();throw Error(storageError);}},
 removeItem(key){try{browserStorage?.removeItem(key);}catch{markStorageError();}}
};
export const flushStorage=()=>native?nativeStore.flush():storageError?Promise.reject(Error(storageError)):Promise.resolve();
export async function resetStorage(){if(!native){location.reload();return;}await vault.reset({confirm:true});location.reload();}
export function minimizeApp(){if(Capacitor.getPlatform()==='android')return App.minimizeApp();}
export async function transport(path,{token,accountId,body,key,signal}={}) {
  const headers={...(native&&token?{Authorization:'Bearer '+token}:{}),...(!native&&accountId?{'X-Symbols-Account':accountId}:{}),...(body?{'Content-Type':'application/json'}:{}),...(key?{'Idempotency-Key':key}:{})};
  if(native) {
    const r=await CapacitorHttp.request({url:__NATIVE_API__+'/api/v3/'+path,method:body?'POST':'GET',headers,data:body,readTimeout:35000,connectTimeout:10000,responseType:'json',disableRedirects:true});
    return {status:r.status,data:r.data,headers:r.headers};
  }
  const timeout=new AbortController();const timer=setTimeout(()=>timeout.abort(),35000);
  const abort=()=>timeout.abort();signal?.addEventListener('abort',abort,{once:true});
  try {
    const r=await fetch('/api/web/v3/'+path,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined,credentials:'same-origin',redirect:'error',signal:timeout.signal});
    return {status:r.status,data:await r.json(),headers:Object.fromEntries(r.headers)};
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
export function lifecycle(onActive,onBack) {
  document.addEventListener('visibilitychange',()=>onActive(!document.hidden));
  if(native){App.addListener('appStateChange',({isActive})=>onActive(isActive));App.addListener('backButton',onBack);}
}
