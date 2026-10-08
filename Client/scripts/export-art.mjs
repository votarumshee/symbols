// Build-time adaptation only. Client runtime is Kotlin/Compose, with no JS or WebView.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {skinIcon} from '../../dist/skin-icons.mjs';
import {TYPES} from '../../dist/engine.mjs';
import {SKINS} from '../../dist/skins.mjs';
const target=fileURLToPath(new URL('../app/src/main/assets/symbols/',import.meta.url));fs.mkdirSync(target,{recursive:true});
const symbolColor={point:'#eb9909',inspect:'#14a591',powerful:'#8654d6',angry:'#dc516b',teleport:'#3683e8',erase:'#637286'};
const palette={classic:'#d8e8e4',neon:'#d69cff',frost:'#a1e9ff',ember:'#ffb375',storm:'#bbf7ff',cosmos:'#88eaff',solar:'#ffca5c'};
for(const type of ['king',...Object.keys(TYPES)])for(const skin of SKINS){
 let svg=skinIcon(type,0,skin.id).replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" ')
 .replaceAll('currentColor',skin.id==='classic' ? (symbolColor[type]??palette.classic) : palette[skin.id]).replaceAll('var(--crown-fill,#287ad6)','#287ad6').replaceAll('var(--crown-edge,#133968)','#133968');
 fs.writeFileSync(path.join(target,`${type}-${skin.id}.svg`),svg);
}
for(const side of ['own','enemy']) {
 const svg=fs.readFileSync(path.join(target,'king-classic.svg'),'utf8').replaceAll('#287ad6',side==='own'?'#2587df':'#7849aa').replaceAll('#133968',side==='own'?'#174171':'#2c2146');
 fs.writeFileSync(path.join(target,`king-classic${side}.svg`),svg);
}
for(const asset of ['thunder-lion.png','fire-c.png','rank-atlas.png'])fs.copyFileSync(fileURLToPath(new URL('../../Server/public/'+asset,import.meta.url)),path.join(target,'../'+asset));
fs.writeFileSync(path.join(target,'../art-manifest.json'),JSON.stringify({source:'8c953993d57a887112a75c4b0a69bb2a376ea1eb',symbols:['king',...Object.keys(TYPES)],skins:SKINS.map(s=>s.id),license:'GPL-3.0; see THIRD_PARTY_NOTICES.md'},null,2));
