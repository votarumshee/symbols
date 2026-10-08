import {icon} from './icons.mjs';
let sound=false,context=null;
export const soundEnabled=()=>sound;
export function toggleSound(){sound=!sound;if(sound){try{const Audio=globalThis.AudioContext||globalThis.webkitAudioContext;context??=new Audio();context.resume();}catch{sound=false;}}return sound;}
function playSound(type){if(!sound||!context)return;try{const oscillator=context.createOscillator(),gain=context.createGain(),time=context.currentTime;oscillator.type=type==='laser'?'sawtooth':type==='tank'?'triangle':'sine';oscillator.frequency.setValueAtTime(type==='laser'?750:type==='tank'?110:1100,time);oscillator.frequency.exponentialRampToValueAtTime(type==='laser'?110:type==='tank'?35:350,time+.24);gain.gain.setValueAtTime(.045,time);gain.gain.exponentialRampToValueAtTime(.001,time+.28);oscillator.connect(gain);gain.connect(context.destination);oscillator.start();oscillator.stop(time+.3);}catch{}}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
export async function animateShots(root,events,isCurrent){const reduced=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
 for(const event of events){if(!isCurrent())return;const type=event.projectile||'arrow';playSound(type);let previous=null;
  for(let i=0;i<event.path.length;i++){if(!isCurrent())return;const c=event.path[i],el=root.querySelector(`[data-side="${c.side}"][data-index="${c.index}"]`);if(!el)continue;
   const fx=document.createElement('span');fx.className=`flying-shot flying-${type}${c.reflected?' flying-reflected':''}`;fx.innerHTML=['arrow','arrowx2','sword'].includes(type)?icon(type):'';
   let angle=(event.direction??0)*45;if(previous&&previous.side===c.side){const width=Number(root.querySelector('.board')?.style.gridTemplateColumns?.match(/repeat\((\d+)/)?.[1]||20),dx=c.index%width-previous.index%width,dy=Math.floor(c.index/width)-Math.floor(previous.index/width);angle=Math.atan2(dx,-dy)*180/Math.PI;}else if(c.side!==event.player)angle=180-angle;
   if(el.classList.contains('enemy'))angle=180-angle;fx.style.transform=`rotate(${angle}deg)`;el.append(fx);await wait(reduced?3:type==='laser'?18:42);fx.remove();previous=c;
   if(!reduced&&isCurrent()){const trail=document.createElement('span');trail.className=`shot-trail trail-${type}${c.reflected?' trail-reflected':''}`;trail.setAttribute('aria-hidden','true');el.append(trail);setTimeout(()=>trail.remove(),260);}
   const impact=event.impacts?.find(v=>v.side===c.side&&v.index===c.index&&v.reflected===c.reflected);
   if(impact){const burst=document.createElement('span');burst.className=`impact impact-${impact.kind}`;burst.textContent=impact.kind==='king'?`−${impact.damage}`:impact.kind==='reflect'?'↩':impact.kind==='blocked'?'Щит':'';el.append(burst);setTimeout(()=>burst.remove(),700);}
  }
  if(type==='tank'&&event.path.length){const c=event.path.at(-1),el=root.querySelector(`[data-side="${c.side}"][data-index="${c.index}"]`);const burst=document.createElement('span');burst.className='impact impact-explosion';el?.append(burst);setTimeout(()=>burst.remove(),650);}
  await wait(reduced?0:420);
 }
}
