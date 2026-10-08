export const LEVEL_NAMES=['Очень лёгкий','Лёгкий','Средний','Сложный','Безумно сложный'];
export function mergeHistory(a=[],b=[]){const records=new Map();for(const r of [...a,...b])if(r&&typeof r.id==='string'&&Number.isFinite(r.at))records.set(r.id,r);return [...records.values()].sort((x,y)=>y.at-x.at).slice(0,100);}
export function recordMatch(progress,record){progress.history=mergeHistory(progress.history,[record]);}
