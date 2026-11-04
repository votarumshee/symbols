import {randomUUID} from 'node:crypto';
import {one} from '../repositories/db.mjs';
import {requireValue} from './errors.mjs';

export const wishesQuery={type:'object',additionalProperties:false,properties:{
 sort:{enum:['top','new']},offset:{type:'integer',minimum:0,maximum:10000}
}};

export async function wishesPage(c,id,{sort='top',offset=0}={}){
 const rows=(await c.query(`SELECT w.id,w.owner,p.nick,w.body,w.created,
  (SELECT count(*)::integer FROM wish_likes l WHERE l.wish_id=w.id) likes,
  EXISTS(SELECT 1 FROM wish_likes l WHERE l.wish_id=w.id AND l.owner=$1) liked
  FROM wishes w JOIN profiles p ON p.id=w.owner
  WHERE NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.owner=$1 AND b.target=w.owner) OR (b.target=$1 AND b.owner=w.owner))
  ORDER BY ${sort==='new'?'w.created DESC,w.id DESC':'likes DESC,w.created DESC,w.id DESC'} LIMIT 31 OFFSET $2`,[id,offset])).rows;
 return {wishes:rows.slice(0,30),nextOffset:rows.length>30&&offset+30<=10000?offset+30:null};
}

export async function wishCommand(c,id,kind,b){
 if(kind==='wish'){
  const body=typeof b.text==='string'?b.text.trim():'';
  requireValue(body.length>=3&&body.length<=1000,'Пожелание: 3–1000 символов');
  const recent=await one(c,"SELECT count(*)::integer n FROM wishes WHERE owner=$1 AND created>now()-interval '1 hour'",[id]);
  requireValue(recent.n<5,'Можно отправить до пяти пожеланий за час',429,'WISH_LIMIT');
  const wishId=randomUUID();await c.query('INSERT INTO wishes(id,owner,body) VALUES($1,$2,$3)',[wishId,id,body]);
  return {wishId};
 }
 const wish=await one(c,`SELECT w.id FROM wishes w WHERE w.id=$1 AND NOT EXISTS(
  SELECT 1 FROM blocks b WHERE (b.owner=$2 AND b.target=w.owner) OR (b.target=$2 AND b.owner=w.owner)) FOR KEY SHARE`,[b.id,id]);
 requireValue(wish,'Пожелание недоступно',404);
 if(b.liked)await c.query('INSERT INTO wish_likes(wish_id,owner) VALUES($1,$2) ON CONFLICT DO NOTHING',[b.id,id]);
 else await c.query('DELETE FROM wish_likes WHERE wish_id=$1 AND owner=$2',[b.id,id]);
 return {wishId:b.id,liked:b.liked};
}
