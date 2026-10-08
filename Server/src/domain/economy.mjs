import {records} from './catalog.mjs';
export const BASE=records('symbol').filter(r=>r.payload.free&&r.key!=='king').map(r=>r.key);
export const PRICES=Object.fromEntries(records('symbol').filter(r=>r.payload.referencePriceRubies!=null).map(r=>[r.key,r.payload.referencePriceRubies]));
export function freshVault(nick){return {nick,tutorialDone:false,balanceCents:100,balance:1,inventory:Object.fromEntries(Object.keys(PRICES).map(t=>[t,0])),xp:0,rank:null,rankProgress:0,trialRun:[],history:[],claims:[],quests:{clean:0,blocks:0},game:null,ownedSkins:{},skins:{},avatar:'lion'};}
