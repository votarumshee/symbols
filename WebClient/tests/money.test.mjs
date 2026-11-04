import test from 'node:test';
import assert from 'node:assert/strict';
import {money,walletTotal} from '../src/money.mjs';
import {legacyView,reduceEvents} from '../src/state.mjs';

test('full balance formats exact ruby digits and cents without rounding',()=>{
 const total=10n**38n+101n,p={balanceCents:'9007199254740991',rubyReserveCents:(total-9007199254740991n).toString()};
 assert.equal(money(walletTotal(p)).replace(/\s/g,''),'1000000000000000000000000000000000001,01');
 assert.equal(money('425'),'4,25');assert.equal(money(0),'0,00');
});

test('reserve survives snapshot projection and event replay',()=>{
 const state={cursor:'0',revision:'0',profile:{balanceCents:'100'},match:null};
 const page={cursor:'1',events:[{cursor:'1',revision:'1',serverTime:'2026-11-04T00:00:00Z',profilePatch:{balanceCents:'9007199254740991',rubyReserveCents:'1000000000000000000000000'}}]};
 const updated=reduceEvents(state,page),p=legacyView(updated,'u').profile;
 assert.equal(walletTotal(p),1000000009007199254740991n);assert.equal(p.rubyReserveCents,page.events[0].profilePatch.rubyReserveCents);
 assert.deepEqual(reduceEvents(updated,page),updated);
});
