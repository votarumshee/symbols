import fs from 'node:fs';
import {openDatabase} from './local-db.mjs';
const file=process.argv[2]??process.env.SYMBOLS_DB??'data/symbols.sqlite';
const {sql}=openDatabase(file);
sql.exec('CREATE TABLE IF NOT EXISTS _export_migrations(name TEXT PRIMARY KEY NOT NULL)');
for(const name of fs.readdirSync('database/original/migrations').filter(f=>f.endsWith('.sql')).sort()){
 if(sql.prepare('SELECT 1 FROM _export_migrations WHERE name=?').get(name))continue;
 sql.exec('BEGIN IMMEDIATE');
 try{sql.exec(fs.readFileSync('database/original/migrations/'+name,'utf8'));sql.prepare('INSERT INTO _export_migrations VALUES(?)').run(name);sql.exec('COMMIT');}catch(e){sql.exec('ROLLBACK');throw e;}
}
sql.exec(fs.readFileSync('database/original/02-content.sql','utf8'));
console.log(JSON.stringify({file,sqlite:sql.prepare('SELECT sqlite_version() version').get(),catalog:sql.prepare('SELECT count(*) n FROM game_content').get(),relations:sql.prepare('SELECT count(*) n FROM game_content_links').get(),integrity:sql.prepare('PRAGMA integrity_check').get(),foreignKeys:sql.prepare('PRAGMA foreign_key_check').all()}));
sql.close();
