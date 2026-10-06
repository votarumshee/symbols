import {levelInfo} from './progression.mjs';
import {avatar} from './avatars.mjs';
export const FRAME_TYPES=[['bronze','Бронза'],['silver','Серебро'],['gold','Золото'],['emerald','Изумруд'],['diamond','Алмаз'],['puregold','Чистое золото']];
export const FRAMES=FRAME_TYPES.flatMap(([type,name],i)=>Array.from({length:4},(_,j)=>({id:i*4+j+1,type,name:name+' '+(j+1),stage:j+1,level:(i*4+j+1)*10})));
FRAMES.push(...Array.from({length:6},(_,j)=>({id:25+j,type:'violetdiamond',name:'Фиолетовый алмаз '+(j+1),stage:j+1,level:250+j*10})));
export function unlockedFrames(xp){return Math.min(30,Math.floor(levelInfo(xp).level/10));}
export function activeFrame(p){const count=unlockedFrames(p.xp);return p.frame===null?null:Number.isInteger(p.frame)&&p.frame>0&&p.frame<=count?p.frame:count||null;}
export function framedAvatar(value,frame,level=0){const f=FRAMES.find(f=>f.id===frame);return `<span class="framed-avatar ${f?'frame-'+f.type:''}" ${f?`aria-label="Рамка ${f.name}"`:''}>${avatar(value)}${f?` ${level>300?`<span class="frame-level">${level}</span>`:`<span class="frame-stripes" aria-hidden="true">${'<i></i>'.repeat(f.stage)}</span>`}${['emerald','diamond','violetdiamond'].includes(f.type)?`<span class="frame-crystals" aria-hidden="true">◆ ◆ ◆</span>${f.type==='violetdiamond'?'<span class="frame-gems-left" aria-hidden="true">◆ ◆ ◆</span><span class="frame-gems-right" aria-hidden="true">◆ ◆ ◆</span>':''}`:''}`:''}</span>`;}
