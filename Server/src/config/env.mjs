export function config(env=process.env){
 if(!env.DATABASE_URL)throw Error('DATABASE_URL required');
 const webOrigin=env.WEB_ORIGIN||null;
 if(webOrigin){const u=new URL(webOrigin);if(u.origin!==webOrigin||u.username||u.password||!(u.protocol==='https:'||(u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname))))throw Error('WEB_ORIGIN must be an exact HTTPS origin (HTTP allowed only on loopback)');}
 return {databaseUrl:env.DATABASE_URL,webOrigin,port:Number(env.PORT??3000),host:env.HOST??'127.0.0.1',poolMax:Number(env.PG_POOL_MAX??10),trustProxy:env.TRUST_PROXY?env.TRUST_PROXY.split(','):false,log:env.LOG_LEVEL??'info',scheduler:env.SCHEDULER!=='false'};
}
