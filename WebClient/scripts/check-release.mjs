import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const config=JSON.parse(await fs.readFile(new URL('../capacitor.config.json',import.meta.url))),build=JSON.parse(await fs.readFile(new URL('../www/build.json',import.meta.url))),source=await fs.readFile(new URL('./build.mjs',import.meta.url),'utf8');
assert(!config.server?.url&&!config.server?.cleartext);assert.equal(config.loggingBehavior,'none');assert.equal(config.android.webContentsDebuggingEnabled,false);assert.equal(config.ios.webContentsDebuggingEnabled,false);assert.equal(build.apiVersion,3);assert(!source.includes('../dist'));assert.equal(build.assetVersion,createHash('sha256').update(await fs.readFile(new URL('../www/client.js',import.meta.url))).digest('hex'));
if(process.env.SYMBOLS_RELEASE_CHECK==='production')assert.equal(build.nativeApi,'https://symbols-api.votarumshee.com');
const ui=await fs.readFile(new URL('../src/next.mjs',import.meta.url),'utf8');assert(!/request\("(?:instant|promo)"/.test(ui));assert(!ui.includes('/api/v2'));
const bundle=await fs.readFile(new URL('../www/client.js',import.meta.url),'utf8');for(const secret of [/-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/,/ya29\.[a-zA-Z0-9_-]{20}/,/1\/\/0[a-zA-Z0-9_-]{40}/])assert(!secret.test(bundle));
console.log(JSON.stringify({pass:true,...build}));
