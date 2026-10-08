import {reduceEvents,legacyView} from './state.mjs';
export class ApiError extends Error {
  constructor(status,data,headers={}){super(data?.error?.message??'Сервер временно недоступен');this.status=status;this.code=data?.error?.code;this.retryAfter=Number(headers['retry-after']??headers['Retry-After']??0)*1000;}
}
export class Client {
  constructor({transport,storage,flush=async()=>{},onChange=()=>{},onStatus=()=>{},onUnauthorized=()=>{},onStorageError=()=>{},onTerminal=async()=>{}}){Object.assign(this,{transport,storage,flush,onChange,onStatus,onUnauthorized,onStorageError,onTerminal});this.state=null;this.session=null;this.running=false;this.active=true;this.inFlight=false;this.retryAt=0;this.generation=0;this.identity=0;this.worker=null;}
  context(){return {identity:this.identity,generation:this.generation,session:this.session&&{...this.session}};}
  current(c){return c.identity===this.identity&&c.session?.id===this.session?.id;}
  assertCurrent(c){if(!this.current(c))throw Error('Аккаунт изменён. Операция сохранена для сверки.');}
  async request(path,body,key,signal,context=this.context()){
    const r=await this.transport(path,{token:context.session?.token,accountId:context.session?.id,body,key,signal});
    if(r.status<200||r.status>=300){if(r.status===401&&this.current(context)&&context.generation===this.generation){this.stop();this.state=null;this.onUnauthorized();}throw new ApiError(r.status,r.data,r.headers);}return r.data;
  }
  pendingFor(c){if(!c.session)return null;try{const p=JSON.parse(this.storage.getItem('pending:'+c.session.id)||'null');if(p!==null&&(!p||typeof p!=='object'||typeof p.kind!=='string'||typeof p.key!=='string'||!p.key||!p.body||typeof p.body!=='object'||Array.isArray(p.body)))throw Error('invalid journal');return p;}catch{this.stop();this.onStorageError();throw Error('Журнал операции повреждён. Требуется восстановление хранилища.');}}
  get pending(){return this.pendingFor(this.context());}
  async savePending(value,c=this.context()){if(!c.session)throw Error('Нет аккаунта');this.storage.setItem('pending:'+c.session.id,JSON.stringify(value));await this.flush();if(this.current(c))this.onStatus();}
  view(){return legacyView(this.state,this.session?.id);}
  async useSession(s){if(this.session?.id===s?.id&&this.session?.token===s?.token)return;this.stop();this.identity++;this.session=s;this.state=null;}
  async bootstrap(c=this.context()){const s=await this.request('bootstrap',undefined,undefined,undefined,c);if(!this.current(c))return;if(this.contentVersion&&s.contentVersion!==this.contentVersion)throw Error('Правила игры обновились. Нужна новая версия клиента.');if(!this.state||BigInt(s.cursor)>=BigInt(this.state.cursor))this.state=s;this.onChange(this.view());return this.view();}
  async authenticate(kind,value){return this.request('account/'+kind,kind==='register'?{nick:value}:{code:value});}
  async command(kind,body={}) {
    if(this.inFlight)throw Error('Дождись завершения операции');
    if(this.pending)throw Error('Сначала проверь незавершённую операцию');
    if(Date.now()<this.retryAt)throw Error('Слишком много запросов. Подожди перед повтором.');
    if(["logout","delete-account"].includes(kind))this.stop();
    const c=this.context();this.inFlight=true;
    try {
      const b={...body};delete b.key;delete b.progress;
      if(kind==='sell'){b.price=String(b.price).trim().replace(',','.');if(!b.skin)b.skin='classic';}
      if(['action','leave'].includes(kind)){if(!this.state?.match)throw Error('Обнови поле');b.matchId=this.state.match.id;b.revision=String(body.revision??this.state.match.revision);}
      const p={kind,body:b,key:crypto.randomUUID(),at:Date.now()};
      await this.savePending(p,c);this.assertCurrent(c);
      return await this.sendPending(c,p);
    }finally{this.inFlight=false;}
  }
  async sendPending(c=this.context(),p=this.pendingFor(c)) {
    this.assertCurrent(c);await this.flush();this.assertCurrent(c);let result;
    try{result=await this.request('commands/'+p.kind,p.body,p.key,undefined,c);}
    catch(e){if(e.status>=400&&e.status<500&&![408,429].includes(e.status))await this.savePending(null,c);if(this.current(c)){if(e.status===429)this.retryAt=Date.now()+Math.max(1000,e.retryAfter);this.onStatus(e.message);}throw e;}
    await this.savePending(null,c);this.assertCurrent(c);
    if(['logout','delete-account'].includes(p.kind)){this.stop();this.state=null;await this.onTerminal(p.kind,c.session.id);return result;}
    await this.bootstrap(c);this.assertCurrent(c);
    return {...result,...this.view()};
  }
  async reconcile() {
    if(this.inFlight)return;this.inFlight=true;const c=this.context();
    try {
      const p=this.pendingFor(c);if(!p)return this.bootstrap(c);
      if(['action','leave'].includes(p.kind)){await this.bootstrap(c);this.assertCurrent(c);await this.savePending(null,c);return this.view();}
      if(!Number.isFinite(p.at)||p.at<=0||Date.now()-p.at<0||Date.now()-p.at>24*3600000)throw Error('Старая операция: требуется сверка с поддержкой');
      if(Date.now()<this.retryAt)throw Error('Подожди перед повтором');
      return await this.sendPending(c,p);
    }finally{this.inFlight=false;}
  }
  stop(){this.generation++;this.abort?.abort();this.running=false;this.wake?.();}
  setActive(active){if(this.active===active)return;this.active=active;this.stop();if(active&&this.session)this.start();}
  start(){if(!this.session||!this.active)return;this.running=true;this.ensureWorker();}
  ensureWorker(){
    // Native CapacitorHttp cannot cancel: one worker until its real promise settles.
    if(this.worker||!this.running||!this.active)return;
    const g=this.generation;this.worker=this.loop(g).catch(e=>{if(g===this.generation)this.onStatus(e.message);}).finally(()=>{this.worker=null;if(this.running&&this.active)this.ensureWorker();});
  }
  async sleep(ms){await new Promise(resolve=>{const timer=setTimeout(done,ms);function done(){clearTimeout(timer);resolve();}this.wake=done;});this.wake=null;}
  async loop(g) {
    let failures=0;const c=this.context();
    while(g===this.generation&&this.active&&this.running) {
      try {
        if(!this.state)await this.bootstrap(c);
        if(g!==this.generation||!this.state)return;
        this.abort=new AbortController();
        const page=await this.request('changes?cursor='+this.state.cursor,undefined,undefined,this.abort.signal,c);
        if(g!==this.generation)return;
        const before=this.state.cursor;
        try{this.state=reduceEvents(this.state,page);}catch{await this.bootstrap(c);}
        if(g!==this.generation)return;
        if(this.state.cursor!==before)this.onChange(this.view());this.onStatus();failures=0;
      }catch(e){
        if(g!==this.generation)return;
        if(e.status===401){this.onStatus('Сессия истекла. Войди по коду восстановления.');this.running=false;return;}
        this.onStatus('Связь потеряна. Восстанавливаем…');
        if(e.code==='SNAPSHOT_REQUIRED'){await this.bootstrap(c);continue;}
        await this.sleep(Math.max(e.retryAfter??0,Math.min(30000,1000*2**Math.min(failures++,5))));
      }
    }
  }
  async market({symbol,desc=false,offset=0}){const c=this.context(),q=new URLSearchParams({desc:String(desc),offset:String(offset)});if(symbol)q.set('symbol',symbol);const d=await this.request('market?'+q,undefined,undefined,undefined,c);this.assertCurrent(c);return d;}
}
