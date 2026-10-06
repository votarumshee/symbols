import {records} from "./catalog.mjs";
export const SKINS=records('skin').map(r=>r.payload);
export const SKIN_SYMBOLS=['king','arrow','arrowx2','laser','tank','sword','point','inspect','powerful','smile','circle','feedback','electricity','angry','teleport','erase'];
export function ownsSkin(profile,symbol,skin){return skin==='classic'||!!profile.ownedSkins?.[symbol]?.includes(skin);}

export function skinsFor(symbol){return SKIN_SYMBOLS.includes(symbol)?SKINS:[];}
