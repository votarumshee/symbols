// The first games use basic symbols and forgiving opponents. Trials keep their own levels.
export function matchLevel(d){return d.xp<250?0:d.xp<1000?1:2;}
