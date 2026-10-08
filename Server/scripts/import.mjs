import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {createPool,transaction,one} from '../src/repositories/db.mjs';
import {config} from '../src/config/env.mjs';
import {freshVault,PRICES} from '../src/domain/economy.mjs';
import {parseMoney} from '../src/domain/money.mjs';
const tables=['profiles','matches','recovery','recovery_limits','vaults','listings','arenas','operations','account_sessions'];
export function cents(value){if(String(value)==='0')return 0;return parseMoney(String(value));}
const integer=(n,name)=>{if(!Number.isSafeInteger(n)||n<0)throw Error('Invalid '+name);return n;};
function wallet(old,profile){
 const d=old?JSON.parse(old.data):freshVault(profile.nick),legacy=JSON.parse(profile.data);
 if(!old&&!legacy.newEconomy){d.balanceCents=cents(legacy.human?.balance??1);d.nick=legacy.nick||profile.nick;d.tutorialDone=legacy.tutorial?.status==='done';d.rank=legacy.rank??null;d.rankProgress=Math.min(80,(legacy.trial?.results?.length??0)*20);d.trialRun=(legacy.trial?.results??[]).slice(0,4);d.history=legacy.history??[];for(const t of Object.keys(PRICES))d.inventory[t]=legacy.human?.unlocked?.includes(t)?1:0;}
 if(d.balanceCents===undefined)d.balanceCents=cents(d.balance);integer(d.balanceCents,'balance');
 // balance is an old display cache; balanceCents is authoritative if supplied.
 d.balance=d.balanceCents/100;d.inventory??={};for(const t of Object.keys(PRICES))d.inventory[t]??=0;
 for(const n of Object.values(d.inventory))integer(n,'inventory');integer(d.xp??0,'xp');
 d.ownedSkins??=Object.fromEntries(Object.entries(d.skins??{}).map(([t,k])=>[t,[k]]));d.skins??={};d.quests??={clean:0,blocks:0};d.claims??=[];d.game=null;return d;
}
export async function importDatabase(pool,file,{dryRun=true}={}){
 const bytes=fs.readFileSync(file),digest=createHash('sha256').update(bytes).digest('hex'),report={digest,dryRun,counts:{},errors:[],policy:'active matches archived and cancelled without new rewards; open listings preserve escrow'};
 let sql;
 if(file.endsWith('.sql')){sql=new DatabaseSync(':memory:');sql.exec(bytes.toString('utf8'));}else sql=new DatabaseSync(file,{readOnly:true});
 const rows={};
 try{for(const t of tables){rows[t]=sql.prepare(t==='listings'?'SELECT *,CAST(price AS TEXT) AS exact_price FROM listings':'SELECT * FROM '+t).all();report.counts[t]=rows[t].length;}}
 finally{sql.close();}
 const ids=new Set(rows.profiles.map(p=>p.id)),vaults=new Map();
 for(const p of rows.profiles)try{vaults.set(p.id,wallet(rows.vaults.find(v=>v.profile_id===p.id),p));if(!/^[a-f0-9]{64}$/.test(p.token_hash))throw Error('Invalid token hash');}catch(e){report.errors.push({table:'profiles',id:p.id,error:e.message});}
 for(const row of rows.vaults)if(!ids.has(row.profile_id))report.errors.push({table:'vaults',id:row.profile_id,error:'Missing profile'});
 for(const l of rows.listings)try{l.cents=l.price_cents==null?cents(l.exact_price):integer(l.price_cents,'price_cents');if(l.price_cents!=null&&cents(l.exact_price)!==l.cents)throw Error('price/price_cents mismatch');if(!ids.has(l.seller)||l.buyer&&!ids.has(l.buyer))throw Error('Missing listing owner');}catch(e){report.errors.push({table:'listings',id:l.id,error:e.message});}
 report.sourceBalanceCents=[...vaults.values()].reduce((sum,d)=>sum+BigInt(d.balanceCents),0n).toString();
 report.sourceInventory=Object.fromEntries(Object.keys(PRICES).map(t=>[t,[...vaults.values()].reduce((sum,d)=>sum+BigInt(d.inventory[t]??0),0n).toString()]));
 if(report.errors.length)return {...report,ok:false};
 class DryRun extends Error{}
 try{await transaction(pool,async c=>{
  await c.query('SELECT pg_advisory_xact_lock(830014)');
  if(await one(c,'SELECT 1 FROM imports WHERE digest=$1',[digest])){report.alreadyImported=true;return;}
  for(const p of rows.profiles){await c.query('INSERT INTO profiles(id,nick,legacy_data,seen) VALUES($1,$2,$3,$4)',[p.id,p.nick,JSON.parse(p.data),new Date(p.seen)]);const d=vaults.get(p.id);await c.query('INSERT INTO vaults(profile_id,data,balance_cents,revision) VALUES($1,$2,$3,$4)',[p.id,d,d.balanceCents,String(rows.vaults.find(v=>v.profile_id===p.id)?.revision??0)]);
   await c.query("INSERT INTO account_sessions(token_hash,profile_id,created,expires) VALUES($1,$2,now(),now()+interval '30 days')",[p.token_hash,p.id]);}
  for(const r of rows.recovery)await c.query('INSERT INTO recovery VALUES($1,$2)',[r.profile_id,r.code_hash]);
  for(const r of rows.account_sessions)await c.query("INSERT INTO account_sessions(token_hash,profile_id,created,expires) VALUES($1,$2,$3,now()+interval '30 days') ON CONFLICT(token_hash) DO NOTHING",[r.token_hash,r.profile_id,new Date(r.created)]);
  for(const r of rows.recovery_limits)await c.query('INSERT INTO recovery_limits VALUES($1,$2,$3) ON CONFLICT(key) DO NOTHING',[r.key,r.count,new Date(r.expires)]);
  for(const l of rows.listings)await c.query('INSERT INTO listings VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[l.id,l.seller,l.symbol,l.skin??null,l.cents,l.status,l.buyer,new Date(l.created)]);
  // Preserve every legacy row, including pre-v2 history and cancelled active states, privately.
  for(const t of tables)for(const r of rows[t])await c.query('INSERT INTO legacy_rows VALUES($1,$2,$3)',[t,String(r.id??r.profile_id??r.token_hash??r.key),r]);
  const target=(await c.query('SELECT profile_id,data,balance_cents FROM vaults WHERE profile_id=ANY($1::text[])',[[...ids]])).rows;
  report.targetBalanceCents=target.reduce((n,r)=>n+BigInt(r.balance_cents),0n).toString();report.targetProfiles=target.length;
  report.targetInventory=Object.fromEntries(Object.keys(PRICES).map(t=>[t,target.reduce((n,r)=>n+BigInt(r.data.inventory[t]??0),0n).toString()]));
  report.ownershipVerified=target.every(r=>JSON.stringify(r.data.ownedSkins)===JSON.stringify(vaults.get(r.profile_id).ownedSkins)&&JSON.stringify(r.data.ownedAvatars)===JSON.stringify(vaults.get(r.profile_id).ownedAvatars));
  report.openListingsVerified=Number((await one(c,"SELECT count(*) n FROM listings WHERE seller=ANY($1::text[]) AND status='open'",[[...ids]])).n)===rows.listings.filter(l=>l.status==='open').length;
  if(report.targetBalanceCents!==report.sourceBalanceCents||target.length!==ids.size||JSON.stringify(report.targetInventory)!==JSON.stringify(report.sourceInventory)||!report.ownershipVerified||!report.openListingsVerified)throw Error('Reconciliation mismatch');
  report.ok=true;await c.query('INSERT INTO imports(digest,report) VALUES($1,$2)',[digest,report]);if(dryRun)throw new DryRun();
 });}catch(e){if(!(e instanceof DryRun)){report.ok=false;report.errors.push({error:e.code??e.message});}}
 if(report.alreadyImported)report.ok=true;return report;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const file=process.argv[2],reportArg=process.argv.find(a=>a.startsWith('--report='));if(!file||!reportArg)throw Error('Usage: npm run db:import -- private/export.sqlite [--apply] --report=private/report.json');
 const out=path.resolve(reportArg.slice(9));if(!out.startsWith(path.resolve('private')+path.sep))throw Error('Report must be inside ignored Server/private/');fs.mkdirSync(path.dirname(out),{recursive:true});
 const p=createPool(config());try{const r=await importDatabase(p,file,{dryRun:!process.argv.includes('--apply')});fs.writeFileSync(out,JSON.stringify(r,null,2));console.log({ok:r.ok,dryRun:r.dryRun,report:out});if(!r.ok)process.exitCode=1;}finally{await p.end();}
}
