export function config(env=process.env){
 if(!env.DATABASE_URL)throw Error('DATABASE_URL required');
 return {databaseUrl:env.DATABASE_URL,port:Number(env.PORT??3000),host:env.HOST??'127.0.0.1',poolMax:Number(env.PG_POOL_MAX??10),trustProxy:env.TRUST_PROXY?env.TRUST_PROXY.split(','):false,log:env.LOG_LEVEL??'info',scheduler:env.SCHEDULER!=='false'};
}
