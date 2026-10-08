import {levelInfo} from "./progression.mjs";
export function unlockedFrames(xp){return Math.min(30,Math.floor(levelInfo(xp).level/10));}
export function activeFrame(p){const count=unlockedFrames(p.xp);return p.frame===null?null:Number.isInteger(p.frame)&&p.frame>0&&p.frame<=count?p.frame:count||null;}
