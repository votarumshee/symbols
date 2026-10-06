// Explicit allowlists: new internal fields never become public by accident.
const pick=(o,keys)=>Object.fromEntries(keys.filter(k=>o?.[k]!==undefined).map(k=>[k,structuredClone(o[k])]));
export function profileView(d){const v=pick(d,['nick','tutorialDone','balanceCents','inventory','xp','rank','rankProgress','trialRun','history','quests','game','ownedSkins','skins','avatar','ownedAvatars','upgrades','frame','cases','lastCaseDrop','levelRewards']);v.balanceCents=String(d.balanceCents);return v;}
export function matchView(s,user,revision){
 if(!s)return null;
 const seats=s.players.flatMap((p,i)=>p.id===user&&!p.bot?[i]:[]);
 if(!seats.length)throw Error('Партия недоступна');
 const v=pick(s,['id','mode','size','capacity','status','created','deadline','code','tutorial','level','started','actor','turnAt','finished','reason','damage','blocks']);
 v.revision=String(revision);v.seats=seats;
 v.players=s.players.map(p=>pick(p,['id','nick','avatar','frame','level','rank','skins','bot']));
 v.board=s.g?pick(s.g,['width','rows','height','boards','hp','maxHp','kingHp','kingMax','current','pending','extra','turn','winner']):null;
 v.uses=s.g?Object.fromEntries(seats.map(i=>[i,s.g.playerStocks?.[i]??{}])):{};
 v.result=s.results?.[user]??null;
 return v;
}
export function patch(before,after){const result={};for(const k of new Set([...Object.keys(before??{}),...Object.keys(after??{})])){if(JSON.stringify(before?.[k])!==JSON.stringify(after?.[k]))result[k]=after?.[k]??null;}return result;}
export function matchPatch(before,after){
 if(!before||!after||before.id!==after.id||!before.board&&after.board)return {snapshot:after};
 const delta=patch(before,after);
 if(delta.board&&before.board&&after.board){const fields=patch(before.board,after.board);delete fields.boards;
 const cells=[];for(let side=0;side<2;side++)for(let index=0;index<after.board.boards[side].length;index++)if(JSON.stringify(before.board.boards[side][index])!==JSON.stringify(after.board.boards[side][index]))cells.push({side,index,value:after.board.boards[side][index]});
 delta.board={...fields,cells};
 }return {baseRevision:before.revision,patch:delta};
}
