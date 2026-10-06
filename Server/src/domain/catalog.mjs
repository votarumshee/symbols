import raw from '../../content/catalog.json' with {type:'json'};
import {createHash} from 'node:crypto';
function freeze(v){if(v&&typeof v==='object'){Object.freeze(v);Object.values(v).forEach(freeze);}return v;}
export const catalog=freeze(raw);
export const contentVersion=createHash('sha256').update(JSON.stringify(catalog)).digest('hex');
export const records=category=>catalog.records.filter(r=>r.category===category);
export const settings=records('settings')[0].payload;
