
import {icon} from './icons.mjs';
export function skinIcon(type,dir=0,skin='classic'){
 let svg=icon(type,dir).replace('symbol-icon ',`symbol-icon skin-${skin} `);
 if(skin==='cosmos'||skin==='solar'){
 const cosmos=skin==='cosmos',color=cosmos?'#88eaff':'#ffca5c',accent=cosmos?'#bf7cff':'#ff693f';
 const ring=`<g class="premium-orbit" fill="none" stroke="${accent}"><ellipse cx="16" cy="16" rx="15" ry="8" stroke-width="1"/><ellipse cx="16" cy="16" rx="15" ry="8" transform="rotate(65 16 16)" stroke-width=".6"/><circle cx="16" cy="16" r="14" stroke-width="2" opacity=".2"/></g>`;
 const sparks=`<g class="premium-sparks" fill="${color}">${Array.from({length:8},(_,i)=>{const a=i*Math.PI/4,x=16+14*Math.cos(a),y=16+14*Math.sin(a);return cosmos?`<path d="M${x} ${y-1.5}l.5 1 1 .5-1 .5-.5 1-.5-1-1-.5 1-.5Z"/>`:`<path d="M${x} ${y-2}q3 3 0 4-2-1 0-4Z"/>`;}).join('')}</g>`;
 return svg.replace(/(<svg[^>]*>)([\s\S]*)(<\/svg>)/,(_,open,body,close)=>open+ring+'<g class="premium-core">'+body+'</g>'+sparks+close);
 }
 if(skin!=='storm')return svg;
 const aura='<g class="arcana-aura" fill="none"><circle cx="16" cy="16" r="14" stroke="#b340ff" stroke-width="2" opacity=".45"/><ellipse cx="16" cy="16" rx="14" ry="10" stroke="#ff557e" stroke-width=".65"/><circle cx="16" cy="16" r="11.8" stroke="#85eeff" stroke-width=".5" stroke-dasharray="3 5"/></g>';
 const bolts='<g class="arcana-bolts" fill="none" stroke="#affaff" stroke-width=".85" stroke-linejoin="round"><path d="m8 2-4 6 3 2-5 7 4-1-2 7 5 6"/><path d="m25 2 3 7-3 3 5 4-3 4 2 6-6 4"/><path d="m10 3 4 2 5-3 4 3M9 29l5-2 5 3 4-3"/></g>';
 const particles='<g class="arcana-particles" fill="#ffcfec"><circle cx="3" cy="5" r=".9"/><circle cx="29" cy="11" r=".8"/><circle cx="6" cy="25" r=".7"/><circle cx="24" cy="28" r=".9"/><path d="m23 4 .6 1.4L25 6l-1.4.6L23 8l-.6-1.4L21 6l1.4-.6Z"/></g>';
 const blade=type==='sword'?`<g transform="rotate(${dir*45} 16 16)"><path class="arcana-blade" d="m16 2 3 6-4 4 3 4-2 6m-5-13 2 5-1 4m9-9-2 5 1 4" fill="none" stroke="#e5fcff" stroke-width="1"/><path d="m8 21 8 2 8-2" fill="none" stroke="#ff8ad8" stroke-width="1.3"/></g>`:'';
 return svg.replace(/(<svg[^>]*>)([\s\S]*)(<\/svg>)/,(_,open,body,close)=>open+aura+'<g class="arcana-core">'+body+'</g>'+bolts+particles+blade+close);
}
