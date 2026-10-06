import {EventEmitter} from 'node:events';
import {changes} from '../services/sync.mjs';
import {authenticate} from '../services/accounts.mjs';
export async function eventHub(pool,log){
 const hub=new EventEmitter();hub.setMaxListeners(2000);let client,closed=false,retry;
 async function connect(){try{client=await pool.connect();client.on('notification',m=>hub.emit('change',m.payload));client.on('error',()=>{client?.release(true);client=null;if(!closed)retry=setTimeout(connect,1000);});await client.query('LISTEN symbols_events');hub.emit('change',null);}catch{if(!closed)retry=setTimeout(connect,1000);}}
 await connect();
 return {hub,async close(){closed=true;clearTimeout(retry);if(client){await client.query('UNLISTEN symbols_events');client.release();client=null;}}};
}
export function stream(socket,request,pool,hub,metrics){
 const user=request.user.profile_id,token=request.headers.authorization?.slice(7);let cursor=request.query.cursor,stopped=false,busy=false,pending=false,alive=true;
 const close=()=>{if(stopped)return;stopped=true;clearInterval(heartbeat);hub.off('change',onChange);metrics.connections--;};
 const send=data=>{if(socket.readyState===1){const body=JSON.stringify(data);if(socket.bufferedAmount>1048576){socket.close(1013,'Reconnect with cursor');return;}socket.send(body);metrics.wsMessages++;metrics.wsBytes+=Buffer.byteLength(body);}};
 async function flush(){if(stopped)return;if(busy){pending=true;return;}busy=true;
  try{let page;do{page=await changes(pool,user,cursor,request.user.token_hash);if(page.events.length){send(page);cursor=page.cursor;}}while(page.hasMore&&!stopped);}
  catch(e){send({error:{code:e.code??'UNAVAILABLE'}});socket.close(e.statusCode===401?1008:1012,'Resynchronize');}
  finally{busy=false;if(pending){pending=false;void flush();}}
 }
 const onChange=id=>{if(id===null||id===user)void flush();};hub.on('change',onChange);
 socket.on('pong',()=>{alive=true;});socket.on('message',()=>socket.close(1008,'Use HTTP commands'));
 socket.on('close',close);socket.on('error',close);
 const heartbeat=setInterval(()=>{if(!alive){socket.terminate();return;}alive=false;socket.ping();void flush();},20000);
 metrics.connections++;void flush();
}
