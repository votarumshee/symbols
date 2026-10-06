import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
for(const base of ['src','scripts','test','migrations'])for(const f of fs.readdirSync(base,{recursive:true}).filter(f=>/\.(m?js)$/.test(f))){const file=path.join(base,f);if(spawnSync(process.execPath,['--check',file],{stdio:'inherit'}).status)process.exit(1);if(base==='src'&&/\.\.\/.*(?:dist|Client)\/|localStorage|env\.DB|env\.AVATARS/.test(fs.readFileSync(file,'utf8')))throw Error('Forbidden runtime dependency '+file);}
console.log('Standalone ES modules checked');
