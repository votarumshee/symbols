import {config} from './config/env.mjs';
import {buildApp} from './app.mjs';
const cfg=config();cfg.metricsToken=process.env.METRICS_TOKEN;const app=await buildApp(cfg);
await app.listen({host:cfg.host,port:cfg.port});
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,async()=>{await app.close();process.exitCode=0;});
