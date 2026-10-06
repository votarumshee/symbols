import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
export function openDatabase(file){
 fs.mkdirSync(path.dirname(file),{recursive:true});
 const sql=new DatabaseSync(file);sql.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
 class Query{
  constructor(s){this.s=s;this.args=[];}
  bind(...args){this.args=args;return this;}
  async first(){return sql.prepare(this.s).get(...this.args)??null;}
  async all(){return {results:sql.prepare(this.s).all(...this.args)};}
  async run(){const r=sql.prepare(this.s).run(...this.args);return {meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}};}
 }
 const DB={prepare:s=>new Query(s),batch:async qs=>{sql.exec('BEGIN IMMEDIATE');try{const result=[];for(const q of qs)result.push(await q.run());sql.exec('COMMIT');return result;}catch(e){sql.exec('ROLLBACK');throw e;}}};
 return {sql,DB};
}
