export const SKINS=[{id:'classic',name:'Обычный',price:0},{id:'neon',name:'Фиолетовый неон',price:120},{id:'frost',name:'Ледяной',price:80},{id:'ember',name:'Огненный',price:100},{id:'storm',name:'Гроза',price:1000,effect:'Молнии и частицы'},{id:'cosmos',name:'Космос',price:1200,effect:'Звёзды и орбиты'},{id:'solar',name:'Солнечный феникс',price:1200,effect:'Пламя и золотые искры'}];
export const SKIN_SYMBOLS=['king','arrow','arrowx2','laser','tank','sword','point','inspect','powerful','smile','circle','feedback','electricity','angry','teleport','erase'];
export function ownsSkin(profile,symbol,skin){return skin==='classic'||!!profile.ownedSkins?.[symbol]?.includes(skin);}

export function skinsFor(symbol){return SKIN_SYMBOLS.includes(symbol)?SKINS:[];}
