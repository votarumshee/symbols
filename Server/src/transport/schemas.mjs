import {TYPES} from '../domain/engine.mjs';
const symbol={enum:['king',...Object.keys(TYPES)]};
const str=(maxLength=128)=>({type:'string',minLength:1,maxLength});
const obj=properties=>({type:'object',properties,additionalProperties:false});
const revision={type:'string',pattern:'^[0-9]{1,19}$'};
export const commandSchemas={
 start:obj({mode:{enum:['play','duel','team','trial','local','room']},small:{type:'boolean'},code:str(6)}),
 action:{...obj({matchId:str(),revision,action:{...obj({type:symbol,index:{type:'integer',minimum:0,maximum:279},dir:{type:'integer',minimum:0,maximum:7},source:{anyOf:[{type:'integer',minimum:0,maximum:279},{type:'null'}]},side:{type:'integer',minimum:0,maximum:1}}),required:['type']}}),required:['matchId','revision','action']},
 leave:{...obj({matchId:str(),revision}),required:['matchId','revision']},
 sell:{...obj({symbol:str(20),skin:str(30),price:{type:'string',pattern:'^[0-9]{1,14}([.,][0-9]{1,2})?$'},quantity:{type:'integer',minimum:1,maximum:100}}),required:['symbol','price']},
 buy:{...obj({id:str()}),required:['id']},cancel:{...obj({id:str()}),required:['id']},
 upgrade:{...obj({symbol:str(20),level:{type:'integer',minimum:0,maximum:30},max:{type:'boolean'}}),required:['symbol','level']},
 frame:{...obj({frame:{anyOf:[{type:'integer',minimum:1,maximum:30},{type:'null'}]}}),required:['frame']},
 nickname:{...obj({nick:str(20)}),required:['nick']},
 avatar:{...obj({avatar:str(30)}),required:['avatar']},'buy-avatar':{...obj({avatar:str(30)}),required:['avatar']},
 skin:{...obj({symbol:str(20),skin:str(30)}),required:['symbol','skin']},'buy-skin':{...obj({symbol:str(20),skin:str(30)}),required:['symbol','skin']},
 'buy-case':{...obj({case:str(30)}),required:['case']},'open-case':{...obj({case:str(30)}),required:['case']},
 'recovery-code':obj({}),logout:obj({}),'delete-account':{...obj({confirm:{const:true}}),required:['confirm']},
 report:{...obj({target:str(),reason:str(500)}),required:['target','reason']},
 block:{...obj({target:str()}),required:['target']},unblock:{...obj({target:str()}),required:['target']}
};
export const registerSchema={...obj({nick:str(20)}),required:['nick']};
export const recoverSchema={...obj({code:str(40)}),required:['code']};
