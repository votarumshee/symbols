// Dependency-free ZIP/ELF alignment audit. Run after zipalign/apksigner verification.
import fs from 'node:fs';
import zlib from 'node:zlib';
const path=process.argv[2];if(!path)throw Error('node scripts/audit-apk.mjs file.apk');
const zip=fs.readFileSync(path),libs=[];let end=zip.length-22;while(end>=0&&zip.readUInt32LE(end)!==0x06054b50)end--;if(end<0)throw Error('Invalid ZIP');
let pos=zip.readUInt32LE(end+16);const count=zip.readUInt16LE(end+10);
for(let i=0;i<count;i++){
 if(zip.readUInt32LE(pos)!==0x02014b50)throw Error('Invalid central directory');
 const method=zip.readUInt16LE(pos+10),size=zip.readUInt32LE(pos+20),n=zip.readUInt16LE(pos+28),extra=zip.readUInt16LE(pos+30),comment=zip.readUInt16LE(pos+32),local=zip.readUInt32LE(pos+42),name=zip.toString('utf8',pos+46,pos+46+n);pos+=46+n+extra+comment;
 if(!name.endsWith('.so'))continue;
 const start=local+30+zip.readUInt16LE(local+26)+zip.readUInt16LE(local+28);const compressed=zip.subarray(start,start+size),elf=method===0?compressed:zlib.inflateRawSync(compressed);
 const is64=elf[4]===2;const ph=Number(is64?elf.readBigUInt64LE(32):elf.readUInt32LE(28));const stride=elf.readUInt16LE(is64?54:42),num=elf.readUInt16LE(is64?56:44);const aligns=[];
 for(let j=0;j<num;j++){const p=ph+j*stride;if(elf.readUInt32LE(p)===1)aligns.push(Number(is64?elf.readBigUInt64LE(p+48):elf.readUInt32LE(p+28)));}
 libs.push({name,is64,loadAlignments:aligns,elf16k:aligns.every(a=>a>=16384),zip16k:method!==0||start%16384===0});
}
console.log(JSON.stringify({file:path,libraries:libs,pass:libs.every(l=>(!l.is64||l.elf16k)&&l.zip16k)},null,2));
if(libs.some(l=>l.is64&&!l.elf16k||!l.zip16k))process.exitCode=1;
