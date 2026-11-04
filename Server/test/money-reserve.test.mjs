import test from 'node:test';
import assert from 'node:assert/strict';
import {freshVault} from '../src/domain/economy.mjs';
import {walletTotal,addMoney} from '../src/domain/money.mjs';
import {redeemPromo,PROMO_100_RUBIES} from '../src/domain/promo.mjs';
import {profileView} from '../src/transport/projection.mjs';

test('promo 100 grants exact large amount once while legacy balance stays safe',()=>{
 const d=freshVault('Игрок');const grant=BigInt(PROMO_100_RUBIES)*100n;
 assert.equal(redeemPromo(d,' 100 ').rubies,PROMO_100_RUBIES);
 assert.equal(walletTotal(d),grant+100n);assert.equal(d.balanceCents,Number.MAX_SAFE_INTEGER);
 assert.equal(profileView(d).rubyReserveCents,d.rubyReserveCents);
 const stored=JSON.stringify(d);assert.equal(walletTotal(JSON.parse(stored)),grant+100n);
 assert.throws(()=>redeemPromo(d,'100'),e=>e.code==='PROMO_CLAIMED');assert.equal(JSON.stringify(d),stored);
 redeemPromo(d,'10');assert.equal(d.inventory.sword,25);assert.equal(walletTotal(d),grant+100n);
});

test('exact cents survive spend, award, reserve boundary and JSON round trips',()=>{
 const d=freshVault('Игрок');redeemPromo(d,'100');const total=walletTotal(d);
 addMoney(d,-425);assert.equal(walletTotal(d),total-425n);addMoney(d,1);assert.equal(walletTotal(d),total-424n);
 addMoney(d,-(walletTotal(d)-20n));assert.equal(d.balanceCents,20);assert.equal(d.rubyReserveCents,'0');
 addMoney(d,-20);assert.equal(walletTotal(d),0n);assert.throws(()=>addMoney(d,-1));assert.equal(walletTotal(d),0n);
});

test('invalid reserves and non-integer deltas cannot corrupt money',()=>{
 for(const rubyReserveCents of [null,-1,'-1','1e30','01','',{},'9'.repeat(81)])assert.throws(()=>walletTotal({balanceCents:100,rubyReserveCents}));
 const d=freshVault('Игрок');for(const value of [NaN,Infinity,.5,Number.MAX_SAFE_INTEGER+1,'100'])assert.throws(()=>addMoney(d,value));
 assert.equal(walletTotal(d),100n);
});
