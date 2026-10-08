import {records} from "./catalog.mjs";
export const CASE_PRICE=2000;
export const CASES=records('case').map(r=>({...r.payload,price:r.payload.priceCents}));
export function drawCase(c,roll=crypto.getRandomValues(new Uint32Array(1))[0]/4294967296){let cursor=roll*10000;for(const [symbol,weight] of c.drops){cursor-=weight;if(cursor<0)return symbol;}return c.drops.at(-1)[0];}

export const casePrice=c=>c.price??CASE_PRICE;
