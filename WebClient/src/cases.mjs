export const CASE_PRICE=2000;
export const CASES=[
{id:'assault',name:'Штурм',mark:'⚔️',tone:'red',drops:[['circle',6500],['feedback',1500],['arrowx2',1500],['laser',480],['tank',20]]},
{id:'energy',name:'Энергия',mark:'⚡',tone:'purple',drops:[['circle',6500],['angry',3000],['inspect',480],['powerful',20]]},
{id:'guard',name:'Страж',mark:'🛡️',tone:'green',drops:[['circle',6500],['feedback',3000],['electricity',480],['sword',20]]},
{id:'rift',price:7500,name:'Разлом',mark:'🌀',tone:'blue',drops:[['circle',6500],['angry',3000],['teleport',480],['sword',10],['tank',10]]}
];
export function drawCase(c,roll=crypto.getRandomValues(new Uint32Array(1))[0]/4294967296){let cursor=roll*10000;for(const [symbol,weight] of c.drops){cursor-=weight;if(cursor<0)return symbol;}return c.drops.at(-1)[0];}

export const casePrice=c=>c.price??CASE_PRICE;
