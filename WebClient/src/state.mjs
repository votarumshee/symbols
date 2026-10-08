export const clone=value=>JSON.parse(JSON.stringify(value));
// Validate continuity before publishing; a bad page must not partially update UI.
export function reduceEvents(previous,page) {
  const state=clone(previous);
  for(const e of page.events) {
    if(BigInt(e.cursor)<=BigInt(state.cursor))continue;
    if(BigInt(e.cursor)!==BigInt(state.cursor)+1n)throw Error('SNAPSHOT_REQUIRED');
    Object.assign(state.profile,e.profilePatch);
    if(e.match) {
      if('snapshot'in e.match)state.match=clone(e.match.snapshot);
      else {
        if(!state.match||state.match.id!==e.entityId||state.match.revision!==e.match.baseRevision)throw Error('SNAPSHOT_REQUIRED');
        const patch=clone(e.match.patch),board=patch.board;delete patch.board;
        Object.assign(state.match,patch);
        if(board) {
          if(!state.match.board)throw Error('SNAPSHOT_REQUIRED');
          const cells=board.cells??[];delete board.cells;Object.assign(state.match.board,board);
          for(const {side,index,value} of cells) {
            if(!state.match.board.boards[side]||index<0||index>=state.match.board.boards[side].length)throw Error('SNAPSHOT_REQUIRED');
            state.match.board.boards[side][index]=value;
          }
        }
      }
    }
    state.cursor=e.cursor;state.revision=e.revision;state.serverTime=e.serverTime;
  }
  if(BigInt(page.cursor)>BigInt(state.cursor))throw Error('SNAPSHOT_REQUIRED');
  return state;
}
export function legacyView(state,id) {
  if(!state)return {};
  const profile={...clone(state.profile),balance:Number(state.profile.balanceCents)/100,claims:[]};
  const m=state.match;
  const game=m?{...clone(m),g:m.board?{...clone(m.board),playerStocks:clone(m.uses),stocks:[{},{}]}:null,sharedUses:true,
    usedSymbols:m.uses,results:{[id]:m.result},events:clone(m.effects)}:null;
  return {profile,game,revision:m?.revision??'-1'};
}
