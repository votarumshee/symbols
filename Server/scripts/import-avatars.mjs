import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createPool,one} from '../src/repositories/db.mjs';
import {config} from '../src/config/env.mjs';
const manifest=JSON.parse(fs.readFileSync(process.argv[2],'utf8')),source=fs.realpathSync(process.argv[3]),destination=path.resolve(process.argv[4]??'private/avatars'),apply=process.argv.includes('--apply');
const p=createPool(config());let count=0;try{for(const entry of manifest){
 if(!/^avatars\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.jpg$/.test(entry.key))throw Error('Invalid R2 key');
 const profileId=entry.key.split('/')[1];if(!await one(p,'SELECT 1 FROM profiles WHERE id=$1',[profileId]))throw Error('Unknown avatar owner');
 const input=fs.realpathSync(path.join(source,entry.key));if(!input.startsWith(source+path.sep))throw Error('Source escapes export directory');
 const data=fs.readFileSync(input);if(data.length>5*1024*1024||data[0]!==255||data[1]!==216)throw Error('Invalid JPEG');
 if(createHash('sha256').update(data).digest('hex')!==entry.sha256)throw Error('Avatar checksum mismatch');
 const output=path.join(destination,entry.key.slice(8));if(apply){fs.mkdirSync(path.dirname(output),{recursive:true});if(fs.existsSync(output)&&!fs.readFileSync(output).equals(data))throw Error('Refusing to overwrite a different avatar');fs.writeFileSync(output,data);}count++;
 }console.log({validated:count,applied:apply});}finally{await p.end();}
